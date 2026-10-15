declare global {
  interface Window {
    OPINION_APP_CONFIG?: { apiUrl?: string };
  }
}

export const environment = {
  apiUrl: typeof window !== 'undefined'
    ? window.OPINION_APP_CONFIG?.apiUrl ?? 'http://localhost:5140/api'
    : 'http://localhost:5140/api'
};

export function apiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const apiOrigin = environment.apiUrl.replace(/\/api\/?$/i, '');
  return new URL(path, `${apiOrigin}/`).toString();
}
