# ICLUB Demo App

A hybrid mobile **Proof-of-Concept** for ICLUB — an investment form with an AI-powered WebRTC consultant, built with **Vite + Vanilla JS + TailwindCSS** and packaged as an Android APK via **Capacitor**.

---

## Features

| Feature | Details |
|---|---|
| Investment Form | Name, Email, Amount, Goal, Risk Tolerance |
| AI Call Trigger | Popup fires when the user focuses the 3rd field (Investment Amount) |
| Newo WebCall Widget | Programmatic audio call with form context logged as Socket API payload |
| SIP Transfer Simulation | UI status sequence after lead qualification |
| Android packaging | Capacitor wraps the built web app into a native APK |

---

## Project Structure

```
iclub-demo-app/
├── index.html          # Mobile-first UI (TailwindCSS via CDN)
├── main.js             # App logic (form, popup, widget, SIP transfer)
├── vite.config.js      # Vite configuration
├── capacitor.config.js # Capacitor configuration
└── package.json
```

---

## Quick Start (Browser)

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

**Try the flow:**
1. Enter your name and email.
2. Click / tap the **Investment Amount** field — an AI consultant call popup appears.
3. Click **Yes, Connect Me** — the Newo widget opens an audio call and the form data is logged to the console as the Socket API payload.
4. After ~8 seconds a SIP transfer overlay appears, simulating a hand-off to a human agent.

---

## Build for Android (Capacitor)

### Prerequisites

- [Android Studio](https://developer.android.com/studio) installed
- JDK 17+
- Android SDK (API 22+)

### Steps

```bash
# 1. Build the production web bundle
npm run build

# 2. Initialise Capacitor (first time only)
npx cap init "ICLUB Demo" com.iclub.demoapp --web-dir dist

# 3. Add the Android platform (first time only)
npx cap add android

# 4. Sync web assets into the Android project
npx cap sync android

# 5. Open in Android Studio
npx cap open android
```

In Android Studio:
- Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
- The signed/unsigned APK will be in `android/app/build/outputs/apk/debug/`.

### Live Reload (during development)

```bash
# Start the Vite dev server first, then:
npx cap run android --livereload --external
```

---

## Technology Choices

| Library | Purpose |
|---|---|
| [Vite](https://vitejs.dev) | Fast dev server & production bundler |
| [TailwindCSS CDN](https://tailwindcss.com) | Utility-first mobile UI (no build step) |
| [Capacitor](https://capacitorjs.com) | Web → Android/iOS native packaging |
| [Newo Web Call Widget](https://cdn.newo.ai/webcall-widget/widget.umd.min.js) | AI WebRTC audio call |

---

## Newo Widget Integration

```js
// Initialise (hidden button — triggered programmatically)
window.WebCallWidget.init({
  target:          '#call-widget-container',
  showButton:      false,
  customerIdn:     'YOUR_CUSTOMER_IDN',
  connectorIdn:    'newo_voice_connector',
  externalActorId: crypto.randomUUID(),
  // In dev, /newo-api is proxied by Vite to https://app.newo.ai
  apiBaseUrl:      import.meta.env.DEV ? '/newo-api' : 'https://app.newo.ai',
  useLogger:       true,
});

// Before calling .open(), collect form data and log it
console.log('Simulating Socket API Payload with Form Context', formPayload);

// Launch audio call
window.WebCallWidget.open('audio');
```
