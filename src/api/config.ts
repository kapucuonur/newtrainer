/** Base URL for Pi / tunnel API. Empty = cloud features disabled. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? '';
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export function isCloudApiEnabled(): boolean {
  return getApiBaseUrl().length > 0;
}
