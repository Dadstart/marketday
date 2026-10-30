import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { supabaseServiceRoleKey, supabaseUrl } from './src/env.ts';

const session = JSON.parse(readFileSync('tmp-delete-session.json', 'utf8')) as { eventId: string };
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const byId = await supabase.from('events').select('id, title').eq('id', session.eventId).maybeSingle();
const titled = await supabase.from('events').select('id, title').eq('title', 'Delete check');
console.log(
  JSON.stringify({
    byId: byId.error?.message ?? byId.data,
    titled: titled.error?.message ?? titled.data,
  }),
);
