export const LOCALES = ['en', 'tr', 'de', 'ru', 'it', 'es', 'se', 'no', 'dk'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  de: 'Deutsch',
  ru: 'Русский',
  it: 'Italiano',
  es: 'Español',
  se: 'Svenska',
  no: 'Norsk',
  dk: 'Dansk',
};

export const LOCALE_STORAGE_KEY = 'roadlab.locale';

/** Map browser BCP-47 tags onto our locale keys (se/no/dk as requested). */
const BROWSER_MAP: Record<string, Locale> = {
  en: 'en',
  tr: 'tr',
  de: 'de',
  ru: 'ru',
  it: 'it',
  es: 'es',
  sv: 'se',
  se: 'se',
  nb: 'no',
  nn: 'no',
  no: 'no',
  da: 'dk',
  dk: 'dk',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (LOCALES as readonly string[]).includes(value));
}

export function detectBrowserLocale(fallback: Locale = 'en'): Locale {
  if (typeof navigator === 'undefined') return fallback;
  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const raw of candidates) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    const primary = lower.split('-')[0];
    const mapped = BROWSER_MAP[lower] ?? BROWSER_MAP[primary];
    if (mapped) return mapped;
  }
  return fallback;
}

export function loadStoredLocale(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: Locale): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / private mode
  }
}
