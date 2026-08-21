import type { RouteLocationNormalized, Router } from 'vue-router';

import { getStoredToken } from '@/api';
import { hasAllPermissions, useAuthStore } from '@/stores/auth';

export const DEFAULT_HOME = '/selection/customer';

export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_HOME;
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_HOME;
  if (value === '/login' || value.startsWith('/login?')) return DEFAULT_HOME;
  return value;
}

function redirectQuery(to: RouteLocationNormalized) {
  return { redirect: to.fullPath };
}

export function installGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    await auth.ensureProfile();

    if (to.path === '/login') {
      if (auth.profile) {
        return safeRedirect(to.query.redirect);
      }
      return true;
    }

    if (getStoredToken() && auth.sessionExpired) {
      return {
        path: '/login',
        query: redirectQuery(to),
      };
    }

    const required = to.meta.permissions;
    if (required?.length && !hasAllPermissions(auth.permissions, required)) {
      return DEFAULT_HOME;
    }

    return true;
  });
}
