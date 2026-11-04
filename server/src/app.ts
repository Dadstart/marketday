import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import { signSession, verifyIdentityToken, verifySession } from './auth.js';
import {
  createEvent,
  DatabaseError,
  deleteEvent,
  getAccount,
  getBoothFee,
  getEvent,
  getEventStart,
  getOwnedRegistration,
  getUserById,
  getVendorProfile,
  listAccounts,
  listEvents,
  markRegistrationPaid,
  registerForEvent,
  saveCheckoutSession,
  saveAdminAccount,
  saveVendorProfile,
  unregisterFromEvent,
  updateEvent,
  upsertUser,
} from './db.js';
import { sanitizeDescription } from '../../client/src/description.js';
import { parseAdminNotes, parseAvailableSpaces, parseSpaceRequest, parseVendorProfile, ProfileError } from './profile.js';
import {
  confirmedPayment,
  createBoothCheckout,
  inspectCheckout,
  PaymentError,
  refundRegistrationPayment,
} from './stripe.js';
import type { CurrentUser, EventInput } from './types.js';

type AppVariables = {
  user: CurrentUser;
};

const app = new Hono<{ Variables: AppVariables }>();

const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    throw new HttpError(401, 'Sign in to continue.');
  }

  try {
    const sessionUser = await verifySession(token);
    const user = await getUserById(sessionUser.id);
    if (!user) {
      throw new HttpError(401, 'Sign in again.');
    }
    c.set('user', user);
  } catch (error) {
    if (error instanceof HttpError || error instanceof DatabaseError) {
      throw error;
    }
    throw new HttpError(401, 'Sign in again.');
  }
  await next();
};

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.post('/session', async (c) => {
  const body = await readJson(c);
  const provider = body.provider;
  const idToken = stringValue(body.idToken);
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new HttpError(400, 'Choose Google or Microsoft sign-in.');
  }
  if (!idToken) {
    throw new HttpError(400, 'Sign-in did not include an identity token.');
  }

  let identity;
  try {
    identity = await verifyIdentityToken(provider, idToken);
  } catch (error) {
    console.error(error);
    throw new HttpError(401, 'The sign-in token could not be verified.');
  }
  const user = await upsertUser(identity);
  const session = await signSession(user);
  return c.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user,
  });
});

const requireAdmin: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  if (!c.get('user').admin) {
    throw new HttpError(403, 'Only an administrator can view accounts.');
  }
  await next();
};

const requireProfile: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  const user = c.get('user');
  if (!user.admin && !user.profileComplete) {
    throw new HttpError(403, 'Finish your vendor profile before continuing.');
  }
  await next();
};

app.use('/me', requireUser);
app.use('/me/*', requireUser);
app.use('/events', requireUser, requireProfile);
app.use('/events/*', requireUser, requireProfile);
app.use('/payments', requireUser, requireProfile);
app.use('/payments/*', requireUser, requireProfile);
app.use('/admin', requireUser, requireAdmin);
app.use('/admin/*', requireUser, requireAdmin);

app.get('/me', (c) => c.json({ user: c.get('user') }));

app.get('/me/profile', async (c) => {
  const profile = await getVendorProfile(c.get('user').id);
  return c.json({ profile });
});

app.put('/me/profile', async (c) => {
  const profile = parseVendorProfile(await readJson(c));
  const user = await saveVendorProfile(c.get('user').id, profile);
  return c.json({ user });
});

app.get('/admin/users', async (c) => {
  const users = await listAccounts();
  return c.json({ users });
});

app.get('/admin/users/:id', async (c) => {
  const account = await getAccount(c.req.param('id'));
  if (!account) {
    throw new HttpError(404, 'That account does not exist.');
  }
  return c.json({ user: account });
});

app.put('/admin/users/:id', async (c) => {
  const userId = c.req.param('id');
  const existing = await getAccount(userId);
  if (!existing) {
    throw new HttpError(404, 'That account does not exist.');
  }
  const body = await readJson(c);
  const profile = parseVendorProfile(body);
  const adminNotes = parseAdminNotes(body.adminNotes);
  await saveAdminAccount(userId, profile, adminNotes);
  const account = await getAccount(userId);
  if (!account) {
    throw new HttpError(404, 'That account does not exist.');
  }
  return c.json({ user: account });
});

app.get('/events', async (c) => {
  const events = await listEvents(c.get('user').id);
  return c.json({ events });
});

app.post('/events', async (c) => {
  const user = c.get('user');
  if (!user.admin) {
    throw new HttpError(403, 'Only an administrator can create events.');
  }

  const input = parseEventInput(await readJson(c));
  const event = await createEvent(user.id, input);
  return c.json({ event }, 201);
});

app.delete('/events/:id', async (c) => {
  if (!c.get('user').admin) {
    throw new HttpError(403, 'Only an administrator can delete events.');
  }
  const deleted = await deleteEvent(c.req.param('id'));
  if (!deleted) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.body(null, 204);
});

