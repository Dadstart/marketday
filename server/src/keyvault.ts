import { existsSync } from 'node:fs';

const SECRET_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_LIVE_SECRET_KEY',
] as const;

export function keyVaultSecretName(envName: string): string {
  return envName.replaceAll('_', '-');
}

const OPTIONAL_SECRETS = new Set<string>(['SUPABASE_URL', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_LIVE_SECRET_KEY']);

export async function loadKeyVaultSecrets(): Promise<void> {
  const vaultUrl = vaultUrlFromEnv();
  if (!vaultUrl) {
    return;
  }

  ensureAzureCliOnPath();
  const client = await secretClient(vaultUrl);
  const loaded: string[] = [];
  for (const name of SECRET_NAMES) {
    const secretName = keyVaultSecretName(name);
    try {
      const secret = await client.getSecret(secretName);
      const value = secret.value?.trim();
      if (!value) {
        applyMissingSecret(name, secretName);
        continue;
      }
      process.env[name] = value;
      loaded.push(secretName);
    } catch (error) {
      if (statusCode(error) === 404) {
        applyMissingSecret(name, secretName);
        continue;
      }
      if (error instanceof Error && error.message.startsWith('Missing ')) {
        throw error;
      }
      throw new Error(`Could not read ${secretName} from Azure Key Vault. ${accessHint(error)}`);
    }
  }
  console.log(`Loaded from Azure Key Vault: ${loaded.join(', ')}`);
}

export async function uploadKeyVaultSecrets(): Promise<void> {
  const vaultUrl = vaultUrlFromEnv();
  if (!vaultUrl) {
    throw new Error('Set AZURE_KEY_VAULT_URL to your vault address, then run this again.');
  }

  const client = await secretClient(vaultUrl);
  for (const name of SECRET_NAMES) {
    const value = process.env[name]?.trim();
    const secretName = keyVaultSecretName(name);
    if (!value) {
      console.log(`Skipped ${secretName} (not set).`);
      continue;
    }
    try {
      await client.setSecret(secretName, value);
    } catch (error) {
      throw new Error(`Could not store ${secretName} in Azure Key Vault. ${accessHint(error)}`);
    }
    console.log(`Stored ${secretName}.`);
  }
}

function applyMissingSecret(name: string, secretName: string): void {
  delete process.env[name];
  if (!OPTIONAL_SECRETS.has(name)) {
    throw new Error(`Missing ${secretName} in Azure Key Vault.`);
  }
}

function ensureAzureCliOnPath(): void {
  if (process.platform !== 'win32') {
    return;
  }
  const dir = 'C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin';
  if (!existsSync(`${dir}\\az.cmd`)) {
    return;
  }
  const path = process.env.PATH ?? '';
  if (path.toLowerCase().includes(dir.toLowerCase())) {
    return;
  }
  process.env.PATH = `${dir};${path}`;
}

function vaultUrlFromEnv(): string | null {
  const value = process.env.AZURE_KEY_VAULT_URL?.trim();
  if (!value) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AZURE_KEY_VAULT_URL is not a valid URL.');
  }
  const host = url.hostname.toLowerCase();
  const allowed =
    url.protocol === 'https:' &&
    /^[a-z0-9-]+\.vault\.(azure\.net|azure\.cn|usgovcloudapi\.net|microsoftazure\.de)$/.test(host);
  if (!allowed) {
    throw new Error('AZURE_KEY_VAULT_URL must be an https://….vault.azure.net/ address.');
  }
  return url.origin;
}

async function secretClient(vaultUrl: string) {
  ensureAzureCliOnPath();
  const { DefaultAzureCredential } = await import('@azure/identity');
  const { SecretClient } = await import('@azure/keyvault-secrets');
  return new SecretClient(vaultUrl, new DefaultAzureCredential());
}

function statusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

function accessHint(error: unknown): string {
  const detail = error instanceof Error && error.message ? error.message : 'The request failed.';
  return `${detail} Sign in with the Azure CLI (az login), or set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.`;
}
