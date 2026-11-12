import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

import { awsAccessKeyId, awsRegion, awsSecretAccessKey, sesFromEmail } from './env.js';
import { SesError } from './errors.js';
import {
  deliverVendorEmails,
  DeliveryStopped,
  missingSesSettings,
  SES_NOT_CONFIGURED,
  vendorEmailInput,
  type EmailMessage,
  type EmailSendProgress,
} from './mail.js';

export { SesError };
export type { EmailMessage };

export function sesConfigured(): boolean {
  return !missingSesSettings({
    region: awsRegion,
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    from: sesFromEmail,
  });
}

export async function sendVendorEmails(
  input: EmailMessage,
  onProgress?: (progress: EmailSendProgress) => Promise<void> | void,
): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const from = sesFromEmail;
  const region = awsRegion;
  const accessKeyId = awsAccessKeyId;
  const secretAccessKey = awsSecretAccessKey;
  if (!from || !region || !accessKeyId || !secretAccessKey) {
    throw new SesError(503, SES_NOT_CONFIGURED);
  }

  const client = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    return await deliverVendorEmails(
      input.recipients,
      async (email) => {
        await client.send(new SendEmailCommand(vendorEmailInput(from, input, email)));
      },
      { onProgress },
    );
  } catch (error) {
    if (error instanceof DeliveryStopped) {
      throw new SesError(502, error.message);
    }
    throw error;
  }
}
