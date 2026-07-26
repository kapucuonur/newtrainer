import { useI18n } from '../i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, locales, labels, t } = useI18n();

  return (
    <label className="language-switcher">
      <span>{t('lang.label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        aria-label={t('lang.label')}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {labels[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
