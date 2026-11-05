import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isAdminEmail } from './admins.js';
import { DatabaseError, databaseFailure } from './errors.js';
import { supabaseServiceRoleKey, supabaseUrl } from './env.js';
import { feeCents } from './fees.js';
import {
  assertAssignableSpot,
  isMapArea,
  mapSpotLimit,
  mergeSpaceLists,
  uniqueRecipients,
  type EmailAudience,
} from './guards.js';

export { DatabaseError };
export { isEmailAudience, isMapArea, type EmailAudience } from './guards.js';
import type {
  AccountDetail,
  AccountSummary,
  CurrentUser,
  EventInput,
  EventMap,
  EventRecord,
  Identity,
  MapArea,
  ProviderName,
  RegistrationRecord,
  SpaceRequest,
  VendorProfileDraft,
  VendorProfileInput,
} from './types.js';

type UserRow = {
  id: string;
  provider: ProviderName;
  email: string;
  name: string;
  picture: string | null;
  profile_completed_at: string | null;
  venmo: string | null;
  contact_person: string | null;
  business_name: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
};

const userColumns =
  'id, provider, email, name, picture, profile_completed_at, venmo, contact_person, business_name, phone, crosswinds_resident, offering, products_and_services, facebook_name';

const eventColumns =
  'id, title, description, location, starts_at, ends_at, capacity, spaces_available, created_at';

const spaceOrder: SpaceRequest[] = ['grass-generator', 'grass', 'food-truck', 'pavilion'];

function asSpaceList(value: unknown): SpaceRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const spaces: SpaceRequest[] = [];
  for (const item of value) {
    if (typeof item === 'string' && spaceOrder.includes(item as SpaceRequest)) {
      spaces.push(item as SpaceRequest);
    }
  }
  return spaces;
}

type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  spaces_available: string[] | null;
  created_at: string;
};

type RegistrationRow = {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
  paid_at: string | null;
  stripe_checkout_session_id: string | null;
  spaces_requested: string[] | null;
};

type RegistrantRow = {
  id: string;
  user_id: string;
  created_at: string;
  paid_at: string | null;
  amount_cents: number | null;
  stripe_checkout_session_id: string | null;
  spaces_requested: string[] | null;
  users: { name: string; email: string } | { name: string; email: string }[] | null;
};

export type OwnedRegistration = {
  id: string;
  paidAt: string | null;
  stripeCheckoutSessionId: string | null;
};

export type BoothFee = {
  cents: number;
  resident: boolean;
};

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const accountLinkColumns =
  'id, email, created_at, profile_completed_at, picture, venmo, contact_person, business_name, phone, crosswinds_resident, offering, products_and_services, facebook_name, admin_notes';

type AccountLink = {
  id: string;
  email: string;
  created_at: string;
  profile_completed_at: string | null;
  picture: string | null;
  venmo: string | null;
  contact_person: string | null;
  business_name: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
  admin_notes: string | null;
};

export async function upsertUser(identity: Identity): Promise<CurrentUser> {
  return linkIdentity(identity, false);
}

async function linkIdentity(identity: Identity, retried: boolean): Promise<CurrentUser> {
  const candidates = await findIdentityCandidates(identity);
  if (candidates.length === 0) {
    const created = await insertUser(identity);
    if (created) {
      return created;
    }
    if (retried) {
      throw databaseFailure('Could not save this account.');
    }
    return linkIdentity(identity, true);
  }

  const survivor = pickSurvivor(candidates);
  for (const other of candidates) {
    if (other.id !== survivor.id) {
      await mergeUserInto(survivor.id, other.id);
    }
  }
  const updated = await updateUserIdentity(survivor.id, identity);
  if (updated) {
    return updated;
  }
  if (retried) {
    throw databaseFailure('Could not save this account.');
  }
  return linkIdentity(identity, true);
}

