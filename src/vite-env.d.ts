/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSRM_URL?: string;
  readonly VITE_ELEVATION_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
