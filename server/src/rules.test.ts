import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseAddressList, recipientNoun } from '../../client/src/email/addresses.js';
import { MAP_SPOTS, areaLabel, spotLimit } from '../../client/src/map/spots.js';
import { canAssignToSpot, requestedLabel, unassignedVendors, vendorLabel, vendorOptionLabel } from '../../client/src/map/vendors.js';
import type { EventMap, MapRegistration } from '../../client/src/api/client.js';
import { isAdminEmail } from './admins.js';
import { databaseFailure, DatabaseError } from './errors.js';
import { feeCents, GUEST_FEE_CENTS, isBoothFee, RESIDENT_FEE_CENTS } from './fees.js';
import { assertAssignableSpot, mapSpotLimit, mergeSpaceLists, uniqueRecipients } from './guards.js';
import {
  parseAvailableSpaces,
  parseBrandingImage,
  parseNewAccount,
  parseRequestedSpaces,
  parseVendorProfile,
  presentedProvider,
  ProfileError,
} from './profile.js';

describe('booth fees', () => {
  test('a resident pays five dollars and everyone else pays ten', () => {
    assert.equal(feeCents(true), RESIDENT_FEE_CENTS);
    assert.equal(feeCents(false), GUEST_FEE_CENTS);
    assert.equal(RESIDENT_FEE_CENTS, 500);
    assert.equal(GUEST_FEE_CENTS, 1000);
  });

  test('only those two amounts count as a booth fee', () => {
    assert.equal(isBoothFee(500), true);
    assert.equal(isBoothFee(1000), true);
    assert.equal(isBoothFee(0), false);
    assert.equal(isBoothFee(1500), false);
  });
});

describe('administrators', () => {
  test('recognizes the two administrator addresses regardless of case or surrounding spaces', () => {
    assert.equal(isAdminEmail('  Andrew@Bishop4.com '), true);
    assert.equal(isAdminEmail('louise@bishop4.com'), true);
    assert.equal(isAdminEmail('vendor@example.com'), false);
  });
});

describe('vendor profiles', () => {
  const profile = {
    venmo: '  @market  ',
    contactPerson: 'Ada Lovelace',
    businessName: 'Analytical Engines',
    phone: '(512) 555-1212',
    crosswindsResident: true,
    offering: 'retail',
    productsAndServices: 'Prints',
    facebookName: '  ',
  };

  test('trims text, accepts a phone with at least ten digits, and treats a blank Facebook name as empty', () => {
    const parsed = parseVendorProfile(profile);
    assert.equal(parsed.venmo, '@market');
    assert.equal(parsed.phone, '(512) 555-1212');
    assert.equal(parsed.facebookName, null);
    assert.equal(parsed.brandingImage, null);
    assert.equal(parsed.crosswindsResident, true);
    assert.equal(parsed.emailOptOut, false);
    assert.equal(parseVendorProfile({ ...profile, emailOptOut: true }).emailOptOut, true);
    assert.throws(() => parseVendorProfile({ ...profile, emailOptOut: 'yes' }), /market emails/);
  });

  test('rejects a short phone, an unknown offering, and a missing residency answer', () => {
    assert.throws(() => parseVendorProfile({ ...profile, phone: '555-1212' }), ProfileError);
    assert.throws(() => parseVendorProfile({ ...profile, offering: 'crafts' }), ProfileError);
    assert.throws(() => parseVendorProfile({ ...profile, crosswindsResident: 'yes' }), ProfileError);
  });

  test('accepts a name and email for an account an administrator creates', () => {
    assert.deepEqual(parseNewAccount({ name: '  Ada Lovelace  ', email: 'Ada@Example.com' }), {
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
    });
    assert.equal(presentedProvider('google', 'admin:8f1c'), 'admin');
    assert.equal(presentedProvider('microsoft', 'subject-1'), 'microsoft');
    assert.throws(() => parseNewAccount({ name: ' ', email: 'ada@example.com' }), /name/);
    assert.throws(() => parseNewAccount({ name: 'Ada', email: 'ada@' }), /email address/);
  });

  test('keeps a small picture and rejects anything that is not a PNG, JPEG, GIF, or WebP', () => {
    const png = `data:image/png;base64,${Buffer.from('logo').toString('base64')}`;
    assert.equal(parseBrandingImage(png), png);
    assert.equal(parseBrandingImage(''), null);
    assert.equal(parseBrandingImage(null), null);
    assert.throws(() => parseBrandingImage('data:image/svg+xml;base64,PHN2Zy8+'), /PNG, JPEG/);
    assert.throws(() => parseVendorProfile({ ...profile, brandingImage: 'https://example.com/logo.png' }), /PNG, JPEG/);
    const oversized = `data:image/png;base64,${Buffer.alloc(1_500_001).toString('base64')}`;
    assert.throws(() => parseBrandingImage(oversized), /1\.5 MB/);
  });

  test('requested spaces keep duplicates and available spaces do not', () => {
    assert.deepEqual(parseRequestedSpaces(['grass', 'grass', 'pavilion']), ['grass', 'grass', 'pavilion']);
    assert.deepEqual(parseAvailableSpaces(['pavilion', 'pavilion', 'grass']), ['pavilion', 'grass']);
    assert.throws(() => parseRequestedSpaces([]), ProfileError);
    assert.throws(() => parseRequestedSpaces(Array.from({ length: 21 }, () => 'grass')), /20 spaces/);
    assert.throws(() => parseRequestedSpaces(['parking']), /from the list/);
  });
});

