const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getStoredTokens() {
  const accessToken = sessionStorage.getItem('connectly_access_token') || localStorage.getItem('connectly_access_token');
  const refreshToken = sessionStorage.getItem('connectly_refresh_token') || localStorage.getItem('connectly_refresh_token');
  return { accessToken, refreshToken };
}

export function setStoredTokens(accessToken: string, refreshToken?: string) {
  sessionStorage.setItem('connectly_access_token', accessToken);
  localStorage.setItem('connectly_access_token', accessToken);
  if (refreshToken) {
    sessionStorage.setItem('connectly_refresh_token', refreshToken);
    localStorage.setItem('connectly_refresh_token', refreshToken);
  }
}

export function clearStoredTokens() {
  sessionStorage.removeItem('connectly_access_token');
  sessionStorage.removeItem('connectly_refresh_token');
  localStorage.removeItem('connectly_access_token');
  localStorage.removeItem('connectly_refresh_token');
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { accessToken } = getStoredTokens();

  const headers = new Headers(options.headers || {});
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  // Do not set Content-Type if sending FormData (browser sets boundary)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  let res = await fetch(url, { ...options, headers });

  // Handle 401 Token Expiration with Refresh Token
  if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const { refreshToken } = getStoredTokens();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const { accessToken: newAccess } = await refreshRes.json();
          setStoredTokens(newAccess);
          headers.set('Authorization', `Bearer ${newAccess}`);
          res = await fetch(url, { ...options, headers });
        } else {
          clearStoredTokens();
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
      } catch {
        clearStoredTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    } else {
      clearStoredTokens();
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMessage = (typeof data === 'object' && data?.error) ? data.error : res.statusText || 'Request failed';
    throw new ApiError(res.status, errorMessage, data);
  }

  return data as T;
}
