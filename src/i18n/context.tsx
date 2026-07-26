import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  detectBrowserLocale,
  loadStoredLocale,
  LOCALES,
  LOCALE_LABELS,
  persistLocale,
  type Locale,
} from './locales';
import { de } from './messages/de';
import { dk } from './messages/dk';
import { en, type MessageKey } from './messages/en';
import { es } from './messages/es';
import { it } from './messages/it';
import { no } from './messages/no';
import { ru } from './messages/ru';
import { se } from './messages/se';
import { tr } from './messages/tr';

const dictionaries = { en, tr, de, ru, it, es, se, no, dk } as const;

export type TranslateVars = Record<string, string | number>;

export type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  locales: typeof LOCALES;
  labels: typeof LOCALE_LABELS;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{{${name}}}`,
  );
}

function resolveInitialLocale(): Locale {
  return loadStoredLocale() ?? detectBrowserLocale('en');
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'se' ? 'sv' : locale === 'dk' ? 'da' : locale;
  }, [locale]);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const table = dictionaries[locale] ?? en;
      return interpolate(table[key] ?? en[key] ?? key, vars);
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      locales: LOCALES,
      labels: LOCALE_LABELS,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function useT(): TranslateFn {
  return useI18n().t;
}
