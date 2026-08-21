import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  api,
  getStoredToken,
  readTokenDisplayName,
  storeToken,
  TOKEN_STORAGE_KEY,
} from './index';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('stores and reads the JWT on the shared key', () => {
    expect(getStoredToken()).toBeNull();
    storeToken('abc');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('abc');
    expect(getStoredToken()).toBe('abc');
    storeToken(null);
    expect(getStoredToken()).toBeNull();
  });

  it('reads the display name from a JWT payload without verifying it', () => {
    const json = JSON.stringify({ name: '管理员', sub: 'admin' });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
    storeToken(`header.${payload}.sig`);
    expect(readTokenDisplayName()).toBe('管理员');
  });

  it('attaches the bearer token and classifies 401 / 403 / offline', async () => {
    storeToken('tok');
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/login')) {
          return jsonResponse({ message: '用户名或密码错误' }, 401);
        }
        if (url.endsWith('/rbac/users')) {
          return jsonResponse({ message: '无权限执行此操作' }, 403);
        }
        return jsonResponse({ username: 'admin' });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.login('a', 'b')).rejects.toMatchObject({
      kind: 'unauthorized',
      message: '用户名或密码错误',
    } satisfies Partial<ApiError>);

    await expect(api.listUsers()).rejects.toMatchObject({
      kind: 'forbidden',
    });

    const loginInit = fetchMock.mock.calls[0]?.[1];
    const headers = loginInit?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers instanceof Headers ? headers.get('Authorization') : null).toBe(
      'Bearer tok',
    );

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(api.getStore()).rejects.toMatchObject({ kind: 'offline' });
  });

  it('does not treat a 403 as a session expiry', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 403));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await api.me();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('forbidden');
      expect((error as ApiError).kind).not.toBe('unauthorized');
    }
  });
});
