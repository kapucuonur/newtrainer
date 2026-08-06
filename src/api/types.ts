export type UserProfile = {
  displayName: string | null;
  weightKg: number | null;
  ftp: number | null;
  bikeWeightKg: number | null;
};

export type User = {
  id: number;
  email: string;
  createdAt: string;
  profile: UserProfile;
};

/** Server-stored workout summary — no GPS track or FIT/GPX files. */
export type RideSummary = {
  id: number;
  routeName: string | null;
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  durationS: number;
  avgPower: number | null;
  maxPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  elevationGainM: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type RoomStatus = 'lobby' | 'live' | 'ended';

export type RoomMember = {
  userId: number;
  displayName: string;
  joinedAt?: string;
  lastSeen?: string;
  isHost: boolean;
};

export type Room = {
  id: number;
  code: string;
  hostUserId: number;
  status: RoomStatus;
  route: unknown;
  createdAt: string;
  maxMembers: number;
  members: RoomMember[];
};

export type PeerRider = {
  userId: number;
  displayName: string;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  speed_kmh: number | null;
  power: number | null;
  hr: number | null;
  cadence: number | null;
  stale?: boolean;
};
