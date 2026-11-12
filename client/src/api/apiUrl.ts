export function resolveApiUrl(
  configured: string | undefined,
  page?: { protocol: string; hostname: string; origin: string },
): string {
  const value = configured?.trim() || 'http://localhost:8787';
  if (!page) {
    return value;
  }
  const pageIsLocal = page.hostname === 'localhost' || page.hostname === '127.0.0.1';
  if (pageIsLocal) {
    return localApiUrl(value);
  }
  let api: URL;
  try {
    api = new URL(value);
  } catch {
    return page.origin;
  }
  const apiIsLocal = api.hostname === 'localhost' || api.hostname === '127.0.0.1';
  const mixedContent = page.protocol === 'https:' && api.protocol === 'http:';
  if (apiIsLocal || mixedContent) {
    return page.origin;
  }
  return api.origin;
}

function localApiUrl(configured: string): string {
  try {
    const api = new URL(configured);
    if (api.hostname === 'localhost' || api.hostname === '127.0.0.1') {
      return api.origin;
    }
  } catch {
    // A remote address in .env is for the published site. Local pages use the API port.
  }
  return 'http://localhost:8787';
}
