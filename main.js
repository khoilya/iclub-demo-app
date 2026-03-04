/**
 * ICLUB Demo App — main.js
 *
 * Direct mobile WebRTC flow:
 *  1. Wait for the user to focus the 4th form field (Investment Amount).
 *  2. Show the "AI consultant call" popup.
 *  3. If accepted, create a direct WebRTC session using Newo signaling APIs.
 *  4. After a simulated qualification delay, show the SIP-transfer overlay.
 */

// DOM References
const form = document.getElementById('investment-form');
const amountInput = document.getElementById('amount');

const callPopup = document.getElementById('call-popup');
const btnAccept = document.getElementById('btn-accept');
const btnDecline = document.getElementById('btn-decline');

const sipOverlay = document.getElementById('sip-overlay');
const sipStatus = document.getElementById('sip-status');
const btnSipClose = document.getElementById('btn-sip-close');

const statusBanner = document.getElementById('status-banner');
const remoteAudio = document.getElementById('remote-audio');
const callControls = document.getElementById('call-controls');
const callStatusText = document.getElementById('call-status-text');
const btnHangup = document.getElementById('btn-hangup');

// Configuration
const isNativePlatform = Boolean(window?.Capacitor?.isNativePlatform?.());
const apiBaseUrl =
  import.meta.env.VITE_NEWO_API_BASE_URL ||
  (isNativePlatform ? 'https://app.newo.ai' : '/newo-api');

const customerIdn = import.meta.env.VITE_NEWO_CUSTOMER_IDN || 'C_NE_UBL1JSPF';
const connectorIdn = import.meta.env.VITE_NEWO_CONNECTOR_IDN || 'newo_voice_connector';

// State
let callPopupShown = false;

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

let sipTransferTimerId = null;
let isTearingDownCall = false;

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

  if (typeof details === 'undefined') {
    logger.call(console, prefix);
    return;
  }

  logger.call(console, prefix, details);
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

function clearSipTransferTimer() {
  if (sipTransferTimerId === null) {
    return;
  }

  window.clearTimeout(sipTransferTimerId);
  sipTransferTimerId = null;
}

function hideSIPOverlay() {
  sipOverlay.classList.add('hidden');
  sipOverlay.classList.remove('flex');
  btnSipClose.classList.add('hidden');
  sipStatus.textContent = '';
}

function scheduleSIPTransfer() {
  clearSipTransferTimer();

  sipTransferTimerId = window.setTimeout(() => {
    sipTransferTimerId = null;

    if (!callSession.isStarting && !callSession.isInCall) {
      return;
    }

    simulateSIPTransfer();
  }, 8000);
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
  const response = await fetch(url, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = parseApiError(payload, `${response.status} ${response.statusText}`);
    throw new Error(`Request failed: ${message}`);
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
    clearSipTransferTimer();
    hideSIPOverlay();

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
  hideSIPOverlay();

  console.log('Starting direct WebRTC call with form context', formPayload);

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
    scheduleSIPTransfer();
    logWebRtc('info', 'Direct WebRTC call established');
  } catch (error) {
    if (error instanceof CallCancelledError) {
      logWebRtc('info', 'Call start cancelled');
      return;
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

function simulateSIPTransfer() {
  btnSipClose.classList.add('hidden');
  sipOverlay.classList.remove('hidden');
  sipOverlay.classList.add('flex');

  const steps = [
    { delay: 0, text: 'Connecting to SIP gateway...' },
    { delay: 1500, text: 'Routing to available agent...' },
    { delay: 3000, text: 'Agent connected. Have a great conversation!' },
  ];

  steps.forEach(({ delay, text }) => {
    setTimeout(() => {
      sipStatus.textContent = text;
      if (text.includes('Agent connected')) {
        btnSipClose.classList.remove('hidden');
      }
    }, delay);
  });
}

btnSipClose.addEventListener('click', () => {
  hideSIPOverlay();
});

function showCallPopup() {
  if (callPopupShown) {
    return;
  }

  callPopupShown = true;
  callPopup.classList.remove('hidden');
  callPopup.classList.add('flex');
}

function hideCallPopup() {
  callPopup.classList.add('hidden');
  callPopup.classList.remove('flex');
}

btnAccept.addEventListener('click', () => {
  hideCallPopup();
  startAICall();
});

btnDecline.addEventListener('click', () => {
  hideCallPopup();
});

btnHangup?.addEventListener('click', () => {
  stopAICall();
});

callPopup.addEventListener('click', (event) => {
  if (event.target === callPopup) {
    hideCallPopup();
  }
});

amountInput.addEventListener('focus', () => {
  // Small delay so the keyboard has time to appear before the popup.
  setTimeout(showCallPopup, 400);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const payload = collectFormData();
  console.log('Form submitted:', payload);

  statusBanner.classList.remove('hidden');
  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

window.addEventListener('beforeunload', () => {
  teardownCallSession();
});
