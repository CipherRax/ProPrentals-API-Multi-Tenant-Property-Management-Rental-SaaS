/**
 * ProPrentals API client.
 *
 * Handles the API response envelope ({ success, data }), auth token storage
 * with automatic refresh rotation, and typed requests. Runs fully client-side.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const ACCESS_KEY = 'pp.access';
const REFRESH_KEY = 'pp.refresh';

import type { PaginationMeta } from '@/types';
export type { PaginationMeta };

export type Envelope<T> = {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
};

export class ApiError extends Error {
  statusCode: number;
  path?: string;

  constructor(message: string, statusCode: number, path?: string) {
    super(Array.isArray(message) ? message.join(', ') : message);
    this.statusCode = statusCode;
    this.path = path;
  }
}

class ApiClient {
  private inflightRefresh: Promise<boolean> | null = null;

  get accessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_KEY);
  }

  get refreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
  }

  setTokens(access: string, refresh: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }

  clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken);
  }

  private async request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    const token = this.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (res.status === 401 && !path.includes('/auth/login') && retry) {
      const refreshed = await this.rotate();
      if (refreshed) return this.request<T>(path, options, false);
    }

    const isBlob = res.headers.get('content-type')?.includes('application/pdf');

    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      const message = body?.message ?? body?.error ?? `Request failed (${res.status})`;
      throw new ApiError(message, res.status, body?.path);
    }

    if (isBlob) return (await res.blob()) as unknown as T;

    const json = (await res.json()) as Envelope<T> | T;
    // Some endpoints skip the envelope (PDFs / raw) and return T directly.
    if (json && typeof json === 'object' && 'success' in (json as any)) {
      return (json as Envelope<T>).data;
    }
    return json as T;
  }

  /** Rotate the access token using the stored refresh token. Returns true on success. */
  private async rotate(): Promise<boolean> {
    if (this.inflightRefresh) return this.inflightRefresh;

    this.inflightRefresh = (async () => {
      const refresh = this.refreshToken;
      if (!refresh) {
        this.clearTokens();
        return false;
      }
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refresh}` },
          credentials: 'include',
        });
        if (!res.ok) {
          this.clearTokens();
          return false;
        }
        const json = await res.json();
        const data = json.data ?? json;
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        this.clearTokens();
        return false;
      } finally {
        this.inflightRefresh = null;
      }
    })();

    return this.inflightRefresh;
  }

  get<T>(path: string, query?: Record<string, unknown>) {
    const qs = buildQuery(query);
    return this.request<T>(`${path}${qs}`, { method: 'GET' });
  }

  /**
   * Fetch a paginated list. The interceptor unwraps paginated responses to
   * { success, data: T[], meta }, so we surface both the items and the meta.
   */
  async getList<T>(
    path: string,
    query?: Record<string, unknown>,
  ): Promise<{ items: T[]; meta: PaginationMeta }> {
    const qs = buildQuery(query);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = this.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_BASE}/api/v1${path}${qs}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (res.status === 401) {
      const refreshed = await this.rotate();
      if (refreshed) return this.getList<T>(path, query);
    }

    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status, body?.path);
    }

    const json = (await res.json()) as Envelope<T[]> & { data: T[]; meta: PaginationMeta };
    return { items: json.data ?? [], meta: json.meta };
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    });
  }

  /**
   * Uploads one or more files as `multipart/form-data` under the field
   * name `files` (matches the image-upload endpoints). Sends the access
   * token but no JSON Content-Type so the browser sets the boundary.
   */
  async upload<T>(path: string, files: File[]): Promise<T> {
    const token = this.accessToken;
    const form = new FormData();
    for (const file of files) form.append('files', file);

    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      credentials: 'include',
    });

    if (res.status === 401 && !path.includes('/auth/login')) {
      const refreshed = await this.rotate();
      if (refreshed) return this.upload<T>(path, files);
    }

    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status, body?.path);
    }

    const json = (await res.json()) as Envelope<T>;
    return json.data ?? (json as unknown as T);
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, String(v)));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const api = new ApiClient();

/** Parse a Prisma Decimal string into a number. */
export function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Resolve a stored image URL for use in <img src>. Uploaded images are
 * stored server-relative ("/uploads/...") and are served by the API origin,
 * not the web app origin — so make them absolute against the API base.
 * Absolute/external URLs (e.g. seeded CDN links) pass through untouched.
 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^[a-z]+:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}

export function formatMoney(value: string | number | null | undefined, currency = 'KES'): string {
  const n = toNumber(value);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
