import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, storeToken } from '@/api';
import { hasAllPermissions, useAccess, useAuthStore } from './auth';

const viewer: Awaited<ReturnType<typeof api.me>> = {
  username: 'viewer',
  displayName: '只读',
  roles: [{ id: 3, code: 'viewer', name: '只读用户' }],
  permissions: ['selection:read'],
  orgUnit: null,
};

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('treats a missing token as anonymous read-only', async () => {
    const auth = useAuthStore();
    await auth.ensureProfile();
    expect(auth.profile).toBeNull();
    expect(useAccess().canWrite()).toBe(false);
  });

  it('loads the profile for a stored token', async () => {
    storeToken('tok');
    vi.spyOn(api, 'me').mockResolvedValue(viewer);
    const auth = useAuthStore();
    await auth.ensureProfile();
    expect(auth.profile?.username).toBe('viewer');
    expect(auth.permissions).toEqual(['selection:read']);
    expect(useAccess().canWrite('selection:write')).toBe(false);
  });

  it('clears the profile on 401 without treating 403 as expiry', async () => {
    storeToken('tok');
    vi.spyOn(api, 'me').mockRejectedValue(
      new ApiError('unauthorized', '登录已失效，请重新登录'),
    );
    const auth = useAuthStore();
    await auth.ensureProfile();
    expect(auth.profile).toBeNull();
    expect(auth.sessionExpired).toBe(true);
    expect(window.localStorage.getItem('symtek_token')).toBe('tok');
  });

  it('stores the token on login and clears it on logout', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({
      ...viewer,
      token: 'jwt',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    const auth = useAuthStore();
    const result = await auth.login('viewer', 'secret');
    expect(result).toEqual({ ok: true });
    expect(window.localStorage.getItem('symtek_token')).toBe('jwt');
    expect(auth.isAuthenticated).toBe(true);

    auth.logout();
    expect(window.localStorage.getItem('symtek_token')).toBeNull();
    expect(auth.profile).toBeNull();
  });

  it('requires every listed permission', () => {
    expect(hasAllPermissions(['rbac:view'], ['rbac:view'])).toBe(true);
    expect(
      hasAllPermissions(['rbac:view'], ['rbac:view', 'audit:view']),
    ).toBe(false);
  });
});
