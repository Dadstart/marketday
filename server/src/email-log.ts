export type EmailLogRow = {
  vendorName: string;
  email: string;
  status: 'sent' | 'failed';
  result: string;
  subject: string;
  sentAt: string;
};

const COLUMNS = ['Vendor name', 'Email', 'Status', 'Result', 'Subject', 'Sent at'] as const;

export function emailLogCsv(rows: EmailLogRow[]): string {
  const lines = [
    [...COLUMNS],
    ...rows.map((row) => [
      row.vendorName,
      row.email,
      row.status === 'sent' ? 'Sent' : 'Not delivered',
      row.status === 'sent' ? 'Sent' : row.result || 'Not delivered',
      row.subject,
      row.sentAt,
    ]),
  ];
  return `${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function emailLogSummary(rows: EmailLogRow[]): { sent: number; failed: number } {
  const sent = rows.filter((row) => row.status === 'sent').length;
  return { sent, failed: rows.length - sent };
}

function csvCell(value: string): string {
  const formula = /^[=+\-@]/.test(value);
  const text = formula ? `'${value}` : value;
  if (formula || /[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