async function findIdentityCandidates(identity: Identity): Promise<AccountLink[]> {
  const [byExactEmail, byEmail, byProvider] = await Promise.all([
    supabase.from('users').select(accountLinkColumns).eq('email', identity.email),
    supabase.from('users').select(accountLinkColumns).ilike('email', exactIlike(identity.email)),
    supabase
      .from('users')
      .select(accountLinkColumns)
      .eq('provider', identity.provider)
      .eq('provider_subject', identity.subject)
      .maybeSingle(),
  ]);

  if (byExactEmail.error) {
    throw databaseFailure(byExactEmail.error.message);
  }
  if (byEmail.error) {
    throw databaseFailure(byEmail.error.message);
  }
  if (byProvider.error) {
    throw databaseFailure(byProvider.error.message);
  }

  const matches = new Map<string, AccountLink>();
  for (const row of [...((byExactEmail.data ?? []) as AccountLink[]), ...((byEmail.data ?? []) as AccountLink[])]) {
    if (row.email.trim().toLowerCase() === identity.email) {
      matches.set(row.id, row);
    }
  }
  if (byProvider.data) {
    matches.set((byProvider.data as AccountLink).id, byProvider.data as AccountLink);
  }
  return [...matches.values()];
}

async function insertUser(identity: Identity): Promise<CurrentUser | null> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      provider: identity.provider,
      provider_subject: identity.subject,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
    })
    .select(userColumns)
    .single();

  if (error?.code === '23505') {
    return null;
  }
  if (error || !data) {
    throw databaseFailure(error?.message);
  }
  return toCurrentUser(data as UserRow);
}