app.put('/events/:id', async (c) => {
  if (!c.get('user').admin) {
    throw new HttpError(403, 'Only an administrator can edit events.');
  }
  const input = parseEventInput(await readJson(c));
  const updated = await updateEvent(c.req.param('id'), input);
  if (!updated) {
    throw new HttpError(404, 'That event does not exist.');
  }
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.get('/events/:id', async (c) => {
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.post('/events/:id/registrations', async (c) => {
  const body = await readJson(c);
  const spaceRequested = parseSpaceRequest(body.spaceRequested);
  await registerForEvent(c.req.param('id'), c.get('user').id, spaceRequested);
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.delete('/events/:id/registrations', async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');
  const registration = await getOwnedRegistration(eventId, user.id);
  const startsAt = await getEventStart(eventId);
  if (registration?.paidAt && startsAt && eventHasStarted(startsAt)) {
    throw new HttpError(409, 'This event has started, so the booth fee cannot be refunded.');
  }
  if (registration?.paidAt && !registration.stripeCheckoutSessionId) {
    throw new HttpError(
      409,
      'This registration was paid, but the Stripe payment could not be found. It was not canceled.',
    );
  }
  if (registration?.stripeCheckoutSessionId) {
    await refundRegistrationPayment({
      sessionId: registration.stripeCheckoutSessionId,
      registrationId: registration.id,
      userId: user.id,
      eventId,
    });
  }
  await unregisterFromEvent(eventId, user.id);
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.post('/events/:id/payment', async (c) => {
  const user = c.get('user');
  const eventId = c.req.param('id');
  const body = await readJson(c);
  const returnUrl = parseReturnUrl(body.returnUrl);
  const result = await getEvent(eventId, user);
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  if (!result.event.registered) {
    throw new HttpError(400, 'Register for the event before paying.');
  }

  const registration = await getOwnedRegistration(eventId, user.id);
  if (!registration) {
    throw new HttpError(400, 'Register for the event before paying.');
  }
  if (registration.paidAt) {
    return c.json({ url: null, paid: true });
  }

  const fee = await getBoothFee(user.id);
  if (!fee) {
    throw new HttpError(
      400,
      'Finish your profile and say whether you are a Crosswinds resident before paying.',
    );
  }

  if (registration.stripeCheckoutSessionId) {
    const existing = await inspectCheckout(registration.stripeCheckoutSessionId);
    if (existing.kind === 'paid') {
      await markRegistrationPaid(registration.id, existing.amountCents, registration.stripeCheckoutSessionId);
      return c.json({ url: null, paid: true });
    }
    if (existing.kind === 'open' && existing.amountCents === fee.cents) {
      return c.json({ url: existing.url, paid: false });
    }
  }

  const session = await createBoothCheckout({
    registrationId: registration.id,
    userId: user.id,
    eventId,
    eventTitle: result.event.title,
    email: user.email,
    amountCents: fee.cents,
    resident: fee.resident,
    successUrl: withCheckoutPlaceholder(returnUrl),
    cancelUrl: returnUrl,
  });
  await saveCheckoutSession(registration.id, session.id);
  return c.json({ url: session.url, paid: false });
});

app.post('/payments/confirm', async (c) => {
  const user = c.get('user');
  const body = await readJson(c);
  const sessionId = body.sessionId;
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    throw new HttpError(400, 'That payment session is not valid.');
  }

  const payment = await confirmedPayment(sessionId);
  if (payment.userId !== user.id) {
    throw new HttpError(403, 'That payment belongs to another account.');
  }

  const registration = await getOwnedRegistration(payment.eventId, user.id);
  if (!registration || registration.id !== payment.registrationId) {
    throw new HttpError(400, 'That payment does not match your registration.');
  }
  if (!registration.paidAt) {
    await markRegistrationPaid(registration.id, payment.amountCents, sessionId);
  }
  return c.json({ paid: true, eventId: payment.eventId });
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

app.onError((error, c) => {
  if (
    error instanceof HttpError ||
    error instanceof DatabaseError ||
    error instanceof ProfileError ||
    error instanceof PaymentError
  ) {
    return c.json({ error: error.message }, error.status as 400);
  }
  console.error(error);
  return c.json({ error: 'Something went wrong.' }, 500);
});

export { app };

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseReturnUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) {
    throw new HttpError(400, 'The payment return address is missing.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'The payment return address is not valid.');
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'The payment return address is not valid.');
  }
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  const appScheme = url.protocol === 'marketday:';
  if (!localHttp && !appScheme) {
    throw new HttpError(400, 'The payment return address is not allowed.');
  }
  return url.toString();
}

function withCheckoutPlaceholder(returnUrl: string): string {
  const joiner = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${joiner}checkout_session_id={CHECKOUT_SESSION_ID}`;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Expected a JSON object.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, 'Expected a JSON object.');
  }
}

function eventHasStarted(startsAt: string): boolean {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start <= Date.now();
}

function parseEventInput(body: Record<string, unknown>): EventInput {
  const title = boundedText(body.title, 'A title is required.', 120);
  const description = sanitizeDescription(boundedText(body.description ?? '', '', 4000));
  const location = boundedText(body.location ?? '', '', 200);
  const startsAt = requiredDate(body.startsAt, 'A start time is required.');
  const endsAt = optionalDate(body.endsAt, 'The end time is not a valid date.');
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    throw new HttpError(400, 'The end time is before the start time.');
  }

  return {
    title,
    description,
    location,
    startsAt,
    endsAt,
    capacity: optionalCapacity(body.capacity),
    spacesAvailable: parseAvailableSpaces(body.spacesAvailable),
  };
}

function boundedText(value: unknown, requiredMessage: string, maxLength: number): string {
  if (value == null || value === '') {
    if (requiredMessage) {
      throw new HttpError(400, requiredMessage);
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, requiredMessage || 'Expected text.');
  }
  const trimmed = value.trim();
  if (!trimmed && requiredMessage) {
    throw new HttpError(400, requiredMessage);
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `Use ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function requiredDate(value: unknown, message: string): string {
  const parsed = optionalDate(value, message);
  if (!parsed) {
    throw new HttpError(400, message);
  }
  return parsed;
}

function optionalDate(value: unknown, message: string): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, message);
  }
  return new Date(value).toISOString();
}

function optionalCapacity(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) {
    throw new HttpError(400, 'Capacity must be a whole number greater than zero.');
  }
  return parsed;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
