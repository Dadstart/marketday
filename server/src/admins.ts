export const ADMIN_EMAILS = ['andrew@bishop4.com', 'louise@bishop4.com'] as const;

const adminEmails = new Set<string>(ADMIN_EMAILS);

export function isAdminEmail(email: string): boolean {
  return adminEmails.has(email.trim().toLowerCase());
}
