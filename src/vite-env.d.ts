/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSRM_URL?: string;
  readonly VITE_ELEVATION_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  /** Self-hosted ROADLAB API (Pi + Cloudflare Tunnel). Unset = local-only. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
