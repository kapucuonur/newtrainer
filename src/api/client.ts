import { getApiBaseUrl } from './config';
import type { AuthResponse, RideSummary, Room, User, UserProfile } from './types';

const TOKEN_KEY = 'roadlab_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: string;
  body?: BodyInit | null;
  token?: string | null;
  headers?: Record<string, string>;
  json?: unknown;
};

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) throw new ApiError(0, 'API URL not configured');

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const token = options.token === undefined ? getStoredToken() : options.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body ?? null;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'Network error — is the Pi API reachable?');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : data &&
            typeof data === 'object' &&
            'message' in data &&
            typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : res.status === 413
            ? 'Route payload too large for the API'
            : `Request failed (${res.status})`;
    const code =
      data &&
      typeof data === 'object' &&
      'code' in data &&
      typeof (data as { code: unknown }).code === 'string'
        ? (data as { code: string }).code
        : undefined;
    throw new ApiError(res.status, message, code);
  }

  return data as T;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    json: { email, password, displayName },
    token: null,
  });
  setStoredToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    json: { email, password },
    token: null,
  });
  setStoredToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchMe(): Promise<User> {
  const data = await apiRequest<{ user: User }>('/api/me');
  return data.user;
}

export async function updateProfile(
  patch: Partial<{
    displayName: string | null;
    weightKg: number | null;
    ftp: number | null;
    bikeWeightKg: number | null;
  }>,
): Promise<User> {
  const data = await apiRequest<{ user: User }>('/api/me/profile', {
    method: 'PATCH',
    json: patch,
  });
  return data.user;
}

export async function listRides(): Promise<RideSummary[]> {
  const data = await apiRequest<{ rides: RideSummary[] }>('/api/rides');
  return data.rides;
}

export type SaveRideInput = {
  routeName?: string | null;
  startedAt: string;
  endedAt?: string | null;
  distanceM: number;
  durationS: number;
  avgPower?: number | null;
  maxPower?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  elevationGainM?: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
};

/** Persist a light workout summary on the Pi (no track points / FIT / GPX). */
export async function saveRide(input: SaveRideInput): Promise<RideSummary> {
  const data = await apiRequest<{ ride: RideSummary }>('/api/rides', {
    method: 'POST',
    json: {
      routeName: input.routeName ?? null,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      distanceM: input.distanceM,
      durationS: input.durationS,
      avgPower: input.avgPower ?? null,
      maxPower: input.maxPower ?? null,
      avgHr: input.avgHr ?? null,
      maxHr: input.maxHr ?? null,
      avgSpeedKmh: input.avgSpeedKmh ?? null,
      maxSpeedKmh: input.maxSpeedKmh ?? null,
      elevationGainM: input.elevationGainM ?? null,
      avgCadence: input.avgCadence ?? null,
      maxCadence: input.maxCadence ?? null,
    },
  });
  return data.ride;
}

export async function createRoom(route: unknown): Promise<Room> {
  const data = await apiRequest<{ room: Room }>('/api/rooms', {
    method: 'POST',
    json: { route },
  });
  return data.room;
}

export async function joinRoom(code: string): Promise<Room> {
  const data = await apiRequest<{ room: Room }>('/api/rooms/join', {
    method: 'POST',
    json: { code },
  });
  return data.room;
}

export async function fetchRoom(roomId: number): Promise<Room> {
  const data = await apiRequest<{ room: Room }>(`/api/rooms/${roomId}`);
  return data.room;
}

export async function startRoom(roomId: number): Promise<Room> {
  const data = await apiRequest<{ room: Room }>(`/api/rooms/${roomId}/start`, {
    method: 'POST',
  });
  return data.room;
}

export async function leaveRoom(roomId: number): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/rooms/${roomId}/leave`, {
    method: 'POST',
  });
}

export async function endRoom(roomId: number): Promise<Room> {
  const data = await apiRequest<{ room: Room }>(`/api/rooms/${roomId}/end`, {
    method: 'POST',
  });
  return data.room;
}

export type { User, UserProfile, RideSummary, Room };
