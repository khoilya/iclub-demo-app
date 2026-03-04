import { CapacitorHttp } from '@capacitor/core';

/**
 * ICLUB Demo App — main.js
 *
 * Direct mobile WebRTC flow:
 *  1. Wait for the user to focus the 4th form field (Investment Amount).
 *  2. Show the "AI consultant call" popup.
 *  3. If accepted, create a direct WebRTC session using Newo signaling APIs.
 */

// DOM References
const form = document.getElementById('investment-form');
const amountInput = document.getElementById('amount');
const fullNameInput = document.getElementById('full-name');
const phoneInput = document.getElementById('phone');

const callPopup = document.getElementById('call-popup');
const btnAccept = document.getElementById('btn-accept');
const btnDecline = document.getElementById('btn-decline');
const btnOpenCall = document.getElementById('btn-open-call');
const callbackPopup = document.getElementById('callback-popup');
const btnCallbackYes = document.getElementById('btn-callback-yes');
const btnCallbackNo = document.getElementById('btn-callback-no');

const statusBanner = document.getElementById('status-banner');
const remoteAudio = document.getElementById('remote-audio');
const callControls = document.getElementById('call-controls');
const callStatusText = document.getElementById('call-status-text');
const btnHangup = document.getElementById('btn-hangup');
const btnDebugOpen = document.getElementById('btn-debug-open');
const debugPanel = document.getElementById('debug-panel');
const btnDebugClose = document.getElementById('btn-debug-close');
const btnDebugClear = document.getElementById('btn-debug-clear');
const btnDebugCopy = document.getElementById('btn-debug-copy');
const debugLogOutput = document.getElementById('debug-log-output');

// Configuration
const isNativePlatform = Boolean(window?.Capacitor?.isNativePlatform?.());
const apiBaseUrl =
  import.meta.env.VITE_NEWO_API_BASE_URL ||
  (isNativePlatform ? 'https://app.newo.ai' : '/newo-api');

const customerIdn = import.meta.env.VITE_NEWO_CUSTOMER_IDN || 'C_NE_UBL1JSPF';
const connectorIdn = import.meta.env.VITE_NEWO_CONNECTOR_IDN || 'newo_voice_connector_web';
const outboundWebhookUrl =
  import.meta.env.VITE_OUTBOUND_WEBHOOK_URL ||
  (isNativePlatform
    ? 'https://hooks.newo.ai/UYFns5IzFhXs3Yi89vUTlg'
    : '/callback-webhook');

// State
const callSession = {
  externalActorId: crypto.randomUUID(),
  isStarting: false,
  isInCall: false,
  startAttemptId: 0,
  jwt: null,
  peerConnection: null,
  localStream: null,
  remoteStream: null,
};

let isTearingDownCall = false;
let callPopupTriggerTimerId = null;
let hasAutoCallPopupShown = false;
let pendingSubmissionPayload = null;
let isSendingCallbackWebhook = false;
const inAppLogs = [];
const maxInAppLogs = 300;

class CallCancelledError extends Error {
  constructor() {
    super('Call start cancelled');
    this.name = 'CallCancelledError';
  }
}

function logWebRtc(level, message, details) {
  const timestamp = new Date().toISOString();
  const prefix = `[DirectWebRTC][${timestamp}] ${message}`;
  const logger = typeof console[level] === 'function' ? console[level] : console.log;
  appendInAppLog(level, message, details);

  if (typeof details === 'undefined') {
    logger.call(console, prefix);
    return;
  }

  logger.call(console, prefix, details);
}

