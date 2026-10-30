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
  createdAt: string;
};

export type RegistrationSummary = {
  id: string;
  name: string;
  email: string | null;
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
  return body;
}

export async function fetchMe(token: string): Promise<SessionUser> {
  const body = await request<{ user: SessionUser }>('/me', token);
  return body.user;
}

export function fetchEvents(token: string): Promise<{ events: EventSummary[] }> {
  return request('/events', token);
}

export function fetchEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}`, token);
}

export function createEvent(token: string, draft: EventDraft): Promise<{ event: EventSummary }> {
  return request('/events', token, {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export function registerForEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, { method: 'POST' });
}

export function unregisterFromEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, { method: 'DELETE' });
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