describe('merged registrations', () => {
  test('keeps the larger count of each space and a stable order', () => {
    assert.deepEqual(
      mergeSpaceLists(['grass', 'grass', 'food-truck'], ['pavilion', 'grass', 'grass-generator']),
      ['grass-generator', 'grass', 'grass', 'food-truck', 'pavilion'],
    );
  });
});

describe('email recipient rows', () => {
  test('drops blanks, keeps the first spelling of a repeated address, and sorts by name', () => {
    assert.deepEqual(
      uniqueRecipients([
        { name: ' Zoe ', email: ' Zoe@Example.com ' },
        { name: 'Zoe again', email: 'zoe@example.com' },
        { name: '  ', email: 'ada@example.com' },
        { name: 'Missing', email: 'not-an-email' },
        { name: null, email: null },
      ]),
      [
        { name: 'ada@example.com', email: 'ada@example.com' },
        { name: 'Zoe', email: 'Zoe@Example.com' },
      ],
    );
  });
});

describe('database failures', () => {
  test('turns a missing table into instructions for installing the schema', () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const error = databaseFailure('relation "public.events" does not exist');
      assert.ok(error instanceof DatabaseError);
      assert.equal(error.status, 503);
      assert.match(error.message, /server\/supabase\/migrations/);
    } finally {
      console.error = original;
    }
  });

  test('hides other database errors behind a generic message', () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const error = databaseFailure('permission denied');
      assert.equal(error.status, 500);
      assert.equal(error.message, 'The database request failed.');
    } finally {
      console.error = original;
    }
  });
});

