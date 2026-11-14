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

export const EMAILS_PER_SECOND = 10;

export type EmailFailure = { email: string; error: string };

export type EmailAttempt = {
  email: string;
  status: 'sent' | 'failed';
  error: string;
};

export type EmailSendProgress = {
  total: number;
  sent: number;
  failed: EmailFailure[];
  done: boolean;
  error?: string;
  latest?: EmailAttempt;
};

type EmailPace = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (progress: EmailSendProgress) => Promise<void> | void;
};

type EmailWindow = { start: number; used: number };

const sharedWindow: EmailWindow = { start: -1, used: 0 };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeEmailSlot(window: EmailWindow, now: () => number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const time = now();
  if (window.start < 0 || time - window.start >= 1000) {
    window.start = time;
    window.used = 0;
  }
  if (window.used >= EMAILS_PER_SECOND) {
    const wait = window.start + 1000 - time;
    if (wait > 0) {
      await sleep(wait);
    }
    window.start = now();
    window.used = 0;
  }
  window.used += 1;
}

export async function deliverVendorEmails(
  recipients: { email: string }[],
  send: (email: string) => Promise<void>,
  pace: EmailPace = {},
): Promise<{ sent: number; failed: EmailFailure[] }> {
  const now = pace.now ?? Date.now;
  const sleep = pace.sleep ?? delay;
  const window = pace.now ? { start: -1, used: 0 } : sharedWindow;
  const failed: EmailFailure[] = [];
  let sent = 0;
  const total = recipients.length;
  for (const recipient of recipients) {
    await takeEmailSlot(window, now, sleep);
    let latest: EmailSendProgress['latest'];
    try {
      await send(recipient.email);
      sent += 1;
      latest = { email: recipient.email, status: 'sent', error: '' };
    } catch (error) {
      if (error instanceof DeliveryStopped) {
        throw error;
      }
      const message = errorMessage(error);
      if (isFatalSesError(errorName(error))) {
        failed.push({ email: recipient.email, error: message });
        await pace.onProgress?.({
          total,
          sent,
          failed: [...failed],
          done: false,
          latest: { email: recipient.email, status: 'failed', error: message },
        });
        throw new DeliveryStopped(message);
      }
      failed.push({ email: recipient.email, error: message });
      latest = { email: recipient.email, status: 'failed', error: message };
    }
    await pace.onProgress?.({ total, sent, failed: [...failed], done: false, latest });
  }
  return { sent, failed };
}
