/**
 * Symtek 后端 API 客户端。
 *
 * - 开发环境经 Vite 代理把 /api 转发到 http://localhost:5080
 * - 生产环境可通过 VITE_API_BASE 覆盖后端地址（默认同源 /api）
 * - JWT token 保存在 localStorage（键 symtek_token）
 */

export const TOKEN_STORAGE_KEY = 'symtek_token';

export const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

/** 请求超时（毫秒），可用 VITE_API_TIMEOUT 覆盖，默认 30s。 */
export const API_TIMEOUT = Number(import.meta.env?.VITE_API_TIMEOUT) || 30_000;

export type ApiErrorKind = 'error' | 'forbidden' | 'offline' | 'unauthorized';

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

/** 角色摘要（登录/资料接口返回）。 */
export interface RoleInfo {
  id: number;
  code: string;
  name: string;
}

/** 所属组织（含完整路径，如「事业部 / 部门 / 课别」）。 */
export interface OrgUnitInfo {
  id: number;
  name: string;
  level: null | string;
  path: string;
}

/** 登录用户资料：身份 + 角色 + 权限码 + 组织。 */
export interface UserProfile {
  username: string;
  displayName: string;
  roles: RoleInfo[];
  permissions: string[];
  orgUnit: null | OrgUnitInfo;
}

export interface LoginResult extends UserProfile {
  token: string;
  expiresAt: string;
}

/** 用户管理列表项。 */
export interface RbacUser extends Omit<UserProfile, 'permissions'> {
  id: number;
  isActive: boolean;
  createdAt: string;
}

/** 角色列表项。 */
export interface RbacRole {
  id: number;
  code: string;
  name: string;
  description: null | string;
  isSystem: boolean;
  permissions: PermissionInfo[];
  createdAt: string;
}

/** 权限项。 */
export interface PermissionInfo {
  id: number;
  code: string;
  name: string;
  module: null | string;
}

/** 组织节点（扁平，前端组树）。 */
export interface OrgUnitNode {
  id: number;
  name: string;
  parentId: null | number;
  level: null | string;
  sortOrder: number;
  childCount: number;
  userCount: number;
}

/** 操作日志条目。 */
export interface AuditLogItem {
  id: number;
  timestamp: string;
  username: null | string;
  action: string;
  target: null | string;
  detail: null | string;
  ip: null | string;
  result: boolean;
  error: null | string;
}

/** 操作日志分页结果。 */
export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
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
    // 后端挂起时避免请求永久 pending（否则桥接层写入队列会一直卡住）
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('offline', '请求超时，请稍后重试');
    }
    throw new ApiError('offline', '无法连接后端服务');
  }

  if (response.status === 401) {
    // 登录接口的 401 带后端错误信息（如“用户名或密码错误”），优先透出；
    // 其他接口的 401 视为登录已失效。
    let message = '登录已失效，请重新登录';
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // 无响应体，保留默认信息
    }
    throw new ApiError('unauthorized', message);
  }
  if (response.status === 403) {
    // 已登录但无权限：与 401 分离，避免前端误判为登录失效弹出登录框
    let message = '无权限执行此操作';
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // 无响应体，保留默认信息
    }
    throw new ApiError('forbidden', message);
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

  /** 当前登录用户资料（角色/权限/组织）。 */
  me(): Promise<UserProfile> {
    return request<UserProfile>('/auth/me');
  },

  // ---- RBAC：用户 ----
  listUsers(): Promise<RbacUser[]> {
    return request<RbacUser[]>('/rbac/users');
  },
  createUser(payload: {
    displayName: string;
    isActive?: boolean;
    orgUnitId?: null | number;
    password: string;
    roleIds?: number[];
    username: string;
  }): Promise<RbacUser> {
    return request<RbacUser>('/rbac/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateUser(
    id: number,
    payload: {
      displayName: string;
      isActive?: boolean;
      orgUnitId?: null | number;
      roleIds?: number[];
    },
  ): Promise<RbacUser> {
    return request<RbacUser>(`/rbac/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  resetUserPassword(id: number, password: string): Promise<void> {
    return request(`/rbac/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  },
  deleteUser(id: number): Promise<void> {
    return request(`/rbac/users/${id}`, { method: 'DELETE' });
  },

  // ---- RBAC：角色 ----
  listRoles(): Promise<RbacRole[]> {
    return request<RbacRole[]>('/rbac/roles');
  },
  listPermissions(): Promise<PermissionInfo[]> {
    return request<PermissionInfo[]>('/rbac/roles/permissions');
  },
  createRole(payload: {
    code: string;
    description?: null | string;
    name: string;
    permissionIds?: number[];
  }): Promise<RbacRole> {
    return request<RbacRole>('/rbac/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateRole(
    id: number,
    payload: {
      description?: null | string;
      name: string;
      permissionIds?: number[];
    },
  ): Promise<RbacRole> {
    return request<RbacRole>(`/rbac/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteRole(id: number): Promise<void> {
    return request(`/rbac/roles/${id}`, { method: 'DELETE' });
  },

  // ---- RBAC：组织架构 ----
  listOrgUnits(): Promise<OrgUnitNode[]> {
    return request<OrgUnitNode[]>('/rbac/org-units');
  },
  createOrgUnit(payload: {
    level?: null | string;
    name: string;
    parentId?: null | number;
    sortOrder?: number;
  }): Promise<OrgUnitNode> {
    return request<OrgUnitNode>('/rbac/org-units', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateOrgUnit(
    id: number,
    payload: {
      level?: null | string;
      name: string;
      parentId?: null | number;
      sortOrder?: number;
    },
  ): Promise<OrgUnitNode> {
    return request<OrgUnitNode>(`/rbac/org-units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteOrgUnit(id: number): Promise<void> {
    return request(`/rbac/org-units/${id}`, { method: 'DELETE' });
  },

  // ---- 操作日志 ----
  listAuditLogs(
    params: {
      action?: string;
      from?: string;
      page?: number;
      pageSize?: number;
      result?: boolean;
      target?: string;
      to?: string;
      username?: string;
    } = {},
  ): Promise<AuditLogPage> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.pageSize !== undefined) {
      query.set('pageSize', String(params.pageSize));
    }
    if (params.action) query.set('action', params.action);
    if (params.username) query.set('username', params.username);
    if (params.target) query.set('target', params.target);
    if (params.result !== undefined) query.set('result', String(params.result));
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    return request<AuditLogPage>(`/audit-logs?${query.toString()}`);
  },
};
