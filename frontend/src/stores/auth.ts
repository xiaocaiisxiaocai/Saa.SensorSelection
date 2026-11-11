import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  api,
  ApiError,
  getStoredToken,
  readTokenDisplayName,
  storeToken,
  type UserProfile,
} from '@/api';

export function hasAllPermissions(
  owned: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((code) => owned.includes(code));
}

// 路由守卫每次导航都会调用 ensureProfile。同一个 token 在这段时间内复用已加载的
// 资料，避免每次切页都多一次 /auth/me 往返；过期后照常刷新，权限变更仍会在
// 下一次导航时生效（后端对每个请求也会重新校验账号状态）。
const PROFILE_REUSE_MS = 60_000;

export const useAuthStore = defineStore('auth', () => {
  const profile = ref<null | UserProfile>(null);
  const sessionExpired = ref(false);
  let profilePromise: null | Promise<void> = null;
  let profilePromiseEpoch = 0;
  let profilePromiseToken: null | string = null;
  let profileToken: null | string = null;
  let profileLoadedAt = 0;
  let sessionEpoch = 0;

  const permissions = computed(() => profile.value?.permissions ?? []);
  const roleCodes = computed(
    () => profile.value?.roles.map((role) => role.code) ?? [],
  );
  const displayName = computed(() => {
    if (profile.value) {
      return profile.value.displayName || profile.value.username;
    }
    return readTokenDisplayName() ?? '';
  });
  const isAuthenticated = computed(() => Boolean(profile.value));

  function applyProfile(next: null | UserProfile) {
    profile.value = next;
    profileToken = next ? getStoredToken() : null;
    profileLoadedAt = next ? Date.now() : 0;
    if (next) sessionExpired.value = false;
  }

  function clearSession() {
    sessionEpoch += 1;
    storeToken(null);
    sessionExpired.value = false;
    applyProfile(null);
  }

  function expireSession() {
    sessionEpoch += 1;
    applyProfile(null);
    sessionExpired.value = true;
  }

  async function ensureProfile(): Promise<void> {
    const token = getStoredToken();
    if (
      profilePromise &&
      profilePromiseToken === token &&
      profilePromiseEpoch === sessionEpoch
    ) {
      await profilePromise;
      return;
    }
    if (
      profile.value &&
      profileToken !== null &&
      profileToken === token &&
      Date.now() - profileLoadedAt < PROFILE_REUSE_MS
    ) {
      return;
    }
    if (!token) {
      sessionExpired.value = false;
      applyProfile(null);
      return;
    }
    const requestEpoch = sessionEpoch;
    const requestToken = token;
    const pending = (async () => {
      try {
        const next = await api.me();
        if (
          requestEpoch === sessionEpoch &&
          requestToken === getStoredToken()
        ) {
          applyProfile(next);
        }
      } catch (error) {
        if (
          requestEpoch === sessionEpoch &&
          requestToken === getStoredToken() &&
          error instanceof ApiError &&
          error.kind === 'unauthorized'
        ) {
          expireSession();
        }
      }
    })();
    profilePromise = pending;
    profilePromiseEpoch = requestEpoch;
    profilePromiseToken = requestToken;
    try {
      await pending;
    } finally {
      if (profilePromise === pending) {
        profilePromise = null;
        profilePromiseToken = null;
      }
    }
  }

  async function login(username: string, password: string) {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      return { ok: false as const, message: '请输入用户名和密码' };
    }
    try {
      const result = await api.login(trimmed, password);
      sessionEpoch += 1;
      storeToken(result.token);
      applyProfile(result);
      return { ok: true as const };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '登录失败，请重试';
      return { ok: false as const, message };
    }
  }

  function logout() {
    clearSession();
  }

  return {
    applyProfile,
    clearSession,
    displayName,
    ensureProfile,
    expireSession,
    isAuthenticated,
    login,
    logout,
    permissions,
    profile,
    roleCodes,
    sessionExpired,
  };
});

export function useAccess() {
  const auth = useAuthStore();

  function canWrite(code = 'selection:write') {
    return auth.permissions.includes(code);
  }

  function has(code: string) {
    return auth.permissions.includes(code);
  }

  function hasAll(codes: readonly string[]) {
    return hasAllPermissions(auth.permissions, codes);
  }

  return {
    canWrite,
    has,
    hasAll,
    permissions: computed(() => auth.permissions),
  };
}
