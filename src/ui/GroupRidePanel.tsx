import type { Room } from '../api/types';
import { useT } from '../i18n';
import { Users, Plus, LogIn, LogOut, Radio, Play, ShieldAlert } from 'lucide-react';

type Props = {
  enabled: boolean;
  userId: number | null;
  room: Room | null;
  joinCode: string;
  busy: boolean;
  message: string | null;
  canCreate: boolean;
  onJoinCodeChange: (code: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onStart: () => void;
  onLeave: () => void;
  onEnd: () => void;
};

export function GroupRidePanel({
  enabled,
  userId,
  room,
  joinCode,
  busy,
  message,
  canCreate,
  onJoinCodeChange,
  onCreate,
  onJoin,
  onStart,
  onLeave,
  onEnd,
}: Props) {
  const t = useT();
  const isHost = Boolean(room && userId != null && room.hostUserId === userId);

  return (
    <section className="group-ride-panel" aria-label={t('group.title')}>
      <div className="group-ride-head">
        <h2>
          <Users className="icon-xs" />
          {t('group.title')}
        </h2>
        <p>{t('group.subtitle')}</p>
      </div>

      {!enabled && <p className="muted-text">{t('group.needLogin')}</p>}

      {enabled && !room && (
        <div className="group-ride-actions">
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={!canCreate || busy}
            onClick={onCreate}
          >
            <Plus className="icon-xs" />
            {busy ? t('group.working') : t('group.create')}
          </button>
          {!canCreate && <p className="muted-text">{t('group.needRoute')}</p>}

          <div className="group-join-row">
            <input
              type="text"
              className="group-code-input"
              value={joinCode}
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('group.codePlaceholder')}
              onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
              aria-label={t('group.codePlaceholder')}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || joinCode.trim().length < 4}
              onClick={onJoin}
            >
              <LogIn className="icon-xs" />
              {t('group.join')}
            </button>
          </div>
        </div>
      )}

      {room && (
        <div className="group-lobby">
          <div className="group-lobby-meta">
            <span className="group-code-badge" title={t('group.codeLabel')}>
              {room.code}
            </span>
            <span className="group-status" data-status={room.status}>
              <Radio className="icon-xs" />
              {room.status === 'lobby'
                ? t('group.statusLobby')
                : room.status === 'live'
                  ? t('group.statusLive')
                  : t('group.statusEnded')}
            </span>
            <span className="muted-text">
              {t('group.memberCount', {
                count: room.members.length,
                max: room.maxMembers,
              })}
            </span>
          </div>

          <ul className="group-member-list">
            {room.members.map((m) => (
              <li key={m.userId}>
                <span>{m.displayName}</span>
                {m.isHost && <em>{t('group.host')}</em>}
                {userId === m.userId && <em>{t('group.you')}</em>}
              </li>
            ))}
          </ul>

          {room.status === 'lobby' && !isHost && (
            <p className="muted-text">{t('group.waitHost')}</p>
          )}

          <div className="btn-row">
            {isHost && room.status === 'lobby' && (
              <button
                type="button"
                className="btn btn-accent btn-sm"
                disabled={busy}
                onClick={onStart}
              >
                <Play className="icon-xs" />
                {t('group.start')}
              </button>
            )}
            {isHost && room.status !== 'ended' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={onEnd}
              >
                <ShieldAlert className="icon-xs" />
                {t('group.end')}
              </button>
            )}
            {room.status !== 'ended' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={onLeave}
              >
                <LogOut className="icon-xs" />
                {t('group.leave')}
              </button>
            )}
          </div>
        </div>
      )}

      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
