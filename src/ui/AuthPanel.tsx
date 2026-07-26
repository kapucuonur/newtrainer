import { useEffect, useState } from 'react';
import { isCloudApiEnabled } from '../api/config';
import type { User } from '../api/types';

type Props = {
  user: User | null;
  busy: boolean;
  message: string | null;
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

export function AuthPanel({
  user,
  busy,
  message,
  onLogin,
  onRegister,
  onLogout,
  onSaveProfile,
}: Props) {
  const cloud = isCloudApiEnabled();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [ftp, setFtp] = useState('');
  const [bikeWeightKg, setBikeWeightKg] = useState('');

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.profile.displayName ?? '');
    setWeightKg(user.profile.weightKg != null ? String(user.profile.weightKg) : '');
    setFtp(user.profile.ftp != null ? String(user.profile.ftp) : '');
    setBikeWeightKg(
      user.profile.bikeWeightKg != null ? String(user.profile.bikeWeightKg) : '',
    );
  }, [user]);

  if (!cloud) {
    return (
      <section className="device-card auth-card">
        <div className="device-card-head">
          <div>
            <h2>Cloud profile</h2>
            <p>Optional. Set VITE_API_URL to your Pi API to sync profile & rides.</p>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="device-card auth-card">
        <div className="device-card-head">
          <div>
            <h2>Account</h2>
            <p>Register or log in to save rides on your Pi.</p>
          </div>
        </div>
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('register')}
          >
            Register
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
              Display name
              <input
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Rider"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
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
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
      </section>
    );
  }

  return (
    <section className="device-card auth-card">
      <div className="device-card-head">
        <div>
          <h2>Profile</h2>
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
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Rider"
          />
        </label>
        <label>
          Weight (kg)
          <input
            type="number"
            min={1}
            step={0.1}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </label>
        <label>
          FTP (W)
          <input
            type="number"
            min={1}
            step={1}
            value={ftp}
            onChange={(e) => setFtp(e.target.value)}
          />
        </label>
        <label>
          Bike weight (kg)
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
            {busy ? '…' : 'Save profile'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void onLogout()}
          >
            Log out
          </button>
        </div>
      </form>
      {message && <p className="auth-message">{message}</p>}
    </section>
  );
}
