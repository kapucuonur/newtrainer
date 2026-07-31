import { useI18n } from '../i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, locales, labels, t } = useI18n();

  return (
    <div className="language-switcher" role="group" aria-label={t('lang.label')}>
      <span className="language-switcher-label" id="language-switcher-label">
        {t('lang.label')}
      </span>
      <div className="language-switcher-options" aria-labelledby="language-switcher-label">
        {locales.map((code) => {
          const active = locale === code;
          return (
            <button
              key={code}
              type="button"
              className={`lang-btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={labels[code]}
              title={labels[code]}
              onClick={() => setLocale(code)}
            >
              <span className="lang-btn-code">{code.toUpperCase()}</span>
              <span className="lang-btn-name">{labels[code]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
