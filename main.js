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

// ─── Newo Widget Helpers ─────────────────────────────────────────────────────

/**
 * Initialise the Newo Web Call Widget (hidden button mode).
 * Safe to call multiple times — only executes once.
 */
function initWidget() {
  if (widgetInitialised) return;
  if (typeof window.WebCallWidget === 'undefined') {
    console.warn('Newo WebCallWidget script not loaded yet — retrying in 500 ms');
    setTimeout(initWidget, 500);
    return;
  }
  window.WebCallWidget.init({
    target:         '#call-widget-container',
    showButton:     false,
    customerIdn:    'DEMO',
    connectorIdn:   'DEMO',
    externalActorId:'DEMO_USER',
  });
  widgetInitialised = true;
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

  initWidget();
  window.WebCallWidget.open('audio');
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
