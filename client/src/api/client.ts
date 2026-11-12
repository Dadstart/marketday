import type { SessionUser, StoredSession } from '../auth/types';
import { resolveApiUrl } from './apiUrl';

const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  typeof window === 'undefined'
    ? undefined
    : {
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        origin: window.location.origin,
      },
);

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
  refundable: boolean;
  feeCents: number | null;
  spacesRequested: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[];
  spacesAvailable: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[];
  createdAt: string;
};

export type RegistrationSummary = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  paid: boolean | null;
  refundable: boolean;
  amountCents: number | null;
  spacesRequested: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[];
  createdAt: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  email: string;
  businessName: string | null;
  profileComplete: boolean;
  brandingImage: string | null;
  archived: boolean;
  emailOptOut: boolean;
};

export type AccountDetail = AccountSummary & {
  provider: 'google' | 'microsoft' | 'admin';
  venmo: string | null;
  contactPerson: string | null;
  phone: string | null;
  crosswindsResident: boolean | null;
  offering: string | null;
  productsAndServices: string | null;
  facebookName: string | null;
  adminNotes: string | null;
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
  brandingImage: string | null;
  emailOptOut: boolean;
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
  brandingImage: string | null;
  emailOptOut: boolean;
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

export function fetchAccounts(token: string, includeArchived = false): Promise<{ users: AccountSummary[] }> {
  const path = includeArchived ? '/admin/users?includeArchived=1' : '/admin/users';
  return request(path, token);
}

export function setMyEmailOptOut(token: string, emailOptOut: boolean): Promise<{ emailOptOut: boolean }> {
  return request('/me/email-opt-out', token, {
    method: 'PUT',
    body: JSON.stringify({ emailOptOut }),
  });
}

export function setAccountEmailOptOut(
  token: string,
  userId: string,
  emailOptOut: boolean,
): Promise<{ user: AccountDetail }> {
  return request(`/admin/users/${userId}/email-opt-out`, token, {
    method: 'PUT',
    body: JSON.stringify({ emailOptOut }),
  });
}

export function setAccountArchived(
  token: string,
  userId: string,
  archived: boolean,
): Promise<{ user: AccountDetail }> {
  return request(`/admin/users/${userId}/archived`, token, {
    method: 'PUT',
    body: JSON.stringify({ archived }),
  });
}

export function createAccount(
  token: string,
  input: { name: string; email: string },
): Promise<{ user: AccountDetail }> {
  return request('/admin/users', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAccount(token: string, userId: string): Promise<{ user: AccountDetail }> {
  return request(`/admin/users/${userId}`, token);
}

export function updateAccount(
  token: string,
  userId: string,
  profile: VendorProfileInput & { adminNotes: string | null },
): Promise<{ user: AccountDetail }> {
  return request(`/admin/users/${userId}`, token, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function fetchEvents(token: string | null): Promise<{ events: EventSummary[] }> {
  return request('/events', token);
}

export function fetchEvent(token: string | null, eventId: string): Promise<EventDetail> {
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
  spacesRequested: ('grass-generator' | 'grass' | 'food-truck' | 'pavilion')[],
): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, {
    method: 'POST',
    body: JSON.stringify({ spacesRequested }),
  });
}

export function unregisterFromEvent(token: string, eventId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations`, token, { method: 'DELETE' });
}

export function updateRegistrationSpaces(
  token: string,
  eventId: string,
  registrationId: string,
  spacesRequested: RegistrationSummary['spacesRequested'],
): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations/${registrationId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ spacesRequested }),
  });
}

export function cancelRegistration(token: string, eventId: string, registrationId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations/${registrationId}`, token, { method: 'DELETE' });
}

export function markRegistrationPaid(token: string, eventId: string, registrationId: string): Promise<EventDetail> {
  return request(`/events/${eventId}/registrations/${registrationId}/paid`, token, { method: 'POST' });
}

export type MapArea = 'pavilion' | 'grass' | 'food-truck';

export type SpaceAssignment = {
  area: MapArea;
  spot: number;
  registrationId: string;
};

export type MapRegistration = {
  id: string;
  name: string;
  businessName: string | null;
  spacesRequested: RegistrationSummary['spacesRequested'];
};

export type EventMap = {
  title: string;
  volunteers: string;
  assignments: SpaceAssignment[];
  registrations: MapRegistration[];
};

export function fetchEventMap(token: string, eventId: string): Promise<EventMap> {
  return request(`/events/${eventId}/map`, token);
}

export function saveEventVolunteers(token: string, eventId: string, volunteers: string): Promise<EventMap> {
  return request(`/events/${eventId}/volunteers`, token, {
    method: 'PUT',
    body: JSON.stringify({ volunteers }),
  });
}

export function assignEventSpace(
  token: string,
  eventId: string,
  area: MapArea,
  spot: number,
  registrationId: string | null,
): Promise<EventMap> {
  return request(`/events/${eventId}/map`, token, {
    method: 'PUT',
    body: JSON.stringify({ area, spot, registrationId }),
  });
}

export type EmailImage = {
  id: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  data: string;
};

export type EmailAudience = 'vendors' | 'registered' | 'unpaid' | 'addresses';

export type EmailAudienceCounts = {
  vendors: number;
  registered: number;
  unpaid: number;
};

export function fetchEmailAudiences(token: string, eventId: string): Promise<EmailAudienceCounts> {
  return request(`/events/${eventId}/email-audiences`, token);
}

export type EmailLogSummary = { sent: number; failed: number };

export function fetchEmailLog(token: string, eventId: string): Promise<EmailLogSummary> {
  return request(`/events/${eventId}/email-log`, token);
}

export async function downloadEmailLog(token: string, eventId: string): Promise<void> {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/events/${eventId}/email-log.csv`, { headers });
  } catch {
    throw new ApiError('The Community Day server is not running.', 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The request failed.';
    throw new ApiError(message, response.status);
  }
  const csv = await response.text();
  if (typeof document === 'undefined') {
    throw new ApiError('Download the email log from the web app.', 400);
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'email-log.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type EmailSendProgress = {
  total: number;
  sent: number;
  failed: { email: string; error: string }[];
  done: boolean;
  error?: string;
};

export async function sendEventEmail(
  token: string,
  eventId: string,
  audience: EmailAudience,
  subject: string,
  text: string,
  images: EmailImage[],
  addresses: string,
  onProgress?: (progress: EmailSendProgress) => void,
): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const headers = new Headers();
  headers.set('Accept', 'application/x-ndjson, application/json');
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/events/${eventId}/email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ audience, subject, text, images, addresses }),
    });
  } catch {
    throw new ApiError('The Community Day server is not running.', 0);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The request failed.';
    throw new ApiError(message, response.status);
  }

  const last = await readEmailProgress(response, onProgress);
  return { sent: last.sent, failed: last.failed };
}

async function readEmailProgress(
  response: Response,
  onProgress?: (progress: EmailSendProgress) => void,
): Promise<EmailSendProgress> {
  const reader = response.body?.getReader();
  const updates: EmailSendProgress[] = [];
  const apply = (line: string) => {
    let event: EmailSendProgress;
    try {
      event = JSON.parse(line) as EmailSendProgress;
    } catch {
      throw new ApiError('The email send returned an unexpected update.', 502);
    }
    if (typeof event.sent !== 'number' || !Array.isArray(event.failed)) {
      throw new ApiError('The email send returned an unexpected update.', 502);
    }
    updates.push(event);
    onProgress?.(event);
  };

  if (!reader) {
    const text = await response.text();
    for (const line of text.split('\n')) {
      if (line.trim()) {
        apply(line);
      }
    }
  } else {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          apply(line);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      apply(buffer);
    }
  }

  const finished = updates.at(-1);
  if (!finished || finished.done === false) {
    throw new ApiError('The email send stopped before it finished.', 502);
  }
  if (finished.error) {
    throw new ApiError(finished.error, 502);
  }
  return finished;
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
    throw new ApiError('The Community Day server is not running.', 0);
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
