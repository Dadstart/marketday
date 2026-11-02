import { loadEnvFile } from './load-env-file.js';
import { uploadKeyVaultSecrets } from './keyvault.js';

loadEnvFile();

uploadKeyVaultSecrets().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The upload failed.');
  process.exitCode = 1;
});
