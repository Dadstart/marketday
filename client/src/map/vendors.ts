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

export function unassignedVendors(map: EventMap, area: MapArea, currentId: string | null): MapRegistration[] {
  return map.registrations
    .filter((registration) => {
      if (registration.id === currentId) {
        return true;
      }
      const assigned = map.assignments.filter((item) => item.registrationId === registration.id).length;
      const requested = Math.max(registration.spacesRequested.length, 1);
      return assigned < requested;
    })
    .sort((left, right) => {
      const leftMatch = matchesArea(left, area) ? 0 : 1;
      const rightMatch = matchesArea(right, area) ? 0 : 1;
      if (leftMatch !== rightMatch) {
        return leftMatch - rightMatch;
      }
      return vendorLabel(left).localeCompare(vendorLabel(right));
    });
}

function matchesArea(registration: MapRegistration, area: MapArea): boolean {
  if (area === 'pavilion') {
    return registration.spacesRequested.includes('pavilion');
  }
  if (area === 'food-truck') {
    return registration.spacesRequested.includes('food-truck');
  }
  return registration.spacesRequested.includes('grass') || registration.spacesRequested.includes('grass-generator');
}
