import { createClient } from '@supabase/supabase-js';

import { upsertUser } from './src/db.ts';
import { supabaseServiceRoleKey, supabaseUrl } from './src/env.ts';

const email = 'merge-check@example.com';
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanup(): Promise<void> {
  const { data } = await supabase.from('users').select('id').eq('email', email);
  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length > 0) {
    await supabase.from('registrations').delete().in('user_id', ids);
    await supabase.from('users').delete().in('id', ids);
  }
}

async function main(): Promise<void> {
  await cleanup();
  const { data: events, error: eventError } = await supabase.from('events').select('id').limit(1);
  if (eventError || !events?.[0]) {
    throw new Error(eventError?.message ?? 'No event is available for the merge check.');
  }
  const eventId = events[0].id as string;
  const older = new Date(Date.now() - 86_400_000).toISOString();

  const { data: google, error: googleError } = await supabase
    .from('users')
    .insert({
      provider: 'google',
      provider_subject: 'merge-check-google',
      email,
      name: 'Merge Check',
      business_name: 'Kept Business',
      profile_completed_at: older,
      created_at: older,
    })
    .select('id')
    .single();
  if (googleError || !google) {
    throw new Error(googleError?.message ?? 'Could not create the Google account.');
  }

  const { data: microsoft, error: microsoftError } = await supabase
    .from('users')
    .insert({
      provider: 'microsoft',
      provider_subject: 'merge-check-microsoft',
      email,
      name: 'Merge Check Microsoft',
      phone: '5555555555',
    })
    .select('id')
    .single();
  if (microsoftError || !microsoft) {
    throw new Error(microsoftError?.message ?? 'Could not create the Microsoft account.');
  }

  const { error: unpaidError } = await supabase.from('registrations').insert({
    event_id: eventId,
    user_id: google.id,
    space_requested: 'grass',
  });
  if (unpaidError) {
    throw new Error(unpaidError.message);
  }

  const { error: paidError } = await supabase.from('registrations').insert({
    event_id: eventId,
    user_id: microsoft.id,
    paid_at: new Date().toISOString(),
    amount_cents: 500,
    space_requested: 'pavilion',
  });
  if (paidError) {
    throw new Error(paidError.message);
  }

  const microsoftLogin = await upsertUser({
    provider: 'microsoft',
    subject: 'merge-check-microsoft',
    email,
    name: 'Merge Check Microsoft',
    picture: null,
  });
  const googleLogin = await upsertUser({
    provider: 'google',
    subject: 'merge-check-google',
    email,
    name: 'Merge Check',
    picture: null,
  });

  const { data: remaining, error: remainingError } = await supabase
    .from('users')
    .select('id, provider, provider_subject, business_name, phone, profile_completed_at')
    .eq('email', email);
  if (remainingError) {
    throw new Error(remainingError.message);
  }

  const { data: registrations, error: registrationError } = await supabase
    .from('registrations')
    .select('user_id, paid_at, amount_cents, space_requested')
    .eq('event_id', eventId)
    .eq('user_id', microsoftLogin.id);
  if (registrationError) {
    throw new Error(registrationError.message);
  }

  const account = remaining?.[0];
  const registration = registrations?.[0];
  const ok =
    remaining?.length === 1 &&
    microsoftLogin.id === googleLogin.id &&
    account?.id === googleLogin.id &&
    account?.provider === 'google' &&
    account?.provider_subject === 'merge-check-google' &&
    account?.business_name === 'Kept Business' &&
    account?.phone === '5555555555' &&
    account?.profile_completed_at != null &&
    registrations?.length === 1 &&
    registration?.paid_at != null &&
    registration?.amount_cents === 500 &&
    registration?.space_requested === 'grass';

  console.log(ok ? 'merge-check-ok' : 'merge-check-failed');
  if (!ok) {
    console.log(
      JSON.stringify(
        {
          microsoftLogin: microsoftLogin.id,
          googleLogin: googleLogin.id,
          remaining,
          registrations,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'merge check failed');
  process.exitCode = 1;
} finally {
  await cleanup();
}
