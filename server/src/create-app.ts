import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

import { emailPlainText, sanitizeDescription, sanitizeEmailHtml } from '../../client/src/description.js';
import type { CheckoutState, ConfirmedPayment } from './checkout.js';
import { DatabaseError, PaymentError, SesError } from './errors.js';
import { feeCents } from './fees.js';
import { isEmailAudience, isMapArea, type EmailAudience } from './guards.js';
import type { EmailMessage } from './mail.js';
import {
  parseAdminNotes,
  parseAvailableSpaces,
  parseNewAccount,
  parseRequestedSpaces,
  parseVendorProfile,
  ProfileError,
} from './profile.js';
import type {
  AccountDetail,
  AccountSummary,
  CurrentUser,
  EventInput,
  EventMap,
  EventRecord,
  Identity,
  MapArea,
  RegistrationRecord,
  SpaceRequest,
  VendorProfileDraft,
  VendorProfileInput,
} from './types.js';

export type AppServices = {
  signSession: (user: CurrentUser) => Promise<{ token: string; expiresAt: number }>;
  verifyIdentityToken: (provider: 'google' | 'microsoft', idToken: string) => Promise<Identity>;
  verifySession: (token: string) => Promise<CurrentUser>;
  upsertUser: (identity: Identity) => Promise<CurrentUser>;
  getUserById: (userId: string) => Promise<CurrentUser | null>;
  getVendorProfile: (userId: string) => Promise<VendorProfileDraft | null>;
  saveVendorProfile: (userId: string, input: VendorProfileInput) => Promise<CurrentUser>;
  listAccounts: () => Promise<AccountSummary[]>;
  getAccount: (userId: string) => Promise<AccountDetail | null>;
  saveAdminAccount: (userId: string, profile: VendorProfileInput, adminNotes: string | null) => Promise<void>;
  createAdminAccount: (input: { name: string; email: string }) => Promise<AccountDetail>;
  listEvents: (userId: string) => Promise<EventRecord[]>;
  createEvent: (userId: string, input: EventInput) => Promise<EventRecord>;
  deleteEvent: (eventId: string) => Promise<boolean>;
  updateEvent: (eventId: string, input: EventInput) => Promise<boolean>;
  getEvent: (
    eventId: string,
    user: CurrentUser,
  ) => Promise<{ event: EventRecord; registrations: RegistrationRecord[] } | null>;
  registerForEvent: (eventId: string, userId: string, spaces: SpaceRequest[]) => Promise<void>;
  getOwnedRegistration: (
    eventId: string,
    userId: string,
  ) => Promise<{ id: string; paidAt: string | null; stripeCheckoutSessionId: string | null } | null>;
  getEventStart: (eventId: string) => Promise<string | null>;
  unregisterFromEvent: (eventId: string, userId: string) => Promise<void>;
  getRegistration: (
    eventId: string,
    registrationId: string,
  ) => Promise<{ id: string; userId: string; paidAt: string | null; stripeCheckoutSessionId: string | null } | null>;
  updateRegistrationSpaces: (eventId: string, registrationId: string, spaces: SpaceRequest[]) => Promise<void>;
  deleteRegistration: (eventId: string, registrationId: string) => Promise<void>;
  refundRegistrationPayment: (input: {
    sessionId: string;
    registrationId: string;
    userId: string;
    eventId: string;
  }) => Promise<void>;
  getBoothFee: (userId: string) => Promise<{ cents: number; resident: boolean } | null>;
  inspectCheckout: (sessionId: string) => Promise<CheckoutState>;
  expireOpenCheckout: (sessionId: string) => Promise<void>;
  markRegistrationPaidByAdmin: (
    eventId: string,
    registrationId: string,
    amountCents: number,
    stripeCheckoutSessionId: string | null,
  ) => Promise<void>;
  emailAudienceCounts: (eventId: string) => Promise<{ vendors: number; registered: number; unpaid: number } | null>;
  listEmailRecipients: (audience: EmailAudience, eventId: string) => Promise<{ name: string; email: string }[]>;
  sendVendorEmails: (input: EmailMessage) => Promise<{ sent: number; failed: { email: string; error: string }[] }>;
  getEventMap: (eventId: string) => Promise<EventMap | null>;
  saveEventVolunteers: (eventId: string, volunteers: string) => Promise<void>;
  assignEventSpace: (eventId: string, area: MapArea, spot: number, registrationId: string | null) => Promise<void>;
  createBoothCheckout: (input: {
    registrationId: string;
    userId: string;
    eventId: string;
    eventTitle: string;
    email: string;
    amountCents: number;
    resident: boolean;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<{ id: string; url: string }>;
  saveCheckoutSession: (registrationId: string, sessionId: string) => Promise<void>;
  markRegistrationPaid: (registrationId: string, amountCents: number, sessionId: string) => Promise<void>;
  confirmedPayment: (sessionId: string) => Promise<ConfirmedPayment>;
};

type AppVariables = {
  user: CurrentUser;
};

export function createApp(deps: AppServices) {
  const {
    signSession,
    verifyIdentityToken,
    verifySession,
    upsertUser,
    getUserById,
    getVendorProfile,
    saveVendorProfile,
    listAccounts,
    getAccount,
    saveAdminAccount,
    createAdminAccount,
    listEvents,
    createEvent,
    deleteEvent,
    updateEvent,
    getEvent,
    registerForEvent,
    getOwnedRegistration,
    getEventStart,
    unregisterFromEvent,
    getRegistration,
    updateRegistrationSpaces,
    deleteRegistration,
    refundRegistrationPayment,
    getBoothFee,
    inspectCheckout,
    expireOpenCheckout,
    markRegistrationPaidByAdmin,
    emailAudienceCounts,
    listEmailRecipients,
    sendVendorEmails,
    getEventMap,
    saveEventVolunteers,
    assignEventSpace,
    createBoothCheckout,
    saveCheckoutSession,
    markRegistrationPaid,
    confirmedPayment,
  } = deps;

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

  app.post('/admin/users', async (c) => {
    const input = parseNewAccount(await readJson(c));
    const account = await createAdminAccount(input);
    return c.json({ user: account }, 201);
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
    const spacesRequested = parseRequestedSpaces(body.spacesRequested);
    await registerForEvent(c.req.param('id'), c.get('user').id, spacesRequested);
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
    const stripePaid = Boolean(registration?.paidAt && registration.stripeCheckoutSessionId);
    if (stripePaid && startsAt && eventHasStarted(startsAt)) {
      throw new HttpError(409, 'This event has started, so the booth fee cannot be refunded.');
    }
    if (registration?.stripeCheckoutSessionId && (stripePaid || !registration.paidAt)) {
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

  app.put('/events/:id/registrations/:registrationId', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const eventId = c.req.param('id');
    const registrationId = c.req.param('registrationId');
    const registration = await getRegistration(eventId, registrationId);
    if (!registration) {
      throw new HttpError(404, 'That registration does not exist.');
    }
    const spacesRequested = parseRequestedSpaces((await readJson(c)).spacesRequested);
    await updateRegistrationSpaces(eventId, registrationId, spacesRequested);
    return c.json(await eventDetail(eventId, c.get('user')));
  });

  app.delete('/events/:id/registrations/:registrationId', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const eventId = c.req.param('id');
    const registration = await getRegistration(eventId, c.req.param('registrationId'));
    if (!registration) {
      throw new HttpError(404, 'That registration does not exist.');
    }
    const stripePaid = Boolean(registration.paidAt && registration.stripeCheckoutSessionId);
    if (registration.stripeCheckoutSessionId && (stripePaid || !registration.paidAt)) {
      await refundRegistrationPayment({
        sessionId: registration.stripeCheckoutSessionId,
        registrationId: registration.id,
        userId: registration.userId,
        eventId,
      });
    }
    await deleteRegistration(eventId, registration.id);
    return c.json(await eventDetail(eventId, c.get('user')));
  });

  app.post('/events/:id/registrations/:registrationId/paid', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const eventId = c.req.param('id');
    const registration = await getRegistration(eventId, c.req.param('registrationId'));
    if (!registration) {
      throw new HttpError(404, 'That registration does not exist.');
    }
    if (registration.paidAt) {
      throw new HttpError(409, 'That registration is already paid.');
    }
    let stripeCheckoutSessionId: string | null = null;
    let amountCents = feeCents(false);
    const fee = await getBoothFee(registration.userId);
    if (fee) {
      amountCents = fee.cents;
    }
    if (registration.stripeCheckoutSessionId) {
      const existing = await inspectCheckout(registration.stripeCheckoutSessionId);
      if (existing.kind === 'paid') {
        stripeCheckoutSessionId = registration.stripeCheckoutSessionId;
        amountCents = existing.amountCents;
      } else {
        await expireOpenCheckout(registration.stripeCheckoutSessionId);
      }
    }
    await markRegistrationPaidByAdmin(eventId, registration.id, amountCents, stripeCheckoutSessionId);
    return c.json(await eventDetail(eventId, c.get('user')));
  });

  app.get('/events/:id/email-audiences', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const counts = await emailAudienceCounts(c.req.param('id'));
    if (!counts) {
      throw new HttpError(404, 'That event does not exist.');
    }
    return c.json(counts);
  });

  app.post('/events/:id/email', async (c) => {
    const admin = c.get('user');
    requireRegistrationAdmin(admin);
    const eventId = c.req.param('id');
    const body = await readJson(c);
    const audience = typeof body.audience === 'string' ? body.audience : '';
    if (!isEmailAudience(audience)) {
      throw new HttpError(400, 'Choose who should receive this email.');
    }
    const subject = boundedText(body.subject, 'A subject is required.', 200).replace(/\s+/g, ' ');
    const message = boundedText(body.text, 'A message is required.', 8000);
    const htmlBody = sanitizeEmailHtml(message);
    const text = emailPlainText(htmlBody) || ' ';
    if (!htmlBody) {
      throw new HttpError(400, 'A message is required.');
    }
    const images = parseEmailImages(body.images, htmlBody);
    if (!(await emailAudienceCounts(eventId))) {
      throw new HttpError(404, 'That event does not exist.');
    }
    const recipients =
      audience === 'addresses' ? parseRecipientAddresses(body.addresses) : await listEmailRecipients(audience, eventId);
    if (recipients.length === 0) {
      throw new HttpError(400, audience === 'addresses' ? 'Enter at least one email address.' : 'No vendors match that choice.');
    }
    const result = await sendVendorEmails({
      replyTo: admin.email,
      subject,
      html: `<!DOCTYPE html><html><body>${htmlBody}</body></html>`,
      text,
      images,
      recipients,
    });
    return c.json(result);
  });

  app.get('/events/:id/map', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const map = await getEventMap(c.req.param('id'));
    if (!map) {
      throw new HttpError(404, 'That event does not exist.');
    }
    return c.json(map);
  });

  app.put('/events/:id/volunteers', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const eventId = c.req.param('id');
    const body = await readJson(c);
    if (typeof body.volunteers !== 'string') {
      throw new HttpError(400, 'Enter the volunteer names.');
    }
    const volunteers = body.volunteers.trim();
    if (volunteers.length > 400) {
      throw new HttpError(400, 'Volunteer names must be 400 characters or fewer.');
    }
    await saveEventVolunteers(eventId, volunteers);
    const map = await getEventMap(eventId);
    if (!map) {
      throw new HttpError(404, 'That event does not exist.');
    }
    return c.json(map);
  });

  app.put('/events/:id/map', async (c) => {
    requireRegistrationAdmin(c.get('user'));
    const eventId = c.req.param('id');
    const body = await readJson(c);
    const area = typeof body.area === 'string' ? body.area : '';
    const spot = typeof body.spot === 'number' ? body.spot : Number.NaN;
    const registrationId = body.registrationId == null ? null : String(body.registrationId);
    if (!isMapArea(area) || !Number.isInteger(spot)) {
      throw new HttpError(400, 'Choose a space on the map.');
    }
    if (!(await getEventMap(eventId))) {
      throw new HttpError(404, 'That event does not exist.');
    }
    await assignEventSpace(eventId, area, spot, registrationId);
    const map = await getEventMap(eventId);
    if (!map) {
      throw new HttpError(404, 'That event does not exist.');
    }
    return c.json(map);
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
      error instanceof PaymentError ||
      error instanceof SesError
    ) {
      return c.json({ error: error.message }, error.status as 400);
    }
    console.error(error);
    return c.json({ error: 'Something went wrong.' }, 500);
  });

  async function eventDetail(eventId: string, user: CurrentUser) {
    const result = await getEvent(eventId, user);
    if (!result) {
      throw new HttpError(404, 'That event does not exist.');
    }
    return result;
  }

  return app;
}

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

