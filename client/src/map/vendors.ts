import type { EventMap, MapArea, MapRegistration } from '../api/client';

const SPACE_LABELS: Record<MapRegistration['spacesRequested'][number], string> = {
  'grass-generator': '10x10 grass plus generator',
  grass: '10x10 grass',
  'food-truck': 'Food truck',
  pavilion: '10x10 pavilion',
};

export function vendorLabel(registration: MapRegistration): string {
  return registration.businessName || registration.name;
}

export function vendorOptionLabel(registration: MapRegistration): string {
  if (!registration.businessName || registration.businessName === registration.name) {
    return registration.name;
  }
  return `${registration.name} — ${registration.businessName}`;
}

export function requestedLabel(spaces: MapRegistration['spacesRequested']): string {
  if (spaces.length === 0) {
    return 'Not chosen';
  }
  const order = ['grass-generator', 'grass', 'food-truck', 'pavilion'] as const;
  return order
    .flatMap((id) => {
      const amount = spaces.filter((space) => space === id).length;
      if (amount === 0) {
        return [];
      }
      return [amount === 1 ? SPACE_LABELS[id] : `${SPACE_LABELS[id]} × ${amount}`];
    })
    .join(', ');
}

const AREA_SPACES: Record<MapArea, readonly MapRegistration['spacesRequested'][number][]> = {
  pavilion: ['pavilion'],
  grass: ['grass', 'grass-generator'],
  'food-truck': ['food-truck'],
};

export function requestedInArea(spaces: MapRegistration['spacesRequested'], area: MapArea): number {
  const accepted = AREA_SPACES[area];
  return spaces.filter((space) => accepted.includes(space)).length;
}

export function canAssignToSpot(
  spacesRequested: MapRegistration['spacesRequested'],
  assignments: EventMap['assignments'],
  registrationId: string,
  area: MapArea,
  spot: number,
): boolean {
  const assignedElsewhere = assignments.filter(
    (item) => item.registrationId === registrationId && item.area === area && item.spot !== spot,
  ).length;
  return assignedElsewhere < requestedInArea(spacesRequested, area);
}

export function unassignedVendors(map: EventMap, area: MapArea, currentId: string | null): MapRegistration[] {
  const seen = new Set<string>();
  return map.registrations
    .filter((registration) => {
      if (seen.has(registration.id)) {
        return false;
      }
      seen.add(registration.id);
      if (registration.id === currentId) {
        return true;
      }
      const assigned = map.assignments.filter((item) => item.registrationId === registration.id && item.area === area).length;
      return assigned < requestedInArea(registration.spacesRequested, area);
    })
    .sort((left, right) => vendorLabel(left).localeCompare(vendorLabel(right)));
}