async function updateUserIdentity(userId: string, identity: Identity): Promise<CurrentUser | null> {
  const { data, error } = await supabase
    .from('users')
    .update({
      provider: identity.provider,
      provider_subject: identity.subject,
      email: identity.email,
      name: identity.name,
      ...(identity.picture ? { picture: identity.picture } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select(userColumns)
    .single();

  if (error?.code === '23505') {
    return null;
  }
  if (error || !data) {
    throw databaseFailure(error?.message);
  }
  return toCurrentUser(data as UserRow);
}

function pickSurvivor(candidates: AccountLink[]): AccountLink {
  return [...candidates].sort((left, right) => {
    const profile = Number(right.profile_completed_at != null) - Number(left.profile_completed_at != null);
    if (profile !== 0) {
      return profile;
    }
    return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
  })[0];
}

async function mergeUserInto(survivorId: string, duplicateId: string): Promise<void> {
  const [survivor, duplicate] = await Promise.all([loadAccountLink(survivorId), loadAccountLink(duplicateId)]);
  if (!survivor || !duplicate) {
    return;
  }

  const profilePatch = missingProfile(survivor, duplicate);
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase.from('users').update(profilePatch).eq('id', survivorId);
    if (error) {
      throw databaseFailure(error.message);
    }
  }

  await moveRegistrations(survivorId, duplicateId);

  const { error: eventError } = await supabase.from('events').update({ created_by: survivorId }).eq('created_by', duplicateId);
  if (eventError) {
    throw databaseFailure(eventError.message);
  }

  const { error: deleteError } = await supabase.from('users').delete().eq('id', duplicateId);
  if (deleteError) {
    throw databaseFailure(deleteError.message);
  }
}

async function loadAccountLink(userId: string): Promise<AccountLink | null> {
  const { data, error } = await supabase.from('users').select(accountLinkColumns).eq('id', userId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return data ? (data as AccountLink) : null;
}

function missingProfile(survivor: AccountLink, duplicate: AccountLink): Partial<AccountLink> {
  const patch: Partial<AccountLink> = {};
  const fields = [
    'picture',
    'venmo',
    'contact_person',
    'business_name',
    'phone',
    'crosswinds_resident',
    'offering',
    'products_and_services',
    'facebook_name',
    'admin_notes',
    'profile_completed_at',
  ] as const;
  for (const field of fields) {
    if (survivor[field] == null && duplicate[field] != null) {
      patch[field] = duplicate[field] as never;
    }
  }
  return patch;
}

type RegistrationLink = {
  id: string;
  event_id: string;
  paid_at: string | null;
  amount_cents: number | null;
  stripe_checkout_session_id: string | null;
  spaces_requested: string[] | null;
};

async function moveRegistrations(survivorId: string, duplicateId: string): Promise<void> {
  const columns = 'id, event_id, paid_at, amount_cents, stripe_checkout_session_id, spaces_requested';
  const [survivorResult, duplicateResult] = await Promise.all([
    supabase.from('registrations').select(columns).eq('user_id', survivorId),
    supabase.from('registrations').select(columns).eq('user_id', duplicateId),
  ]);
  if (survivorResult.error) {
    throw databaseFailure(survivorResult.error.message);
  }
  if (duplicateResult.error) {
    throw databaseFailure(duplicateResult.error.message);
  }

  const survivorRows = new Map(
    ((survivorResult.data ?? []) as RegistrationLink[]).map((row) => [row.event_id, row]),
  );

  for (const duplicateRow of (duplicateResult.data ?? []) as RegistrationLink[]) {
    const survivorRow = survivorRows.get(duplicateRow.event_id);
    if (!survivorRow) {
      const { error } = await supabase.from('registrations').update({ user_id: survivorId }).eq('id', duplicateRow.id);
      if (error) {
        throw databaseFailure(error.message);
      }
      continue;
    }

    const patch: Partial<RegistrationLink> = {};
    const survivorSpaces = asSpaceList(survivorRow.spaces_requested);
    const duplicateSpaces = asSpaceList(duplicateRow.spaces_requested);
    const merged = mergeSpaceLists(survivorSpaces, duplicateSpaces);
    if (merged.join('\0') !== survivorSpaces.join('\0')) {
      patch.spaces_requested = merged;
    }
    if (survivorRow.paid_at == null && duplicateRow.paid_at != null) {
      patch.paid_at = duplicateRow.paid_at;
      patch.amount_cents = duplicateRow.amount_cents;
      patch.stripe_checkout_session_id = duplicateRow.stripe_checkout_session_id;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('registrations').update(patch).eq('id', survivorRow.id);
      if (error) {
        throw databaseFailure(error.message);
      }
    }

    const { error } = await supabase.from('registrations').delete().eq('id', duplicateRow.id);
    if (error) {
      throw databaseFailure(error.message);
    }
  }
}

function exactIlike(value: string): string {
  return value.replace(/%/g, '\\%');
}

export async function getUserById(userId: string): Promise<CurrentUser | null> {
  const { data, error } = await supabase.from('users').select(userColumns).eq('id', userId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return data ? toCurrentUser(data as UserRow) : null;
}

export async function saveVendorProfile(userId: string, input: VendorProfileInput): Promise<CurrentUser> {
  const { data, error } = await supabase
    .from('users')
    .update(profileUpdate(input))
    .eq('id', userId)
    .select(userColumns)
    .single();

  if (error || !data) {
    throw databaseFailure(error?.message);
  }

  return toCurrentUser(data as UserRow);
}

export async function saveAdminAccount(
  userId: string,
  input: VendorProfileInput,
  adminNotes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      ...profileUpdate(input),
      admin_notes: adminNotes,
    })
    .eq('id', userId);
  if (error) {
    throw databaseFailure(error.message);
  }
}

function profileUpdate(input: VendorProfileInput) {
  return {
    venmo: input.venmo,
    contact_person: input.contactPerson,
    business_name: input.businessName,
    phone: input.phone,
    crosswinds_resident: input.crosswindsResident,
    offering: input.offering,
    products_and_services: input.productsAndServices,
    facebook_name: input.facebookName,
    profile_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const profileColumns =
  'venmo, contact_person, business_name, phone, crosswinds_resident, offering, products_and_services, facebook_name, profile_completed_at';

type ProfileRow = {
  venmo: string | null;
  contact_person: string | null;
  business_name: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
  profile_completed_at: string | null;
};

const offerings = new Set(['retail', 'food', 'service', 'group', 'entertainment']);

export async function getVendorProfile(userId: string): Promise<VendorProfileDraft | null> {
  const { data, error } = await supabase.from('users').select(profileColumns).eq('id', userId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return data ? toProfileDraft(data as ProfileRow) : null;
}

export async function listEvents(userId: string): Promise<EventRecord[]> {
  const [events, registrations, boothFee] = await Promise.all([
    selectEvents(),
    selectRegistrations(),
    getBoothFee(userId),
  ]);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  const paid = new Set<string>();
  const refundable = new Set<string>();
  const spaces = new Map<string, SpaceRequest[]>();

  for (const registration of registrations) {
    counts.set(registration.event_id, (counts.get(registration.event_id) ?? 0) + 1);
    if (registration.user_id === userId) {
      mine.add(registration.event_id);
      spaces.set(registration.event_id, asSpaceList(registration.spaces_requested));
      if (registration.paid_at) {
        paid.add(registration.event_id);
        if (registration.stripe_checkout_session_id) {
          refundable.add(registration.event_id);
        }
      }
    }
  }

  return events.map((event) =>
    toEventRecord(
      event,
      counts.get(event.id) ?? 0,
      mine.has(event.id),
      paid.has(event.id),
      refundable.has(event.id),
      boothFee?.cents ?? null,
      spaces.get(event.id) ?? [],
    ),
  );
}

export async function getEvent(
  eventId: string,
  user: CurrentUser,
): Promise<{ event: EventRecord; registrations: RegistrationRecord[] } | null> {
  const { data, error } = await supabase
    .from('events')
    .select(eventColumns)
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data) {
    return null;
  }

  const { data: registrationRows, error: registrationError } = await supabase
    .from('registrations')
    .select(
      'id, user_id, created_at, paid_at, amount_cents, stripe_checkout_session_id, spaces_requested, users(name, email)',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (registrationError) {
    throw databaseFailure(registrationError.message);
  }

  const rows = (registrationRows ?? []) as RegistrantRow[];
  const registrations = rows.map((row) => {
    const account = Array.isArray(row.users) ? row.users[0] : row.users;
    const email = account?.email ?? null;
    const showEmail = user.admin || row.user_id === user.id;
    return {
      id: row.id,
      userId: user.admin ? row.user_id : null,
      name: account?.name ?? 'Registered user',
      email: showEmail ? email : null,
      paid: user.admin ? row.paid_at != null : null,
      refundable: user.admin ? row.paid_at != null && Boolean(row.stripe_checkout_session_id) : false,
      amountCents: user.admin ? row.amount_cents : null,
      spacesRequested: user.admin ? asSpaceList(row.spaces_requested) : [],
      createdAt: row.created_at,
    };
  });

  const mine = rows.find((row) => row.user_id === user.id);
  const boothFee = await getBoothFee(user.id);

  return {
    event: toEventRecord(
      data as EventRow,
      registrations.length,
      mine != null,
      mine?.paid_at != null,
      mine?.paid_at != null && Boolean(mine.stripe_checkout_session_id),
      boothFee?.cents ?? null,
      asSpaceList(mine?.spaces_requested),
    ),
    registrations,
  };
}

export async function createEvent(userId: string, input: EventInput): Promise<EventRecord> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      title: input.title,
      description: input.description,
      location: input.location,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      capacity: input.capacity,
      spaces_available: input.spacesAvailable,
      created_by: userId,
    })
    .select(eventColumns)
    .single();

  if (error || !data) {
    throw databaseFailure(error?.message);
  }

  const boothFee = await getBoothFee(userId);
  return toEventRecord(data as EventRow, 0, false, false, false, boothFee?.cents ?? null, []);
}

export async function updateEvent(eventId: string, input: EventInput): Promise<boolean> {
  const { data: registrations, error: registrationError } = await supabase
    .from('registrations')
    .select('spaces_requested')
    .eq('event_id', eventId);
  if (registrationError) {
    throw databaseFailure(registrationError.message);
  }

  const rows = registrations ?? [];
  if (input.capacity != null && rows.length > input.capacity) {
    throw new DatabaseError(400, 'Capacity cannot be lower than the number of people already registered.');
  }
  const offered = new Set<string>(input.spacesAvailable);
  const requestedSpaceRemoved = rows.some((row) =>
    asSpaceList(row.spaces_requested).some((space) => !offered.has(space)),
  );
  if (requestedSpaceRemoved) {
    throw new DatabaseError(400, 'Someone is already registered for a space you removed.');
  }

  const { data, error } = await supabase
    .from('events')
    .update({
      title: input.title,
      description: input.description,
      location: input.location,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      capacity: input.capacity,
      spaces_available: input.spacesAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .select('id');
  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []).length > 0;
}

const accountSummaryColumns =
  'id, name, email, business_name, venmo, contact_person, phone, crosswinds_resident, offering, products_and_services, facebook_name, profile_completed_at';
const accountDetailColumns =
  'id, name, email, provider, business_name, venmo, contact_person, phone, crosswinds_resident, offering, products_and_services, facebook_name, admin_notes, profile_completed_at, created_at';

type AccountSummaryRow = {
  id: string;
  name: string;
  email: string;
  business_name: string | null;
  venmo: string | null;
  contact_person: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
  profile_completed_at: string | null;
};

type AccountDetailRow = AccountSummaryRow & {
  provider: ProviderName;
  venmo: string | null;
  contact_person: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
  admin_notes: string | null;
  created_at: string;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  const { data, error } = await supabase.from('users').select(accountSummaryColumns).order('name', { ascending: true });
  if (error) {
    throw databaseFailure(error.message);
  }
  return ((data ?? []) as AccountSummaryRow[]).map(toAccountSummary);
}

export async function emailAudienceCounts(
  eventId: string,
): Promise<{ vendors: number; registered: number; unpaid: number } | null> {
  if (!(await eventExists(eventId))) {
    return null;
  }
  const [vendors, registered, unpaid] = await Promise.all([
    listEmailRecipients('vendors', eventId),
    listEmailRecipients('registered', eventId),
    listEmailRecipients('unpaid', eventId),
  ]);
  return { vendors: vendors.length, registered: registered.length, unpaid: unpaid.length };
}

export async function listEmailRecipients(
  audience: EmailAudience,
  eventId: string,
): Promise<{ name: string; email: string }[]> {
  if (audience === 'addresses') {
    return [];
  }
  if (audience === 'vendors') {
    const { data, error } = await supabase.from('users').select('name, email');
    if (error) {
      throw databaseFailure(error.message);
    }
    return uniqueRecipients((data ?? []) as { name: string | null; email: string | null }[]);
  }

  const query = supabase.from('registrations').select('users(name, email)').eq('event_id', eventId);
  const { data, error } = await (audience === 'unpaid' ? query.is('paid_at', null) : query);
  if (error) {
    throw databaseFailure(error.message);
  }
  return uniqueRecipients(
    ((data ?? []) as RegistrationEmailRow[]).map((row) => {
      const account = Array.isArray(row.users) ? row.users[0] : row.users;
      return { name: account?.name ?? null, email: account?.email ?? null };
    }),
  );
}

async function eventExists(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return Boolean(data);
}

type RegistrationEmailRow = {
  users: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
};

export async function getAccount(userId: string): Promise<AccountDetail | null> {
  const { data, error } = await supabase.from('users').select(accountDetailColumns).eq('id', userId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data) {
    return null;
  }
  const row = data as AccountDetailRow;
  return {
    ...toAccountSummary(row),
    provider: row.provider,
    venmo: blankToNull(row.venmo),
    contactPerson: blankToNull(row.contact_person),
    phone: blankToNull(row.phone),
    crosswindsResident: row.crosswinds_resident,
    offering: blankToNull(row.offering),
    productsAndServices: blankToNull(row.products_and_services),
    facebookName: blankToNull(row.facebook_name),
    adminNotes: blankToNull(row.admin_notes),
    createdAt: row.created_at,
  };
}

function toAccountSummary(row: AccountSummaryRow): AccountSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    businessName: blankToNull(row.business_name),
    profileComplete: isProfileComplete(row),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getBoothFee(userId: string): Promise<BoothFee | null> {
  const { data, error } = await supabase
    .from('users')
    .select('crosswinds_resident, profile_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data?.profile_completed_at || typeof data.crosswinds_resident !== 'boolean') {
    return null;
  }
  return { cents: feeCents(data.crosswinds_resident), resident: data.crosswinds_resident };
}

export async function getEventStart(eventId: string): Promise<string | null> {
  const { data, error } = await supabase.from('events').select('starts_at').eq('id', eventId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data) {
    return null;
  }
  return (data.starts_at as string | null) ?? null;
}

export async function getRegistration(
  eventId: string,
  registrationId: string,
): Promise<{
  id: string;
  userId: string;
  paidAt: string | null;
  stripeCheckoutSessionId: string | null;
} | null> {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, user_id, paid_at, stripe_checkout_session_id')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id as string,
    userId: data.user_id as string,
    paidAt: (data.paid_at as string | null) ?? null,
    stripeCheckoutSessionId: (data.stripe_checkout_session_id as string | null) ?? null,
  };
}

export async function updateRegistrationSpaces(
  eventId: string,
  registrationId: string,
  spacesRequested: SpaceRequest[],
): Promise<void> {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('spaces_available')
    .eq('id', eventId)
    .maybeSingle();
  if (eventError) {
    throw databaseFailure(eventError.message);
  }
  if (!event) {
    throw new DatabaseError(404, 'That event does not exist.');
  }
  const offered = new Set(spacesAvailable((event.spaces_available as string[] | null) ?? []));
  if (spacesRequested.some((space) => !offered.has(space))) {
    throw new DatabaseError(400, 'One of those spaces is not available for this event.');
  }

  const { data, error } = await supabase
    .from('registrations')
    .update({ spaces_requested: spacesRequested })
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .select('id');
  if (error) {
    throw databaseFailure(error.message);
  }
  if ((data ?? []).length === 0) {
    throw new DatabaseError(404, 'That registration does not exist.');
  }
}

export async function getEventMap(eventId: string): Promise<EventMap | null> {
  const event = await readEventTitle(eventId);
  if (!event) {
    return null;
  }

  const { data: registrationRows, error: registrationError } = await supabase
    .from('registrations')
    .select('id, spaces_requested, users(name, business_name)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (registrationError) {
    throw databaseFailure(registrationError.message);
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('space_assignments')
    .select('area, spot, registration_id')
    .eq('event_id', eventId);
  if (assignmentError) {
    if (assignmentError.message.includes('space_assignments')) {
      throw new DatabaseError(
        503,
        'Run server/supabase/migrations/20261105180000_space_assignments.sql in the Supabase SQL editor.',
      );
    }
    throw databaseFailure(assignmentError.message);
  }

  const registrations = ((registrationRows ?? []) as MapRegistrationRow[]).map((row) => {
    const account = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      id: row.id,
      name: account?.name ?? 'Registered user',
      businessName: account?.business_name?.trim() ? account.business_name.trim() : null,
      spacesRequested: asSpaceList(row.spaces_requested),
    };
  });
  const registrationIds = new Set(registrations.map((registration) => registration.id));

  return {
    title: event.title,
    volunteers: event.volunteers,
    registrations,
    assignments: ((assignmentRows ?? []) as AssignmentRow[])
      .filter(
        (row) =>
          isMapArea(row.area) &&
          Number.isInteger(row.spot) &&
          row.spot >= 1 &&
          row.spot <= mapSpotLimit(row.area) &&
          registrationIds.has(row.registration_id),
      )
      .map((row) => ({
        area: row.area as MapArea,
        spot: row.spot,
        registrationId: row.registration_id,
      })),
  };
}

export async function saveEventVolunteers(eventId: string, volunteers: string): Promise<void> {
  const event = await readEventTitle(eventId);
  if (!event) {
    throw new DatabaseError(404, 'That event does not exist.');
  }
  const { error } = await supabase
    .from('events')
    .update({ volunteers: volunteers || null })
    .eq('id', eventId);
  if (error) {
    if (error.message.includes('volunteers')) {
      throw new DatabaseError(
        503,
        'Run server/supabase/migrations/20261105190000_event_volunteers.sql in the Supabase SQL editor.',
      );
    }
    throw databaseFailure(error.message);
  }
}

async function readEventTitle(eventId: string): Promise<{ title: string; volunteers: string } | null> {
  const withVolunteers = await supabase.from('events').select('title, volunteers').eq('id', eventId).maybeSingle();
  if (withVolunteers.error?.message.includes('volunteers')) {
    const titleOnly = await supabase.from('events').select('title').eq('id', eventId).maybeSingle();
    if (titleOnly.error) {
      throw databaseFailure(titleOnly.error.message);
    }
    if (!titleOnly.data) {
      return null;
    }
    return { title: titleOnly.data.title as string, volunteers: '' };
  }
  if (withVolunteers.error) {
    throw databaseFailure(withVolunteers.error.message);
  }
  if (!withVolunteers.data) {
    return null;
  }
  const volunteers = withVolunteers.data.volunteers;
  return {
    title: withVolunteers.data.title as string,
    volunteers: typeof volunteers === 'string' ? volunteers : '',
  };
}

export async function assignEventSpace(
  eventId: string,
  area: MapArea,
  spot: number,
  registrationId: string | null,
): Promise<void> {
  assertAssignableSpot(area, spot);
  if (registrationId) {
    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('id')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (registrationError) {
      throw databaseFailure(registrationError.message);
    }
    if (!registration) {
      throw new DatabaseError(404, 'That registration does not exist.');
    }
  }

  const { error: deleteError } = await supabase
    .from('space_assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('area', area)
    .eq('spot', spot);
  if (deleteError) {
    throw databaseFailure(deleteError.message);
  }
  if (!registrationId) {
    return;
  }

  const { error } = await supabase.from('space_assignments').insert({
    event_id: eventId,
    registration_id: registrationId,
    area,
    spot,
  });
  if (error) {
    throw databaseFailure(error.message);
  }
}

type MapRegistrationRow = {
  id: string;
  spaces_requested: string[] | null;
  users:
    | { name: string; business_name: string | null }
    | { name: string; business_name: string | null }[]
    | null;
};

type AssignmentRow = {
  area: string;
  spot: number;
  registration_id: string;
};

export async function deleteRegistration(eventId: string, registrationId: string): Promise<void> {
  const { error } = await supabase.from('registrations').delete().eq('id', registrationId).eq('event_id', eventId);
  if (error) {
    throw databaseFailure(error.message);
  }
}

export async function markRegistrationPaidByAdmin(
  eventId: string,
  registrationId: string,
  amountCents: number,
  stripeCheckoutSessionId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('registrations')
    .update({
      paid_at: new Date().toISOString(),
      amount_cents: amountCents,
      stripe_checkout_session_id: stripeCheckoutSessionId,
    })
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .is('paid_at', null)
    .select('id');
  if (error) {
    throw databaseFailure(error.message);
  }
  if ((data ?? []).length === 0) {
    throw new DatabaseError(409, 'That registration is already paid.');
  }
}

export async function getOwnedRegistration(eventId: string, userId: string): Promise<OwnedRegistration | null> {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, paid_at, stripe_checkout_session_id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw databaseFailure(error.message);
  }
  if (!data) {
    return null;
  }
  return {
    id: data.id as string,
    paidAt: (data.paid_at as string | null) ?? null,
    stripeCheckoutSessionId: (data.stripe_checkout_session_id as string | null) ?? null,
  };
}

export async function saveCheckoutSession(registrationId: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('registrations')
    .update({ stripe_checkout_session_id: sessionId })
    .eq('id', registrationId);

  if (error) {
    throw databaseFailure(error.message);
  }
}

export async function markRegistrationPaid(
  registrationId: string,
  amountCents: number,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('registrations')
    .update({
      paid_at: new Date().toISOString(),
      amount_cents: amountCents,
      stripe_checkout_session_id: sessionId,
    })
    .eq('id', registrationId)
    .is('paid_at', null);

  if (error) {
    throw databaseFailure(error.message);
  }
}

export async function registerForEvent(
  eventId: string,
  userId: string,
  spacesRequested: SpaceRequest[],
): Promise<void> {
  const { error } = await supabase.rpc('register_for_event', {
    p_event_id: eventId,
    p_user_id: userId,
    p_spaces_requested: spacesRequested,
  });

  if (!error) {
    return;
  }

  if (error.message.includes('event_not_found')) {
    throw new DatabaseError(404, 'That event does not exist.');
  }
  if (error.message.includes('event_full')) {
    throw new DatabaseError(409, 'This event is full.');
  }
  if (error.message.includes('invalid_space')) {
    throw new DatabaseError(400, 'Choose at least one space.');
  }
  if (error.message.includes('space_unavailable')) {
    throw new DatabaseError(400, 'One of those spaces is not available for this event.');
  }
  if (error.message.includes('too_many_spaces')) {
    throw new DatabaseError(400, 'Request 20 spaces or fewer.');
  }
  throw databaseFailure(error.message);
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.from('events').delete().eq('id', eventId).select('id');
  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []).length > 0;
}

export async function unregisterFromEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('registrations')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) {
    throw databaseFailure(error.message);
  }
}

