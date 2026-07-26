# ROADLAB — Indoor Road Ride

Free browser bike trainer inspired by Zwift/Rouvy: **Web Bluetooth FTMS**, heart-rate straps, world-map A→B routing, and elevation-based trainer resistance.

## Stack

- Vite + React + TypeScript
- MapLibre + OpenFreeMap (no Google key required)
- OSRM public routing + OpenTopoData elevation
- Web Bluetooth: FTMS `0x1826`, Heart Rate `0x180D`

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
4. **Start ride** — rider marker advances; grade updates mock resistance
5. Drag **Demo effort** to change power/speed

## Test with real hardware

1. Chrome/Edge on Android, Windows, or macOS (secure context / localhost)
2. Wake trainer + HR strap; enable Bluetooth pairing mode
3. **Connect FTMS** → select your trainer (must expose Fitness Machine Service)
4. **Connect HR strap** → select Heart Rate Service device
5. Build a short route and **Start ride**
6. Confirm Indoor Bike Data (speed/cadence/power) in the HUD
7. On climbs, trainer should receive SIM grade (`0x11`) or resistance fallback

## Optional env

Copy `.env.example` → `.env` to override OSRM, elevation, or map style URLs. Google Maps is optional and unused by default.

## Limitations

| Area | Reality |
|------|---------|
| iOS Safari | No Web Bluetooth — use Chrome/Edge elsewhere, or a WebBLE-capable iOS browser |
| WiFi trainers | Not controllable from a sandboxed tab; probe `ws://127.0.0.1:8787` local bridge stub |
| ANT+ | Needs USB stick + local bridge (documented in UI / `wifiBridge.ts`) |
| Public OSRM / OpenTopoData | Rate limits; app falls back to straight line / synthetic elevation |
| Trainer SIM support | Varies by brand; unsupported devices get grade→resistance mapping |

## Architecture (WiFi bridge)

Browser → WebSocket bridge on localhost → vendor/ANT+ protocol. Bluetooth FTMS works without the bridge.
