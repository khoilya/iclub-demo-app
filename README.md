# ICLUB Demo App

A hybrid mobile **Proof-of-Concept** for ICLUB: an investment form with an AI-powered **direct WebRTC** consultant call, built with **Vite + Vanilla JS + TailwindCSS** and packaged as an Android APK via **Capacitor**.

---

## Features

| Feature | Details |
|---|---|
| Investment Form | Name, Email, Phone, Amount, Goal, Risk Tolerance |
| AI Call Trigger | Popup appears when the user focuses the 4th field (Investment Amount) |
| Direct WebRTC Call | No widget dependency, no WebSocket API dependency |
| Newo REST Signaling | `tokens/embedded` + `ice` + `call` endpoints |
| Call Controls | In-call status bar with **End Call** button |
| In-App Debug Logs | Mobile-visible logs panel with Copy/Clear actions |
| Submit Callback Flow | After valid submit (`name` + `phone`), asks consent and sends outbound callback webhook |
| Android Packaging | Capacitor wraps the app into a native APK |

---

## Project Structure

```text
iclub-demo-app/
|- index.html          # Mobile-first UI (TailwindCSS via CDN)
|- main.js             # App logic (form, popup, direct WebRTC)
|- vite.config.js      # Vite configuration (+ dev proxies for /newo-api and /callback-webhook)
|- capacitor.config.js # Capacitor configuration
`- package.json
```

---

## Quick Start (Browser)

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Try the flow

1. Enter your name, email, and phone.
2. Focus the **Investment Amount** field.
3. Click **Yes, Connect Me**.
4. The app starts a direct WebRTC audio call via Newo REST signaling APIs.
5. Use **End Call** anytime from the active-call control bar.
6. Submit form (name + phone required), then confirm callback consent in popup.

---

## Direct WebRTC Signaling Flow

1. `POST /api/v1/webrtc-provider/tokens/embedded`
2. `GET /api/v1/webrtc-provider/ice` (Bearer JWT)
3. Create local offer via `RTCPeerConnection`
4. `POST /api/v1/webrtc-provider/call` with `{ sdp, type: 'offer' }`
5. Apply remote answer SDP and play remote audio

This integration uses standard `navigator.mediaDevices.getUserMedia` and `RTCPeerConnection` directly in `main.js`.

---

## Environment Variables

You can configure these values in `.env` / build env:

```bash
VITE_NEWO_API_BASE_URL=https://app.newo.ai
VITE_NEWO_CUSTOMER_IDN=C_NE_UBL1JSPF
VITE_NEWO_CONNECTOR_IDN=newo_voice_connector
VITE_OUTBOUND_WEBHOOK_URL=https://hooks.newo.ai/UYFns5IzFhXs3Yi89vUTlg
```

Runtime behavior:

- Native (Capacitor): defaults to `https://app.newo.ai`.
- Browser dev: defaults to `/newo-api` (proxied by `vite.config.js`).
- Outbound callback webhook:
  - Native defaults to `https://hooks.newo.ai/UYFns5IzFhXs3Yi89vUTlg`.
  - Browser defaults to `/callback-webhook` (proxied by `vite.config.js` / `netlify.toml`) to avoid CORS.
- Build asset paths:
  - `pnpm build` uses relative assets (`./assets/...`) for Android/iOS builds.
  - `pnpm build:gh` uses `/iclub-demo-app/...` for GitHub Pages.

---

## Deployment Notes

- Browser environments may hit CORS restrictions unless proxied or allowlisted.
- Mobile builds use direct API base URL (default behavior in this app) and use Capacitor native HTTP for signaling calls to bypass WebView CORS.
- `vite.config.js` keeps `/newo-api` and `/callback-webhook` proxies for local browser development.

---

## Build for Android (Capacitor)

### Prerequisites

- [Android Studio](https://developer.android.com/studio)
- JDK 17+
- Android SDK (API 22+)

### Steps

```bash
# 1. Build production web bundle
pnpm build

# 2. Initialize Capacitor (first time only)
pnpm exec cap init "ICLUB Demo" com.iclub.demoapp --web-dir dist

# 3. Add Android platform (first time only)
pnpm exec cap add android

# 4. Sync web assets
pnpm exec cap sync android

# 5. Open Android project
pnpm exec cap open android
```

In Android Studio:

- Use **Build -> Build Bundle(s) / APK(s) -> Build APK(s)**.
- APK output path: `android/app/build/outputs/apk/debug/`.

### Live Reload

```bash
# Start Vite dev server first, then:
pnpm exec cap run android --livereload --external
```

---

## Technology Choices

| Library | Purpose |
|---|---|
| [Vite](https://vitejs.dev) | Dev server + production bundling |
| [TailwindCSS CDN](https://tailwindcss.com) | Utility-first mobile UI |
| [Capacitor](https://capacitorjs.com) | Web to Android/iOS packaging |
| [WebRTC APIs](https://developer.mozilla.org/docs/Web/API/WebRTC_API) | Direct real-time audio call |

---

## Direct Integration Snippet

```js
const jwt = await fetch('/api/v1/webrtc-provider/tokens/embedded', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_idn: 'C_NE_UBL1JSPF',
    connector_idn: 'newo_voice_connector_web',
    external_actor_id: crypto.randomUUID(),
  }),
}).then((r) => r.json()).then((r) => r.jwt);

const ice = await fetch('/api/v1/webrtc-provider/ice', {
  headers: { Authorization: `Bearer ${jwt}` },
}).then((r) => r.json());

const pc = new RTCPeerConnection({
  iceServers: ice.iceServers,
  iceTransportPolicy: ice.iceTransportPolicy || 'relay',
});
```
