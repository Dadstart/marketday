import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseAddressList } from '../../client/src/email/addresses.js';
import { createApp, type AppServices } from './create-app.js';
import { DatabaseError, SesError } from './errors.js';
import type { EmailMessage } from './mail.js';
import type { CurrentUser, EventRecord } from './types.js';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function person(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'user-1',
    email: 'vendor@example.com',
    name: 'Vendor',
    picture: null,
    provider: 'google',
    admin: false,
    profileComplete: true,
    ...overrides,
  };
}

const admin = person({ id: 'admin-1', email: 'andrew@bishop4.com', name: 'Andrew', admin: true, profileComplete: false });

function eventRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'event-1',
    title: 'November Community Day',
    description: '',
    location: 'Pavilion',
    startsAt: future,
    endsAt: null,
    capacity: null,
    spacesAvailable: ['grass', 'pavilion', 'food-truck', 'grass-generator'],
    registrationCount: 1,
    registered: true,
    paid: false,
    refundable: false,
    feeCents: 1000,
    spacesRequested: ['grass'],
    createdAt: future,
    ...overrides,
  };
}

function detail(overrides: Partial<EventRecord> = {}) {
  return { event: eventRecord(overrides), registrations: [] };
}

function missing(name: string): () => Promise<never> {
  return async () => {
    throw new Error(`Unexpected call to ${name}`);
  };
}

function services(overrides: Partial<AppServices>): AppServices {
  return {
    signSession: missing('signSession'),
    verifyIdentityToken: missing('verifyIdentityToken'),
    verifySession: missing('verifySession'),
    upsertUser: missing('upsertUser'),
    getUserById: missing('getUserById'),
    getVendorProfile: missing('getVendorProfile'),
    saveVendorProfile: missing('saveVendorProfile'),
    listAccounts: missing('listAccounts'),
    getAccount: missing('getAccount'),
    setAccountArchived: missing('setAccountArchived'),
    saveAdminAccount: missing('saveAdminAccount'),
    createAdminAccount: missing('createAdminAccount'),
    listEvents: missing('listEvents'),
    createEvent: missing('createEvent'),
    deleteEvent: missing('deleteEvent'),
    updateEvent: missing('updateEvent'),
    getEvent: missing('getEvent'),
    registerForEvent: missing('registerForEvent'),
    getOwnedRegistration: missing('getOwnedRegistration'),
    getEventStart: missing('getEventStart'),
    unregisterFromEvent: missing('unregisterFromEvent'),
    getRegistration: missing('getRegistration'),
    updateRegistrationSpaces: missing('updateRegistrationSpaces'),
    deleteRegistration: missing('deleteRegistration'),
    refundRegistrationPayment: missing('refundRegistrationPayment'),
    getBoothFee: missing('getBoothFee'),
    inspectCheckout: missing('inspectCheckout'),
    expireOpenCheckout: missing('expireOpenCheckout'),
    markRegistrationPaidByAdmin: missing('markRegistrationPaidByAdmin'),
    emailAudienceCounts: missing('emailAudienceCounts'),
    listEmailRecipients: missing('listEmailRecipients'),
    sendVendorEmails: missing('sendVendorEmails'),
    getEventMap: missing('getEventMap'),
    saveEventVolunteers: missing('saveEventVolunteers'),
    assignEventSpace: missing('assignEventSpace'),
    createBoothCheckout: missing('createBoothCheckout'),
    saveCheckoutSession: missing('saveCheckoutSession'),
    markRegistrationPaid: missing('markRegistrationPaid'),
    confirmedPayment: missing('confirmedPayment'),
    ...overrides,
  };
}

