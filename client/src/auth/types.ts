export type AuthProviderName = 'google' | 'microsoft';

export type ProviderCredential = {
  provider: AuthProviderName;
  idToken: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  picture: string | null;
  provider: AuthProviderName;
  admin: boolean;
  profileComplete: boolean;
  profileReviewed: boolean;
};

export type StoredSession = {
  token: string;
  expiresAt: number;
  user: SessionUser;
};
