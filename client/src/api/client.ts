import type { SessionUser, StoredSession } from '../auth/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type EventSummary = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  registrationCount: number;
  registered: boolean;
  paid: boolean;
  feeCents: number | null;
  spaceRequested: string | null;
  spacesAvailable: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[];
  createdAt: string;
};

export type RegistrationSummary = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  paid: boolean | null;
  amountCents: number | null;
  spaceRequested: string | null;
  createdAt: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  email: string;
  businessName: string | null;
  profileComplete: boolean;
};

export type AccountDetail = AccountSummary & {
  provider: 'google' | 'microsoft';
  venmo: string | null;
  contactPerson: string | null;
  phone: string | null;
  crosswindsResident: boolean | null;
  offering: string | null;
  productsAndServices: string | null;
  facebookName: string | null;
  createdAt: string;
};

export type EventDetail = {
  event: EventSummary;
  registrations: RegistrationSummary[];
};

export type EventDraft = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number | null;
  spacesAvailable: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[];
};

export type VendorProfileInput = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean;
  offering: 'retail' | 'food' | 'service' | 'group' | 'entertainment';
  productsAndServices: string;
  facebookName: string | null;
};

export type VendorProfileDraft = {
  venmo: string;
  contactPerson: string;
  businessName: string;
  phone: string;
  crosswindsResident: boolean | null;
  offering: VendorProfileInput['offering'] | null;
  productsAndServices: string;
  facebookName: string;
};

export async function createApiSession(input: {
  provider: 'google' | 'microsoft';
  idToken: string;
}): Promise<StoredSession> {
  const body = await request<StoredSession>('/session', null, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!isSession(body)) {
    throw new ApiError('The server returned an unexpected sign-in response.', 500);
  }
  return { ...body, user: normalizeUser(body.user) };
}

export async function fetchMe(token: string): Promise<SessionUser> {
  const body = await request<{ user: SessionUser }>('/me', token);
  return normalizeUser(body.user);
}

export async function fetchVendorProfile(token: string): Promise<VendorProfileDraft | null> {
  const body = await request<{ profile: VendorProfileDraft | null }>('/me/profile', token);
  return body.profile;
}

export async function saveVendorProfile(
  token: string,
  profile: VendorProfileInput,
): Promise<{ user: SessionUser }> {
  const body = await request<{ user: SessionUser }>('/me/profile', token, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  return { user: normalizeUser(body.user) };
}

export function fetchAccounts(token: string): Promise<{ users: AccountSummary[] }> {
  return request('/admin/users', token);
}

export function fetchAccount(token: string, userId: string): Promise<{ user: AccountDetail }> {
  return request(`/admin/users/${userId}`, token);
}

export function fetchEvents(token: string): Promise<{ events: EventSummary[] }> {
  return request('/events', token);
}

export function fetchEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}`, token);
}

export function deleteEvent(token: string, eventId: string): Promise<void> {
  return request(`/events/${eventId}`, token, { method: 'DELETE' });
}

export function updateEvent(token: string, eventId: string, draft: EventDraft): Promise<EventDetail> {
  return request(`/events/${eventId}`, token, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });
}

export function createEvent(token: string, draft: EventDraft): Promise<{ event: EventSummary }> {
  return request('/events', token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function registerForEvent(
  token: string,
  eventId: string,
  spaceRequested: 'grass-generator' | 'grass' | 'food-truck' | 'pavilion',
): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, {
    method: 'POST',
    body: JSON.stringify({ spaceRequested }),
  });
}

export function unregisterFromEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, { method: 'DELETE' });
}

export function startEventPayment(
  token: string,
  eventId: string,
  returnUrl: string,
): Promise<{ url: string | null; paid: boolean }> {
  return request(`/events/${eventId}/payment`, token, {
    method: 'POST',
    body: JSON.stringify({ returnUrl }),
  });
}

export function confirmCheckout(
  token: string,
  sessionId: string,
): Promise<{ paid: boolean; eventId: string }> {
  return request('/payments/confirm', token, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

async function request<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('The Market Day server is not running.', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The request failed.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

function isSession(value: StoredSession): value is StoredSession {
  return Boolean(value?.token && value.user?.id && typeof value.expiresAt === 'number');
}

function normalizeUser(user: SessionUser): SessionUser {
  return {
    ...user,
    admin: user.admin === true,
    profileComplete: user.profileComplete === true,
  };
}
