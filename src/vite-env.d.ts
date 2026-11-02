/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSRM_URL?: string;
  readonly VITE_ELEVATION_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  /** Self-hosted ROADLAB API (Pi + Cloudflare Tunnel). Unset = local-only. */
  readonly VITE_API_URL?: string;
  /** Mapillary public client token for street-level ride imagery. Unset = street view off. */
  readonly VITE_MAPILLARY_ACCESS_TOKEN?: string;
  /** Google Maps JS API browser key (referrer-restricted) — preferred street view source when set. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
