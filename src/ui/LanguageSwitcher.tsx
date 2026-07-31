import { useEffect, useId, useRef, useState } from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '../i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, locales, labels, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`language-switcher${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="language-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('lang.label')}
        title={labels[locale]}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Languages className="icon-xs" aria-hidden="true" />
        <span className="language-switcher-code">{locale.toUpperCase()}</span>
        <span className="language-switcher-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open ? (
        <div className="language-switcher-menu" id={menuId} role="menu" aria-label={t('lang.label')}>
          {locales.map((code) => {
            const active = locale === code;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`language-switcher-item${active ? ' is-active' : ''}`}
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
              >
                <span className="language-switcher-item-code">{code.toUpperCase()}</span>
                <span className="language-switcher-item-name">{labels[code]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
