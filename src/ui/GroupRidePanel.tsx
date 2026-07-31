import type { Room } from '../api/types';
import { useT } from '../i18n';
import { Users, Plus, LogIn, LogOut, Radio, Play, ShieldAlert } from 'lucide-react';

type Props = {
  cloudEnabled: boolean;
  userId: number | null;
  room: Room | null;
  joinCode: string;
  busy: boolean;
  message: string | null;
  canCreate: boolean;
  routePending: boolean;
  onJoinCodeChange: (code: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onStart: () => void;
  onLeave: () => void;
  onEnd: () => void;
};

export function GroupRidePanel({
  cloudEnabled,
  userId,
  room,
  joinCode,
  busy,
  message,
  canCreate,
  routePending,
  onJoinCodeChange,
  onCreate,
  onJoin,
  onStart,
  onLeave,
  onEnd,
}: Props) {
  const t = useT();
  const loggedIn = userId != null;
  const enabled = cloudEnabled && loggedIn;
  const isHost = Boolean(room && loggedIn && room.hostUserId === userId);
  const createBlockedReason = !canCreate
    ? routePending
      ? t('group.routePending')
      : t('group.needRoute')
    : undefined;
  const canJoin = joinCode.trim().length >= 4;

  return (
    <section className="group-ride-panel" aria-label={t('group.title')}>
      <div className="group-ride-head">
        <h2>
          <Users className="icon-xs" />
          {t('group.title')}
        </h2>
        <p>{t('group.subtitle')}</p>
      </div>

      {!cloudEnabled && <p className="muted-text">{t('group.needCloud')}</p>}
      {cloudEnabled && !loggedIn && <p className="muted-text">{t('group.needLogin')}</p>}

      {enabled && !room && (
        <div className="group-ride-actions">
          <div className="group-create-block">
            <button
              type="button"
              className="btn btn-accent btn-sm"
              disabled={busy || !canCreate}
              title={createBlockedReason}
              onClick={onCreate}
            >
              <Plus className="icon-xs" />
              {busy ? t('group.working') : t('group.create')}
            </button>
            {createBlockedReason && (
              <p className="group-need-route" role="status">
                {createBlockedReason}
              </p>
            )}
          </div>

          <div className="group-join-block">
            <p className="group-join-hint">{t('group.joinHint')}</p>
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
                disabled={busy || !canJoin}
                title={!canJoin ? t('group.needCode') : undefined}
                onClick={onJoin}
              >
                <LogIn className="icon-xs" />
                {t('group.join')}
              </button>
            </div>
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
