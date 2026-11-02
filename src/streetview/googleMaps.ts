/**
 * Loads the Google Maps JavaScript API (Street View only) without an npm
 * dependency. The browser key is public by design; it is locked down by
 * HTTP-referrer and API restrictions plus a daily quota in Google Cloud.
 *
 * Billing note: Dynamic Street View is charged per panorama *instantiation*,
 * so the ride keeps one StreetViewPanorama and only moves it.
 */

const LOAD_TIMEOUT_MS = 15000;
const CALLBACK_NAME = '__roadlabGoogleMapsReady';

type LatLngLiteral = { lat: number; lng: number };

export interface GoogleStreetViewPanorama {
  setPosition(position: LatLngLiteral): void;
  setPov(pov: { heading: number; pitch: number }): void;
  getStatus(): string;
  addListener(event: string, handler: () => void): { remove(): void };
}

export type GoogleStreetViewLibrary = {
  StreetViewPanorama: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => GoogleStreetViewPanorama;
};

declare global {
  interface Window {
    google?: { maps?: { importLibrary(name: string): Promise<unknown> } };
    [CALLBACK_NAME]?: () => void;
    /** Called by the Maps API when the key is rejected (bad key, referrer, or API not enabled). */
    gm_authFailure?: () => void;
  }
}

export function getGoogleMapsKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

let loadPromise: Promise<GoogleStreetViewLibrary> | null = null;

export function loadGoogleStreetView(apiKey: string): Promise<GoogleStreetViewLibrary> {
  loadPromise ??= new Promise<GoogleStreetViewLibrary>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('Google Maps load timed out')),
      LOAD_TIMEOUT_MS,
    );
    window.gm_authFailure = () => {
      window.clearTimeout(timer);
      reject(new Error('Google Maps rejected the API key'));
    };
    window[CALLBACK_NAME] = () => {
      window.clearTimeout(timer);
      const maps = window.google?.maps;
      if (!maps) {
        reject(new Error('Google Maps did not initialise'));
        return;
      }
      maps
        .importLibrary('streetView')
        .then((lib) => resolve(lib as GoogleStreetViewLibrary))
        .catch(reject);
    };
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      callback: CALLBACK_NAME,
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Allow a retry on the next ride (e.g. after a network blip).
    loadPromise = null;
    throw error;
  });
  return loadPromise;
}
