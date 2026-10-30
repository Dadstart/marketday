import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import { signSession, verifyIdentityToken, verifySession } from './auth.js';
import {
  createEvent,
  DatabaseError,
  getEvent,
  getUserById,
  listEvents,
  registerForEvent,
  saveVendorProfile,
  unregisterFromEvent,
  upsertUser,
} from './db.js';
import { parseVendorProfile, ProfileError } from './profile.js';
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

app.get('/me', (c) => c.json({ user: c.get('user') }));

app.put('/me/profile', async (c) => {
  const profile = parseVendorProfile(await readJson(c));
  const user = await saveVendorProfile(c.get('user').id, profile);
  return c.json({ user });
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

app.get('/events/:id', async (c) => {
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.post('/events/:id/registrations', async (c) => {
  await registerForEvent(c.req.param('id'), c.get('user').id);
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.delete('/events/:id/registrations', async (c) => {
  await unregisterFromEvent(c.req.param('id'), c.get('user').id);
  const result = await getEvent(c.req.param('id'), c.get('user'));
  if (!result) {
    throw new HttpError(404, 'That event does not exist.');
  }
  return c.json(result);
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

app.onError((error, c) => {
  if (error instanceof HttpError || error instanceof DatabaseError || error instanceof ProfileError) {
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

function parseEventInput(body: Record<string, unknown>): EventInput {
  const title = boundedText(body.title, 'A title is required.', 120);
  const description = boundedText(body.description ?? '', '', 4000);
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
