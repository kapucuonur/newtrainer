import { useEffect, useState } from 'react';
import { listRides } from '../api/client';
import { isCloudApiEnabled } from '../api/config';
import type { RideSummary, User } from '../api/types';
import { useT } from '../i18n';
import { formatDistance, formatDuration } from './format';

type Props = {
  user: User | null;
  busy: boolean;
  message: string | null;
  /** Bump after saving a ride so history reloads. */
  historyRevision?: number;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, displayName: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onSaveProfile: (fields: {
    displayName: string;
    weightKg: string;
    ftp: string;
    bikeWeightKg: string;
  }) => Promise<void>;
};

function formatRideDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rideStatsLine(ride: RideSummary): string {
  const parts: string[] = [
    formatDistance(ride.distanceM),
    formatDuration(ride.durationS),
  ];
  if (ride.avgPower != null) parts.push(`${Math.round(ride.avgPower)} W`);
  if (ride.maxPower != null) parts.push(`max ${Math.round(ride.maxPower)} W`);
  if (ride.avgHr != null) parts.push(`${Math.round(ride.avgHr)} bpm`);
  if (ride.avgSpeedKmh != null) parts.push(`${ride.avgSpeedKmh.toFixed(1)} km/h`);
  if (ride.elevationGainM != null) parts.push(`↑ ${Math.round(ride.elevationGainM)} m`);
  return parts.join(' · ');
}

export function AuthPanel({
  user,
  busy,
  message,
  historyRevision = 0,
  onLogin,
  onRegister,
  onLogout,
  onSaveProfile,
}: Props) {
  const t = useT();
  const cloud = isCloudApiEnabled();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [ftp, setFtp] = useState('');
  const [bikeWeightKg, setBikeWeightKg] = useState('');
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [ridesLoading, setRidesLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.profile.displayName ?? '');
    setWeightKg(user.profile.weightKg != null ? String(user.profile.weightKg) : '');
    setFtp(user.profile.ftp != null ? String(user.profile.ftp) : '');
    setBikeWeightKg(
      user.profile.bikeWeightKg != null ? String(user.profile.bikeWeightKg) : '',
    );
  }, [user]);

  useEffect(() => {
    if (!user || !cloud) {
      setRides([]);
      return;
    }
    let cancelled = false;
    setRidesLoading(true);
    void listRides()
      .then((next) => {
        if (!cancelled) setRides(next);
      })
      .catch(() => {
        if (!cancelled) setRides([]);
      })
      .finally(() => {
        if (!cancelled) setRidesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, cloud, historyRevision]);

  if (!cloud) {
    return (
      <section id="account-panel" className="device-card auth-card">
        <div className="device-card-head">
          <div>
            <h2>{t('auth.cloudTitle')}</h2>
            <p>{t('auth.cloudDisabled')}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section id="account-panel" className="device-card auth-card">
        <div className="device-card-head">
          <div>
            <h2>{t('auth.accountTitle')}</h2>
            <p>{t('auth.accountHint')}</p>
          </div>
        </div>
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('login')}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('register')}
          >
            {t('auth.register')}
          </button>
        </div>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'login') void onLogin(email, password);
            else void onRegister(email, password, displayName);
          }}
        >
          {mode === 'register' && (
            <label>
              {t('auth.displayName')}
              <input
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('auth.displayNamePlaceholder')}
              />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {t('auth.password')}
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? '…' : mode === 'login' ? t('auth.logIn') : t('auth.createAccount')}
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
      </section>
    );
  }

  return (
    <section id="account-panel" className="device-card auth-card">
      <div className="device-card-head">
        <div>
          <h2>{t('auth.profile')}</h2>
          <p>
            {user.profile.displayName || user.email}
            <br />
            <span className="auth-email">{user.email}</span>
          </p>
        </div>
      </div>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSaveProfile({ displayName, weightKg, ftp, bikeWeightKg });
        }}
      >
        <label>
          {t('auth.displayName')}
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('auth.displayNamePlaceholder')}
          />
        </label>
        <label>
          {t('auth.weight')}
          <input
            type="number"
            min={1}
            step={0.1}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </label>
        <label>
          {t('auth.ftp')}
          <input
            type="number"
            min={1}
            step={1}
            value={ftp}
            onChange={(e) => setFtp(e.target.value)}
          />
        </label>
        <label>
          {t('auth.bikeWeight')}
          <input
            type="number"
            min={1}
            step={0.1}
            value={bikeWeightKg}
            onChange={(e) => setBikeWeightKg(e.target.value)}
          />
        </label>
        <div className="btn-row">
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? '…' : t('auth.saveProfile')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void onLogout()}
          >
            {t('auth.logOut')}
          </button>
        </div>
      </form>
      {message && <p className="auth-message">{message}</p>}

      <div className="ride-history">
        <h3>{t('auth.rideHistory')}</h3>
        <p className="ride-history-hint">{t('auth.rideHistoryHint')}</p>
        {ridesLoading ? (
          <p className="muted-text">…</p>
        ) : rides.length === 0 ? (
          <p className="muted-text">{t('auth.rideHistoryEmpty')}</p>
        ) : (
          <ul className="ride-history-list">
            {rides.map((ride) => (
              <li key={ride.id} className="ride-history-item">
                <div className="ride-history-title">
                  {ride.routeName || t('auth.rideUntitled')}
                </div>
                <div className="ride-history-meta">{formatRideDate(ride.startedAt)}</div>
                <div className="ride-history-stats">{rideStatsLine(ride)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
