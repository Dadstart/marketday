import { DatabaseError } from './errors.js';
import type { MapArea, SpaceRequest } from './types.js';

export type EmailAudience = 'vendors' | 'registered' | 'unpaid' | 'addresses';

const spaceOrder: SpaceRequest[] = ['grass-generator', 'grass', 'food-truck', 'pavilion'];

const spotLimits: Record<MapArea, number> = {
  pavilion: 13,
  grass: 28,
  'food-truck': 4,
};

export function isEmailAudience(value: string): value is EmailAudience {
  return value === 'vendors' || value === 'registered' || value === 'unpaid' || value === 'addresses';
}

export function isMapArea(value: string): value is MapArea {
  return value === 'pavilion' || value === 'grass' || value === 'food-truck';
}

export function mapSpotLimit(area: MapArea): number {
  return spotLimits[area];
}

export function assertAssignableSpot(area: MapArea, spot: number): void {
  if (!Number.isInteger(spot) || spot < 1 || spot > spotLimits[area]) {
    throw new DatabaseError(400, 'That space is not on the map.');
  }
}

export function mergeSpaceLists(left: SpaceRequest[], right: SpaceRequest[]): SpaceRequest[] {
  const merged: SpaceRequest[] = [];
  for (const space of spaceOrder) {
    const count = Math.max(
      left.filter((item) => item === space).length,
      right.filter((item) => item === space).length,
    );
    for (let index = 0; index < count; index += 1) {
      merged.push(space);
    }
  }
  return merged;
}

export function uniqueRecipients(
  rows: { name: string | null; email: string | null }[],
): { name: string; email: string }[] {
  const seen = new Set<string>();
  const recipients: { name: string; email: string }[] = [];
  for (const row of rows) {
    const email = row.email?.trim() ?? '';
    const key = email.toLowerCase();
    if (!email.includes('@') || seen.has(key)) {
      continue;
    }
    seen.add(key);
    recipients.push({ name: row.name?.trim() || email, email });
  }
  recipients.sort((left, right) => left.name.localeCompare(right.name));
  return recipients;
}
