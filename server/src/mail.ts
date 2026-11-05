export type OutboundImage = {
  id: string;
  contentType: string;
  fileName: string;
  bytes: Uint8Array;
};

export type EmailMessage = {
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  images: OutboundImage[];
  recipients: { email: string }[];
};

export const SES_NOT_CONFIGURED =
  'Amazon SES is not configured. Add AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL to .env.';

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

export function missingSesSettings(config: {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  from?: string;
}): boolean {
  return !config.region || !config.accessKeyId || !config.secretAccessKey || !config.from;
}

export function isFatalSesError(name: string): boolean {
  return fatalSesErrors.has(name);
}

export class DeliveryStopped extends Error {}

export function vendorEmailInput(from: string, input: EmailMessage, recipient: string) {
  return {
    FromEmailAddress: from,
    Destination: { ToAddresses: [recipient] },
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
  };
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return '';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'Amazon SES could not send that email.';
}

export async function deliverVendorEmails(
  recipients: { email: string }[],
  send: (email: string) => Promise<void>,
): Promise<{ sent: number; failed: { email: string; error: string }[] }> {
  const failed: { email: string; error: string }[] = [];
  let sent = 0;
  for (const recipient of recipients) {
    try {
      await send(recipient.email);
      sent += 1;
    } catch (error) {
      if (error instanceof DeliveryStopped) {
        throw error;
      }
      if (isFatalSesError(errorName(error))) {
        throw new DeliveryStopped(errorMessage(error));
      }
      failed.push({ email: recipient.email, error: errorMessage(error) });
    }
  }
  return { sent, failed };
}
