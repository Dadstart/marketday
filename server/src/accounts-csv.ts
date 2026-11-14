import type { AccountDetail } from './types.js';

export type AccountSpreadsheetRow = AccountDetail & { updatedAt: string };

const COLUMNS = [
  'Name',
  'Email',
  'Business name',
  'Contact person',
  'Phone',
  'Venmo',
  'Crosswinds resident',
  'Offering',
  'Products and services',
  'Facebook name',
  'Admin notes',
  'Profile complete',
  'Market emails',
  'Archived',
  'Sign-in',
  'Created',
  'Updated',
  'Branding image',
] as const;

const OFFERINGS: Record<string, string> = {
  retail: 'Retail products',
  food: 'Food',
  service: 'Service',
  group: 'Group / community organization',
  entertainment: 'Entertainment',
};

const SIGN_IN: Record<AccountDetail['provider'], string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  admin: 'Added by an administrator',
};

export function accountsCsv(accounts: AccountSpreadsheetRow[]): string {
  const lines = [COLUMNS.map(String), ...accounts.map(accountRow)];
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function accountRow(account: AccountSpreadsheetRow): string[] {
  return [
    account.name,
    account.email,
    text(account.businessName),
    text(account.contactPerson),
    text(account.phone),
    text(account.venmo),
    yesNo(account.crosswindsResident),
    account.offering ? (OFFERINGS[account.offering] ?? account.offering) : '',
    text(account.productsAndServices),
    text(account.facebookName),
    text(account.adminNotes),
    account.profileComplete ? 'Yes' : 'No',
    account.emailOptOut ? "Don't email me" : 'Send them',
    account.archived ? 'Yes' : 'No',
    SIGN_IN[account.provider],
    account.createdAt,
    account.updatedAt,
    account.brandingImage ? 'Yes' : 'No',
  ];
}

function text(value: string | null): string {
  return value ?? '';
}

function yesNo(value: boolean | null): string {
  if (value == null) {
    return '';
  }
  return value ? 'Yes' : 'No';
}

function csvCell(value: string): string {
  const formula = /^[=+\-@]/.test(value);
  const safe = formula ? `'${value}` : value;
  if (formula || /[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}
