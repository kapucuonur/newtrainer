import { useT } from '../i18n';

// Absolute URLs so they also work inside the Android shell (opens the system browser).
const SITE = 'https://newtrainer.trihonor.com';

export function LegalLinks() {
  const t = useT();
  return (
    <p className="device-info-text legal-links">
      <a href={`${SITE}/privacy.html`} target="_blank" rel="noopener noreferrer">
        {t('legal.privacy')}
      </a>
      {' · '}
      <a href={`${SITE}/terms.html`} target="_blank" rel="noopener noreferrer">
        {t('legal.terms')}
      </a>
    </p>
  );
}
