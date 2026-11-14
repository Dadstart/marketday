import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { accountsCsv, type AccountSpreadsheetRow } from './accounts-csv.js';

describe('user list spreadsheet', () => {
  test('includes every saved field for each user', () => {
    const ada: AccountSpreadsheetRow = {
      id: 'user-1',
      name: 'Ada, Lovelace',
      email: 'ada@example.com',
      businessName: 'Analytical Engines',
      contactPerson: 'Ada',
      phone: '5555550100',
      venmo: 'ada',
      crosswindsResident: true,
      offering: 'retail',
      productsAndServices: 'Maps',
      facebookName: 'ada.lovelace',
      adminNotes: '=Follow up',
      profileComplete: true,
      brandingImage: 'data:image/png;base64,abc',
      archived: false,
      emailOptOut: true,
      provider: 'google',
      createdAt: '2026-11-01T15:00:00.000Z',
      updatedAt: '2026-11-12T15:00:00.000Z',
    };
    const grace: AccountSpreadsheetRow = {
      ...ada,
      id: 'user-2',
      name: 'Grace',
      email: 'grace@example.com',
      businessName: null,
      contactPerson: null,
      phone: null,
      venmo: null,
      crosswindsResident: null,
      offering: null,
      productsAndServices: null,
      facebookName: null,
      adminNotes: null,
      profileComplete: false,
      brandingImage: null,
      archived: true,
      emailOptOut: false,
      provider: 'admin',
    };
    const csv = accountsCsv([ada, grace]);
    assert.match(
      csv,
      /^Name,Email,Business name,Contact person,Phone,Venmo,Crosswinds resident,Offering,Products and services,Facebook name,Admin notes,Profile complete,Market emails,Archived,Sign-in,Created,Updated,Branding image\r\n/,
    );
    assert.match(
      csv,
      /"Ada, Lovelace",ada@example.com,Analytical Engines,Ada,5555550100,ada,Yes,Retail products,Maps,ada\.lovelace,"'=Follow up",Yes,Don't email me,No,Google,2026-11-01T15:00:00\.000Z,2026-11-12T15:00:00\.000Z,Yes/,
    );
    assert.match(csv, /Grace,grace@example.com,,,,,,,,,,No,Send them,Yes,Added by an administrator/);
    assert.equal(csv.includes('base64'), false);
  });
});
