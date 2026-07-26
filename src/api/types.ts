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

export type RideSummary = {
  id: number;
  routeName: string | null;
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  durationS: number;
  avgPower: number | null;
  avgHr: number | null;
  hasFit: boolean;
  hasGpx: boolean;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};
