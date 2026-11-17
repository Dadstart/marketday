export type AppLocation =
  | { screen: 'events' }
  | { screen: 'event'; eventId: string }
  | { screen: 'profile' }
  | { screen: 'users' }
  | { screen: 'user'; userId: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function locationFromPath(pathname: string): AppLocation {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean).map(decodeSegment);
  if (parts[0] === 'events' && parts.length === 2 && isId(parts[1])) {
    return { screen: 'event', eventId: parts[1] };
  }
  if (parts[0] === 'profile' && parts.length === 1) {
    return { screen: 'profile' };
  }
  if (parts[0] === 'users' && parts.length === 1) {
    return { screen: 'users' };
  }
  if (parts[0] === 'users' && parts.length === 2 && isId(parts[1])) {
    return { screen: 'user', userId: parts[1] };
  }
  return { screen: 'events' };
}

export function locationFromUrl(url: string): AppLocation {
  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.protocol === 'marketday:') {
      const path = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname;
      return locationFromPath(path);
    }
    return locationFromPath(parsed.pathname);
  } catch {
    return { screen: 'events' };
  }
}

export function pathForLocation(location: AppLocation): string {
  switch (location.screen) {
    case 'event':
      return `/events/${location.eventId}`;
    case 'profile':
      return '/profile';
    case 'users':
      return '/users';
    case 'user':
      return `/users/${location.userId}`;
    default:
      return '/';
  }
}

export function readBrowserLocation(): AppLocation {
  if (typeof window === 'undefined') {
    return { screen: 'events' };
  }
  return locationFromPath(window.location.pathname);
}

export function writeBrowserLocation(location: AppLocation, mode: 'push' | 'replace' = 'push'): void {
  if (typeof window === 'undefined') {
    return;
  }
  const path = pathForLocation(location);
  if (window.location.pathname === path) {
    return;
  }
  const next = `${path}${window.location.search}`;
  if (mode === 'replace') {
    window.history.replaceState({ marketday: path }, '', next);
  } else {
    window.history.pushState({ marketday: path }, '', next);
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isId(value: string | undefined): value is string {
  return Boolean(value && ID.test(value));
}
