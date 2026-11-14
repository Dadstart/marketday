import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { emailLogCsv, emailLogSummary } from './email-log.js';

describe('email log', () => {
  test('writes a spreadsheet row for every delivery, including a bounce', () => {
    const csv = emailLogCsv([
      {
        vendorName: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'sent',
        result: 'Sent',
        subject: 'Vendor map',
        sentAt: '2026-11-12T18:00:00.000Z',
      },
      {
        vendorName: 'Grace, "Hopper"',
        email: 'grace@example.com',
        status: 'failed',
        result: 'Mailbox does not exist.',
        subject: '=Reminder',
        sentAt: '2026-11-12T18:00:01.000Z',
      },
    ]);
    assert.equal(
      csv,
      [
        'Vendor name,Email,Status,Result,Subject,Sent at',
        'Ada Lovelace,ada@example.com,Sent,Sent,Vendor map,2026-11-12T18:00:00.000Z',
        '"Grace, ""Hopper""",grace@example.com,Not delivered,Mailbox does not exist.,"\'=Reminder",2026-11-12T18:00:01.000Z',
        '',
      ].join('\r\n'),
    );
    assert.deepEqual(
      emailLogSummary([
        { vendorName: 'Ada', email: 'ada@example.com', status: 'sent', result: 'Sent', subject: 'Hi', sentAt: '' },
        { vendorName: 'Grace', email: 'grace@example.com', status: 'failed', result: 'Bounced', subject: 'Hi', sentAt: '' },
      ]),
      { sent: 1, failed: 1 },
    );
  });
});
