import { loadEnvFile } from './load-env-file.js';

loadEnvFile();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env and start the server again.`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const supabaseUrl = optional('SUPABASE_URL') ?? 'https://fiwpwhgcyhaujunmcdxw.supabase.co';
export const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
export const sessionSecret = required('SUPABASE_SESSION_SECRET');
export const port = Number(process.env.PORT ?? 8787);

export const googleClientIds = [
  optional('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  optional('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  optional('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
].filter((value): value is string => Boolean(value));

export const microsoftClientId = optional('EXPO_PUBLIC_MICROSOFT_CLIENT_ID');
export const stripeTestSecretKey = optional('STRIPE_TEST_SECRET_KEY');
export const stripeLiveSecretKey = optional('STRIPE_LIVE_SECRET_KEY');
export const awsRegion = optional('AWS_REGION');
export const awsAccessKeyId = optional('AWS_ACCESS_KEY_ID');
export const awsSecretAccessKey = optional('AWS_SECRET_ACCESS_KEY');
export const sesFromEmail = optional('SES_FROM_EMAIL');

if (
  stripeLiveSecretKey &&
  !stripeLiveSecretKey.startsWith('sk_live_') &&
  !stripeLiveSecretKey.startsWith('rk_live_') &&
  !stripeLiveSecretKey.startsWith('pk_live_')
) {
  throw new Error('STRIPE_LIVE_SECRET_KEY must be a Stripe live secret key (sk_live_…).');
}

export const stripeSecretKey = stripeLiveSecretKey ?? stripeTestSecretKey;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}