function appFor(user: CurrentUser, overrides: Partial<AppServices> = {}) {
  return createApp(
    services({
      verifySession: async () => user,
      getUserById: async (id) => (id === user.id ? user : null),
      ...overrides,
    }),
  );
}

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  options: { token?: string | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token !== null) {
    headers.authorization = `Bearer ${options.token ?? 'session'}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await app.request(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as { error?: string }) : null };
}

const eventBody = {
  title: 'November Community Day',
  description: 'Hello <script>alert(1)</script><b>vendors</b>',
  location: 'Pavilion',
  startsAt: future,
  endsAt: null,
  capacity: 40,
  spacesAvailable: ['grass', 'pavilion'],
};

describe('access', () => {
  test('health does not require a session and unknown routes are not found', async () => {
    const app = appFor(person());
    assert.deepEqual((await call(app, 'GET', '/health', { token: null })).body, { ok: true });
    const missingRoute = await call(app, 'GET', '/missing', { token: null });
    assert.equal(missingRoute.status, 404);
  });

  test('event routes require a finished profile, except for an administrator', async () => {
    const vendor = person({ profileComplete: false });
    const blocked = await call(appFor(vendor), 'GET', '/events');
    assert.equal(blocked.status, 403);
    assert.match(blocked.body?.error ?? '', /vendor profile/);

    const listed = await call(
      appFor(admin, { listEvents: async () => [] }),
      'GET',
      '/events',
    );
    assert.equal(listed.status, 200);

    const accounts = await call(appFor(person(), { listAccounts: async () => [] }), 'GET', '/admin/users');
    assert.equal(accounts.status, 403);
  });

  test('an administrator can create a user from a name and email', async () => {
    let saved: { name: string; email: string } | null = null;
    const app = appFor(admin, {
      createAdminAccount: async (input) => {
        saved = input;
        return {
          id: 'new-1',
          name: input.name,
          email: input.email,
          businessName: null,
          profileComplete: false,
          brandingImage: null,
          archived: false,
          emailOptOut: false,
          provider: 'admin',
          venmo: null,
          contactPerson: null,
          phone: null,
          crosswindsResident: null,
          offering: null,
          productsAndServices: null,
          facebookName: null,
          adminNotes: null,
          createdAt: future,
        };
      },
    });
    const created = await call(app, 'POST', '/admin/users', {
      body: { name: '  Ada Lovelace ', email: 'ada@example.com' },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(saved, { name: 'Ada Lovelace', email: 'ada@example.com' });

    const invalid = await call(app, 'POST', '/admin/users', { body: { name: 'Ada', email: 'not-an-email' } });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body?.error ?? '', /email address/);

    const vendor = await call(appFor(person()), 'POST', '/admin/users', {
      body: { name: 'Ada', email: 'ada@example.com' },
    });
    assert.equal(vendor.status, 403);
  });

  test('an administrator can archive a user, and the list hides archived accounts unless asked', async () => {
    let includeArchived: boolean | null = null;
    let archived: boolean | null = null;
    const account = {
      id: 'user-2',
      name: 'Ada',
      email: 'ada@example.com',
      businessName: null,
      profileComplete: false,
      brandingImage: null,
      archived: false,
      emailOptOut: false,
      provider: 'admin' as const,
      venmo: null,
      contactPerson: null,
      phone: null,
      crosswindsResident: null,
      offering: null,
      productsAndServices: null,
      facebookName: null,
      adminNotes: null,
      createdAt: future,
    };
    const app = appFor(admin, {
      listAccounts: async (included) => {
        includeArchived = included;
        return [];
      },
      setAccountArchived: async (_userId, next) => {
        archived = next;
        return { ...account, archived: next };
      },
    });

    const listed = await call(app, 'GET', '/admin/users');
    assert.equal(listed.status, 200);
    assert.equal(includeArchived, false);

    const withArchived = await call(app, 'GET', '/admin/users?includeArchived=1');
    assert.equal(withArchived.status, 200);
    assert.equal(includeArchived, true);

    const updated = await call(app, 'PUT', '/admin/users/user-2/archived', { body: { archived: true } });
    assert.equal(updated.status, 200);
    assert.equal(archived, true);
    assert.equal((updated.body as { user?: { archived?: boolean } } | null)?.user?.archived, true);

    const invalid = await call(app, 'PUT', '/admin/users/user-2/archived', { body: { archived: 'yes' } });
    assert.equal(invalid.status, 400);

    const vendor = await call(
      appFor(person(), { setAccountArchived: async () => account }),
      'PUT',
      '/admin/users/user-2/archived',
      { body: { archived: true } },
    );
    assert.equal(vendor.status, 403);

    const missingUser = await call(
      appFor(admin, { setAccountArchived: async () => null }),
      'PUT',
      '/admin/users/missing/archived',
      { body: { archived: false } },
    );
    assert.equal(missingUser.status, 404);
  });

  test('anyone can browse events, and registering still requires a sign-in', async () => {
    let listedFor: string | null | undefined;
    let viewedAs: CurrentUser | null | undefined;
    const browse = appFor(person(), {
      listEvents: async (userId) => {
        listedFor = userId;
        return [eventRecord({ registered: false })];
      },
      getEvent: async (_eventId, user) => {
        viewedAs = user;
        return detail({ registered: false });
      },
    });

    const listed = await call(browse, 'GET', '/events', { token: null });
    assert.equal(listed.status, 200);
    assert.equal(listedFor, null);

    const viewed = await call(browse, 'GET', '/events/event-1', { token: null });
    assert.equal(viewed.status, 200);
    assert.equal(viewedAs, null);

    const signedIn = await call(browse, 'GET', '/events');
    assert.equal(signedIn.status, 200);
    assert.equal(listedFor, 'user-1');

    const map = await call(browse, 'GET', '/events/event-1/map', { token: null });
    assert.equal(map.status, 401);

    const register = await call(browse, 'POST', '/events/event-1/registrations', {
      token: null,
      body: { spacesRequested: ['grass'] },
    });
    assert.equal(register.status, 401);
    assert.match(register.body?.error ?? '', /Sign in/);
  });

  test('a broken session asks the person to sign in again', async () => {
    const app = appFor(person(), { verifySession: async () => { throw new Error('bad token'); } });
    const response = await call(app, 'GET', '/me');
    assert.equal(response.status, 401);
  });
});

describe('events and registration', () => {
  test('stores a cleaned description and rejects an end time before the start', async () => {
    let saved: unknown;
    const app = appFor(admin, {
      createEvent: async (_userId, input) => {
        saved = input;
        return eventRecord({ description: input.description });
      },
    });
    const created = await call(app, 'POST', '/events', { body: eventBody });
    assert.equal(created.status, 201);
    assert.equal((saved as { description: string }).description.includes('script'), false);
    assert.match((saved as { description: string }).description, /<b>vendors<\/b>/);

    const backwards = await call(app, 'POST', '/events', {
      body: { ...eventBody, endsAt: past },
    });
    assert.equal(backwards.status, 400);
    assert.match(backwards.body?.error ?? '', /end time/);

    const vendor = await call(appFor(person()), 'POST', '/events', { body: eventBody });
    assert.equal(vendor.status, 403);
  });

  test('asks for at least one space before registering', async () => {
    const app = appFor(person(), { getEvent: async () => detail() });
    const response = await call(app, 'POST', '/events/event-1/registrations', { body: { spacesRequested: [] } });
    assert.equal(response.status, 400);
  });

  test('saves a branding image with the profile and rejects a file that is not a picture', async () => {
    const profile = {
      venmo: '@market',
      contactPerson: 'Ada Lovelace',
      businessName: 'Analytical Engines',
      phone: '(512) 555-1212',
      crosswindsResident: true,
      offering: 'retail',
      productsAndServices: 'Prints',
      facebookName: null,
      brandingImage: null,
    };
    let saved: string | null = 'unset';
    const app = appFor(person(), {
      saveVendorProfile: async (_userId, input) => {
        saved = input.brandingImage;
        return person();
      },
    });
    const png = `data:image/png;base64,${Buffer.from('logo').toString('base64')}`;
    assert.equal((await call(app, 'PUT', '/me/profile', { body: { ...profile, brandingImage: png } })).status, 200);
    assert.equal(saved, png);
    const rejected = await call(app, 'PUT', '/me/profile', {
      body: { ...profile, brandingImage: 'data:text/html;base64,YQ==' },
    });
    assert.equal(rejected.status, 400);
    assert.equal(saved, png);
  });

  test('saves an email opt-out with the profile', async () => {
    const profile = {
      venmo: '@market',
      contactPerson: 'Ada Lovelace',
      businessName: 'Analytical Engines',
      phone: '(512) 555-1212',
      crosswindsResident: true,
      offering: 'retail',
      productsAndServices: 'Prints',
      facebookName: null,
      brandingImage: null,
      emailOptOut: true,
    };
    let optedOut: boolean | null = null;
    const app = appFor(person(), {
      saveVendorProfile: async (_userId, input) => {
        optedOut = input.emailOptOut;
        return person();
      },
    });
    assert.equal((await call(app, 'PUT', '/me/profile', { body: profile })).status, 200);
    assert.equal(optedOut, true);
  });
});

describe('canceling and refunding', () => {
  const registration = { id: 'reg-1', paidAt: future, stripeCheckoutSessionId: 'cs_123' };

  test('a vendor who paid through Stripe is refunded before the event and blocked after it starts', async () => {
    const refunds: string[] = [];
    let unregistered = false;
    const before = appFor(person(), {
      getOwnedRegistration: async () => registration,
      getEventStart: async () => future,
      refundRegistrationPayment: async (input) => {
        refunds.push(input.sessionId);
      },
      unregisterFromEvent: async () => {
        unregistered = true;
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(before, 'DELETE', '/events/event-1/registrations')).status, 200);
    assert.deepEqual(refunds, ['cs_123']);
    assert.equal(unregistered, true);

    const after = appFor(person(), {
      getOwnedRegistration: async () => registration,
      getEventStart: async () => past,
      refundRegistrationPayment: async () => {
        throw new Error('should not refund');
      },
      unregisterFromEvent: async () => {
        throw new Error('should not cancel');
      },
    });
    const blocked = await call(after, 'DELETE', '/events/event-1/registrations');
    assert.equal(blocked.status, 409);
    assert.match(blocked.body?.error ?? '', /cannot be refunded/);
  });

  test('a payment marked paid by an administrator is canceled without a Stripe refund, even after the start', async () => {
    let refunded = false;
    let unregistered = false;
    const app = appFor(person(), {
      getOwnedRegistration: async () => ({ ...registration, stripeCheckoutSessionId: null }),
      getEventStart: async () => past,
      refundRegistrationPayment: async () => {
        refunded = true;
      },
      unregisterFromEvent: async () => {
        unregistered = true;
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(app, 'DELETE', '/events/event-1/registrations')).status, 200);
    assert.equal(refunded, false);
    assert.equal(unregistered, true);
  });

  test('an administrator can refund a Stripe payment after the event starts', async () => {
    const refunds: { userId: string }[] = [];
    let deleted = false;
    const app = appFor(admin, {
      getRegistration: async () => ({ ...registration, userId: 'user-1' }),
      refundRegistrationPayment: async (input) => {
        refunds.push(input);
      },
      deleteRegistration: async () => {
        deleted = true;
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(app, 'DELETE', '/events/event-1/registrations/reg-1')).status, 200);
    assert.equal(refunds[0]?.userId, 'user-1');
    assert.equal(deleted, true);

    const marked = appFor(admin, {
      getRegistration: async () => ({ ...registration, userId: 'user-1', stripeCheckoutSessionId: null }),
      refundRegistrationPayment: async () => {
        throw new Error('should not refund');
      },
      deleteRegistration: async () => {
        deleted = true;
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(marked, 'DELETE', '/events/event-1/registrations/reg-1')).status, 200);
  });

  test('only an administrator can mark a registration paid, and an open checkout is cleared', async () => {
    const vendor = await call(appFor(person()), 'POST', '/events/event-1/registrations/reg-1/paid', { body: {} });
    assert.equal(vendor.status, 403);

    let marked: { amountCents: number; sessionId: string | null } | null = null;
    let expired = false;
    const open = appFor(admin, {
      getRegistration: async () => ({ id: 'reg-1', userId: 'user-1', paidAt: null, stripeCheckoutSessionId: 'cs_open' }),
      getBoothFee: async () => ({ cents: 500, resident: true }),
      inspectCheckout: async () => ({ kind: 'open' as const, url: 'https://pay.example', amountCents: 500 }),
      expireOpenCheckout: async () => {
        expired = true;
      },
      markRegistrationPaidByAdmin: async (_eventId, _registrationId, amountCents, sessionId) => {
        marked = { amountCents, sessionId };
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(open, 'POST', '/events/event-1/registrations/reg-1/paid', { body: {} })).status, 200);
    assert.equal(expired, true);
    assert.deepEqual(marked, { amountCents: 500, sessionId: null });

    let kept: { amountCents: number; sessionId: string | null } | null = null;
    const paid = appFor(admin, {
      getRegistration: async () => ({ id: 'reg-1', userId: 'user-1', paidAt: null, stripeCheckoutSessionId: 'cs_paid' }),
      getBoothFee: async () => ({ cents: 1000, resident: false }),
      inspectCheckout: async () => ({ kind: 'paid' as const, amountCents: 1000 }),
      expireOpenCheckout: async () => {
        throw new Error('should not expire a paid checkout');
      },
      markRegistrationPaidByAdmin: async (_eventId, _registrationId, amountCents, sessionId) => {
        kept = { amountCents, sessionId };
      },
      getEvent: async () => detail(),
    });
    assert.equal((await call(paid, 'POST', '/events/event-1/registrations/reg-1/paid', { body: {} })).status, 200);
    assert.deepEqual(kept, { amountCents: 1000, sessionId: 'cs_paid' });

    const already = appFor(admin, {
      getRegistration: async () => ({ id: 'reg-1', userId: 'user-1', paidAt: future, stripeCheckoutSessionId: null }),
    });
    assert.equal((await call(already, 'POST', '/events/event-1/registrations/reg-1/paid', { body: {} })).status, 409);
  });
});

describe('paying', () => {
  test('refuses a return address that is not the local app', async () => {
    const app = appFor(person(), { getEvent: async () => detail() });
    const response = await call(app, 'POST', '/events/event-1/payment', {
      body: { returnUrl: 'https://example.com/return' },
    });
    assert.equal(response.status, 400);
    assert.match(response.body?.error ?? '', /not allowed/);
  });

  test('reuses an open checkout for the same fee and starts a new one when the fee changed', async () => {
    const open = appFor(person(), {
      getEvent: async () => detail(),
      getOwnedRegistration: async () => ({ id: 'reg-1', paidAt: null, stripeCheckoutSessionId: 'cs_open' }),
      getBoothFee: async () => ({ cents: 1000, resident: false }),
      inspectCheckout: async () => ({ kind: 'open' as const, url: 'https://pay.example/open', amountCents: 1000 }),
    });
    const reused = await call(open, 'POST', '/events/event-1/payment', {
      body: { returnUrl: 'http://localhost:8081/events' },
    });
    assert.equal(reused.status, 200);
    assert.equal((reused.body as { url?: string } | null)?.url, 'https://pay.example/open');

    const checkout: { amountCents?: number; successUrl?: string } = {};
    const changed = appFor(person(), {
      getEvent: async () => detail(),
      getOwnedRegistration: async () => ({ id: 'reg-1', paidAt: null, stripeCheckoutSessionId: 'cs_old' }),
      getBoothFee: async () => ({ cents: 500, resident: true }),
      inspectCheckout: async () => ({ kind: 'open' as const, url: 'https://pay.example/old', amountCents: 1000 }),
      createBoothCheckout: async (input) => {
        checkout.amountCents = input.amountCents;
        checkout.successUrl = input.successUrl;
        return { id: 'cs_new', url: 'https://pay.example/new' };
      },
      saveCheckoutSession: async () => undefined,
    });
    const started = await call(changed, 'POST', '/events/event-1/payment', {
      body: { returnUrl: 'marketday://events' },
    });
    assert.equal(started.status, 200);
    assert.equal(checkout.amountCents, 500);
    assert.match(checkout.successUrl ?? '', /marketday:\/\/events\?checkout_session_id=\{CHECKOUT_SESSION_ID\}/);
  });

  test('records a confirmed payment only for the person who paid', async () => {
    let recorded = false;
    const app = appFor(person(), {
      confirmedPayment: async () => ({ registrationId: 'reg-1', userId: 'someone-else', eventId: 'event-1', amountCents: 1000 }),
    });
    assert.equal((await call(app, 'POST', '/payments/confirm', { body: { sessionId: 'cs_123' } })).status, 403);

    const own = appFor(person(), {
      confirmedPayment: async () => ({ registrationId: 'reg-1', userId: 'user-1', eventId: 'event-1', amountCents: 1000 }),
      getOwnedRegistration: async () => ({ id: 'reg-1', paidAt: null, stripeCheckoutSessionId: 'cs_123' }),
      markRegistrationPaid: async () => {
        recorded = true;
      },
    });
    const confirmed = await call(own, 'POST', '/payments/confirm', { body: { sessionId: 'cs_123' } });
    assert.equal(confirmed.status, 200);
    assert.equal(recorded, true);
    assert.equal((await call(own, 'POST', '/payments/confirm', { body: { sessionId: 'pi_123' } })).status, 400);
  });
});

describe('the map', () => {
  const map = { title: 'November Community Day', volunteers: '', assignments: [], registrations: [] };

  test('saves volunteers and assigns a vendor to a numbered space', async () => {
    const savedState = { volunteers: '' };
    const assignment: { area?: string; spot?: number; registrationId?: string | null } = {};
    const app = appFor(admin, {
      saveEventVolunteers: async (_eventId, value) => {
        savedState.volunteers = value;
      },
      assignEventSpace: async (_eventId, area, spot, registrationId) => {
        assignment.area = area;
        assignment.spot = spot;
        assignment.registrationId = registrationId;
      },
      getEventMap: async () => ({ ...map, volunteers: savedState.volunteers }),
    });
    const saved = await call(app, 'PUT', '/events/event-1/volunteers', { body: { volunteers: '  Louise, Jennifer  ' } });
    assert.equal(saved.status, 200);
    assert.equal(savedState.volunteers, 'Louise, Jennifer');
    const tooLong = await call(app, 'PUT', '/events/event-1/volunteers', { body: { volunteers: 'a'.repeat(401) } });
    assert.equal(tooLong.status, 400);

    const assigned = await call(app, 'PUT', '/events/event-1/map', {
      body: { area: 'pavilion', spot: 4, registrationId: 'reg-1' },
    });
    assert.equal(assigned.status, 200);
    assert.deepEqual(assignment, { area: 'pavilion', spot: 4, registrationId: 'reg-1' });

    await call(app, 'PUT', '/events/event-1/map', { body: { area: 'grass', spot: 1, registrationId: null } });
    assert.equal(assignment.registrationId, null);
    const bad = await call(app, 'PUT', '/events/event-1/map', { body: { area: 'parking', spot: 1, registrationId: null } });
    assert.equal(bad.status, 400);
    assert.equal((await call(appFor(person()), 'GET', '/events/event-1/map')).status, 403);
  });

  test('passes a missing map table through as a database error', async () => {
    const app = appFor(admin, {
      getEventMap: async () => {
        throw new DatabaseError(503, 'Run server/supabase/migrations/20261105180000_space_assignments.sql in the Supabase SQL editor.');
      },
    });
    const response = await call(app, 'GET', '/events/event-1/map');
    assert.equal(response.status, 503);
    assert.match(response.body?.error ?? '', /space_assignments/);
  });
});

describe('emailing vendors', () => {
  test('sends a private, cleaned message to each chosen vendor and replies to the administrator', async () => {
    const sent: EmailMessage[] = [];
    const app = appFor(admin, {
      emailAudienceCounts: async () => ({ vendors: 2, registered: 1, unpaid: 1 }),
      listEmailRecipients: async (audience) => {
        assert.equal(audience, 'unpaid');
        return [{ name: 'Ada', email: 'ada@example.com' }];
      },
      sendVendorEmails: async (input) => {
        sent.push(input);
        return { sent: input.recipients.length, failed: [] };
      },
    });
    const response = await call(app, 'POST', '/events/event-1/email', {
      body: {
        audience: 'unpaid',
        subject: '  Vendor   map  ',
        text: 'Hi <b>there</b> <script>alert(1)</script>',
        images: [],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(sent[0]?.subject, 'Vendor map');
    assert.equal(sent[0]?.replyTo, admin.email);
    assert.deepEqual(sent[0]?.recipients, [{ name: 'Ada', email: 'ada@example.com' }]);
    assert.match(sent[0]?.html ?? '', /<b>there<\/b>/);
    assert.equal(sent[0]?.html.includes('script'), false);
    assert.equal((await call(appFor(person()), 'POST', '/events/event-1/email', { body: {} })).status, 403);
  });

  test('sends to a pasted list and rejects the same addresses the form rejects', async () => {
    const addresses = 'Ada@Example.com, grace@example.com ada@example.com';
    const sent: string[] = [];
    const app = appFor(admin, {
      emailAudienceCounts: async () => ({ vendors: 0, registered: 0, unpaid: 0 }),
      sendVendorEmails: async (input) => {
        sent.push(...input.recipients.map((recipient) => recipient.email));
        return { sent: input.recipients.length, failed: [] };
      },
    });
    const response = await call(app, 'POST', '/events/event-1/email', {
      body: { audience: 'addresses', subject: 'Hello', text: 'See you there.', addresses },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(sent, parseAddressList(addresses).emails);

    const invalid = await call(app, 'POST', '/events/event-1/email', {
      body: { audience: 'addresses', subject: 'Hello', text: 'See you there.', addresses: 'not-an-email' },
    });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body?.error ?? '', /not-an-email/);
    assert.equal(sent.length, 2);
  });

  test('attaches an image referenced in the message and skips one that is not', async () => {
    let images: EmailMessage['images'] = [];
    const app = appFor(admin, {
      emailAudienceCounts: async () => ({ vendors: 1, registered: 1, unpaid: 0 }),
      sendVendorEmails: async (input) => {
        images = input.images;
        return { sent: 1, failed: [] };
      },
    });
    const png = Buffer.from('map').toString('base64');
    const response = await call(app, 'POST', '/events/event-1/email', {
      body: {
        audience: 'addresses',
        subject: 'Map',
        text: '<img src="cid:img1" alt="Map">',
        addresses: 'ada@example.com',
        images: [
          { id: 'img1', contentType: 'image/png', data: png },
          { id: 'img2', contentType: 'image/png', data: png },
        ],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(images.length, 1);
    assert.equal(images[0]?.fileName, 'img1.png');
    assert.equal(images[0]?.contentType, 'image/png');

    const missingImage = await call(app, 'POST', '/events/event-1/email', {
      body: {
        audience: 'addresses',
        subject: 'Map',
        text: '<img src="cid:img9" alt="Map">',
        addresses: 'ada@example.com',
        images: [],
      },
    });
    assert.equal(missingImage.status, 400);
  });

  test('reports a mail failure without sending when nobody matches', async () => {
    const app = appFor(admin, {
      emailAudienceCounts: async () => ({ vendors: 0, registered: 0, unpaid: 0 }),
      listEmailRecipients: async () => [],
    });
    const empty = await call(app, 'POST', '/events/event-1/email', {
      body: { audience: 'registered', subject: 'Hello', text: 'Hi' },
    });
    assert.equal(empty.status, 400);

    const unconfigured = appFor(admin, {
      emailAudienceCounts: async () => ({ vendors: 1, registered: 1, unpaid: 0 }),
      listEmailRecipients: async () => [{ name: 'Ada', email: 'ada@example.com' }],
      sendVendorEmails: async () => {
        throw new SesError(503, 'Amazon SES is not configured. Add AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL to .env.');
      },
    });
    const response = await call(unconfigured, 'POST', '/events/event-1/email', {
      body: { audience: 'vendors', subject: 'Hello', text: 'Hi' },
    });
    assert.equal(response.status, 503);
    assert.match(response.body?.error ?? '', /SES_FROM_EMAIL/);
  });
});
