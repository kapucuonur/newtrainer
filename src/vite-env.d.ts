/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSRM_URL?: string;
  readonly VITE_ELEVATION_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAPILLARY_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
