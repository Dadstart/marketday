import * as jose from 'jose';

import { isAdminEmail } from './admins.js';
import { googleClientIds, microsoftClientId, sessionSecret } from './env.js';
import type { CurrentUser, Identity, ProviderName } from './types.js';

const googleJwks = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const microsoftJwks = jose.createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

const sessionKey = new TextEncoder().encode(sessionSecret);

export async function verifyIdentityToken(
  provider: ProviderName,
  idToken: string,
): Promise<Identity> {
  if (provider === 'google') {
    return verifyGoogle(idToken);
  }
  return verifyMicrosoft(idToken);
}

export async function signSession(user: CurrentUser): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const token = await new jose.SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    admin: user.admin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionKey);

  return { token, expiresAt: expiresAt * 1000 };
}

export async function verifySession(token: string): Promise<CurrentUser> {
  const { payload } = await jose.jwtVerify(token, sessionKey, { algorithms: ['HS256'] });
  const id = payload.sub;
  const email = stringClaim(payload.email);
  const name = stringClaim(payload.name);
  const provider = payload.provider;
  if (!id || !email || !name || (provider !== 'google' && provider !== 'microsoft')) {
    throw new Error('The session is invalid.');
  }

  return {
    id,
    email,
    name,
    picture: stringClaim(payload.picture),
    provider,
    admin: isAdminEmail(email),
  };
}

async function verifyGoogle(idToken: string): Promise<Identity> {
  if (googleClientIds.length === 0) {
    throw new Error('Google sign-in is not configured on the server.');
  }

  const { payload } = await jose.jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: googleClientIds,
  });

  if (payload.email_verified !== true) {
    throw new Error('Google has not verified this email address.');
  }

  return identityFromPayload('google', payload);
}

async function verifyMicrosoft(idToken: string): Promise<Identity> {
  if (!microsoftClientId) {
    throw new Error('Microsoft sign-in is not configured on the server.');
  }

  const { payload } = await jose.jwtVerify(idToken, microsoftJwks, {
    audience: microsoftClientId,
  });
  const issuer = stringClaim(payload.iss) ?? '';
  if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i.test(issuer)) {
    throw new Error('The Microsoft sign-in token is from an unexpected issuer.');
  }

  return identityFromPayload('microsoft', payload);
}

function identityFromPayload(provider: ProviderName, payload: jose.JWTPayload): Identity {
  const subject = stringClaim(payload.sub);
  const email = normalizeEmail(payload.email) ?? normalizeEmail(payload.preferred_username);
  const name = stringClaim(payload.name) ?? email;
  if (!subject || !email || !name) {
    throw new Error('The sign-in token did not include an email address.');
  }

  return {
    provider,
    subject,
    email,
    name,
    picture: publicPicture(stringClaim(payload.picture)),
  };
}

function stringClaim(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = stringClaim(value)?.toLowerCase();
  if (!email || !email.includes('@')) {
    return null;
  }
  return email;
}

function publicPicture(value: string | null): string | null {
  if (!value?.startsWith('https://') || value.includes('graph.microsoft.com')) {
    return null;
  }
  return value;
}
