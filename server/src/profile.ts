import type { Offering, SpaceRequest, VendorProfileInput } from './types.js';

const SPACES = new Set<SpaceRequest>(['grass-generator', 'grass', 'food-truck', 'pavilion']);
const OFFERINGS = new Set<Offering>(['retail', 'food', 'service', 'group', 'entertainment']);

export function parseAvailableSpaces(value: unknown): SpaceRequest[] {
  return parseSpaceList(value, 'Choose at least one available space.');
}

export function parseRequestedSpaces(value: unknown): SpaceRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProfileError('Choose at least one space.');
  }
  if (value.length > 20) {
    throw new ProfileError('Request 20 spaces or fewer.');
  }
  const spaces: SpaceRequest[] = [];
  for (const item of value) {
    if (!isSpace(item)) {
      throw new ProfileError('Choose a space from the list.');
    }
    spaces.push(item);
  }
  return spaces;
}

function parseSpaceList(value: unknown, emptyMessage: string): SpaceRequest[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProfileError(emptyMessage);
  }
  const spaces: SpaceRequest[] = [];
  for (const item of value) {
    if (!isSpace(item)) {
      throw new ProfileError('Choose a space from the list.');
    }
    if (!spaces.includes(item)) {
      spaces.push(item);
    }
  }
  return spaces;
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
    brandingImage: parseBrandingImage(body.brandingImage),
  };
}

const BRANDING_IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_BRANDING_BYTES = 1_500_000;

export function parseBrandingImage(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ProfileError('The branding image could not be read.');
  }
  const match = BRANDING_IMAGE.exec(value.trim());
  if (!match) {
    throw new ProfileError('Use a PNG, JPEG, GIF, or WebP image.');
  }
  const bytes = Buffer.from(match[2] ?? '', 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BRANDING_BYTES) {
    throw new ProfileError('The branding image must be 1.5 MB or smaller.');
  }
  return value.trim();
}

const EMAIL_ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function parseNewAccount(body: Record<string, unknown>): { name: string; email: string } {
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new ProfileError("Enter the person's name.");
  }
  const name = body.name.trim();
  if (name.length > 120) {
    throw new ProfileError('Use 120 characters or fewer.');
  }
  if (typeof body.email !== 'string' || !EMAIL_ADDRESS.test(body.email.trim())) {
    throw new ProfileError('Enter an email address.');
  }
  return { name, email: body.email.trim() };
}

export function presentedProvider(provider: 'google' | 'microsoft', subject: string): 'google' | 'microsoft' | 'admin' {
  return subject.startsWith('admin:') ? 'admin' : provider;
}

export function parseAdminNotes(value: unknown): string | null {
  return optionalText(value, 4000, 'Notes');
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
