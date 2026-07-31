import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell for the Vite web app (webDir = dist).
 * Build first: `npm run build`, then `npx cap sync android`.
 *
 * Web Bluetooth needs a secure context — Capacitor serves as https://localhost.
 * MapLibre workers load from /maplibre-worker/ (copied into dist by Vite).
 */
const config: CapacitorConfig = {
  appId: 'com.roadlab.app',
  appName: 'ROADLAB',
  webDir: 'dist',
  server: {
    // Allow OSRM / OpenTopoData / OpenFreeMap / Pi API over HTTPS.
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
