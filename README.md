# ROADLAB — Indoor Road Ride

Free browser bike trainer inspired by Zwift/Rouvy: **Web Bluetooth FTMS**, heart-rate straps, world-map A→B routing, and elevation-based trainer resistance.

## Stack

- Vite + React + TypeScript
- MapLibre + OpenFreeMap Bright (free outdoor tiles; no Google/Mapbox key)
- OSRM public routing + OpenTopoData elevation
- Web Bluetooth: FTMS `0x1826`, Heart Rate `0x180D`
- Capacitor Android shell (`android/`) — maps/UI packaging; BLE via Chrome until native plugin

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in **Chrome or Edge** (Web Bluetooth).

```bash
npm run build
npm run preview
```

Parse self-check:

```bash
npx tsx src/bluetooth/ftms.parse.test.ts
```

## Test without hardware

1. Click **Use demo trainer**
2. Click **Set A** / **Set B** on the map (or keep pick mode)
3. **Build route** → wait for OSRM + elevation
4. **Start ride** — follow-road camera pitches along the route (3D-feel); marker advances; grade updates mock resistance
5. Drag **Demo effort** to change power/speed
6. **Stop** or finish the route → **Ride complete** → **Download FIT** / **Download GPX** locally (Garmin Connect import is manual; OAuth upload not included). Optionally **Save summary** to your Pi profile (stats only — no track/files on the server)

## Test with real hardware

1. Chrome/Edge on Android, Windows, or macOS (secure context / localhost)
2. Wake trainer + HR strap; enable Bluetooth pairing mode
3. **Connect FTMS** → select your trainer (must expose Fitness Machine Service)
4. **Connect HR strap** → select Heart Rate Service device
5. Build a short route and **Start ride**
6. Confirm Indoor Bike Data (speed/cadence/power) in the HUD
7. On climbs, trainer should receive SIM grade (`0x11`) or resistance fallback

## Cloud profile (optional, Raspberry Pi)

Self-hosted API under [`backend/`](./backend) (Node + Fastify + SQLite). No Supabase.

1. On Pi: see [`backend/README.md`](./backend/README.md) — `npm install && npm start`, systemd, Cloudflare Tunnel
2. Tunnel hostname example: `https://newtrainer-api.trihonor.com` → `http://localhost:8788`
3. Vercel / local env: `VITE_API_URL=https://newtrainer-api.trihonor.com`

Without `VITE_API_URL`, the app stays local-only (Bluetooth / map / FIT+GPX download unchanged). With the API, the Pi stores **ride summaries only** (date, distance, duration, power/HR/speed, route label) — not GPS tracks or FIT/GPX files.

## Optional env

Copy `.env.example` → `.env` to override OSRM, elevation, map style, or API URL.

| Variable | Default | Notes |
|----------|---------|--------|
| `VITE_MAP_STYLE_URL` | OpenFreeMap **bright** (Outdoors) | Free, no key. UI presets: Outdoors / Streets / Light. `dark` / `fiord` are grayscale-ish |
| `VITE_API_URL` | unset | Pi API base URL. Enables register/login, profile, save ride summary |

During rides, immersion uses the MapLibre pitched follow camera along the A→B polyline.

## Android (Capacitor)

Same Vite app in this repo; native shell under [`android/`](./android/).

| Path | Bluetooth FTMS/HR | Maps | Notes |
|------|-------------------|------|--------|
| **Chrome Android** (recommended for BLE today) | Yes (Web Bluetooth) | Yes | Open the Vercel/HTTPS URL or `npm run preview` over HTTPS |
| **Capacitor APK** | Not via WebView | Yes | Android System WebView has **no** `navigator.bluetooth` |
| Phase 2 | Native BLE plugin | Already wired | e.g. `@capacitor-community/bluetooth-le` or Capgo Web Bluetooth shim |

### Build / open in Android Studio

Requires JDK + Android SDK (Android Studio install is enough).

```bash
npm install
npm run build:android   # vite build → dist → cap sync android
npm run open:android    # opens android/ in Android Studio
```

`vite build` bakes env at **build time**. Production Android builds load [`.env.production`](./.env.production) (`VITE_API_URL=https://newtrainer-api.trihonor.com`), same API as the Vercel web app. Without that URL, Account / Group ride menus show the intentional “cloud API required” notices — not UI bugs.

Override for a one-off build:

```bash
VITE_API_URL=https://newtrainer-api.trihonor.com npm run build:android
```

Then Run on a device/emulator. Grant Bluetooth (and Location on API ≤30) when prompted.

Permissions are declared in `android/app/src/main/AndroidManifest.xml` (`BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`, legacy BT + location). Cleartext HTTP is off; tiles/API must be HTTPS. Capacitor serves the app as `https://localhost` (secure context for MapLibre workers under `/maplibre-worker/`).

**Important:** FTMS pairing still works best in **Chrome Android** until a native BLE plugin is integrated. The Capacitor shell is for installability, keep-awake, and map/UI packaging.

## Limitations

| Area | Reality |
|------|---------|
| iOS Safari | No Web Bluetooth — use Chrome/Edge elsewhere, or a WebBLE-capable iOS browser |
| Capacitor Android WebView | No Web Bluetooth — use Chrome Android, or add a native BLE plugin |
| WiFi trainers | Not controllable from a sandboxed tab; probe `ws://127.0.0.1:8787` local bridge stub |
| ANT+ | Needs USB stick + local bridge (documented in UI / `wifiBridge.ts`) |
| Public OSRM / OpenTopoData | Rate limits; app falls back to straight line / synthetic elevation |
| Trainer SIM support | Varies by brand; unsupported devices get grade→resistance mapping |

## Architecture (WiFi bridge)

Browser → WebSocket bridge on localhost → vendor/ANT+ protocol. Bluetooth FTMS works without the bridge.