function requireRegistrationAdmin(user: CurrentUser): void {
  if (!user.admin) {
    throw new HttpError(403, 'Only an administrator can change a registration.');
  }
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

const EMAIL_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EMAIL_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const RECIPIENT_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function parseRecipientAddresses(value: unknown): { email: string }[] {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Enter the email addresses.');
  }
  const parts = value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new HttpError(400, 'Enter at least one email address.');
  }
  if (parts.length > 200) {
    throw new HttpError(400, 'Send to 200 addresses or fewer at a time.');
  }
  const invalid = parts.filter((part) => !RECIPIENT_ADDRESS.test(part));
  if (invalid.length > 0) {
    throw new HttpError(400, `These addresses are not valid: ${invalid.slice(0, 5).join(', ')}`);
  }
  const seen = new Set<string>();
  const recipients: { email: string }[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    recipients.push({ email: part });
  }
  return recipients;
}

function parseEmailImages(value: unknown, html: string) {
  if (value == null) {
    value = [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'Images must be a list.');
  }
  if (value.length > 6) {
    throw new HttpError(400, 'An email can include up to 6 images.');
  }
  const referenced = new Set([...html.matchAll(/src="cid:([^"]+)"/g)].map((match) => match[1] ?? ''));
  const images: { id: string; contentType: string; fileName: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, 'An image could not be read.');
    }
    const record = item as { id?: unknown; contentType?: unknown; data?: unknown };
    const id = typeof record.id === 'string' ? record.id : '';
    const contentType = typeof record.contentType === 'string' ? record.contentType : '';
    const data = typeof record.data === 'string' ? record.data : '';
    if (!/^img\d+$/.test(id) || !EMAIL_IMAGE_TYPES.has(contentType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new HttpError(400, 'An image could not be read.');
    }
    if (!referenced.has(id)) {
      continue;
    }
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length === 0 || bytes.length > 1_500_000) {
      throw new HttpError(400, 'Each image must be 1.5 MB or smaller.');
    }
    total += bytes.length;
    if (total > 4_000_000) {
      throw new HttpError(400, 'The images in this email are too large.');
    }
    images.push({
      id,
      contentType,
      fileName: `${id}.${EMAIL_IMAGE_EXTENSIONS[contentType]}`,
      bytes,
    });
  }
  for (const id of referenced) {
    if (!images.some((image) => image.id === id)) {
      throw new HttpError(400, 'An image in the message could not be attached.');
    }
  }
  return images;
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
