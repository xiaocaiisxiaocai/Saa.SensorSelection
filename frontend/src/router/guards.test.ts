import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw,
} from 'vue-router';

import { api, storeToken } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { installGuards, safeRedirect } from './guards';

const routes: RouteRecordRaw[] = [
  { path: '/login', component: { template: '<div>login</div>' } },
  { path: '/selection/customer', component: { template: '<div>customer</div>' } },
  {
    path: '/system/user',
    component: { template: '<div>user</div>' },
    meta: { permissions: ['rbac:view'] },
  },
  {
    path: '/system/audit-log',
    component: { template: '<div>audit</div>' },
    meta: { permissions: ['rbac:view', 'audit:view'] },
  },
];

function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });
  installGuards(router);
  return router;
}

const admin = {
  username: 'admin',
  displayName: '管理员',
  roles: [{ id: 1, code: 'admin', name: '系统管理员' }],
  permissions: [
    'selection:read',
    'selection:write',
    'rbac:view',
    'audit:view',
  ],
  orgUnit: null,
};

describe('router guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets anonymous visitors read business pages', async () => {
    const router = createTestRouter();
    await router.push('/selection/customer');
    expect(router.currentRoute.value.path).toBe('/selection/customer');
  });

  it('hides system routes without rbac:view', async () => {
    const router = createTestRouter();
    await router.push('/system/user');
    expect(router.currentRoute.value.path).toBe('/selection/customer');
  });

  it('sends an expired session to login', async () => {
    const { ApiError } = await import('@/api');
    storeToken('stale');
    vi.spyOn(api, 'me').mockRejectedValue(
      new ApiError('unauthorized', '登录已失效，请重新登录'),
    );

    const router = createTestRouter();
    await router.push('/selection/customer');
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe(
      '/selection/customer',
    );
  });

  it('keeps a stored token on the page when the backend is merely offline', async () => {
    const { ApiError } = await import('@/api');
    storeToken('ok');
    vi.spyOn(api, 'me').mockRejectedValue(
      new ApiError('offline', '无法连接后端服务'),
    );

    const router = createTestRouter();
    await router.push('/selection/customer');
    expect(router.currentRoute.value.path).toBe('/selection/customer');
  });

  it('opens system routes when the profile has the codes', async () => {
    storeToken('ok');
    vi.spyOn(api, 'me').mockResolvedValue(admin);
    const router = createTestRouter();
    await router.push('/system/audit-log');
    expect(router.currentRoute.value.path).toBe('/system/audit-log');
    expect(useAuthStore().permissions).toContain('audit:view');
  });

  it('rejects protocol-relative redirects', () => {
    expect(safeRedirect('//evil.example')).toBe('/selection/customer');
    expect(safeRedirect('/selection/machine')).toBe('/selection/machine');
  });
});
