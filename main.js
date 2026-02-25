/**
 * ICLUB Demo App — main.js
 *
 * Logic overview:
 *  1. Wait for the user to focus the 3rd form field (Investment Amount).
 *  2. Show the "AI consultant call" popup.
 *  3. If the user accepts, collect form data, log the simulated Socket API
 *     payload, then launch the Newo WebCall widget in audio mode.
 *  4. After a simulated qualification delay, show the SIP-transfer overlay.
 */

// ─── DOM References ──────────────────────────────────────────────────────────

const form          = document.getElementById('investment-form');
const amountInput   = document.getElementById('amount');

const callPopup     = document.getElementById('call-popup');
const btnAccept     = document.getElementById('btn-accept');
const btnDecline    = document.getElementById('btn-decline');

const sipOverlay    = document.getElementById('sip-overlay');
const sipStatus     = document.getElementById('sip-status');
const btnSipClose   = document.getElementById('btn-sip-close');

const statusBanner  = document.getElementById('status-banner');

// ─── State ───────────────────────────────────────────────────────────────────

let callPopupShown   = false;   // ensure the popup appears only once
let widgetInitialised = false;  // initialise the widget only once
let widgetInitRetryCount = 0;
const widgetApiBaseUrl = import.meta.env.DEV ? '/newo-api' : 'https://app.newo.ai';

function logWidget(level, message, details) {
  const timestamp = new Date().toISOString();
  const prefix = `[WebCallWidget][${timestamp}] ${message}`;
  const logger = typeof console[level] === 'function' ? console[level] : console.log;

  if (typeof details === 'undefined') {
    logger.call(console, prefix);
    return;
  }

  logger.call(console, prefix, details);
}

function findStartAudioCallButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find((button) => {
    const text = (button.textContent || '').trim().toLowerCase();
    return text.includes('start audio call') || text === 'start call';
  });
}

function autoStartWidgetCall() {
  const maxAttempts = 20;
  const retryDelayMs = 120;
  let attempts = 0;

  const tryClickStart = () => {
    attempts += 1;

    const startButton = findStartAudioCallButton();
    if (startButton && !startButton.disabled) {
      logWidget('info', 'auto-start: clicking widget start call button', { attempts });
      startButton.click();
      return;
    }

    if (attempts >= maxAttempts) {
      logWidget('warn', 'auto-start skipped: start call button not found in time', {
        attempts,
      });
      return;
    }

    setTimeout(tryClickStart, retryDelayMs);
  };

  setTimeout(tryClickStart, 0);
}

// ─── Newo Widget Helpers ─────────────────────────────────────────────────────

/**
 * Initialise the Newo Web Call Widget (hidden button mode).
 * Safe to call multiple times — only executes once.
 */
function initWidget() {
  if (widgetInitialised) {
    logWidget('info', 'init skipped: already initialised');
    return;
  }

  logWidget('info', 'init attempt started', {
    documentReadyState: document.readyState,
    hasWidgetGlobal: typeof window.WebCallWidget !== 'undefined',
    retryCount: widgetInitRetryCount,
    apiBaseUrl: widgetApiBaseUrl,
    note: 'Client-side logs appear in browser DevTools console, not web server terminal.',
  });

  if (typeof window.WebCallWidget === 'undefined') {
    widgetInitRetryCount += 1;
    logWidget('warn', 'script not loaded yet; retrying in 500 ms', {
      retryCount: widgetInitRetryCount,
      widgetScriptUrl: 'https://cdn.newo.ai/webcall-widget/widget.umd.min.js',
    });
    setTimeout(initWidget, 500);
    return;
  }

  const initConfig = {
    target: '#call-widget-container',
    showButton: false,
    theme: 'dark',
    defaultMode: 'audio',
    useOnlyAudio: true,
    customerIdn: 'NEs8DGW1Zx',
    connectorIdn: 'newo_voice_connector',
    externalActorId: crypto.randomUUID(),
    apiBaseUrl: widgetApiBaseUrl,
    useLogger: true,
    onReady: () => {
      logWidget('info', 'widget onReady fired');
    },
  };

  const initStartedAt = performance.now();
  logWidget('info', 'calling init(config)', initConfig);

  try {
    window.WebCallWidget.init(initConfig);
    widgetInitialised = true;
    widgetInitRetryCount = 0;
    logWidget('info', 'init success', {
      durationMs: Math.round(performance.now() - initStartedAt),
    });
  } catch (error) {
    logWidget('error', 'init failed', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Collect all current form values into a plain object.
 */
function collectFormData() {
  const data = new FormData(form);
  const payload = {};
  for (const [key, value] of data.entries()) {
    payload[key] = value;
  }
  return payload;
}

/**
 * Log the simulated Socket API payload, then open an audio call via the widget.
 */
function startAICall() {
  const formPayload = collectFormData();

  // Simulate passing context to the Socket API
  console.log('Simulating Socket API Payload with Form Context', formPayload);

  logWidget('info', 'startAICall invoked; ensuring widget is initialised');
  initWidget();

  if (typeof window.WebCallWidget === 'undefined') {
    logWidget('error', "open('audio') skipped: WebCallWidget is unavailable");
    return;
  }

  if (typeof window.WebCallWidget.open !== 'function') {
    logWidget('error', "open('audio') skipped: WebCallWidget.open is not a function");
    return;
  }

  logWidget('info', "calling open('audio')");
  try {
    window.WebCallWidget.open('audio');
    logWidget('info', "open('audio') success");
    autoStartWidgetCall();
  } catch (error) {
    logWidget('error', "open('audio') failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// ─── SIP Transfer Simulation ─────────────────────────────────────────────────

/**
 * Show the SIP-transfer overlay and run through a short status sequence.
 * Called after the AI has "qualified" the lead (simulated with a timeout).
 */
function simulateSIPTransfer() {
  sipOverlay.classList.remove('hidden');
  sipOverlay.classList.add('flex');

  const steps = [
    { delay: 0,    text: 'Connecting to SIP gateway…' },
    { delay: 1500, text: 'Routing to available agent…' },
    { delay: 3000, text: 'Agent connected. Have a great conversation! 🎉' },
  ];

  steps.forEach(({ delay, text }) => {
    setTimeout(() => {
      sipStatus.textContent = text;
      if (text.includes('🎉')) {
        btnSipClose.classList.remove('hidden');
      }
    }, delay);
  });
}

btnSipClose.addEventListener('click', () => {
  sipOverlay.classList.add('hidden');
  sipOverlay.classList.remove('flex');
});

// ─── Call Popup Logic ─────────────────────────────────────────────────────────

function showCallPopup() {
  if (callPopupShown) return;
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

  // Simulate lead qualification after 8 seconds, then trigger SIP transfer
  setTimeout(simulateSIPTransfer, 8000);
});

btnDecline.addEventListener('click', () => {
  hideCallPopup();
});

// Close popup when clicking outside the card
callPopup.addEventListener('click', (e) => {
  if (e.target === callPopup) hideCallPopup();
});

// ─── Trigger: Focus on 3rd Input Field (Investment Amount) ───────────────────

amountInput.addEventListener('focus', () => {
  // Small delay so the keyboard has time to appear before the popup
  setTimeout(showCallPopup, 400);
});

// ─── Form Submit ─────────────────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const payload = collectFormData();
  console.log('Form submitted:', payload);
  statusBanner.classList.remove('hidden');
  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ─── Initialise Widget on Page Load ──────────────────────────────────────────

window.addEventListener('load', initWidget);
