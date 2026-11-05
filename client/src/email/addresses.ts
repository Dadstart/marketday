import type { EmailAudience } from '../api/client';

const RECIPIENT_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function recipientNoun(audience: EmailAudience, count: number): string {
  if (audience === 'addresses') {
    return count === 1 ? 'address' : 'addresses';
  }
  return count === 1 ? 'vendor' : 'vendors';
}

export function parseAddressList(value: string): { emails: string[]; error: string | null } {
  const parts = value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { emails: [], error: null };
  }
  if (parts.length > 200) {
    return { emails: [], error: 'Send to 200 addresses or fewer at a time.' };
  }
  const invalid = parts.filter((part) => !RECIPIENT_ADDRESS.test(part));
  if (invalid.length > 0) {
    return { emails: [], error: `These addresses are not valid: ${invalid.slice(0, 5).join(', ')}` };
  }
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      emails.push(part);
    }
  }
  return { emails, error: null };
}
