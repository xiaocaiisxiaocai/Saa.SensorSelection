/**
 * Symtek 后端 API 客户端。
 *
 * - 开发环境经 Vite 代理把 /api 转发到 http://localhost:5080
 * - 生产环境可通过 VITE_API_BASE 覆盖后端地址（默认同源 /api）
 * - JWT token 保存在 localStorage（键 symtek_token）
 */

export const TOKEN_STORAGE_KEY = 'symtek_token';

export const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

export type ApiErrorKind = 'error' | 'offline' | 'unauthorized';

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

export interface LoginResult {
  token: string;
  username: string;
  displayName: string;
  expiresAt: string;
}

export function getStoredToken(): null | string {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: null | string): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

/** 从 JWT payload 读取显示名（本地解码，仅用于 UI 展示，不做签名校验）。 */
export function readTokenDisplayName(): null | string {
  const token = getStoredToken();
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    return decoded.name || decoded.sub || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== null) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('offline', '无法连接后端服务');
  }

  if (response.status === 401 || response.status === 403) {
    // 登录接口的 401 带后端错误信息（如“用户名或密码错误”），优先透出；
    // 其他接口的 401/403 视为登录已失效。
    let message = '登录已失效，请重新登录';
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // 无响应体，保留默认信息
    }
    throw new ApiError('unauthorized', message);
  }
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // 保留默认错误信息
    }
    throw new ApiError('error', message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  /** 账号密码登录，返回 JWT。 */
  login(username: string, password: string): Promise<LoginResult> {
    return request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  /** 读取全部 key → 数组。 */
  getStore(): Promise<Record<string, unknown[]>> {
    return request<Record<string, unknown[]>>('/store');
  },

  /** 写入单个 key。 */
  async putKey(key: string, value: unknown[]): Promise<void> {
    await request(`/store/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    });
  },

  /** 删除单个 key。 */
  async deleteKey(key: string): Promise<void> {
    await request(`/store/${encodeURIComponent(key)}`, { method: 'DELETE' });
  },

  /** 整体替换数据仓库（首次接入迁移用）。 */
  async replaceAll(store: Record<string, unknown[]>): Promise<void> {
    await request('/store', { method: 'PUT', body: JSON.stringify(store) });
  },
};
