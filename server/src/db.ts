import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isAdminEmail } from './admins.js';
import { DatabaseError, databaseFailure } from './errors.js';
import { supabaseServiceRoleKey, supabaseUrl } from './env.js';
import { canAssignToSpot } from '../../client/src/map/vendors.js';
import { feeCents } from './fees.js';
import { presentedProvider } from './profile.js';
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
  const saved = await updateProfile(userId, input);
  return toCurrentUser(saved);
}

export async function saveAdminAccount(
  userId: string,
  input: VendorProfileInput,
  adminNotes: string | null,
): Promise<void> {
  await updateProfile(userId, input, adminNotes);
}

export async function createAdminAccount(input: { name: string; email: string }): Promise<AccountDetail> {
  const row = await insertAdminAccount(accountDetailColumns, input);
  return accountDetailFrom(row);
}

async function insertAdminAccount(
  columns: string,
  input: { name: string; email: string },
): Promise<AccountDetailRow> {
  const inserted = await supabase
    .from('users')
    .insert({
      provider: 'google',
      provider_subject: `admin:${crypto.randomUUID()}`,
      email: input.email,
      name: input.name,
    })
    .select(columns)
    .single();
  if (inserted.error?.code === '23505') {
    throw new DatabaseError(409, 'An account with that email already exists.');
  }
  if (!inserted.error && inserted.data) {
    return inserted.data as unknown as AccountDetailRow;
  }
  const retry = accountColumnRetry(columns, inserted.error?.message);
  if (retry) {
    return insertAdminAccount(retry, input);
  }
  throw databaseFailure(inserted.error?.message);
}

