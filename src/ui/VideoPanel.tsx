import { useT } from '../i18n';
import { parseYouTubeVideoId, youtubeEmbedUrl } from '../media/youtube';
import { Film } from 'lucide-react';

type Props = {
  enabled: boolean;
  url: string;
  onUrlChange: (url: string) => void;
};

export function VideoPanel({ enabled, url, onUrlChange }: Props) {
  const t = useT();
  if (!enabled) return null;

  const videoId = parseYouTubeVideoId(url);
  const trimmed = url.trim();

  return (
    <aside className="video-panel" aria-label={t('video.title')}>
      <div className="video-panel-toolbar">
        <Film className="icon-xs icon-accent" aria-hidden />
        <input
          type="url"
          className="video-url-input"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={t('video.urlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('video.urlPlaceholder')}
        />
      </div>
      <div className="video-panel-frame">
        {videoId ? (
          <iframe
            key={videoId}
            src={youtubeEmbedUrl(videoId)}
            title={t('video.title')}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <p className="video-panel-empty">
            {trimmed ? t('video.invalid') : t('video.hint')}
          </p>
        )}
      </div>
    </aside>
  );
}
