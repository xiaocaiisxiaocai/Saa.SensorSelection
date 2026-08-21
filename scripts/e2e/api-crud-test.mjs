#!/usr/bin/env node
// Full CRUD + permission-matrix regression against a running API (default http://localhost:5080).
// Every artifact it creates is prefixed with E2E_PREFIX and removed in the cleanup phase.

const BASE = process.env.API_BASE ?? 'http://localhost:5080/api'
const E2E_PREFIX = 'e2e_'

let passed = 0
const failures = []
const cleanup = []

function ok(name) {
  passed += 1
  console.log(`  \u2713 ${name}`)
}

function fail(name, detail) {
  failures.push({ name, detail })
  console.log(`  \u2717 ${name}\n      ${detail}`)
}

async function check(name, fn) {
  try {
    await fn()
    ok(name)
  } catch (error) {
    fail(name, error && error.message ? error.message : String(error))
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
  }
}

async function request(method, path, { token, body, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (raw) return response
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: response.status, data, headers: response.headers }
}

async function login(username, password) {
  const res = await request('POST', '/auth/login', { body: { username, password } })
  return res
}

function section(title) {
  console.log(`\n${title}`)
}

async function main() {
  console.log(`API CRUD regression against ${BASE}\n`)

  // ---------------------------------------------------------------- health
  section('Health')
  await check('GET /health returns ok with a healthy database', async () => {
    const res = await request('GET', '/health')
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.status, 'ok', 'status field')
    assertEqual(res.data.db, 'ok', 'db field')
  })

  // ------------------------------------------------------------------ auth
  section('Authentication')
  const adminLogin = await login('admin', 'admin123')
  await check('POST /auth/login succeeds for the seeded admin', async () => {
    assertEqual(adminLogin.status, 200, 'status')
    assert(typeof adminLogin.data.token === 'string' && adminLogin.data.token.length > 20, 'token missing')
    assert(Array.isArray(adminLogin.data.permissions), 'permissions missing')
    assert(adminLogin.data.permissions.includes('selection:write'), 'admin lacks selection:write')
  })

  const adminToken = adminLogin.data?.token
  if (!adminToken) {
    console.error('\nFATAL: cannot continue without an admin token.')
    process.exit(1)
  }

  await check('POST /auth/login rejects a wrong password with 401', async () => {
    const res = await login('admin', 'definitely-wrong')
    assertEqual(res.status, 401, 'status')
    assert(res.data.message, 'expected a message')
  })

  await check('POST /auth/login rejects an unknown user with 401', async () => {
    const res = await login(`${E2E_PREFIX}ghost`, 'whatever')
    assertEqual(res.status, 401, 'status')
  })

  await check('POST /auth/login validates a missing password with 400', async () => {
    const res = await request('POST', '/auth/login', { body: { username: 'admin' } })
    assertEqual(res.status, 400, 'status')
  })

  await check('GET /auth/me returns the caller profile', async () => {
    const res = await request('GET', '/auth/me', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.username, 'admin', 'username')
    assert(Array.isArray(res.data.roles) && res.data.roles.length > 0, 'roles missing')
  })

  await check('GET /auth/me rejects an anonymous caller with 401', async () => {
    const res = await request('GET', '/auth/me')
    assertEqual(res.status, 401, 'status')
  })

  await check('GET /auth/me rejects a malformed token with 401', async () => {
    const res = await request('GET', '/auth/me', { token: 'not-a-real-jwt' })
    assertEqual(res.status, 401, 'status')
  })

  // ----------------------------------------------------------------- store
  section('Selection store CRUD')
  const storeKey = `${E2E_PREFIX}customer-req:auto`
  cleanup.push(async () => {
    await request('DELETE', `/store/${encodeURIComponent(storeKey)}`, { token: adminToken })
  })

  await check('GET /store returns the full snapshot as an object of arrays', async () => {
    const res = await request('GET', '/store')
    assertEqual(res.status, 200, 'status')
    assert(res.data && typeof res.data === 'object' && !Array.isArray(res.data), 'expected an object')
    for (const [key, value] of Object.entries(res.data)) {
      assert(Array.isArray(value), `value for ${key} is not an array`)
    }
  })

  await check('PUT /store/{key} rejects an anonymous write with 401', async () => {
    const res = await request('PUT', `/store/${encodeURIComponent(storeKey)}`, { body: [{ id: 1 }] })
    assertEqual(res.status, 401, 'status')
  })

  await check('PUT /store/{key} creates a new key', async () => {
    const res = await request('PUT', `/store/${encodeURIComponent(storeKey)}`, {
      token: adminToken,
      body: [{ id: 1, type: '外观', content: 'e2e created' }],
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.ok, true, 'ok flag')
  })

  await check('GET /store/{key} reads the key back', async () => {
    const res = await request('GET', `/store/${encodeURIComponent(storeKey)}`)
    assertEqual(res.status, 200, 'status')
    assert(Array.isArray(res.data), 'expected an array')
    assertEqual(res.data.length, 1, 'row count')
    assertEqual(res.data[0].content, 'e2e created', 'content')
  })

  await check('PUT /store/{key} updates an existing key', async () => {
    const res = await request('PUT', `/store/${encodeURIComponent(storeKey)}`, {
      token: adminToken,
      body: [
        { id: 1, type: '外观', content: 'e2e updated' },
        { id: 2, type: '尺寸', content: 'e2e second row' },
      ],
    })
    assertEqual(res.status, 200, 'status')
    const read = await request('GET', `/store/${encodeURIComponent(storeKey)}`)
    assertEqual(read.data.length, 2, 'row count after update')
    assertEqual(read.data[0].content, 'e2e updated', 'updated content')
  })

  await check('PUT /store/{key} rejects a non-array body with 400', async () => {
    const res = await request('PUT', `/store/${encodeURIComponent(storeKey)}`, {
      token: adminToken,
      body: { nope: true },
    })
    assertEqual(res.status, 400, 'status')
    assertEqual(res.data.reason, 'validation', 'reason')
  })

  await check('GET /store/{key} returns 404 for an unknown key', async () => {
    const res = await request('GET', `/store/${encodeURIComponent(`${E2E_PREFIX}missing:key`)}`)
    assertEqual(res.status, 404, 'status')
  })

  await check('DELETE /store/{key} removes the key', async () => {
    const res = await request('DELETE', `/store/${encodeURIComponent(storeKey)}`, { token: adminToken })
    assertEqual(res.status, 200, 'status')
    const read = await request('GET', `/store/${encodeURIComponent(storeKey)}`)
    assertEqual(read.status, 404, 'status after delete')
  })

  await check('DELETE /store/{key} returns 404 for an unknown key', async () => {
    const res = await request('DELETE', `/store/${encodeURIComponent(`${E2E_PREFIX}missing:key`)}`, {
      token: adminToken,
    })
    assertEqual(res.status, 404, 'status')
  })

  await check('PUT /store/entity-groups/{kind} validates duplicate item names', async () => {
    const res = await request('PUT', '/store/entity-groups/customer', {
      token: adminToken,
      body: [
        { name: `${E2E_PREFIX}A`, items: ['dup'] },
        { name: `${E2E_PREFIX}B`, items: ['dup'] },
      ],
    })
    assertEqual(res.status, 400, 'status')
    assertEqual(res.data.reason, 'validation', 'reason')
  })

  await check('PUT /store/entity-groups/{kind} validates an empty group list', async () => {
    const res = await request('PUT', '/store/entity-groups/machine', { token: adminToken, body: [] })
    assertEqual(res.status, 400, 'status')
  })

  await check('PUT /store/entity-groups/{kind} reorders groups without data loss', async () => {
    const before = await request('GET', '/store/entity-groups%3Acustomer')
    assertEqual(before.status, 200, 'status of current groups')
    const groups = before.data
    assert(Array.isArray(groups) && groups.length > 0, 'no seeded customer groups')
    const reversed = [...groups].reverse()
    const res = await request('PUT', '/store/entity-groups/customer', { token: adminToken, body: reversed })
    assertEqual(res.status, 200, 'reorder status')
    const after = await request('GET', '/store/entity-groups%3Acustomer')
    assertEqual(after.data.length, groups.length, 'group count preserved')
    // restore original order
    const restore = await request('PUT', '/store/entity-groups/customer', { token: adminToken, body: groups })
    assertEqual(restore.status, 200, 'restore status')
    const restored = await request('GET', '/store/entity-groups%3Acustomer')
    assertEqual(restored.data[0].name, groups[0].name, 'first group restored')
  })

  // ----------------------------------------------------------- permissions
  section('Permission matrix')
  const rolesRes = await request('GET', '/rbac/roles', { token: adminToken })
  const editorRole = rolesRes.data?.find?.((role) => role.code === 'editor')
  const viewerRole = rolesRes.data?.find?.((role) => role.code === 'viewer')

  let editorToken = null
  let viewerToken = null

  await check('An editor user can be provisioned and can write to the store', async () => {
    assert(editorRole, 'seeded editor role missing')
    const created = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}editor`,
        password: 'editor123',
        displayName: 'E2E 编辑者',
        roleIds: [editorRole.id],
      },
    })
    assertEqual(created.status, 200, 'create status')
    cleanup.push(async () => {
      await request('DELETE', `/rbac/users/${created.data.id}`, { token: adminToken })
    })
    const session = await login(`${E2E_PREFIX}editor`, 'editor123')
    assertEqual(session.status, 200, 'editor login status')
    editorToken = session.data.token
    assert(session.data.permissions.includes('selection:write'), 'editor lacks selection:write')
    assert(!session.data.permissions.includes('rbac:view'), 'editor should not have rbac:view')

    const key = `${E2E_PREFIX}editor-write:auto`
    const write = await request('PUT', `/store/${encodeURIComponent(key)}`, {
      token: editorToken,
      body: [{ id: 1, content: 'written by editor' }],
    })
    assertEqual(write.status, 200, 'editor write status')
    await request('DELETE', `/store/${encodeURIComponent(key)}`, { token: adminToken })
  })

  await check('An editor is denied access to RBAC endpoints with 403', async () => {
    assert(editorToken, 'no editor token')
    const res = await request('GET', '/rbac/users', { token: editorToken })
    assertEqual(res.status, 403, 'status')
  })

  await check('An editor is denied access to audit logs with 403', async () => {
    assert(editorToken, 'no editor token')
    const res = await request('GET', '/audit-logs', { token: editorToken })
    assertEqual(res.status, 403, 'status')
  })

  await check('A viewer user can read the store but cannot write to it', async () => {
    assert(viewerRole, 'seeded viewer role missing')
    const created = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}viewer`,
        password: 'viewer123',
        displayName: 'E2E 只读者',
        roleIds: [viewerRole.id],
      },
    })
    assertEqual(created.status, 200, 'create status')
    cleanup.push(async () => {
      await request('DELETE', `/rbac/users/${created.data.id}`, { token: adminToken })
    })
    const session = await login(`${E2E_PREFIX}viewer`, 'viewer123')
    assertEqual(session.status, 200, 'viewer login status')
    viewerToken = session.data.token

    const read = await request('GET', '/store', { token: viewerToken })
    assertEqual(read.status, 200, 'viewer read status')

    const write = await request('PUT', `/store/${encodeURIComponent(`${E2E_PREFIX}viewer-write:auto`)}`, {
      token: viewerToken,
      body: [{ id: 1 }],
    })
    assertEqual(write.status, 403, 'viewer write status')
    assert(write.data.message, 'expected a denial message')
  })

  await check('An inactive account is rejected at login with 403', async () => {
    const created = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}inactive`,
        password: 'inactive123',
        displayName: 'E2E 停用',
        isActive: false,
      },
    })
    assertEqual(created.status, 200, 'create status')
    cleanup.push(async () => {
      await request('DELETE', `/rbac/users/${created.data.id}`, { token: adminToken })
    })
    const session = await login(`${E2E_PREFIX}inactive`, 'inactive123')
    assertEqual(session.status, 403, 'status')
  })

  // ------------------------------------------------------------ rbac users
  section('RBAC users CRUD')
  let userId = null

  await check('GET /rbac/users lists users', async () => {
    const res = await request('GET', '/rbac/users', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    assert(Array.isArray(res.data), 'expected an array')
    assert(
      res.data.some((user) => user.username === 'admin'),
      'admin missing from the list',
    )
  })

  await check('POST /rbac/users creates a user', async () => {
    const res = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}crud`,
        password: 'crud1234',
        displayName: 'E2E CRUD 用户',
        roleIds: viewerRole ? [viewerRole.id] : [],
      },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.username, `${E2E_PREFIX}crud`, 'username')
    assertEqual(res.data.isActive, true, 'isActive default')
    userId = res.data.id
    cleanup.push(async () => {
      await request('DELETE', `/rbac/users/${userId}`, { token: adminToken })
    })
  })

  await check('POST /rbac/users rejects a duplicate username with 400', async () => {
    const res = await request('POST', '/rbac/users', {
      token: adminToken,
      body: { username: `${E2E_PREFIX}crud`, password: 'crud1234', displayName: 'dup' },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('POST /rbac/users rejects a too-short password with 400', async () => {
    const res = await request('POST', '/rbac/users', {
      token: adminToken,
      body: { username: `${E2E_PREFIX}shortpw`, password: '1', displayName: 'short' },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('PUT /rbac/users/{id} updates a user', async () => {
    assert(userId, 'no user id')
    const res = await request('PUT', `/rbac/users/${userId}`, {
      token: adminToken,
      body: { displayName: 'E2E CRUD 用户（已改）', isActive: false, roleIds: [] },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.displayName, 'E2E CRUD 用户（已改）', 'displayName')
    assertEqual(res.data.isActive, false, 'isActive')
    assertEqual(res.data.roles.length, 0, 'roles cleared')
  })

  await check('PUT /rbac/users/{id}/password resets a password', async () => {
    assert(userId, 'no user id')
    const res = await request('PUT', `/rbac/users/${userId}/password`, {
      token: adminToken,
      body: { password: 'reset1234' },
    })
    assertEqual(res.status, 200, 'status')
    // reactivate and verify the new password works
    await request('PUT', `/rbac/users/${userId}`, {
      token: adminToken,
      body: { displayName: 'E2E CRUD 用户（已改）', isActive: true, roleIds: [] },
    })
    const session = await login(`${E2E_PREFIX}crud`, 'reset1234')
    assertEqual(session.status, 200, 'login with the new password')
  })

  await check('The last admin cannot be deleted', async () => {
    const users = await request('GET', '/rbac/users', { token: adminToken })
    const admin = users.data.find((user) => user.username === 'admin')
    assert(admin, 'admin user missing')
    const res = await request('DELETE', `/rbac/users/${admin.id}`, { token: adminToken })
    assert(res.status === 400, `expected 400, got ${res.status}`)
  })

  await check('DELETE /rbac/users/{id} removes a user', async () => {
    assert(userId, 'no user id')
    const res = await request('DELETE', `/rbac/users/${userId}`, { token: adminToken })
    assertEqual(res.status, 200, 'status')
    const users = await request('GET', '/rbac/users', { token: adminToken })
    assert(
      !users.data.some((user) => user.id === userId),
      'user still present after delete',
    )
    userId = null
  })

  // ------------------------------------------------------------ rbac roles
  section('RBAC roles CRUD')
  let roleId = null
  let permissions = []

  await check('GET /rbac/roles/permissions lists the permission catalogue', async () => {
    const res = await request('GET', '/rbac/roles/permissions', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    permissions = res.data
    assertEqual(permissions.length, 7, 'permission count')
    assert(
      permissions.some((permission) => permission.code === 'selection:write'),
      'selection:write missing',
    )
  })

  await check('POST /rbac/roles creates a role', async () => {
    const readPermission = permissions.find((permission) => permission.code === 'selection:read')
    const res = await request('POST', '/rbac/roles', {
      token: adminToken,
      body: {
        code: `${E2E_PREFIX}role`,
        name: 'E2E 角色',
        description: '自动化测试角色',
        permissionIds: [readPermission.id],
      },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.code, `${E2E_PREFIX}role`, 'code')
    assertEqual(res.data.permissions.length, 1, 'permission count')
    roleId = res.data.id
    cleanup.push(async () => {
      await request('DELETE', `/rbac/roles/${roleId}`, { token: adminToken })
    })
  })

  await check('POST /rbac/roles rejects an invalid code with 400', async () => {
    const res = await request('POST', '/rbac/roles', {
      token: adminToken,
      body: { code: '123-bad code!', name: 'bad' },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('POST /rbac/roles rejects a duplicate code with 400', async () => {
    const res = await request('POST', '/rbac/roles', {
      token: adminToken,
      body: { code: `${E2E_PREFIX}role`, name: 'dup' },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('PUT /rbac/roles/{id} updates a role and its permissions', async () => {
    assert(roleId, 'no role id')
    const writePermission = permissions.find((permission) => permission.code === 'selection:write')
    const readPermission = permissions.find((permission) => permission.code === 'selection:read')
    const res = await request('PUT', `/rbac/roles/${roleId}`, {
      token: adminToken,
      body: {
        name: 'E2E 角色（已改）',
        description: '已更新',
        permissionIds: [readPermission.id, writePermission.id],
      },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.name, 'E2E 角色（已改）', 'name')
    assertEqual(res.data.permissions.length, 2, 'permission count')
  })

  await check('The built-in admin role is protected from updates', async () => {
    const roles = await request('GET', '/rbac/roles', { token: adminToken })
    const adminRole = roles.data.find((role) => role.code === 'admin')
    assert(adminRole, 'admin role missing')
    assertEqual(adminRole.isSystem, true, 'admin role should be a system role')
    const res = await request('PUT', `/rbac/roles/${adminRole.id}`, {
      token: adminToken,
      body: { name: 'hacked', permissionIds: [] },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('A role that still has users cannot be deleted', async () => {
    assert(roleId, 'no role id')
    const created = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}roleholder`,
        password: 'holder123',
        displayName: 'E2E 持有者',
        roleIds: [roleId],
      },
    })
    assertEqual(created.status, 200, 'create user status')
    const res = await request('DELETE', `/rbac/roles/${roleId}`, { token: adminToken })
    assertEqual(res.status, 400, 'status')
    const removed = await request('DELETE', `/rbac/users/${created.data.id}`, { token: adminToken })
    assertEqual(removed.status, 200, 'cleanup user delete')
  })

  await check('DELETE /rbac/roles/{id} removes a role', async () => {
    assert(roleId, 'no role id')
    const res = await request('DELETE', `/rbac/roles/${roleId}`, { token: adminToken })
    assertEqual(res.status, 200, 'status')
    roleId = null
  })

  // -------------------------------------------------------- rbac org units
  section('RBAC org units CRUD')
  let parentOrgId = null
  let childOrgId = null

  await check('POST /rbac/org-units creates a root unit', async () => {
    const res = await request('POST', '/rbac/org-units', {
      token: adminToken,
      body: { name: `${E2E_PREFIX}事业部`, level: '事业部', sortOrder: 99 },
    })
    assertEqual(res.status, 200, 'status')
    parentOrgId = res.data.id
    assertEqual(res.data.parentId, null, 'parentId')
    cleanup.push(async () => {
      await request('DELETE', `/rbac/org-units/${parentOrgId}`, { token: adminToken })
    })
  })

  await check('POST /rbac/org-units creates a child unit', async () => {
    assert(parentOrgId, 'no parent id')
    const res = await request('POST', '/rbac/org-units', {
      token: adminToken,
      body: { name: `${E2E_PREFIX}部门`, level: '部门', parentId: parentOrgId },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.parentId, parentOrgId, 'parentId')
    childOrgId = res.data.id
    cleanup.push(async () => {
      await request('DELETE', `/rbac/org-units/${childOrgId}`, { token: adminToken })
    })
  })

  await check('An inverted level hierarchy is rejected with 400', async () => {
    assert(childOrgId, 'no child id')
    const res = await request('POST', '/rbac/org-units', {
      token: adminToken,
      body: { name: `${E2E_PREFIX}倒挂`, level: '事业部', parentId: childOrgId },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('A unit cannot be made its own parent', async () => {
    assert(parentOrgId, 'no parent id')
    const res = await request('PUT', `/rbac/org-units/${parentOrgId}`, {
      token: adminToken,
      body: { name: `${E2E_PREFIX}事业部`, level: '事业部', parentId: parentOrgId },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('A parent/child cycle is rejected with 400', async () => {
    assert(parentOrgId && childOrgId, 'missing org ids')
    const res = await request('PUT', `/rbac/org-units/${parentOrgId}`, {
      token: adminToken,
      body: { name: `${E2E_PREFIX}事业部`, level: '事业部', parentId: childOrgId },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('PUT /rbac/org-units/{id} renames a unit', async () => {
    assert(childOrgId, 'no child id')
    const res = await request('PUT', `/rbac/org-units/${childOrgId}`, {
      token: adminToken,
      body: { name: `${E2E_PREFIX}部门（已改）`, level: '部门', parentId: parentOrgId, sortOrder: 5 },
    })
    assertEqual(res.status, 200, 'status')
    assertEqual(res.data.name, `${E2E_PREFIX}部门（已改）`, 'name')
    assertEqual(res.data.sortOrder, 5, 'sortOrder')
  })

  await check('GET /rbac/org-units reports child counts', async () => {
    const res = await request('GET', '/rbac/org-units', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    const parent = res.data.find((unit) => unit.id === parentOrgId)
    assert(parent, 'parent unit missing')
    assertEqual(parent.childCount, 1, 'childCount')
  })

  await check('A unit with children cannot be deleted', async () => {
    assert(parentOrgId, 'no parent id')
    const res = await request('DELETE', `/rbac/org-units/${parentOrgId}`, { token: adminToken })
    assertEqual(res.status, 400, 'status')
  })

  await check('A unit with attached users cannot be deleted', async () => {
    assert(childOrgId, 'no child id')
    const created = await request('POST', '/rbac/users', {
      token: adminToken,
      body: {
        username: `${E2E_PREFIX}orguser`,
        password: 'orguser123',
        displayName: 'E2E 组织用户',
        orgUnitId: childOrgId,
      },
    })
    assertEqual(created.status, 200, 'create user status')
    const res = await request('DELETE', `/rbac/org-units/${childOrgId}`, { token: adminToken })
    assertEqual(res.status, 400, 'status')
    const removed = await request('DELETE', `/rbac/users/${created.data.id}`, { token: adminToken })
    assertEqual(removed.status, 200, 'cleanup user delete')
  })

  await check('DELETE /rbac/org-units/{id} removes leaf then root', async () => {
    const child = await request('DELETE', `/rbac/org-units/${childOrgId}`, { token: adminToken })
    assertEqual(child.status, 200, 'child delete status')
    childOrgId = null
    const parent = await request('DELETE', `/rbac/org-units/${parentOrgId}`, { token: adminToken })
    assertEqual(parent.status, 200, 'parent delete status')
    parentOrgId = null
  })

  // ------------------------------------------------------------ audit logs
  section('Audit logs')
  await check('GET /audit-logs is denied for an anonymous caller with 401', async () => {
    const res = await request('GET', '/audit-logs')
    assertEqual(res.status, 401, 'status')
  })

  await check('GET /audit-logs returns a paged result', async () => {
    const res = await request('GET', '/audit-logs?page=1&pageSize=5', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    assert(Array.isArray(res.data.items), 'items missing')
    assert(res.data.items.length <= 5, 'pageSize not honoured')
    assert(typeof res.data.total === 'number' && res.data.total > 0, 'total missing')
  })

  await check('GET /audit-logs filters by action', async () => {
    const res = await request('GET', '/audit-logs?action=user.create&pageSize=50', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    assert(res.data.items.length > 0, 'expected user.create entries from this run')
    for (const item of res.data.items) {
      assert(item.action.includes('user.create'), `unexpected action ${item.action}`)
    }
  })

  await check('GET /audit-logs records the failed login from this run', async () => {
    const res = await request('GET', '/audit-logs?action=auth.login&result=false&pageSize=20', {
      token: adminToken,
    })
    assertEqual(res.status, 200, 'status')
    assert(res.data.items.length > 0, 'expected failed login entries')
    for (const item of res.data.items) {
      assertEqual(item.result, false, 'result filter')
    }
  })

  await check('GET /audit-logs caps pageSize at 200', async () => {
    const res = await request('GET', '/audit-logs?pageSize=100000', { token: adminToken })
    assertEqual(res.status, 200, 'status')
    assert(res.data.items.length <= 200, 'pageSize cap not enforced')
  })

  // --------------------------------------------------------------- reports
  section('Reports')
  await check('POST /reports/machine-schematic renders an HTML report', async () => {
    const res = await request(
      'POST',
      '/reports/machine-schematic',
      {
        token: adminToken,
        body: {
          machineNames: ['E2E 机型'],
          sections: [
            {
              id: 1,
              name: '输送机构',
              displayName: '输送机构',
              sort: 1,
              kind: 'structure',
              blocks: [
                {
                  machineName: 'E2E 机型',
                  rows: [
                    {
                      id: 1,
                      role: '进板检知',
                      sensorType: '对射',
                      spec: 'E3Z-T61',
                      purpose: '检测板件',
                      name: '',
                      desc: '',
                      note: '',
                      image: null,
                    },
                  ],
                  images: [],
                },
              ],
            },
          ],
        },
        raw: true,
      },
    )
    assertEqual(res.status, 200, 'status')
    const contentType = res.headers.get('content-type') ?? ''
    assert(contentType.includes('text/html'), `unexpected content-type ${contentType}`)
    const html = await res.text()
    assert(html.includes('E2E 机型'), 'machine name missing from the report')
    assert(html.includes('E3Z-T61'), 'row data missing from the report')
  })

  await check('POST /reports/machine-schematic rejects an empty request with 400', async () => {
    const res = await request('POST', '/reports/machine-schematic', {
      token: adminToken,
      body: { machineNames: [], sections: [] },
    })
    assertEqual(res.status, 400, 'status')
  })

  await check('POST /reports/machine-schematic escapes HTML in user data', async () => {
    const res = await request(
      'POST',
      '/reports/machine-schematic',
      {
        token: adminToken,
        body: {
          machineNames: ['<script>alert(1)</script>'],
          sections: [
            {
              id: 1,
              name: 'x',
              displayName: 'x',
              sort: 1,
              kind: 'structure',
              blocks: [
                {
                  machineName: '<script>alert(1)</script>',
                  rows: [
                    {
                      id: 1,
                      role: '<img src=x onerror=alert(1)>',
                      sensorType: '',
                      spec: '',
                      purpose: '',
                      name: '',
                      desc: '',
                      note: '',
                      image: null,
                    },
                  ],
                  images: [],
                },
              ],
            },
          ],
        },
        raw: true,
      },
    )
    assertEqual(res.status, 200, 'status')
    const html = await res.text()
    // The payload must survive only as inert text: angle brackets have to be entity-encoded.
    assert(!html.includes('<script>alert(1)</script>'), 'raw script tag leaked into the report')
    assert(!html.includes('<img src=x'), 'raw img tag leaked into the report')
    assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'script payload was not entity-encoded')
    assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'img payload was not entity-encoded')
  })

  // --------------------------------------------------------------- cleanup
  section('Cleanup')
  let cleanupErrors = 0
  for (const task of cleanup.reverse()) {
    try {
      await task()
    } catch {
      cleanupErrors += 1
    }
  }
  await check('All e2e artifacts are removed', async () => {
    assertEqual(cleanupErrors, 0, 'cleanup task errors')
    const users = await request('GET', '/rbac/users', { token: adminToken })
    const leftoverUsers = users.data.filter((user) => user.username.startsWith(E2E_PREFIX))
    assertEqual(leftoverUsers.length, 0, `leftover users: ${leftoverUsers.map((u) => u.username).join(', ')}`)
    const roles = await request('GET', '/rbac/roles', { token: adminToken })
    const leftoverRoles = roles.data.filter((role) => role.code.startsWith(E2E_PREFIX))
    assertEqual(leftoverRoles.length, 0, `leftover roles: ${leftoverRoles.map((r) => r.code).join(', ')}`)
    const orgs = await request('GET', '/rbac/org-units', { token: adminToken })
    const leftoverOrgs = orgs.data.filter((unit) => unit.name.startsWith(E2E_PREFIX))
    assertEqual(leftoverOrgs.length, 0, `leftover org units: ${leftoverOrgs.map((o) => o.name).join(', ')}`)
    const store = await request('GET', '/store')
    const leftoverKeys = Object.keys(store.data).filter((key) => key.startsWith(E2E_PREFIX))
    assertEqual(leftoverKeys.length, 0, `leftover store keys: ${leftoverKeys.join(', ')}`)
  })

  // ---------------------------------------------------------------- report
  console.log(`\n${'-'.repeat(60)}`)
  console.log(`passed: ${passed}   failed: ${failures.length}`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const failure of failures) {
      console.log(`  - ${failure.name}\n      ${failure.detail}`)
    }
    process.exit(1)
  }
  console.log('API CRUD regression passed.')
}

main().catch((error) => {
  console.error('\nUnexpected error:', error)
  process.exit(1)
})
