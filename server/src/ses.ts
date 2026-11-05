import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

import { awsAccessKeyId, awsRegion, awsSecretAccessKey, sesFromEmail } from './env.js';

export class SesError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const fatalSesErrors = new Set([
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'AccessDeniedException',
  'SignatureDoesNotMatch',
  'IncompleteSignatureException',
  'MailFromDomainNotVerifiedException',
  'AccountSendingPausedException',
  'SendingPausedException',
]);

export function sesConfigured(): boolean {
  return Boolean(awsRegion && awsAccessKeyId && awsSecretAccessKey && sesFromEmail);
}

export type OutboundImage = {
  id: string;
  contentType: string;
  fileName: string;
  bytes: Uint8Array;
};

export async function sendVendorEmails(input: {
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  images: OutboundImage[];
  recipients: { email: string }[];
}): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const from = sesFromEmail;
  const region = awsRegion;
  const accessKeyId = awsAccessKeyId;
  const secretAccessKey = awsSecretAccessKey;
  if (!from || !region || !accessKeyId || !secretAccessKey) {
    throw new SesError(
      503,
      'Amazon SES is not configured. Add AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL to .env.',
    );
  }

  const client = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const failed: { email: string; error: string }[] = [];
  let sent = 0;

  for (const recipient of input.recipients) {
    try {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [recipient.email] },
          ReplyToAddresses: [input.replyTo],
          Content: {
            Simple: {
              Subject: { Data: input.subject, Charset: 'UTF-8' },
              Body: {
                Html: { Data: input.html, Charset: 'UTF-8' },
                Text: { Data: input.text, Charset: 'UTF-8' },
              },
              Attachments: input.images.map((image) => ({
                RawContent: image.bytes,
                FileName: image.fileName,
                ContentType: image.contentType,
                ContentDisposition: 'INLINE' as const,
                ContentId: image.id,
                ContentTransferEncoding: 'BASE64' as const,
              })),
            },
          },
        }),
      );
      sent += 1;
    } catch (error) {
      if (fatalSesErrors.has(sesErrorName(error))) {
        throw new SesError(502, sesFailureMessage(error));
      }
      failed.push({ email: recipient.email, error: sesFailureMessage(error) });
    }
  }

  return { sent, failed };
}

function sesErrorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return '';
}

function sesFailureMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'Amazon SES could not send that email.';
}