describe('map spots', () => {
  test('covers every numbered pavilion, grass, and food-truck space once', () => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (const spot of MAP_SPOTS) {
      const key = `${spot.area}:${spot.spot}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
      counts.set(spot.area, (counts.get(spot.area) ?? 0) + 1);
      assert.ok(spot.left >= 0 && spot.top >= 0 && spot.width > 0 && spot.height > 0);
      assert.ok(spot.left + spot.width <= 100);
      assert.ok(spot.top + spot.height <= 100);
    }
    assert.equal(counts.get('pavilion'), 13);
    assert.equal(counts.get('grass'), 28);
    assert.equal(counts.get('food-truck'), 4);
    assert.equal(spotLimit('pavilion'), mapSpotLimit('pavilion'));
    assert.equal(spotLimit('grass'), mapSpotLimit('grass'));
    assert.equal(spotLimit('food-truck'), mapSpotLimit('food-truck'));
  });

  test('rejects a spot number the map does not have', () => {
    assert.doesNotThrow(() => assertAssignableSpot('pavilion', 13));
    assert.throws(() => assertAssignableSpot('pavilion', 14), /not on the map/);
    assert.doesNotThrow(() => assertAssignableSpot('food-truck', 4));
    assert.throws(() => assertAssignableSpot('food-truck', 5), /not on the map/);
    assert.equal(areaLabel('food-truck'), 'Food truck');
  });
});

describe('map vendor choices', () => {
  const ada: MapRegistration = {
    id: 'ada',
    name: 'Ada Lovelace',
    businessName: 'Analytical Engines',
    spacesRequested: ['pavilion', 'pavilion'],
  };
  const grace: MapRegistration = {
    id: 'grace',
    name: 'Grace Hopper',
    businessName: null,
    spacesRequested: ['grass'],
  };
  const food: MapRegistration = {
    id: 'food',
    name: 'Food Truck',
    businessName: 'Food Truck',
    spacesRequested: [],
  };

  test('shows the person and the business in the dropdown, and the business alone on the map', () => {
    assert.equal(vendorOptionLabel(ada), 'Ada Lovelace — Analytical Engines');
    assert.equal(vendorLabel(ada), 'Analytical Engines');
    assert.equal(vendorOptionLabel(grace), 'Grace Hopper');
    assert.equal(vendorOptionLabel(food), 'Food Truck');
    assert.equal(requestedLabel(['grass', 'grass', 'food-truck']), '10x10 grass × 2, Food truck');
    assert.equal(requestedLabel([]), 'Not chosen');
  });

  test('offers a vendor only for the spaces they still have left, without listing them twice', () => {
    const mixed: MapRegistration = {
      id: 'mixed',
      name: 'Mixed Vendor',
      businessName: 'Both',
      spacesRequested: ['grass', 'grass-generator', 'pavilion'],
    };
    const duplicate: MapRegistration = { ...ada, id: 'ada' };
    const map: EventMap = {
      title: 'Community Day',
      volunteers: '',
      registrations: [ada, grace, food, mixed, duplicate],
      assignments: [
        { area: 'pavilion', spot: 1, registrationId: 'ada' },
        { area: 'pavilion', spot: 2, registrationId: 'ada' },
        { area: 'grass', spot: 1, registrationId: 'grace' },
        { area: 'grass', spot: 3, registrationId: 'mixed' },
      ],
    };
    assert.deepEqual(unassignedVendors(map, 'pavilion', 'ada').map((vendor) => vendor.id), ['ada', 'mixed']);
    assert.deepEqual(unassignedVendors(map, 'grass', null).map((vendor) => vendor.id), ['mixed']);
    assert.deepEqual(unassignedVendors(map, 'food-truck', null).map((vendor) => vendor.id), []);
    assert.equal(
      canAssignToSpot(mixed.spacesRequested, map.assignments, 'mixed', 'grass', 4),
      true,
    );
    assert.equal(
      canAssignToSpot(mixed.spacesRequested, map.assignments, 'mixed', 'pavilion', 4),
      true,
    );
    assert.equal(canAssignToSpot(grace.spacesRequested, map.assignments, 'grace', 'grass', 2), false);
    assert.equal(canAssignToSpot(grace.spacesRequested, map.assignments, 'grace', 'pavilion', 1), false);
    assert.equal(canAssignToSpot(food.spacesRequested, map.assignments, 'food', 'food-truck', 1), false);
    assert.equal(canAssignToSpot(grace.spacesRequested, map.assignments, 'grace', 'grass', 1), true);
  });
});

describe('pasted email addresses', () => {
  test('splits on commas, spaces, and semicolons, and keeps one copy of each address', () => {
    const parsed = parseAddressList(' Ada@Example.com, grace@example.com\nada@example.com; ');
    assert.equal(parsed.error, null);
    assert.deepEqual(parsed.emails, ['Ada@Example.com', 'grace@example.com']);
  });

  test('reports the first invalid addresses and refuses more than 200', () => {
    const invalid = parseAddressList('ada@example.com, not-an-email');
    assert.match(invalid.error ?? '', /not-an-email/);
    assert.deepEqual(invalid.emails, []);
    const tooMany = parseAddressList(Array.from({ length: 201 }, (_, index) => `p${index}@example.com`).join('\n'));
    assert.match(tooMany.error ?? '', /200/);
  });

  test('uses address and addresses, never addresss', () => {
    assert.equal(recipientNoun('addresses', 1), 'address');
    assert.equal(recipientNoun('addresses', 2), 'addresses');
    assert.equal(recipientNoun('vendors', 1), 'vendor');
    assert.equal(recipientNoun('unpaid', 0), 'vendors');
  });
});
