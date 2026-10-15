import { type AuditOperation, operationHeaders } from './audit-operation';

export const TOKEN_STORAGE_KEY = 'symtek_token';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30_000;

export type ApiErrorKind = 'error' | 'forbidden' | 'offline' | 'unauthorized';

export class ApiError extends Error {
  kind: ApiErrorKind;
  /** HTTP 状态码；网络错误/超时没有响应，为 undefined。 */
  status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RoleInfo {
  id: number;
  code: string;
  name: string;
}

export interface OrgUnitInfo {
  id: number;
  name: string;
  level: null | string;
  path: string;
}

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

export interface RbacUser extends Omit<UserProfile, 'permissions'> {
  id: number;
  isActive: boolean;
  createdAt: string;
}

export interface PermissionInfo {
  id: number;
  code: string;
  name: string;
  module: null | string;
}

export interface RbacRole {
  id: number;
  code: string;
  name: string;
  description: null | string;
  isSystem: boolean;
  permissions: PermissionInfo[];
  createdAt: string;
}

export interface OrgUnitNode {
  id: number;
  name: string;
  parentId: null | number;
  level: null | string;
  sortOrder: number;
  childCount: number;
  userCount: number;
}

export interface UploadedFile {
  dataUrl: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

// 附件上传体积远大于普通 JSON 请求，单独放宽超时。
const UPLOAD_TIMEOUT = 5 * 60_000;

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
  /** 变更明细 JSON（见 AuditChangeSummary），旧日志与登录等操作没有 */
  changes?: null | string;
  operationId?: null | string;
  operationLabel?: null | string;
}

export interface AuditFieldChange {
  name: string;
  before?: string;
  after?: string;
}

export interface AuditRowChange {
  label: string;
  fields: AuditFieldChange[];
}

/** 一条日志的变更明细：每类最多 50 条，truncated 时总数看 *Count */
export interface AuditChangeSummary {
  added: AuditRowChange[];
  removed: AuditRowChange[];
  modified: AuditRowChange[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  reordered: boolean;
  truncated: boolean;
}

/** 一次操作：同一个操作编号下的全部日志 */
export interface AuditOperationItem {
  operationId: string;
  label: null | string;
  timestamp: string;
  username: null | string;
  displayName: null | string;
  ip: null | string;
  result: boolean;
  entryCount: number;
  entries: AuditLogItem[];
}

export interface AuditOperationPage {
  items: AuditOperationItem[];
  total: number;
}

export interface AuditOperationQuery {
  actions?: string[];
  /** 操作类型（如「删除机型」）；没有操作名称的日志按操作码匹配 */
  kinds?: string[];
  from?: string;
  hideLogin?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  result?: boolean;
  to?: string;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
}

export interface AuditLogQuery {
  action?: string;
  direction?: 'asc' | 'desc';
  from?: string;
  page?: number;
  pageSize?: number;
  result?: boolean;
  /** 仅支持 timestamp / username / action / result，其他值后端回落到时间倒序 */
  sort?: string;
  target?: string;
  to?: string;
  username?: string;
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

export function readTokenDisplayName(): null | string {
  const token = getStoredToken();
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as {
      name?: string;
      sub?: string;
    };
    return decoded.name || decoded.sub || null;
  } catch {
    return null;
  }
}

async function readMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body?.message === 'string' && body.message) {
      return body.message;
    }
  } catch {
    /* no JSON body */
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // FormData 必须由浏览器自带 multipart 边界设置 Content-Type。
  if (init?.body != null && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
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
    throw new ApiError(
      'unauthorized',
      await readMessage(response, '登录已失效，请重新登录'),
    );
  }
  if (response.status === 403) {
    throw new ApiError(
      'forbidden',
      await readMessage(response, '无权限执行此操作'),
    );
  }
  if (!response.ok) {
    throw new ApiError(
      'error',
      await readMessage(response, `请求失败（${response.status}）`),
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const headers = new Headers(init?.headers);
  if (init?.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
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
    throw new ApiError('unauthorized', '登录已失效，请重新登录');
  }
  if (response.status === 403) {
    throw new ApiError('forbidden', '无权限执行此操作');
  }
  if (!response.ok) {
    throw new ApiError(
      'error',
      await readMessage(response, `请求失败（${response.status}）`),
      response.status,
    );
  }
  return response.blob();
}

export const api = {
  login(username: string, password: string): Promise<LoginResult> {
    return request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  me(): Promise<UserProfile> {
    return request<UserProfile>('/auth/me');
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getStore(): Promise<Record<string, unknown[]>> {
    return request<Record<string, unknown[]>>('/store');
  },

  async putKey(
    key: string,
    value: unknown[],
    operation?: AuditOperation | null,
  ): Promise<unknown[]> {
    const result = await request<{ value: unknown[] }>(
      `/store/by-key?key=${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        body: JSON.stringify(value),
        headers: operationHeaders(operation),
      },
    );
    return result.value;
  },

  async putEntityGroups(
    kind: 'customer' | 'machine',
    groups: unknown[],
    operation?: AuditOperation | null,
  ): Promise<void> {
    await request(`/store/entity-groups/${kind}`, {
      method: 'PUT',
      body: JSON.stringify(groups),
      headers: operationHeaders(operation),
    });
  },

  uploadFile(file: File): Promise<UploadedFile> {
    const body = new FormData();
    body.append('file', file, file.name);
    return request<UploadedFile>('/files', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
    });
  },

  async deleteKey(
    key: string,
    operation?: AuditOperation | null,
  ): Promise<void> {
    await request(`/store/by-key?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: operationHeaders(operation),
    });
  },

  async replaceAll(store: Record<string, unknown[]>): Promise<void> {
    await request('/store', { method: 'PUT', body: JSON.stringify(store) });
  },

  downloadMachineSchematicReport(payload: {
    machineNames: string[];
    sections: unknown[];
  }): Promise<Blob> {
    return requestBlob('/reports/machine-schematic', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

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

  listAuditLogs(params: AuditLogQuery = {}): Promise<AuditLogPage> {
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
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    const qs = query.toString();
    return request<AuditLogPage>(`/audit-logs${qs ? `?${qs}` : ''}`);
  },

  /** 日志里出现过的操作类型（如「删除机型」；没有操作名称的是操作码） */
  listAuditOperationKinds(): Promise<string[]> {
    return request<string[]>('/audit-logs/operations/kinds');
  },

  /** 按操作分页查询日志：同一次界面操作的多条日志归成一组 */
  listAuditOperations(
    params: AuditOperationQuery = {},
  ): Promise<AuditOperationPage> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.pageSize !== undefined) {
      query.set('pageSize', String(params.pageSize));
    }
    if (params.keyword) query.set('keyword', params.keyword);
    for (const action of params.actions ?? []) query.append('action', action);
    for (const kind of params.kinds ?? []) query.append('kind', kind);
    if (params.result !== undefined) query.set('result', String(params.result));
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.hideLogin) query.set('hideLogin', 'true');
    const qs = query.toString();
    return request<AuditOperationPage>(
      `/audit-logs/operations${qs ? `?${qs}` : ''}`,
    );
  },
};
