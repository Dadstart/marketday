import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isAdminEmail } from './admins.js';
import { supabaseServiceRoleKey, supabaseUrl } from './env.js';
import { feeCents } from './fees.js';
import type {
  AccountDetail,
  AccountSummary,
  CurrentUser,
  EventInput,
  EventRecord,
  Identity,
  ProviderName,
  RegistrationRecord,
  SpaceRequest,
  VendorProfileInput,
} from './types.js';

type UserRow = {
  id: string;
  provider: ProviderName;
  email: string;
  name: string;
  picture: string | null;
  profile_completed_at: string | null;
};

const userColumns = 'id, provider, email, name, picture, profile_completed_at';

type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  created_at: string;
};

type RegistrationRow = {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
  paid_at: string | null;
  space_requested: string | null;
};

type RegistrantRow = {
  id: string;
  user_id: string;
  created_at: string;
  paid_at: string | null;
  amount_cents: number | null;
  space_requested: string | null;
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

export async function upsertUser(identity: Identity): Promise<CurrentUser> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        provider: identity.provider,
        provider_subject: identity.subject,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,provider_subject' },
    )
    .select(userColumns)
    .single();

  if (error || !data) {
    throw databaseFailure(error?.message);
  }

  return toCurrentUser(data as UserRow);
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
    .update({
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
    })
    .eq('id', userId)
    .select(userColumns)
    .single();

  if (error || !data) {
    throw databaseFailure(error?.message);
  }

  return toCurrentUser(data as UserRow);
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

export async function getVendorProfile(userId: string): Promise<VendorProfileInput | null> {
  const { data, error } = await supabase.from('users').select(profileColumns).eq('id', userId).maybeSingle();
  if (error) {
    throw databaseFailure(error.message);
  }
  return data ? toVendorProfile(data as ProfileRow) : null;
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
  const spaces = new Map<string, string | null>();

  for (const registration of registrations) {
    counts.set(registration.event_id, (counts.get(registration.event_id) ?? 0) + 1);
    if (registration.user_id === userId) {
      mine.add(registration.event_id);
      spaces.set(registration.event_id, registration.space_requested);
      if (registration.paid_at) {
        paid.add(registration.event_id);
      }
    }
  }

  return events.map((event) =>
    toEventRecord(
      event,
      counts.get(event.id) ?? 0,
      mine.has(event.id),
      paid.has(event.id),
      boothFee?.cents ?? null,
      spaces.get(event.id) ?? null,
    ),
  );
}

export async function getEvent(
  eventId: string,
  user: CurrentUser,
): Promise<{ event: EventRecord; registrations: RegistrationRecord[] } | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, capacity, created_at')
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
    .select('id, user_id, created_at, paid_at, amount_cents, space_requested, users(name, email)')
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
      amountCents: user.admin ? row.amount_cents : null,
      spaceRequested: user.admin ? row.space_requested : null,
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
      boothFee?.cents ?? null,
      mine?.space_requested ?? null,
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
      created_by: userId,
    })
    .select('id, title, description, location, starts_at, ends_at, capacity, created_at')
    .single();

  if (error || !data) {
    throw databaseFailure(error?.message);
  }

  const boothFee = await getBoothFee(userId);
  return toEventRecord(data as EventRow, 0, false, false, boothFee?.cents ?? null, null);
}

const accountSummaryColumns = 'id, name, email, business_name, profile_completed_at';
const accountDetailColumns =
  'id, name, email, provider, business_name, venmo, contact_person, phone, crosswinds_resident, offering, products_and_services, facebook_name, profile_completed_at, created_at';

type AccountSummaryRow = {
  id: string;
  name: string;
  email: string;
  business_name: string | null;
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
  created_at: string;
};

export async function listAccounts(): Promise<AccountSummary[]> {
  const { data, error } = await supabase.from('users').select(accountSummaryColumns).order('name', { ascending: true });
  if (error) {
    throw databaseFailure(error.message);
  }
  return ((data ?? []) as AccountSummaryRow[]).map(toAccountSummary);
}

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
    createdAt: row.created_at,
  };
}

function toAccountSummary(row: AccountSummaryRow): AccountSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    businessName: blankToNull(row.business_name),
    profileComplete: row.profile_completed_at != null,
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
  spaceRequested: SpaceRequest,
): Promise<void> {
  const { error } = await supabase.rpc('register_for_event', {
    p_event_id: eventId,
    p_user_id: userId,
    p_space_requested: spaceRequested,
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
    throw new DatabaseError(400, 'Choose the space you are requesting.');
  }
  throw databaseFailure(error.message);
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

export class DatabaseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function selectEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, capacity, created_at')
    .order('starts_at', { ascending: true });

  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []) as EventRow[];
}

async function selectRegistrations(): Promise<RegistrationRow[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select('id, event_id, user_id, created_at, paid_at, space_requested');
  if (error) {
    throw databaseFailure(error.message);
  }
  return (data ?? []) as RegistrationRow[];
}

function toVendorProfile(row: ProfileRow): VendorProfileInput | null {
  if (
    row.profile_completed_at == null ||
    !row.venmo ||
    !row.contact_person ||
    !row.business_name ||
    !row.phone ||
    typeof row.crosswinds_resident !== 'boolean' ||
    !row.offering ||
    !offerings.has(row.offering) ||
    !row.products_and_services
  ) {
    return null;
  }

  return {
    venmo: row.venmo,
    contactPerson: row.contact_person,
    businessName: row.business_name,
    phone: row.phone,
    crosswindsResident: row.crosswinds_resident,
    offering: row.offering as VendorProfileInput['offering'],
    productsAndServices: row.products_and_services,
    facebookName: row.facebook_name,
  };
}

function toCurrentUser(row: UserRow): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    provider: row.provider,
    admin: isAdminEmail(row.email),
    profileComplete: row.profile_completed_at != null,
  };
}

function toEventRecord(
  row: EventRow,
  registrationCount: number,
  registered: boolean,
  paid: boolean,
  feeCents: number | null,
  spaceRequested: string | null,
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
    feeCents,
    spaceRequested: registered ? spaceRequested : null,
    createdAt: row.created_at,
  };
}

function databaseFailure(message: string | undefined): DatabaseError {
  console.error(message ?? 'Supabase request failed.');
  if (message?.includes('does not exist') || message?.includes('schema cache')) {
    return new DatabaseError(
      503,
      'The database schema is not installed. Run the SQL files in server/supabase/migrations in the Supabase SQL editor.',
    );
  }
  return new DatabaseError(500, 'The database request failed.');
}
