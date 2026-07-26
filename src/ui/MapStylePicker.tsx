import { useT } from '../i18n';
import { MAP_STYLE_PRESETS, type MapStyleId } from '../map/mapStyles';

type Props = {
  styleId: MapStyleId;
  onChange: (id: MapStyleId) => void;
  className?: string;
};

export function MapStylePicker({ styleId, onChange, className }: Props) {
  const t = useT();

  return (
    <div
      className={['map-style-picker', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={t('map.stylePicker')}
    >
      {MAP_STYLE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={
            styleId === preset.id
              ? 'map-style-picker-btn map-style-picker-btn-active'
              : 'map-style-picker-btn'
          }
          onClick={() => onChange(preset.id)}
        >
          {t(preset.labelKey)}
        </button>
      ))}
    </div>
  );
}
