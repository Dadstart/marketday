import type { Offering, SpaceRequest, VendorProfileInput } from './types.js';

const SPACES = new Set<SpaceRequest>(['grass-generator', 'grass', 'food-truck', 'pavilion']);
const OFFERINGS = new Set<Offering>(['retail', 'food', 'service', 'group', 'entertainment']);

export function parseSpaceRequest(value: unknown): SpaceRequest {
  if (!isSpace(value)) {
    throw new ProfileError('Choose the space you are requesting.');
  }
  return value;
}

export function parseVendorProfile(body: Record<string, unknown>): VendorProfileInput {
  const offering = body.offering;
  if (!isOffering(offering)) {
    throw new ProfileError('Choose what you will offer.');
  }
  if (typeof body.crosswindsResident !== 'boolean') {
    throw new ProfileError('Say whether you are a Crosswinds resident.');
  }

  return {
    venmo: requiredText(body.venmo, 2, 80, 'Enter a Venmo account name or phone number.'),
    contactPerson: requiredText(body.contactPerson, 2, 120, 'Enter the contact person.'),
    businessName: requiredText(body.businessName, 2, 160, 'Enter the business name.'),
    phone: requiredPhone(body.phone),
    crosswindsResident: body.crosswindsResident,
    offering,
    productsAndServices: requiredText(
      body.productsAndServices,
      2,
      4000,
      'List the products or services you will offer.',
    ),
    facebookName: optionalText(body.facebookName, 160, 'Facebook name'),
  };
}

export class ProfileError extends Error {
  readonly status = 400;
}

function requiredText(value: unknown, min: number, max: number, message: string): string {
  if (typeof value !== 'string') {
    throw new ProfileError(message);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ProfileError(message);
  }
  if (trimmed.length > max) {
    throw new ProfileError(`Use ${max} characters or fewer.`);
  }
  return trimmed;
}

function optionalText(value: unknown, max: number, label: string): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ProfileError(`${label} must be text.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > max) {
    throw new ProfileError(`Use ${max} characters or fewer.`);
  }
  return trimmed;
}

function requiredPhone(value: unknown): string {
  const phone = requiredText(value, 7, 30, 'Enter a phone number.');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) {
    throw new ProfileError('Enter a phone number with at least 10 digits.');
  }
  return phone;
}

function isSpace(value: unknown): value is SpaceRequest {
  return typeof value === 'string' && SPACES.has(value as SpaceRequest);
}

function isOffering(value: unknown): value is Offering {
  return typeof value === 'string' && OFFERINGS.has(value as Offering);
}