function formatLogDetails(details) {
  if (typeof details === 'undefined' || details === null) {
    return '';
  }

  if (details instanceof Error) {
    return JSON.stringify({
      name: details.name,
      message: details.message,
      stack: details.stack,
    });
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function isMicrophonePermissionError(error) {
  const name =
    error && typeof error === 'object' && 'name' in error ? String(error.name || '') : '';
  const message = error instanceof Error ? error.message : String(error || '');

  return (
    /NotAllowedError|PermissionDeniedError|SecurityError/i.test(name) ||
    /permission denied|permission|microphone/i.test(message)
  );
}

function renderInAppLogs() {
  if (!debugLogOutput) {
    return;
  }

  debugLogOutput.textContent = inAppLogs.join('\n');
  debugLogOutput.scrollTop = debugLogOutput.scrollHeight;
}

function appendInAppLog(level, message, details) {
  const timestamp = new Date().toISOString();
  const normalizedLevel = String(level).toLowerCase();
  const detailText = formatLogDetails(details);
  const line = detailText
    ? `${timestamp} [${normalizedLevel.toUpperCase()}] ${message} | ${detailText}`
    : `${timestamp} [${normalizedLevel.toUpperCase()}] ${message}`;

  inAppLogs.push(line);
  if (inAppLogs.length > maxInAppLogs) {
    inAppLogs.shift();
  }

  renderInAppLogs();

  if (normalizedLevel === 'error' && debugPanel?.classList.contains('hidden')) {
    openDebugPanel();
  }
}

function openDebugPanel() {
  if (!debugPanel) {
    return;
  }

  debugPanel.classList.remove('hidden');
}

function closeDebugPanel() {
  if (!debugPanel) {
    return;
  }

  debugPanel.classList.add('hidden');
}

function clearDebugLogs() {
  inAppLogs.length = 0;
  renderInAppLogs();
  appendInAppLog('info', 'Debug logs cleared');
}

async function copyDebugLogsToClipboard() {
  const content = inAppLogs.length > 0 ? inAppLogs.join('\n') : 'No logs captured yet.';

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API unavailable');
    }

    await navigator.clipboard.writeText(content);
    appendInAppLog('info', 'Copied debug logs to clipboard');
  } catch (error) {
    appendInAppLog('error', 'Copy debug logs failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function showCallControls(statusText) {
  if (!callControls) {
    return;
  }

  callControls.classList.remove('hidden');
  if (callStatusText) {
    callStatusText.textContent = statusText;
  }
}

function hideCallControls() {
  if (!callControls) {
    return;
  }

  callControls.classList.add('hidden');
}

function setCallStatusText(statusText) {
  if (!callStatusText) {
    return;
  }

  callStatusText.textContent = statusText;
}

function showStatusBanner(kind, message) {
  const successClasses = ['bg-emerald-600/20', 'border-emerald-500/40', 'text-emerald-300'];
  const errorClasses = ['bg-rose-600/20', 'border-rose-500/40', 'text-rose-300'];

  statusBanner.classList.remove(...successClasses, ...errorClasses, 'hidden');

  if (kind === 'error') {
    statusBanner.classList.add(...errorClasses);
    statusBanner.textContent = `⚠️ ${message}`;
  } else {
    statusBanner.classList.add(...successClasses);
    statusBanner.textContent = `✅ ${message}`;
  }

  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetRequiredFieldValidation() {
  fullNameInput?.setCustomValidity('');
  phoneInput?.setCustomValidity('');
}

function validateRequiredFields(formPayload) {
  resetRequiredFieldValidation();

  const name = String(formPayload.fullName ?? fullNameInput?.value ?? '').trim();
  const phone = String(formPayload.phone ?? phoneInput?.value ?? '').trim();
  const missingFields = [];

  if (!name) {
    missingFields.push('Full Name');
    fullNameInput?.setCustomValidity('Full Name is required');
  }

  if (!phone) {
    missingFields.push('Phone Number');
    phoneInput?.setCustomValidity('Phone Number is required');
  }

  if (missingFields.length > 0) {
    if (!name) {
      fullNameInput?.reportValidity();
    } else {
      phoneInput?.reportValidity();
    }

    resetRequiredFieldValidation();
    return {
      valid: false,
      missingFields,
    };
  }

  resetRequiredFieldValidation();
  return {
    valid: true,
    missingFields: [],
  };
}

function prettifyFieldName(fieldName) {
  const fieldMap = {
    email: 'Email',
    amount: 'Investment Amount',
    goal: 'Investment Goal',
    riskTolerance: 'Risk Tolerance',
  };

  if (fieldMap[fieldName]) {
    return fieldMap[fieldName];
  }

  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (match) => match.toUpperCase());
}

function buildOtherFieldsSummary(formPayload) {
  const otherFields = Object.entries(formPayload).filter(
    ([fieldName]) => fieldName !== 'fullName' && fieldName !== 'phone'
  );

  if (otherFields.length === 0) {
    return 'No additional fields were provided.';
  }

  return otherFields
    .map(([fieldName, rawValue]) => {
      const value = String(rawValue || '').trim() || 'not provided';
      return `${prettifyFieldName(fieldName)}: ${value}`;
    })
    .join('; ');
}

function buildOutboundCallbackContent(formPayload) {
  const name = String(formPayload.fullName || '').trim();
  const phone = String(formPayload.phone || '').trim();
  const otherFieldsSummary = buildOtherFieldsSummary(formPayload);

  return `Call a user named ${name} on ${phone}. He filled up the submission form in the iclub application. The information user passed to the form: ${otherFieldsSummary}. During conversation follow the **Outbound call after application form is completed** scenario.`;
}

function showCallbackPopup() {
  if (!callbackPopup) {
    return;
  }

  setCallbackPopupBusyState(false);
  callbackPopup.classList.remove('hidden');
  callbackPopup.classList.add('flex');
}

function hideCallbackPopup() {
  if (!callbackPopup) {
    return;
  }

  setCallbackPopupBusyState(false);
  callbackPopup.classList.add('hidden');
  callbackPopup.classList.remove('flex');
}

function setCallbackPopupBusyState(isBusy) {
  if (btnCallbackYes) {
    btnCallbackYes.disabled = isBusy;
    btnCallbackYes.classList.toggle('opacity-60', isBusy);
    btnCallbackYes.textContent = isBusy ? 'Sending...' : 'Yes, Call Me';
  }

  if (btnCallbackNo) {
    btnCallbackNo.disabled = isBusy;
    btnCallbackNo.classList.toggle('opacity-60', isBusy);
  }
}

async function sendOutboundCallbackWebhook(formPayload) {
  const content = buildOutboundCallbackContent(formPayload);
  const webhookBody = {
    arguments: [
      {
        name: 'content',
        value: content,
      },
      {
        name: 'taskTypes',
        value: '["make_call"]',
      },
    ],
  };

  logWebRtc('info', 'Sending outbound callback webhook', webhookBody);
  const webhookResponse = await fetchJson(outboundWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(webhookBody),
    includeMeta: true,
  });

  logWebRtc('info', 'Outbound callback webhook response', {
    status: webhookResponse.status,
    body: webhookResponse.data,
  });
}

function ensureActiveCallStart(attemptId) {
  if (callSession.startAttemptId !== attemptId) {
    throw new CallCancelledError();
  }
}

function buildApiUrl(pathname) {
  const cleanBase = apiBaseUrl.replace(/\/+$/, '');
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${cleanBase}${cleanPath}`;
}

function parseApiError(payload, fallbackStatusText) {
  if (!payload || typeof payload !== 'object') {
    return fallbackStatusText;
  }

  if (typeof payload.reason === 'string' && payload.reason.trim()) {
    return payload.reason;
  }

  if (Array.isArray(payload.detail) && payload.detail.length > 0) {
    const firstDetail = payload.detail[0];
    if (firstDetail && typeof firstDetail.msg === 'string' && firstDetail.msg.trim()) {
      return firstDetail.msg;
    }
  }

  return fallbackStatusText;
}

async function fetchJson(url, options = {}) {
  const { includeMeta = false, ...requestOptions } = options;
  const method = String(requestOptions.method || 'GET').toUpperCase();

  if (isNativePlatform) {
    const headers = requestOptions.headers || {};
    const contentType = String(headers['Content-Type'] || headers['content-type'] || '');
    let data = undefined;

    appendInAppLog('info', 'HTTP request (native)', { method, url });

    if (typeof requestOptions.body !== 'undefined') {
      if (typeof requestOptions.body === 'string' && contentType.includes('application/json')) {
        try {
          data = JSON.parse(requestOptions.body);
        } catch {
          data = requestOptions.body;
        }
      } else {
        data = requestOptions.body;
      }
    }

    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
      data,
      responseType: 'json',
    });

    appendInAppLog('info', 'HTTP response (native)', {
      method,
      url,
      status: response.status,
    });

    if (response.status < 200 || response.status >= 300) {
      const message = parseApiError(response.data, `${response.status}`);
      throw new Error(`Request failed: ${message}`);
    }

    if (includeMeta) {
      return {
        status: response.status,
        data: response.data,
      };
    }

    return response.data;
  }

  appendInAppLog('info', 'HTTP request (web)', { method, url });
  const response = await fetch(url, requestOptions);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  appendInAppLog('info', 'HTTP response (web)', {
    method,
    url,
    status: response.status,
  });

  if (!response.ok) {
    const message = parseApiError(payload, `${response.status} ${response.statusText}`);
    throw new Error(`Request failed: ${message}`);
  }

  if (includeMeta) {
    return {
      status: response.status,
      data: payload,
    };
  }

  return payload;
}

function waitForIceGatheringComplete(peerConnection, timeoutMs = 7000) {
  if (peerConnection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
      reject(new Error('ICE gathering timeout'));
    }, timeoutMs);

    function onIceGatheringStateChange() {
      if (peerConnection.iceGatheringState !== 'complete') {
        return;
      }

      window.clearTimeout(timeoutId);
      peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
      resolve();
    }

    peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange);
  });
}

function buildCallMetadata(formPayload) {
  return {
    name: String(formPayload.fullName || '').trim(),
    email: String(formPayload.email || '').trim(),
    phone: String(formPayload.phone || '').trim(),
    amount: String(formPayload.amount || '').trim(),
    goal: String(formPayload.goal || '').trim(),
    riskTolerance: String(formPayload.riskTolerance || '').trim(),
  };
}

async function requestEmbeddedToken(callMetadata) {
  const body = {
    customer_idn: customerIdn,
    connector_idn: connectorIdn,
    external_actor_id: callSession.externalActorId,
  };

  const hasMetadata = Object.values(callMetadata).some((value) => value.length > 0);
  if (hasMetadata) {
    body.metadata = callMetadata;
  }

  const payload = await fetchJson(buildApiUrl('/api/v1/webrtc-provider/tokens/embedded'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!payload?.jwt) {
    throw new Error('Token response missing jwt');
  }

  return payload.jwt;
}

async function requestIceConfig(jwt) {
  const payload = await fetchJson(buildApiUrl('/api/v1/webrtc-provider/ice'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  });

  return payload || {};
}

async function requestAnswer(jwt, offerSdp) {
  const payload = await fetchJson(buildApiUrl('/api/v1/webrtc-provider/call'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sdp: offerSdp,
      type: 'offer',
    }),
  });

  if (!payload?.sdp || payload.type !== 'answer') {
    throw new Error('Invalid answer payload');
  }

  return payload;
}

function playRemoteAudio(stream) {
  if (!remoteAudio) {
    logWebRtc('warn', 'Remote audio element is missing (#remote-audio).');
    return;
  }

  if (remoteAudio.srcObject !== stream) {
    remoteAudio.srcObject = stream;
  }

  const playPromise = remoteAudio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch((error) => {
      logWebRtc('warn', 'Remote audio playback requires user gesture', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

function teardownCallSession() {
  if (isTearingDownCall) {
    return;
  }

  isTearingDownCall = true;
  try {
    callSession.startAttemptId += 1;
    callSession.isStarting = false;
    callSession.isInCall = false;

    if (callSession.localStream) {
      callSession.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // no-op
        }
      });
    }

    if (callSession.peerConnection) {
      try {
        callSession.peerConnection.ontrack = null;
        callSession.peerConnection.close();
      } catch {
        // no-op
      }
    }

    if (remoteAudio) {
      try {
        remoteAudio.pause();
      } catch {
        // no-op
      }
      remoteAudio.srcObject = null;
    }

    callSession.jwt = null;
    callSession.peerConnection = null;
    callSession.localStream = null;
    callSession.remoteStream = null;
    hideCallControls();
  } finally {
    isTearingDownCall = false;
  }
}

function stopAICall() {
  if (!callSession.isStarting && !callSession.isInCall) {
    return;
  }

  logWebRtc('info', 'Ending call by user action');
  teardownCallSession();
}

function createPeerConnection(iceConfig) {
  const peerConnection = new RTCPeerConnection({
    sdpSemantics: 'unified-plan',
    iceServers: iceConfig?.iceServers,
    iceTransportPolicy: iceConfig?.iceTransportPolicy || 'relay',
  });

  const remoteStream = new MediaStream();
  callSession.remoteStream = remoteStream;

  peerConnection.addEventListener('connectionstatechange', () => {
    logWebRtc('info', 'connection state changed', {
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      signalingState: peerConnection.signalingState,
    });

    if (peerConnection.connectionState === 'connected') {
      callSession.isInCall = true;
      setCallStatusText('AI consultant connected. Tap End Call to stop.');
      return;
    }

    if (
      peerConnection.connectionState === 'failed' ||
      peerConnection.connectionState === 'closed' ||
      peerConnection.connectionState === 'disconnected'
    ) {
      setCallStatusText('Call disconnected.');
      teardownCallSession();
    }
  });

  peerConnection.addEventListener('icecandidate', (event) => {
    if (event.candidate) {
      return;
    }

    logWebRtc('info', 'ICE gathering complete');
  });

  peerConnection.ontrack = (event) => {
    const [firstStream] = event.streams || [];

    if (firstStream) {
      firstStream.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
    } else if (event.track) {
      if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
    }

    playRemoteAudio(remoteStream);
  };

  return peerConnection;
}

function collectFormData() {
  const data = new FormData(form);
  const payload = {};

  for (const [key, value] of data.entries()) {
    payload[key] = value;
  }

  return payload;
}

async function startAICall() {
  if (callSession.isStarting || callSession.isInCall) {
    logWebRtc('warn', 'Call start skipped: call already in progress');
    return;
  }

  const attemptId = callSession.startAttemptId + 1;
  callSession.startAttemptId = attemptId;

  const formPayload = collectFormData();
  const callMetadata = buildCallMetadata(formPayload);
  callSession.externalActorId = crypto.randomUUID();
  callSession.isStarting = true;
  callSession.isInCall = false;
  showCallControls('Connecting to AI consultant...');

  logWebRtc('info', 'Starting direct WebRTC call with form context', formPayload);

  try {
    const jwt = await requestEmbeddedToken(callMetadata);
    ensureActiveCallStart(attemptId);
    callSession.jwt = jwt;

    const iceConfig = await requestIceConfig(jwt);
    ensureActiveCallStart(attemptId);
    logWebRtc('info', 'ICE config received', iceConfig);

    const peerConnection = createPeerConnection(iceConfig);
    ensureActiveCallStart(attemptId);
    callSession.peerConnection = peerConnection;

    logWebRtc('info', 'Requesting microphone access');
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    ensureActiveCallStart(attemptId);

    callSession.localStream = localStream;
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection, 7000);

    const localDescription = peerConnection.localDescription;
    if (!localDescription?.sdp) {
      throw new Error('Missing localDescription.sdp');
    }

    const answer = await requestAnswer(jwt, localDescription.sdp);
    ensureActiveCallStart(attemptId);
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answer.sdp,
    });

    setCallStatusText('Connected. Tap End Call whenever needed.');
    logWebRtc('info', 'Direct WebRTC call established');
  } catch (error) {
    if (error instanceof CallCancelledError) {
      logWebRtc('info', 'Call start cancelled');
      return;
    }

    if (isMicrophonePermissionError(error)) {
      logWebRtc(
        'error',
        'Microphone permission denied. Enable Microphone for ICLUB Demo in Android Settings > Apps > ICLUB Demo > Permissions.'
      );
    }

    logWebRtc('error', 'Direct WebRTC call failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    teardownCallSession();
  } finally {
    callSession.isStarting = false;
  }
}

function showCallPopup() {
  if (!callPopup.classList.contains('hidden')) {
    return;
  }

  callPopup.classList.remove('hidden');
  callPopup.classList.add('flex');
}

function hideCallPopup() {
  callPopup.classList.add('hidden');
  callPopup.classList.remove('flex');
}

function clearPendingCallPopupTrigger() {
  if (callPopupTriggerTimerId === null) {
    return;
  }

  window.clearTimeout(callPopupTriggerTimerId);
  callPopupTriggerTimerId = null;
}

function requestCallPopup(source, delayMs = 0, options = {}) {
  const { autoFromAmount = false } = options;

  if (autoFromAmount && hasAutoCallPopupShown) {
    return;
  }

  if (!callPopup.classList.contains('hidden')) {
    return;
  }

  if (callPopupTriggerTimerId !== null) {
    return;
  }

  logWebRtc('info', 'queueing call popup trigger', { source, delayMs });

  callPopupTriggerTimerId = window.setTimeout(() => {
    callPopupTriggerTimerId = null;

    if (autoFromAmount && hasAutoCallPopupShown) {
      return;
    }

    if (autoFromAmount) {
      hasAutoCallPopupShown = true;
    }

    showCallPopup();
  }, delayMs);
}

btnAccept.addEventListener('click', () => {
  hideCallPopup();
  startAICall();
});

btnDecline.addEventListener('click', () => {
  hideCallPopup();
});

btnCallbackNo?.addEventListener('click', () => {
  hideCallbackPopup();
  pendingSubmissionPayload = null;
  showStatusBanner('success', 'Application submitted. Callback request skipped.');
});

btnCallbackYes?.addEventListener('click', async () => {
  if (!pendingSubmissionPayload || isSendingCallbackWebhook) {
    return;
  }

  isSendingCallbackWebhook = true;
  setCallbackPopupBusyState(true);

  try {
    await sendOutboundCallbackWebhook(pendingSubmissionPayload);
    hideCallbackPopup();
    showStatusBanner('success', 'Application submitted. AI callback request was sent.');
    pendingSubmissionPayload = null;
    logWebRtc('info', 'Outbound callback webhook completed');
  } catch (error) {
    showStatusBanner('error', 'Application submitted, but callback request failed.');
    logWebRtc('error', 'Outbound callback webhook failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    isSendingCallbackWebhook = false;
    setCallbackPopupBusyState(false);
  }
});

btnOpenCall?.addEventListener('click', () => {
  requestCallPopup('manual-button', 0);
});

btnHangup?.addEventListener('click', () => {
  stopAICall();
});

btnDebugOpen?.addEventListener('click', () => {
  openDebugPanel();
});

btnDebugClose?.addEventListener('click', () => {
  closeDebugPanel();
});

btnDebugClear?.addEventListener('click', () => {
  clearDebugLogs();
});

btnDebugCopy?.addEventListener('click', () => {
  copyDebugLogsToClipboard();
});

callPopup.addEventListener('click', (event) => {
  if (event.target === callPopup) {
    hideCallPopup();
  }
});

callbackPopup?.addEventListener('click', (event) => {
  if (event.target === callbackPopup && !isSendingCallbackWebhook) {
    hideCallbackPopup();
    pendingSubmissionPayload = null;
    showStatusBanner('success', 'Application submitted. Callback request skipped.');
  }
});

amountInput.addEventListener('focus', () => {
  // Small delay so the keyboard has time to appear before the popup.
  requestCallPopup('focus', 400, { autoFromAmount: true });
});

amountInput.addEventListener('pointerup', () => {
  requestCallPopup('pointerup', 180, { autoFromAmount: true });
});

amountInput.addEventListener('touchend', () => {
  requestCallPopup('touchend', 180, { autoFromAmount: true });
});

amountInput.addEventListener('click', () => {
  requestCallPopup('click', 180, { autoFromAmount: true });
});

amountInput.addEventListener('input', () => {
  requestCallPopup('input', 0, { autoFromAmount: true });
});

form.addEventListener('focusin', (event) => {
  if (event.target === amountInput) {
    requestCallPopup('focusin', 220, { autoFromAmount: true });
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const payload = collectFormData();
  logWebRtc('info', 'Form submit clicked', payload);

  const requiredValidation = validateRequiredFields(payload);
  if (!requiredValidation.valid) {
    showStatusBanner(
      'error',
      `Please complete required fields: ${requiredValidation.missingFields.join(' and ')}.`
    );
    return;
  }

  clearPendingCallPopupTrigger();
  hideCallPopup();
  pendingSubmissionPayload = payload;
  showCallbackPopup();
});

window.addEventListener('error', (event) => {
  appendInAppLog('error', 'Window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  appendInAppLog('error', 'Unhandled promise rejection', event.reason);
});

appendInAppLog('info', 'App initialized', {
  isNativePlatform,
  apiBaseUrl,
});

window.addEventListener('beforeunload', () => {
  teardownCallSession();
});