async function selectEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(eventColumns)
    .order('starts_at', { ascending: true });

  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []) as EventRow[];
}

async function selectRegistrations(): Promise<RegistrationRow[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, event_id, user_id, created_at, paid_at, stripe_checkout_session_id, spaces_requested');
  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []) as RegistrationRow[];
}

function toProfileDraft(row: ProfileRow): VendorProfileDraft {
  return {
    venmo: row.venmo?.trim() ?? '',
    contactPerson: row.contact_person?.trim() ?? '',
    businessName: row.business_name?.trim() ?? '',
    phone: row.phone?.trim() ?? '',
    crosswindsResident: typeof row.crosswinds_resident === 'boolean' ? row.crosswinds_resident : null,
    offering: row.offering && offerings.has(row.offering) ? (row.offering as VendorProfileDraft['offering']) : null,
    productsAndServices: row.products_and_services?.trim() ?? '',
    facebookName: row.facebook_name?.trim() ?? '',
  };
}

function isProfileComplete(row: {
  profile_completed_at: string | null;
  venmo: string | null;
  contact_person: string | null;
  business_name: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
}): boolean {
  const phoneDigits = row.phone?.replace(/\D/g, '').length ?? 0;
  return (
    row.profile_completed_at != null &&
    Boolean(row.venmo?.trim()) &&
    Boolean(row.contact_person?.trim()) &&
    Boolean(row.business_name?.trim()) &&
    phoneDigits >= 10 &&
    typeof row.crosswinds_resident === 'boolean' &&
    Boolean(row.offering && offerings.has(row.offering)) &&
    Boolean(row.products_and_services?.trim())
  );
}

function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    provider: row.provider,
    admin: isAdminEmail(row.email),
    profileComplete: isProfileComplete(row),
  };
}

function toEventRecord(
  row: EventRow,
  registrationCount: number,
  registered: boolean,
  paid: boolean,
  refundable: boolean,
  feeCents: number | null,
  spacesRequested: SpaceRequest[],
): EventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    registrationCount,
    registered,
    paid: registered && paid,
    refundable: registered && paid && refundable,
    feeCents,
    spacesRequested: registered ? spacesRequested : [],
    spacesAvailable: spacesAvailable(row.spaces_available),
    createdAt: row.created_at,
  };
}

function spacesAvailable(values: string[] | null): SpaceRequest[] {
  const present = new Set(values ?? []);
  return spaceOrder.filter((space) => present.has(space));
}