function profileUpdate(input: VendorProfileInput, options: { image: boolean; optOut: boolean }) {
  return {
    venmo: input.venmo,
    contact_person: input.contactPerson,
    business_name: input.businessName,
    phone: input.phone,
    crosswinds_resident: input.crosswindsResident,
    offering: input.offering,
    products_and_services: input.productsAndServices,
    facebook_name: input.facebookName,
    ...(options.image ? { branding_image: input.brandingImage } : {}),
    ...(options.optOut ? { email_opt_out: input.emailOptOut } : {}),
    profile_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function updateProfile(userId: string, input: VendorProfileInput, adminNotes?: string | null): Promise<UserRow> {
  return writeProfile(userId, input, adminNotes, { image: true, optOut: true });
}

async function writeProfile(
  userId: string,
  input: VendorProfileInput,
  adminNotes: string | null | undefined,
  options: { image: boolean; optOut: boolean },
): Promise<UserRow> {
  const extra = adminNotes === undefined ? {} : { admin_notes: adminNotes };
  const saved = await supabase
    .from('users')
    .update({ ...profileUpdate(input, options), ...extra })
    .eq('id', userId)
    .select(userColumns)
    .single();
  if (!saved.error && saved.data) {
    return saved.data as UserRow;
  }
  if (options.optOut && saved.error?.message.includes('email_opt_out')) {
    if (input.emailOptOut) {
      throw new DatabaseError(
        503,
        'Run server/supabase/migrations/20261110150000_email_opt_out.sql in the Supabase SQL editor.',
      );
    }
    return writeProfile(userId, input, adminNotes, { ...options, optOut: false });
  }
  if (options.image && saved.error?.message.includes('branding_image') && !input.brandingImage) {
    return writeProfile(userId, input, adminNotes, { ...options, image: false });
  }
  throw profileFailure(saved.error?.message);
}

const profileColumns =
  'venmo, contact_person, business_name, phone, crosswinds_resident, offering, products_and_services, facebook_name, branding_image, email_opt_out, profile_completed_at';

type ProfileRow = {
  venmo: string | null;
  contact_person: string | null;
  business_name: string | null;
  phone: string | null;
  crosswinds_resident: boolean | null;
  offering: string | null;
  products_and_services: string | null;
  facebook_name: string | null;
  branding_image?: string | null;
  email_opt_out?: boolean;
  profile_completed_at: string | null;
};

function profileFailure(message: string | undefined): DatabaseError {
  if (message?.includes('branding_image')) {
    return new DatabaseError(
      503,
      'Run server/supabase/migrations/20261105200000_branding_image.sql in the Supabase SQL editor.',
    );
  }
  return databaseFailure(message);
}

function storedBrandingImage(value: string | null | undefined): string | null {
  return value?.startsWith('data:image/') ? value : null;
}

const offerings = new Set(['retail', 'food', 'service', 'group', 'entertainment']);

export async function getVendorProfile(userId: string): Promise<VendorProfileDraft | null> {
  const row = await selectProfile(profileColumns, userId);
  return row ? toProfileDraft(row) : null;
}

async function selectProfile(columns: string, userId: string): Promise<ProfileRow | null> {
  const selected = await supabase.from('users').select(columns).eq('id', userId).maybeSingle();
  if (!selected.error) {
    return (selected.data as unknown as ProfileRow | null) ?? null;
  }
  if (selected.error.message.includes('email_opt_out') && columns.split(', ').includes('email_opt_out')) {
    return selectProfile(withoutColumn(columns, 'email_opt_out'), userId);
  }
  if (selected.error.message.includes('branding_image') && columns.split(', ').includes('branding_image')) {
    return selectProfile(withoutColumn(columns, 'branding_image'), userId);
  }
  throw profileFailure(selected.error.message);
}

export async function listEvents(userId: string | null): Promise<EventRecord[]> {
  const [events, registrations, boothFee] = await Promise.all([
    selectEvents(),
    selectRegistrations(),
    userId ? getBoothFee(userId) : Promise.resolve(null),
  ]);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  const paid = new Set<string>();
  const refundable = new Set<string>();
  const spaces = new Map<string, SpaceRequest[]>();

  for (const registration of registrations) {
    counts.set(registration.event_id, (counts.get(registration.event_id) ?? 0) + 1);
    if (userId && registration.user_id === userId) {
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
  user: CurrentUser | null,
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
  const registrations = user
    ? rows.map((row) => {
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
      })
    : [];

  const mine = user ? rows.find((row) => row.user_id === user.id) : undefined;
  const boothFee = user ? await getBoothFee(user.id) : null;

  return {
    event: toEventRecord(
      data as EventRow,
      rows.length,
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
  'id, name, email, business_name, venmo, contact_person, phone, crosswinds_resident, offering, products_and_services, facebook_name, branding_image, profile_completed_at, archived, email_opt_out';
const accountDetailColumns =
  'id, name, email, provider, provider_subject, business_name, venmo, contact_person, phone, crosswinds_resident, offering, products_and_services, facebook_name, branding_image, admin_notes, profile_completed_at, created_at, archived, email_opt_out';

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
  branding_image?: string | null;
  profile_completed_at: string | null;
  archived?: boolean;
  email_opt_out?: boolean;
};

type AccountDetailRow = AccountSummaryRow & {
  provider: ProviderName;
  provider_subject: string;
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

export async function listAccounts(includeArchived = false): Promise<AccountSummary[]> {
  const rows = await selectAccountList(accountSummaryColumns, includeArchived);
  return rows.map(toAccountSummary);
}

async function selectAccountList(columns: string, includeArchived: boolean): Promise<AccountSummaryRow[]> {
  const hideArchived = !includeArchived && columns.split(', ').includes('archived');
  const selected = await (hideArchived
    ? supabase.from('users').select(columns).eq('archived', false).order('name', { ascending: true })
    : supabase.from('users').select(columns).order('name', { ascending: true }));
  if (!selected.error) {
    return (selected.data ?? []) as unknown as AccountSummaryRow[];
  }
  const retry = accountColumnRetry(columns, selected.error.message);
  if (retry) {
    return selectAccountList(retry, columns.includes('archived') && !retry.includes('archived') ? true : includeArchived);
  }
  throw profileFailure(selected.error.message);
}

export async function setEmailOptOut(userId: string, emailOptOut: boolean): Promise<boolean> {
  const updated = await supabase
    .from('users')
    .update({ email_opt_out: emailOptOut, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id');
  if (updated.error?.message.includes('email_opt_out')) {
    throw new DatabaseError(
      503,
      'Run server/supabase/migrations/20261110150000_email_opt_out.sql in the Supabase SQL editor.',
    );
  }
  if (updated.error) {
    throw databaseFailure(updated.error.message);
  }
  return (updated.data ?? []).length > 0;
}

export async function setAccountArchived(userId: string, archived: boolean): Promise<AccountDetail | null> {
  const updated = await supabase
    .from('users')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id');
  if (updated.error?.message.includes('archived')) {
    throw new DatabaseError(
      503,
      'Run server/supabase/migrations/20261109100000_user_archived.sql in the Supabase SQL editor.',
    );
  }
  if (updated.error) {
    throw databaseFailure(updated.error.message);
  }
  if ((updated.data ?? []).length === 0) {
    return null;
  }
  return getAccount(userId);
}

const EMAIL_LOG_MIGRATION =
  'Run server/supabase/migrations/20261112180000_email_deliveries.sql in the Supabase SQL editor.';

export type EmailDeliveryRecord = {
  vendorName: string;
  email: string;
  status: 'sent' | 'failed';
  result: string;
  subject: string;
  sentAt: string;
};

function missingEmailLog(message: string | undefined): boolean {
  return Boolean(message && (message.includes('email_deliveries') || message.includes('does not exist') || message.includes('schema cache')));
}

export async function assertEmailLog(): Promise<void> {
  const selected = await supabase.from('email_deliveries').select('id').limit(1);
  if (missingEmailLog(selected.error?.message)) {
    throw new DatabaseError(503, EMAIL_LOG_MIGRATION);
  }
  if (selected.error) {
    throw databaseFailure(selected.error.message);
  }
}

export async function lookupVendorNames(emails: string[]): Promise<Record<string, string>> {
  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  if (wanted.size === 0) {
    return {};
  }
  const selected = await supabase.from('users').select('name, email');
  if (selected.error) {
    throw databaseFailure(selected.error.message);
  }
  const names: Record<string, string> = {};
  for (const row of selected.data ?? []) {
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (email && name && wanted.has(email)) {
      names[email] = name;
    }
  }
  return names;
}

export async function recordEmailDelivery(row: {
  eventId: string;
  subject: string;
  vendorName: string;
  email: string;
  status: 'sent' | 'failed';
  result: string;
}): Promise<void> {
  const inserted = await supabase.from('email_deliveries').insert({
    event_id: row.eventId,
    subject: row.subject,
    vendor_name: row.vendorName,
    email: row.email,
    status: row.status,
    result: row.result,
  });
  if (missingEmailLog(inserted.error?.message)) {
    throw new DatabaseError(503, EMAIL_LOG_MIGRATION);
  }
  if (inserted.error) {
    throw databaseFailure(inserted.error.message);
  }
}

export async function listEmailDeliveries(eventId: string): Promise<EmailDeliveryRecord[] | null> {
  if (!(await eventExists(eventId))) {
    return null;
  }
  const selected = await supabase
    .from('email_deliveries')
    .select('vendor_name, email, status, result, subject, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (missingEmailLog(selected.error?.message)) {
    throw new DatabaseError(503, EMAIL_LOG_MIGRATION);
  }
  if (selected.error) {
    throw databaseFailure(selected.error.message);
  }
  return (selected.data ?? []).flatMap((row) => {
    const status = row.status === 'sent' || row.status === 'failed' ? row.status : null;
    if (!status || typeof row.email !== 'string') {
      return [];
    }
    return [
      {
        vendorName: typeof row.vendor_name === 'string' ? row.vendor_name : row.email,
        email: row.email,
        status,
        result: typeof row.result === 'string' ? row.result : '',
        subject: typeof row.subject === 'string' ? row.subject : '',
        sentAt: typeof row.created_at === 'string' ? row.created_at : '',
      },
    ];
  });
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
    return uniqueRecipients(await selectVendorRecipients(true, true));
  }

  const rows = await selectRegistrationRecipients(eventId, audience === 'unpaid', true);
  return uniqueRecipients(
    rows.flatMap((row) => {
      const account = Array.isArray(row.users) ? row.users[0] : row.users;
      if (account?.email_opt_out === true) {
        return [];
      }
      return [{ name: account?.name ?? null, email: account?.email ?? null }];
    }),
  );
}

async function selectVendorRecipients(
  hideArchived: boolean,
  hideOptOut: boolean,
): Promise<{ name: string | null; email: string | null }[]> {
  const selected =
    hideArchived && hideOptOut
      ? await supabase.from('users').select('name, email').eq('archived', false).eq('email_opt_out', false)
      : hideArchived
        ? await supabase.from('users').select('name, email').eq('archived', false)
        : hideOptOut
          ? await supabase.from('users').select('name, email').eq('email_opt_out', false)
          : await supabase.from('users').select('name, email');
  if (!selected.error) {
    return (selected.data ?? []) as { name: string | null; email: string | null }[];
  }
  if (hideOptOut && selected.error.message.includes('email_opt_out')) {
    return selectVendorRecipients(hideArchived, false);
  }
  if (hideArchived && selected.error.message.includes('archived')) {
    return selectVendorRecipients(false, hideOptOut);
  }
  throw databaseFailure(selected.error.message);
}

async function selectRegistrationRecipients(
  eventId: string,
  unpaid: boolean,
  respectOptOut: boolean,
): Promise<RegistrationEmailRow[]> {
  const columns = respectOptOut ? 'users(name, email, email_opt_out)' : 'users(name, email)';
  const query = supabase.from('registrations').select(columns).eq('event_id', eventId);
  const selected = await (unpaid ? query.is('paid_at', null) : query);
  if (!selected.error) {
    return (selected.data ?? []) as unknown as RegistrationEmailRow[];
  }
  if (respectOptOut && selected.error.message.includes('email_opt_out')) {
    return selectRegistrationRecipients(eventId, unpaid, false);
  }
  throw databaseFailure(selected.error.message);
}

async function eventExists(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return Boolean(data);
}

type RegistrationEmailRow = {
  users:
    | { name: string | null; email: string | null; email_opt_out?: boolean }
    | { name: string | null; email: string | null; email_opt_out?: boolean }[]
    | null;
};

export async function getAccount(userId: string): Promise<AccountDetail | null> {
  const row = await selectAccountRow(accountDetailColumns, userId);
  return row ? accountDetailFrom(row) : null;
}

async function selectAccountRow(columns: string, userId: string): Promise<AccountDetailRow | null> {
  const selected = await supabase.from('users').select(columns).eq('id', userId).maybeSingle();
  if (!selected.error) {
    return (selected.data as unknown as AccountDetailRow | null) ?? null;
  }
  const retry = accountColumnRetry(columns, selected.error.message);
  if (retry) {
    return selectAccountRow(retry, userId);
  }
  throw profileFailure(selected.error.message);
}

function accountColumnRetry(columns: string, message: string | undefined): string | null {
  for (const column of ['email_opt_out', 'archived', 'branding_image']) {
    if (message?.includes(column) && columns.split(', ').includes(column)) {
      return withoutColumn(columns, column);
    }
  }
  return null;
}

function withoutColumn(columns: string, column: string): string {
  return columns
    .split(', ')
    .filter((name) => name !== column)
    .join(', ');
}

function accountDetailFrom(row: AccountDetailRow): AccountDetail {
  return {
    ...toAccountSummary(row),
    provider: presentedProvider(row.provider, row.provider_subject),
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
    brandingImage: storedBrandingImage(row.branding_image),
    archived: row.archived === true,
    emailOptOut: row.email_opt_out === true,
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
      .select('id, spaces_requested')
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (registrationError) {
      throw databaseFailure(registrationError.message);
    }
    if (!registration) {
      throw new DatabaseError(404, 'That registration does not exist.');
    }
    const { data: assignedRows, error: assignedError } = await supabase
      .from('space_assignments')
      .select('area, spot, registration_id')
      .eq('event_id', eventId)
      .eq('registration_id', registrationId);
    if (assignedError) {
      if (assignedError.message.includes('space_assignments')) {
        throw new DatabaseError(
          503,
          'Run server/supabase/migrations/20261105180000_space_assignments.sql in the Supabase SQL editor.',
        );
      }
      throw databaseFailure(assignedError.message);
    }
    const assignments = ((assignedRows ?? []) as AssignmentRow[])
      .filter((row) => isMapArea(row.area))
      .map((row) => ({
        area: row.area as MapArea,
        spot: row.spot,
        registrationId: row.registration_id,
      }));
    if (!canAssignToSpot(asSpaceList(registration.spaces_requested), assignments, registrationId, area, spot)) {
      throw new DatabaseError(400, 'That vendor did not request another space of that type.');
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
    brandingImage: storedBrandingImage(row.branding_image),
    emailOptOut: row.email_opt_out === true,
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

