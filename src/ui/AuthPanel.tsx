import { useEffect, useState } from 'react';
import { listRides } from '../api/client';
import { isCloudApiEnabled } from '../api/config';
import type { RideSummary, User } from '../api/types';
import { useT } from '../i18n';
import { formatDistance, formatDuration } from './format';
import { User as UserIcon, Lock, Mail, History, Save, LogOut, Award, Shield, UserPlus, LogIn } from 'lucide-react';

type Props = {
  user: User | null;
  busy: boolean;
  message: string | null;
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
    if (!user || !cloud) return;
    let cancel = false;
    setRidesLoading(true);
    listRides()
      .then((data) => {
        if (!cancel) setRides(data);
      })
      .catch(() => {
        if (!cancel) setRides([]);
      })
      .finally(() => {
        if (!cancel) setRidesLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [user, cloud, historyRevision]);

  if (!cloud) {
    return (
      <section className="auth-card">
        <h2>
          <Shield className="icon-xs" />
          {t('auth.cloudDisabled')}
        </h2>
        <p className="device-info-text">{t('auth.accountHint')}</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="auth-card" id="account-panel">
        <div className="profile-header">
          <Award className="icon-md icon-accent" />
          <div>
            <h2>{user.profile.displayName || user.email}</h2>
            <p className="device-info-text">{user.email}</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSaveProfile({ displayName, weightKg, ftp, bikeWeightKg });
          }}
          className="profile-form"
        >
          <div className="input-group">
            <label htmlFor="pf-name">
              <UserIcon className="icon-xs" />
              {t('auth.displayName')}
            </label>
            <input
              id="pf-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="profile-row-3">
            <div className="input-group">
              <label htmlFor="pf-w">{t('auth.weight')}</label>
              <input
                id="pf-w"
                type="number"
                step="0.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label htmlFor="pf-ftp">{t('auth.ftp')}</label>
              <input
                id="pf-ftp"
                type="number"
                value={ftp}
                onChange={(e) => setFtp(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label htmlFor="pf-bw">{t('auth.bikeWeight')}</label>
              <input
                id="pf-bw"
                type="number"
                step="0.5"
                value={bikeWeightKg}
                onChange={(e) => setBikeWeightKg(e.target.value)}
              />
            </div>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              <Save className="icon-xs" />
              {busy ? 'Saving...' : t('auth.saveProfile')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void onLogout()}
            >
              <LogOut className="icon-xs" />
              {t('auth.logOut')}
            </button>
          </div>
        </form>

        <div className="history-section">
          <h3>
            <History className="icon-xs" />
            {t('auth.rideHistory')}
          </h3>
          {ridesLoading && <p className="device-info-text">Loading history...</p>}
          {!ridesLoading && rides.length === 0 && (
            <p className="device-info-text">{t('auth.rideHistoryEmpty')}</p>
          )}
          {!ridesLoading && rides.length > 0 && (
            <ul className="ride-history-list">
              {rides.map((r) => (
                <li key={r.id} className="ride-history-item">
                  <div className="ride-history-date">{formatRideDate(r.createdAt)}</div>
                  <div className="ride-history-stats">{rideStatsLine(r)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {message && <p className="auth-message">{message}</p>}
      </section>
    );
  }

  return (
    <section className="auth-card" id="account-panel">
      <div className="auth-tabs">
        <button
          type="button"
          className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
          onClick={() => setMode('login')}
        >
          <LogIn className="icon-xs" />
          {t('auth.login')}
        </button>
        <button
          type="button"
          className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
          onClick={() => setMode('register')}
        >
          <UserPlus className="icon-xs" />
          {t('auth.register')}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'login') {
            void onLogin(email, password);
          } else {
            void onRegister(email, password, displayName);
          }
        }}
        className="auth-form"
      >
        {mode === 'register' && (
          <div className="input-group">
            <label htmlFor="reg-name">
              <UserIcon className="icon-xs" />
              {t('auth.displayName')}
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
        )}

        <div className="input-group">
          <label htmlFor="auth-email">
            <Mail className="icon-xs" />
            {t('auth.email')}
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label htmlFor="auth-pass">
            <Lock className="icon-xs" />
            {t('auth.password')}
          </label>
          <input
            id="auth-pass"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? 'Please wait...'
            : mode === 'login'
              ? t('auth.logIn')
              : t('auth.createAccount')}
        </button>
      </form>

      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
