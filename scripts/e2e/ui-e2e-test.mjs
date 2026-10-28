#!/usr/bin/env node
// Browser end-to-end regression: drives every business CRUD flow through the real UI
// against a running frontend (5178) + backend (5080), then audits UI details
// (fonts, spacing, hit targets, focus rings, overflow, console errors).
//
//   node scripts/e2e/ui-e2e-test.mjs [--headed] [--slow]
//
// Everything it creates is prefixed with E2E and removed again in the teardown phase.

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5178'
const API = process.env.API_BASE ?? 'http://localhost:5080/api'
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123'
const ARTIFACT_DIR = new URL('./artifacts/', import.meta.url).pathname.replace(/^\//, '')
const HEADED = process.argv.includes('--headed')
const SLOW = process.argv.includes('--slow')

const TAG = 'E2E'
const NAMES = {
  site: `${TAG}厂区`,
  customer: `${TAG}客户`,
  machineCategory: `${TAG}机型分类`,
  machineLeafCategory: `${TAG}空分类`,
  machine: `${TAG}机型`,
  sensorModel: `${TAG}-SN-001`,
  processStep: `${TAG}工艺`,
  dictItem: `${TAG}字典项`,
  user: `${TAG.toLowerCase()}_ui_user`,
  role: `${TAG.toLowerCase()}_ui_role`,
  org: `${TAG}组织`,
}

let page
let browser
let context
let passed = 0
const failures = []
const warnings = []
const consoleErrors = []
const networkErrors = []
const serverErrors = []
const pageErrors = []

// ------------------------------------------------------------------ harness

function log(message) {
  console.log(message)
}

function section(title) {
  log(`\n${title}`)
}

async function check(name, fn) {
  await dismissOverlays(name)
  try {
    await fn()
    passed += 1
    log(`  \u2713 ${name}`)
  } catch (error) {
    const raw = error && error.message ? error.message : String(error)
    // Keep enough of Playwright's call log to identify the exact locator.
    const detail = raw.split('\n').slice(0, 5).join('\n      ').trim()
    failures.push({ name, detail })
    log(`  \u2717 ${name}\n      ${detail}`)
    await screenshot(name)
  }
}

/**
 * Guarantee a clean slate before each check: a modal left open by a previous
 * failure would otherwise swallow every later click behind its overlay.
 */
async function dismissOverlays(nextCheck) {
  if (!page) return
  let dismissed = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await isVisible(alertBox())) {
      dismissed = 'alert'
      await alertBox().getByRole('button', { name: '取消', exact: true }).click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(250)
      continue
    }
    if (await isVisible(sheet())) {
      dismissed = 'sheet'
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      continue
    }
    if (await isVisible(page.locator('.ant-popover:visible, .ant-dropdown:visible'))) {
      dismissed = 'popover'
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(250)
      continue
    }
    break
  }
  if (dismissed && nextCheck) {
    warn('Leftover overlay', `a ${dismissed} was still open before "${nextCheck}"`)
  }
}

async function isVisible(locator) {
  try {
    return (await locator.count()) > 0 && (await locator.first().isVisible())
  } catch {
    return false
  }
}

function warn(name, detail) {
  warnings.push({ name, detail })
  log(`  ! ${name}\n      ${detail}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
  }
}

let shotIndex = 0
async function screenshot(label) {
  if (!page) return
  shotIndex += 1
  const safe = label.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 60)
  try {
    await page.screenshot({ path: `${ARTIFACT_DIR}${String(shotIndex).padStart(2, '0')}-${safe}.png`, fullPage: false })
  } catch {
    /* screenshotting must never mask the real failure */
  }
}

// ------------------------------------------------------------------ helpers

// 编辑弹窗（a-modal）与确认框（Modal.confirm）
const sheet = () => page.locator('.ant-modal:not(.ant-modal-confirm):visible').last()
const alertBox = () => page.locator('.ant-modal-confirm:visible').last()

/** Resolve the control inside an a-form-item by its exact label text. */
async function controlFor(scope, labelText) {
  const id = await scope.locator('.ant-form-item-label > label').evaluateAll(
    (labels, text) =>
      labels
        .map((label) => ({
          own: (label.textContent ?? '').trim(),
          id: label.getAttribute('for'),
        }))
        .find((entry) => entry.own === text)?.id ?? null,
    labelText,
  )
  assert(id, `no form row labelled "${labelText}"`)
  return scope.locator(`[id="${id}"]`)
}

async function fillField(scope, labelText, value) {
  const control = await controlFor(scope, labelText)
  await control.fill(value)
}

/** a-select 的 id 在内部只读的搜索 input 上，点击要落在外层的选择框。 */
function selectBox(control) {
  return control.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select-selector ")][1]')
}

/** 打开表头漏斗。标题按列文字精确匹配，避免「制程」命中「工艺制程」。 */
async function openHeaderFilter(title) {
  const headers = page.locator('.ant-table-thead th')
  const count = await headers.count()
  let target = null
  for (let index = 0; index < count; index += 1) {
    const cell = headers.nth(index)
    const label = cell.locator('.ant-table-column-title')
    const text = (await label.count()) > 0 ? await label.innerText() : await cell.innerText()
    if (text.trim() === title) {
      target = cell
      break
    }
  }
  if (!target) throw new Error(`header "${title}" not found`)
  await target.locator('.ant-table-filter-trigger').click()
  const dropdown = page.locator('.ant-table-filter-dropdown').last()
  await dropdown.waitFor({ state: 'visible', timeout: 5000 })
  return dropdown
}

async function pickSelect(scope, labelText, optionText) {
  const trigger = await controlFor(scope, labelText)
  await selectBox(trigger).click()
  if ((await trigger.getAttribute('readonly')) === null) {
    await trigger.pressSequentially(optionText)
  }
  const panel = page.locator('.ant-select-dropdown:visible')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  // antd 下拉是虚拟列表，只渲染可视区域内的选项；目标不在可视区时往下滚
  const option = panel.locator('.ant-select-item-option-content', { hasText: optionText }).first()
  for (let step = 0; step < 60 && !(await option.isVisible().catch(() => false)); step += 1) {
    await panel.locator('.rc-virtual-list-holder').evaluate((holder) => {
      holder.scrollTop += 96
    })
    await page.waitForTimeout(40)
  }
  await option.click()
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
}

/** Open a select and choose its first option, returning the chosen label. */
async function pickFirstOption(scope, labelText) {
  const trigger = await controlFor(scope, labelText)
  await selectBox(trigger).click()
  const panel = page.locator('.ant-select-dropdown:visible')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  const option = panel.locator('.ant-select-item-option-content').first()
  const label = (await option.innerText()).trim()
  await option.click()
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
  return label
}

async function saveSheet() {
  await sheet().getByRole('button', { name: '保存', exact: true }).click()
  await sheet().waitFor({ state: 'hidden', timeout: 10000 })
}

async function expectToast(text) {
  const toast = page.locator('.ant-message-notice', { hasText: text })
  await toast.first().waitFor({ state: 'visible', timeout: 8000 })
}

async function confirmDelete() {
  await alertBox().waitFor({ state: 'visible', timeout: 5000 })
  await alertBox().getByRole('button', { name: '删除', exact: true }).click()
  await alertBox().waitFor({ state: 'hidden', timeout: 5000 })
}

/**
 * Cancels the open sheet. Editing sheets guard unsaved input, so a dirty form
 * raises a "放弃未保存的修改？" confirm that has to be answered before the
 * sheet actually closes; a pristine form closes straight away.
 */
async function cancelSheet() {
  await sheet().getByRole('button', { name: '取消', exact: true }).click()
  const discard = alertBox().getByRole('button', { name: '放弃修改', exact: true })
  if (await discard.isVisible({ timeout: 1500 }).catch(() => false)) {
    await discard.click()
    await alertBox().waitFor({ state: 'hidden', timeout: 5000 })
  }
  await sheet().waitFor({ state: 'hidden', timeout: 10000 })
}

/** Row locator for a table row containing the given text. */
function tableRow(text) {
  return page.locator('.ant-table-tbody tr.ant-table-row', { hasText: text })
}

async function rowAction(text, actionLabel) {
  const row = tableRow(text).first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  await row.getByRole('button', { name: actionLabel, exact: true }).click()
}

/**
 * 左侧目录树（a-tree）的行操作放在每行的「更多」下拉菜单里，按钮在悬停时出现。
 */
async function sourceListAction(text, actionLabel) {
  // 按「X 的更多操作」精确定位节点：hasText 是子串匹配，「E2E客户」会先命中「E2E客户改」
  const more = page.getByRole('button', { name: `${text} 的更多操作`, exact: true })
  const row = page.locator('.ant-tree-treenode').filter({ has: more }).first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  await row.hover()
  await row.getByRole('button', { name: `${text} 的更多操作`, exact: true }).click()
  await page.getByRole('menuitem', { name: actionLabel, exact: true }).click()
}

async function goto(path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
}

async function navTo(label) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: label, exact: true }).click()
  await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
}

// 客户、制程合并为「客户/制程」一个菜单，页面顶部用 Tab 切换
async function openCustomerProcess(tab) {
  await navTo('客户/制程')
  await page.getByRole('tab', { name: tab, exact: true }).click()
  await page.waitForURL(tab === '制程' ? '**/selection/process**' : '**/selection/customer**', { timeout: 10000 })
}

async function settle() {
  await page.waitForTimeout(SLOW ? 400 : 150)
}

// --------------------------------------------------------------------- main

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  log(`UI end-to-end regression against ${BASE_URL}\n`)

  browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW ? 120 : 0 })
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  page = await context.newPage()

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // Vite dev-server HMR noise and favicon 404s are not application errors.
    if (/favicon|\[vite\]/i.test(text)) return
    // 4xx responses are logged by the browser but several checks provoke them
    // on purpose (bad password, duplicate name); they are tracked separately.
    if (/Failed to load resource/i.test(text)) {
      networkErrors.push(text)
      return
    }
    consoleErrors.push(text)
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })

  try {
    await runLogin()
    await runCustomerCrud()
    await runProcessCrud()
    await runSensorCrud()
    await runDictionaryCrud()
    await runMachineCrud()
    await runSearch()
    await runSystemCrud()
    await runReadOnlyGuest()
    await runUiAudit()
  } finally {
    await teardown()
    await report()
  }
}

// -------------------------------------------------------------------- login

async function runLogin() {
  section('Login & shell')

  await check('The login page renders and rejects bad credentials', async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '登录', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('input[autocomplete="username"]').fill(ADMIN_USERNAME)
    await page.locator('input[autocomplete="current-password"]').fill('wrong-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    // 登录失败的原因是常驻内联错误，不是一闪而过的 Toast——用户回头看还在。
    const loginError = page.locator('.login__error')
    await loginError.waitFor({ state: 'visible', timeout: 8000 })
    assert(
      (await loginError.innerText()).includes('用户名或密码错误'),
      `unexpected login error text: ${await loginError.innerText()}`,
    )
    assert(page.url().includes('/login'), 'should stay on the login page')
  })

  await check('Signing in as admin lands on the customer page', async () => {
    await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/selection/customer**', { timeout: 20000 })
    await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
    await page.getByRole('navigation', { name: '主导航' }).waitFor({ state: 'visible' })
    // The shell mounts before BackendStorage finishes its first sync. Waiting
    // for the real source list prevents the first write from racing the
    // connecting state when the test starts with a cold API process.
    await page.locator('.entity-tree').waitFor({ state: 'visible', timeout: 20000 })
  })

  await check('The shell shows no offline or session banner when the backend is reachable', async () => {
    await settle()
    const banner = page.locator('.shell-banner')
    assertEqual(await banner.count(), 0, 'unexpected shell banner')
  })

  await check('Admin sees both the business and the system nav groups', async () => {
    const nav = page.getByRole('navigation', { name: '主导航' })
    for (const label of ['客户/制程', '机型结构', 'Sensor型号', '数据字典']) {
      assert(await nav.getByRole('link', { name: label, exact: true }).isVisible(), `missing nav item ${label}`)
    }
    for (const label of ['用户管理', '角色管理', '组织架构', '操作日志']) {
      assert(await nav.getByRole('link', { name: label, exact: true }).isVisible(), `missing system nav item ${label}`)
    }
  })

  await check('The sidebar is fixed: no collapse toggle, no menu icons, no Ctrl+K', async () => {
    const sider = page.locator('.app-shell__sider')
    assert(await sider.isVisible(), 'desktop sidebar should always be visible')
    assert(
      !((await sider.getAttribute('class')) ?? '').includes('ant-layout-sider-collapsed'),
      'desktop sidebar should never be collapsed',
    )
    assertEqual(await page.locator('[aria-controls="app-sidebar"]').count(), 0, 'desktop shell should have no sidebar toggle')
    assertEqual(await sider.locator('.ant-menu-item svg, .ant-menu-item-icon').count(), 0, 'nav items should have no icons')
    assertEqual(await page.locator('.app-shell__header kbd').count(), 0, 'search should show no shortcut hint')
    // 品牌与分组标题左对齐，菜单项比分组标题缩进一级；分组标题与菜单项同字号、加粗，不重复品牌名
    const nav = await page.evaluate(() => {
      const textX = (el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return Math.round(range.getBoundingClientRect().x)
      }
      const titles = [...document.querySelectorAll('.app-shell__sider .ant-menu-item-group-title')]
      return {
        brand: Math.round(document.querySelector('.app-shell__sider .app-nav__brand > *').getBoundingClientRect().x),
        titles: titles.map(textX),
        items: [...document.querySelectorAll('.app-shell__sider .ant-menu-title-content > a')].map(textX),
        titleFont: titles.map((t) => [getComputedStyle(t).fontSize, getComputedStyle(t).fontWeight]),
        itemWeights: [...document.querySelectorAll('.app-shell__sider .ant-menu-title-content > a')].map((a) => getComputedStyle(a).fontWeight),
        itemSize: getComputedStyle(document.querySelector('.app-shell__sider .ant-menu-item')).fontSize,
        labels: titles.map((t) => t.textContent.trim()),
      }
    })
    assertEqual(new Set([nav.brand, ...nav.titles]).size, 1, `brand and group headings are not aligned: ${JSON.stringify(nav)}`)
    assertEqual(new Set(nav.items).size, 1, `menu items are not aligned: ${JSON.stringify(nav)}`)
    assert(nav.items[0] - nav.brand >= 12, `menu items should be indented under the group headings: ${JSON.stringify(nav)}`)
    assert(!nav.labels.includes('感应器选型'), 'group heading repeats the brand name')
    assert(
      nav.titleFont.every(([size, weight]) => size === nav.itemSize && Number(weight) >= 600),
      `group headings should match the item size and be bold: ${JSON.stringify(nav)}`,
    )
    assert(nav.itemWeights.every((w) => Number(w) < 600), `only group headings should be bold: ${JSON.stringify(nav)}`)
    await page.keyboard.press('Control+k')
    assert(
      (await page.evaluate(() => document.activeElement?.id)) !== 'global-search-input',
      'Ctrl+K should no longer focus the global search',
    )
  })

  await check('The app stays in light mode with no theme switcher', async () => {
    const root = page.locator('html')
    assertEqual(await root.getAttribute('data-theme'), null, 'dark theme attribute should be absent')
    assertEqual(await page.getByRole('radio', { name: '深色' }).count(), 0, 'dark mode switch should be gone')
    assertEqual(await page.getByRole('radio', { name: '浅色' }).count(), 0, 'light mode switch should be gone')
    assertEqual(await page.getByLabel('外观').count(), 0, 'toolbar appearance switch should be gone')
  })
}

// ----------------------------------------------------------------- customer

async function runCustomerCrud() {
  section('Customer module CRUD')

  await openCustomerProcess('客户')

  // 客户目录是「客户 → 厂区」：先建客户（分组），再在客户下建厂区（叶子，带区域），资料挂在厂区上
  await check('Creating a customer (客户) works', async () => {
    await page.getByRole('button', { name: '新建客户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新建客户', 'sheet title')
    await fillField(sheet(), '客户名称', NAMES.customer)
    await saveSheet()
    await expectToast('客户已新增')
    await page.locator('.ant-tree-node-content-wrapper', { hasText: NAMES.customer }).first().waitFor({ state: 'visible' })
  })

  await check('A duplicate customer name is rejected', async () => {
    await page.getByRole('button', { name: '新建客户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '客户名称', NAMES.customer)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('该客户已存在')
    await cancelSheet()
  })

  await check('An empty customer name is rejected', async () => {
    await page.getByRole('button', { name: '新建客户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请检查标红的必填项')
    await cancelSheet()
  })

  await check('A site name containing "/" is rejected', async () => {
    await sourceListAction(NAMES.customer, '新建厂区')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '厂区名称', '华/东')
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await sheet().getByText('厂区名称不能包含“/”').waitFor({ state: 'visible' })
    await cancelSheet()
  })

  await check('A site without a region is rejected', async () => {
    await sourceListAction(NAMES.customer, '新建厂区')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '厂区名称', NAMES.site)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await sheet().getByText('请选择区域').waitFor({ state: 'visible' })
    await cancelSheet()
  })

  await check('Creating a site with a region inside the customer works', async () => {
    await sourceListAction(NAMES.customer, '新建厂区')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新建厂区', 'sheet title')
    await fillField(sheet(), '厂区名称', NAMES.site)
    const region = await pickFirstOption(sheet(), '区域')
    await saveSheet()
    await expectToast('厂区已新增')
    await page.locator('.ant-tree-node-content-wrapper', { hasText: NAMES.site }).first().waitFor({ state: 'visible' })
    // 树上厂区那一行带着它的区域
    await page
      .locator(`.entity-tree__node[data-item="${NAMES.site}"] .entity-tree__tag`, { hasText: region })
      .waitFor({ state: 'visible' })
  })

  await check('Selecting the site opens its four tabs', async () => {
    await page.locator('.ant-tree-node-content-wrapper', { hasText: NAMES.site }).first().click()
    await settle()
    const url = new URL(page.url())
    assertEqual(url.searchParams.get('category'), NAMES.customer, 'selected customer in URL')
    assertEqual(url.searchParams.get('item'), NAMES.site, 'selected site in URL')
    for (const tab of ['客户通用要求', '制程注意事项', '感应器选用标准', '厂外反馈问题项']) {
      await page.getByRole('tab', { name: tab }).waitFor({ state: 'visible', timeout: 8000 })
    }
  })

  await check('客户通用要求: the category filter lives in the column header', async () => {
    await page.getByRole('tab', { name: '客户通用要求' }).click()
    await settle()
    assertEqual(
      await page.locator('[aria-label="要求分类筛选"]').count(),
      0,
      'toolbar category filter should be gone',
    )
    const dropdown = await openHeaderFilter('要求分类')
    await dropdown.getByRole('button', { name: '确定', exact: true }).waitFor({ state: 'visible' })
    await dropdown.getByRole('button', { name: '重置', exact: true }).waitFor({ state: 'visible' })
    // 漏斗不吃 Escape。确定会套用当前勾选并关掉面板；这里没改勾选，等于原样关闭。
    await dropdown.getByRole('button', { name: '确定', exact: true }).click()
    await dropdown.waitFor({ state: 'hidden', timeout: 5000 })
  })

  // ---- 客户通用要求
  await check('客户通用要求: create a requirement', async () => {
    await page.getByRole('tab', { name: '客户通用要求' }).click()
    await settle()
    await page.getByRole('button', { name: '新增要求', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增要求', 'sheet title')
    await fillField(sheet(), '适用机型', 'ALL')
    await fillField(sheet(), '要求内容', `${TAG} 要求内容 A`)
    await fillField(sheet(), '备注', `${TAG} 备注`)
    await saveSheet()
    await expectToast('要求已新增')
    await tableRow(`${TAG} 要求内容 A`).first().waitFor({ state: 'visible' })
  })

  await check('客户通用要求: a requirement without content is rejected', async () => {
    await page.getByRole('button', { name: '新增要求', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请检查标红的必填项')
    await cancelSheet()
  })

  await check('客户通用要求: edit the requirement', async () => {
    await rowAction(`${TAG} 要求内容 A`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑要求', 'sheet title')
    await fillField(sheet(), '要求内容', `${TAG} 要求内容 B`)
    await saveSheet()
    await expectToast('要求已更新')
    await tableRow(`${TAG} 要求内容 B`).first().waitFor({ state: 'visible' })
    assertEqual(await tableRow(`${TAG} 要求内容 A`).count(), 0, 'old content still present')
  })

  await check('客户通用要求: the search box filters rows', async () => {
    const search = page.getByPlaceholder('搜索要求')
    await search.fill('绝对不存在的关键词')
    await settle()
    assertEqual(await tableRow(`${TAG} 要求内容 B`).count(), 0, 'row should be filtered out')
    await page.locator('.ant-table-wrapper', { hasText: '没有匹配的要求记录' }).waitFor({ state: 'visible' })
    await search.fill(`${TAG} 要求内容 B`)
    await settle()
    await tableRow(`${TAG} 要求内容 B`).first().waitFor({ state: 'visible' })
    await search.fill('')
    await settle()
  })

  await check('客户通用要求: delete the requirement', async () => {
    await rowAction(`${TAG} 要求内容 B`, '删除')
    await confirmDelete()
    await expectToast('要求已删除')
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      `${TAG} 要求内容 B`,
      { timeout: 8000 },
    )
  })

  await check('客户通用要求: cancelling a delete keeps the row', async () => {
    await page.getByRole('button', { name: '新增要求', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '要求内容', `${TAG} 保留项`)
    await saveSheet()
    await expectToast('要求已新增')
    await rowAction(`${TAG} 保留项`, '删除')
    await alertBox().waitFor({ state: 'visible' })
    await alertBox().getByRole('button', { name: '取消', exact: true }).click()
    await alertBox().waitFor({ state: 'hidden' })
    await settle()
    assertEqual(await tableRow(`${TAG} 保留项`).count(), 1, 'row should still exist after cancelling')
    await rowAction(`${TAG} 保留项`, '删除')
    await confirmDelete()
    await expectToast('要求已删除')
  })

  // ---- 制程注意事项
  await check('制程注意事项: create, edit and delete a note', async () => {
    await page.getByRole('tab', { name: '制程注意事项' }).click()
    await settle()
    await page.getByRole('button', { name: '新增注意事项', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '制程作用', `${TAG} 制程作用`)
    await fillField(sheet(), '制程特性', `${TAG} 制程特性`)
    await saveSheet()
    await expectToast('注意事项已新增')
    await tableRow(`${TAG} 制程作用`).first().waitFor({ state: 'visible' })

    await rowAction(`${TAG} 制程作用`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '制程作用', `${TAG} 制程作用改`)
    await saveSheet()
    await expectToast('注意事项已更新')
    await tableRow(`${TAG} 制程作用改`).first().waitFor({ state: 'visible' })

    await rowAction(`${TAG} 制程作用改`, '删除')
    await confirmDelete()
    await expectToast('注意事项已删除')
  })

  // ---- 厂外反馈问题项
  await check('厂外反馈问题项: create, edit and delete a feedback item', async () => {
    await page.getByRole('tab', { name: '厂外反馈问题项' }).click()
    await settle()
    await page.getByRole('button', { name: '新增反馈', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '适用机型', 'ALL')
    await fillField(sheet(), '问题点', `${TAG} 问题点`)
    await fillField(sheet(), '改善对策', `${TAG} 对策`)
    await saveSheet()
    await expectToast('反馈已新增')
    await tableRow(`${TAG} 问题点`).first().waitFor({ state: 'visible' })

    await rowAction(`${TAG} 问题点`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '问题点', `${TAG} 问题点改`)
    await saveSheet()
    await expectToast('反馈已更新')
    await tableRow(`${TAG} 问题点改`).first().waitFor({ state: 'visible' })

    await rowAction(`${TAG} 问题点改`, '删除')
    await confirmDelete()
    await expectToast('反馈已删除')
  })

  await check('感应器选用标准 tab renders its upload surface', async () => {
    await page.getByRole('tab', { name: '感应器选用标准' }).click()
    await settle()
    assert(await page.locator('.selection-panel').first().isVisible(), 'panel not visible')
  })

  await check('Renaming the site keeps its data', async () => {
    // 先确认选中的确实是测试厂区，否则会把测试数据写进真实客户（前面步骤失败时页面停在第一个客户）
    const selected = new URL(page.url()).searchParams
    assertEqual(selected.get('category'), NAMES.customer, 'selected customer before writing')
    assertEqual(selected.get('item'), NAMES.site, 'selected site before writing')
    await page.getByRole('tab', { name: '客户通用要求' }).click()
    await settle()
    await page.getByRole('button', { name: '新增要求', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '要求内容', `${TAG} 跟随改名`)
    await saveSheet()
    await expectToast('要求已新增')

    await sourceListAction(NAMES.site, '编辑厂区')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '厂区名称', `${NAMES.site}改`)
    await saveSheet()
    await expectToast('厂区已更新')
    await page.locator('.ant-tree-node-content-wrapper', { hasText: `${NAMES.site}改` }).first().waitFor({ state: 'visible' })
    await settle()
    await tableRow(`${TAG} 跟随改名`).first().waitFor({ state: 'visible' })
    // rename back so the rest of the run uses a stable name
    await sourceListAction(`${NAMES.site}改`, '编辑厂区')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '厂区名称', NAMES.site)
    await saveSheet()
    await expectToast('厂区已更新')
  })

  await check('Renaming the customer keeps its sites and data', async () => {
    await sourceListAction(NAMES.customer, '编辑客户')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '客户名称', `${NAMES.customer}改`)
    await saveSheet()
    await expectToast('客户已更新')
    await page.locator('.ant-tree-node-content-wrapper', { hasText: `${NAMES.customer}改` }).first().waitFor({ state: 'visible' })
    await settle()
    assertEqual(new URL(page.url()).searchParams.get('category'), `${NAMES.customer}改`, 'selection follows the rename')
    await tableRow(`${TAG} 跟随改名`).first().waitFor({ state: 'visible' })
    await sourceListAction(`${NAMES.customer}改`, '编辑客户')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '客户名称', NAMES.customer)
    await saveSheet()
    await expectToast('客户已更新')
  })

  await check('A customer that still has sites cannot be deleted', async () => {
    // 删除项直接禁用并写明原因，不用点了确认才被拒
    const more = page.getByRole('button', { name: `${NAMES.customer} 的更多操作`, exact: true })
    await more.click()
    const remove = page.getByRole('menuitem', { name: '删除客户（下面还有内容）', exact: true })
    await remove.waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await remove.getAttribute('aria-disabled'), 'true', 'delete customer is not disabled')
    await more.click()
    await remove.waitFor({ state: 'hidden', timeout: 8000 })
  })
}

// ------------------------------------------------------------------ process

async function runProcessCrud() {
  section('Process module CRUD')
  await openCustomerProcess('制程')

  await check('工艺制程: create a step', async () => {
    await page.getByRole('tab', { name: '工艺制程' }).click()
    await settle()
    await page.getByRole('button', { name: '新增工艺制程', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增工艺制程', 'sheet title')
    // Re-picking the option that is already selected must still close the panel.
    const layer = await pickFirstOption(sheet(), '制程')
    await pickSelect(sheet(), '制程', layer)
    await fillField(sheet(), '工艺制程', NAMES.processStep)
    await fillField(sheet(), '作用', `${TAG} 作用`)
    await saveSheet()
    await expectToast(/工艺制程已新增|已新增/)
    await tableRow(NAMES.processStep).first().waitFor({ state: 'visible' })
  })

  await check('工艺制程: edit the step', async () => {
    await rowAction(NAMES.processStep, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑工艺制程', 'sheet title')
    await fillField(sheet(), '备注', `${TAG} 备注改`)
    await saveSheet()
    await tableRow(NAMES.processStep).first().waitFor({ state: 'visible' })
    assert(
      (await tableRow(NAMES.processStep).first().innerText()).includes(`${TAG} 备注改`),
      'edited note not shown in the row',
    )
  })

  await check('工艺制程: delete the step', async () => {
    await rowAction(NAMES.processStep, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      NAMES.processStep,
      { timeout: 8000 },
    )
  })

  await check('制程介绍 tab renders', async () => {
    await page.getByRole('tab', { name: '制程介绍' }).click()
    await settle()
    assert(await page.locator('.selection-panel, .selection-page').first().isVisible(), 'panel not visible')
  })
}

// ------------------------------------------------------------------- sensor

async function runSensorCrud() {
  section('Sensor catalogue CRUD')
  await navTo('Sensor型号')

  await check('Sensor: create a model', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增 Sensor 型号', 'sheet title')
    await fillField(sheet(), '料号', `${TAG}-PN-001`)
    await fillField(sheet(), '品牌', `${TAG}Brand`)
    await fillField(sheet(), '型号', NAMES.sensorModel)
    await fillField(sheet(), '规格参数', `${TAG} 规格`)
    // 默认类型是漫反射，底下已有备选；新建现用会让删除被禁用。改选没有备选的类型。
    await pickSelect(sheet(), '感应器类型', '04 光纤式')
    await saveSheet()
    await expectToast('型号已新增')
    await tableRow(NAMES.sensorModel).first().waitFor({ state: 'visible' })
  })

  await check('Sensor: a duplicate model is rejected', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '型号', NAMES.sensorModel)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('该型号已存在，请使用不同的型号名称')
    await cancelSheet()
  })

  await check('Sensor: a model without a name is rejected', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请检查标红的必填项')
    await cancelSheet()
  })

  await check('Sensor: edit the model', async () => {
    await rowAction(NAMES.sensorModel, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑 Sensor 型号', 'sheet title')
    await fillField(sheet(), '适用场景', `${TAG} 场景`)
    await saveSheet()
    await expectToast('型号已更新')
  })

  await check('Sensor: the search box filters the catalogue', async () => {
    const search = page.getByPlaceholder('搜索型号')
    await search.fill(NAMES.sensorModel)
    await settle()
    await tableRow(NAMES.sensorModel).first().waitFor({ state: 'visible' })
    // 默认是「全部」。命中任一成员会展开整组：备选和组内停用都带 sensor-row--alternate。
    // 不带这个 class 的是组头、单独的现用，以及落单的备选或停用。
    const rows = page.locator('.ant-table-tbody tr.ant-table-row')
    const parentRows = page.locator('.ant-table-tbody tr.ant-table-row:not(.sensor-row--alternate)')
    const alternateRows = page.locator('.ant-table-tbody tr.ant-table-row.sensor-row--alternate')
    const parentCount = await parentRows.count()
    const extra = (await rows.count()) - parentCount
    assertEqual(parentCount, 1, 'search should narrow the table to one parent row')
    assertEqual(await alternateRows.count(), extra, 'extra rows must carry sensor-row--alternate')
    await search.fill('')
    await settle()
  })

  await check('Sensor: the status filter switches the visible set', async () => {
    // 状态在表头漏斗里。勾选停用后点确定；重置只清勾选，要点确定才生效。
    const dropdown = await openHeaderFilter('状态')
    await dropdown.locator('.ant-dropdown-menu-item', { hasText: '停用' }).click()
    await dropdown.getByRole('button', { name: '确定', exact: true }).click()
    await dropdown.waitFor({ state: 'hidden', timeout: 5000 })
    await settle()
    assertEqual(await tableRow(NAMES.sensorModel).count(), 0, 'a 现用 model must not show under 停用')

    const again = await openHeaderFilter('状态')
    await again.getByRole('button', { name: '重置', exact: true }).click()
    await again.getByRole('button', { name: '确定', exact: true }).click()
    await again.waitFor({ state: 'hidden', timeout: 5000 })
    await settle()
    await tableRow(NAMES.sensorModel).first().waitFor({ state: 'visible' })
  })

  await check('Sensor: delete the model', async () => {
    await rowAction(NAMES.sensorModel, '删除')
    await confirmDelete()
    await expectToast('型号已删除')
  })
}

// --------------------------------------------------------------- dictionary

async function runDictionaryCrud() {
  section('Dictionary CRUD')
  await navTo('数据字典')

  await check('Dictionary: create an entry', async () => {
    await page.getByRole('button', { name: '新增字典项', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '字典项名称', NAMES.dictItem)
    await saveSheet()
    await expectToast('字典项已新增')
    await tableRow(NAMES.dictItem).first().waitFor({ state: 'visible' })
  })

  await check('Dictionary: a duplicate entry is rejected', async () => {
    await page.getByRole('button', { name: '新增字典项', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '字典项名称', NAMES.dictItem)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('该字典项名称已存在')
    await cancelSheet()
  })

  await check('Dictionary: edit the entry', async () => {
    await rowAction(NAMES.dictItem, '编辑字典项')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '字典项名称', `${NAMES.dictItem}改`)
    await saveSheet()
    await expectToast('字典项已更新')
    await tableRow(`${NAMES.dictItem}改`).first().waitFor({ state: 'visible' })
  })

  await check('Dictionary: delete the entry', async () => {
    await rowAction(`${NAMES.dictItem}改`, '删除字典项')
    await confirmDelete()
    await expectToast('字典项已删除')
  })
}

// ------------------------------------------------------------------ machine

async function runMachineCrud() {
  section('Machine structure CRUD')
  await navTo('机型结构')

  await check('Machine: create a category and a machine', async () => {
    await page.getByRole('button', { name: '新建分类', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '分类名称', NAMES.machineCategory)
    await saveSheet()
    await expectToast('分类已新增')

    // 结构目录标题栏只有「新建分类 / 新建配置」，机型从分类的「更多」菜单里建
    await page.getByPlaceholder('搜索分类或机型…').fill(NAMES.machineCategory)
    await settle()
    await sourceListAction(NAMES.machineCategory, '新建机型')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '机型名称', NAMES.machine)
    await saveSheet()
    await expectToast('机型已新增')
    await page.getByPlaceholder('搜索分类或机型…').fill(NAMES.machine)
    await settle()
    await page.locator('.ant-tree-node-content-wrapper', { hasText: NAMES.machine }).first().waitFor({ state: 'visible' })
  })

  // 机型 Tab 是结构目录共用的容器。机型（最末一层）没有二级 Tab：每个一级 Tab 下直接是它的表格；
  // 新建二级 Tab 的界面已经去掉，没有子选单的分类 / 配置只提示从左侧选机型目录项。

  async function addTab(name, kind) {
    // antd 会在溢出菜单里另渲染一个隐藏的「+」，只点看得见的那个
    await page.locator('.machine-section-tabs .ant-tabs-nav-add:visible, button:has-text("新建 Tab")').first().click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), 'Tab 名称', name)
    await pickSelect(sheet(), 'Tab 类型', kind)
    await saveSheet()
    await expectToast('Tab 已新建')
  }

  await check('Machine: create shared structure and notes tabs', async () => {
    await addTab(`${TAG}机构`, '结构')
    await addTab(`${TAG}注意事项`, '机型注意事项')
    assert(await page.getByRole('tab', { name: new RegExp(`^${TAG}机构`) }).isVisible(), 'structure tab missing')
    assert(await page.getByRole('tab', { name: new RegExp(`^${TAG}注意事项`) }).isVisible(), 'notes tab missing')
  })

  await check('Machine: a machine shows its own table under a tab, without second-level tabs', async () => {
    // 新建的机型仍选中，新建的 Tab 也已选中
    await page.locator('.ant-tabs-tab-active', { hasText: `${TAG}注意事项` }).waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText(`「${NAMES.machine}」在「${TAG}注意事项」下还没有`).first().waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await page.locator('.machine-sub-tabs').count(), 0, 'a machine shows second-level tabs')
    assertEqual(await page.locator('button[aria-label="新建二级 Tab"]').count(), 0, 'a machine offers new second-level tab')
    // 右侧最上方是选中节点的路径
    const path = await page.locator('.machine-node-path').innerText()
    assert(path.includes(NAMES.machineCategory) && path.includes(NAMES.machine), `node path is ${path}`)
  })

  // 注意事项 Tab 下的内容是纯文本事项；结构 Tab 另外要求关联传感器。
  await check('Machine: create, edit and delete a 注意事项 row', async () => {
    await page.getByRole('button', { name: '新增事项', exact: true }).first().click()
    await sheet().waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增事项', 'sheet title')
    await fillField(sheet(), '注意分类', `${TAG}分类`)
    await fillField(sheet(), '事项名称', `${TAG}事项`)
    await fillField(sheet(), '说明', `${TAG}说明`)
    await saveSheet()
    await expectToast('记录已新增')
    await tableRow(`${TAG}事项`).first().waitFor({ state: 'visible', timeout: 8000 })

    await rowAction(`${TAG}事项`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑事项', 'sheet title')
    await fillField(sheet(), '事项名称', `${TAG}事项改`)
    await saveSheet()
    await expectToast('记录已更新')
    await tableRow(`${TAG}事项改`).first().waitFor({ state: 'visible', timeout: 8000 })

    await rowAction(`${TAG}事项改`, '删除')
    await confirmDelete()
    await expectToast('记录已删除')
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      `${TAG}事项改`,
      { timeout: 8000 },
    )
  })

  await check('Machine: a structure row requires an associated sensor', async () => {
    await page.getByRole('tab', { name: new RegExp(`^${TAG}机构`) }).click()
    await page.locator('.ant-tabs-tab-active', { hasText: `${TAG}机构` }).waitFor({ state: 'visible', timeout: 8000 })
    await page.getByRole('button', { name: '新增选型', exact: true }).first().click()
    await sheet().waitFor({ state: 'visible', timeout: 8000 })
    await fillField(sheet(), 'Sensor名称', `${TAG}作用`)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请检查标红的必填项')
    await sheet().getByText('请选择关联传感器').waitFor({ state: 'visible' })
    await cancelSheet()
  })

  await check('Machine: signed-in users always see tree checkboxes for the report', async () => {
    await page.locator('.entity-tree .ant-tree-checkbox').first().waitFor({ state: 'visible', timeout: 8000 })
    const reportMenu = page.getByRole('button', { name: '报告操作', exact: true })
    await reportMenu.click()
    for (const label of ['全选', '清空']) {
      await page.getByRole('menuitem', { name: label, exact: true }).waitFor({ state: 'visible', timeout: 8000 })
    }
    assertEqual(await page.getByRole('menuitem', { name: '选择机型', exact: true }).count(), 0, 'no separate choosing mode')
    // 下拉菜单是点击触发的，Esc 收不起来：再点一次按钮收起，等收起动画结束再进下一项
    await reportMenu.click()
    await page.locator('.ant-dropdown:visible').first().waitFor({ state: 'hidden', timeout: 8000 })
  })

  // 新建二级 Tab 的界面已经去掉：没有子选单的分类在一级 Tab 下提示从左侧选机型目录项
  await check('Machine: an empty category points to directory items, with no second-level tab entry', async () => {
    await page.getByRole('button', { name: '新建分类', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '分类名称', NAMES.machineLeafCategory)
    await saveSheet()
    await expectToast('分类已新增')
    await page.getByPlaceholder('搜索分类或机型…').fill(NAMES.machineLeafCategory)
    await settle()
    await page.locator(`.entity-tree__node[data-node-kind="group"][data-category="${NAMES.machineLeafCategory}"]`).first().click()
    await page.waitForURL((url) => decodeURIComponent(String(url)).includes(`category=${NAMES.machineLeafCategory}`), { timeout: 8000 })
    // 换选单节点时留在当前一级 Tab（这次运行自己的「E2E机构」）
    await page.locator('.ant-tabs-tab-active', { hasText: `${TAG}机构` }).waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('请从左侧配置中选择机型目录项').waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await page.locator('button[aria-label="新建二级 Tab"]').count(), 0, 'an empty category offers new second-level tab')
    assertEqual(await page.locator('.machine-sub-tabs').count(), 0, 'an empty category shows second-level tabs')
  })

  await check('Machine: a menu node with sub-menus shows no second-level tabs', async () => {
    await page.goto(`${BASE_URL}/selection/machine?category=${encodeURIComponent(NAMES.machineCategory)}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByText(`「${NAMES.machineCategory}」下有子选单`).waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await page.locator('.machine-sub-tabs').count(), 0, 'second-level tabs shown for a branch')
  })
}

// ------------------------------------------------------------------- search

async function runSearch() {
  section('Global search')

  await check('Global search finds the machine created by this run', async () => {
    const search = page.getByRole('search').getByRole('textbox', { name: '全局搜索' })
    await search.fill(NAMES.machine)
    await search.press('Enter')
    await page.waitForURL('**/selection/search**', { timeout: 10000 })
    await settle()
    const body = await page.locator('.app-shell__content').innerText()
    assert(body.includes(NAMES.machine), 'search results do not mention the machine')
  })

  await check('An empty search query warns instead of navigating', async () => {
    await openCustomerProcess('客户')
    const search = page.getByRole('search').getByRole('textbox', { name: '全局搜索' })
    await search.fill('   ')
    await search.press('Enter')
    await expectToast('请输入搜索关键词')
    assert(!page.url().includes('/selection/search'), 'should not navigate on an empty query')
    await search.fill('')
  })
}

// ------------------------------------------------------------------- system

async function runSystemCrud() {
  section('System management CRUD')

  // ---- users
  await navTo('用户管理')

  await check('User: create', async () => {
    await page.getByRole('button', { name: '新增用户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增用户', 'sheet title')
    await fillField(sheet(), '用户名', NAMES.user)
    await fillField(sheet(), '初始密码', 'e2epass')
    await fillField(sheet(), '显示名', `${TAG} 界面用户`)
    await saveSheet()
    await tableRow(NAMES.user).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('User: a duplicate username is rejected', async () => {
    await page.getByRole('button', { name: '新增用户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '用户名', NAMES.user)
    await fillField(sheet(), '初始密码', 'e2epass')
    await fillField(sheet(), '显示名', 'dup')
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await page.locator('.ant-message-notice').first().waitFor({ state: 'visible', timeout: 8000 })
    assert(await sheet().isVisible(), 'the sheet should stay open after a rejected save')
    await cancelSheet()
  })

  await check('User: edit the display name', async () => {
    await rowAction(NAMES.user, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑用户', 'sheet title')
    await fillField(sheet(), '显示名', `${TAG} 界面用户改`)
    await saveSheet()
    await settle()
    assert(
      (await tableRow(NAMES.user).first().innerText()).includes(`${TAG} 界面用户改`),
      'display name not updated in the table',
    )
  })

  await check('User: reset the password', async () => {
    await rowAction(NAMES.user, '重置密码')
    await sheet().waitFor({ state: 'visible' })
    const passwordTitle = await sheet().locator('.ant-modal-title').innerText()
    assert(passwordTitle.includes(NAMES.user) && passwordTitle.startsWith('重置 '), `sheet title ${passwordTitle}`)
    await fillField(sheet(), '新密码', 'newpass1')
    await saveSheet()
    await settle()
  })

  await check('User: delete', async () => {
    await rowAction(NAMES.user, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      NAMES.user,
      { timeout: 10000 },
    )
  })

  // ---- roles
  await navTo('角色管理')

  await check('Role: create with permissions', async () => {
    await page.getByRole('button', { name: '新增角色', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新增角色', 'sheet title')
    await fillField(sheet(), '角色标识', NAMES.role)
    await fillField(sheet(), '角色名称', `${TAG} 界面角色`)
    await fillField(sheet(), '描述', `${TAG} 自动化创建`)
    await sheet().locator('.permission-group .ant-row .ant-checkbox-wrapper').first().click()
    await saveSheet()
    await tableRow(NAMES.role).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Role: edit the name', async () => {
    await rowAction(NAMES.role, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑角色', 'sheet title')
    await fillField(sheet(), '角色名称', `${TAG} 界面角色改`)
    await saveSheet()
    await settle()
    assert(
      (await tableRow(NAMES.role).first().innerText()).includes(`${TAG} 界面角色改`),
      'role name not updated in the table',
    )
  })

  await check('Role: the built-in admin role explains why it cannot be deleted', async () => {
    const adminRow = page.locator('.ant-table-tbody tr.ant-table-row', { hasText: '系统内置' }).first()
    await adminRow.waitFor({ state: 'visible' })
    // 内置角色的删除按钮禁用，原因写在 tooltip 里
    const remove = adminRow.getByRole('button', { name: '删除', exact: true })
    assertEqual(await remove.count(), 1, 'the system role should still show its delete action')
    assert(await remove.isDisabled(), 'the system role must not expose an enabled delete button')
  })

  await check('Role: delete', async () => {
    await rowAction(NAMES.role, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      NAMES.role,
      { timeout: 10000 },
    )
  })

  // ---- org units
  await navTo('组织架构')

  await check('Org: create a root unit', async () => {
    await page.getByRole('button', { name: '新建组织', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '新建组织', 'sheet title')
    await fillField(sheet(), '组织名称', NAMES.org)
    // 层级由位置决定，只显示不让选：顶层是事业部
    assertEqual((await sheet().locator('.ant-tag').innerText()).trim(), '事业部', 'root level')
    await saveSheet()
    await tableRow(NAMES.org).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Org: create a child unit', async () => {
    await rowAction(NAMES.org, '新建子节点')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '组织名称', `${NAMES.org}子`)
    assertEqual((await sheet().locator('.ant-tag').innerText()).trim(), '部门', 'child level')
    await saveSheet()
    await tableRow(`${NAMES.org}子`).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Org: a unit with children cannot be deleted', async () => {
    // 有下级组织时删除按钮保留但禁用，原因写在 tooltip 里
    const remove = tableRow(NAMES.org).first().getByRole('button', { name: '删除', exact: true })
    assert(await remove.isDisabled(), 'delete must be disabled while the unit has children')
    await remove.hover({ force: true })
    await page
      .locator('.ant-tooltip:visible', { hasText: '下面还有下级组织，请先删除下级组织' })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
    await page.mouse.move(0, 0)
    assert((await tableRow(NAMES.org).count()) > 0, 'the parent must survive')
  })

  await check('Org: edit the child then delete both', async () => {
    await rowAction(`${NAMES.org}子`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.ant-modal-title').innerText(), '编辑组织', 'sheet title')
    await fillField(sheet(), '组织名称', `${NAMES.org}子改`)
    await saveSheet()
    await tableRow(`${NAMES.org}子改`).first().waitFor({ state: 'visible', timeout: 10000 })

    await rowAction(`${NAMES.org}子改`, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      `${NAMES.org}子改`,
      { timeout: 10000 },
    )
    await rowAction(NAMES.org, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row')).some((row) => row.innerText.includes(text)),
      NAMES.org,
      { timeout: 10000 },
    )
  })

  // ---- audit log
  await check('Audit log lists the operations from this run', async () => {
    await navTo('操作日志')
    await settle()
    await page.locator('.ant-table-tbody tr.ant-table-row').first().waitFor({ state: 'visible', timeout: 10000 })
    // The table renders friendly Chinese labels, not the raw action codes.
    const body = await page.locator('.app-shell__content').innerText()
    assert(/创建用户|创建角色|创建组织|写入数据|登录/.test(body), `no audit rows from this run: ${body.slice(0, 200)}`)
    assert(body.includes(ADMIN_USERNAME), 'audit rows do not mention the acting user')
  })

  await check('Audit log searches changes and shows each field before and after', async () => {
    await page.getByRole('textbox', { name: '搜索操作日志' }).fill(TAG)
    await settle()
    const row = page.locator('.ant-table-tbody tr.ant-table-row').first()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    const summary = await row.innerText()
    assert(/新增|修改|删除/.test(summary), `no change summary for this run: ${summary.slice(0, 200)}`)
    await row.click()
    const drawer = page.locator('.ant-drawer-content')
    await drawer.waitFor({ state: 'visible', timeout: 8000 })
    await drawer.locator('.audit-diff').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden', timeout: 8000 })
    await page.getByRole('button', { name: '重置筛选' }).click()
    await settle()
  })
}

// ---------------------------------------------------------------- read-only

async function runReadOnlyGuest() {
  section('Guest read-only mode')

  await check('Signing out drops back to the read-only customer page', async () => {
    await page.locator('.user-menu__trigger').click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    await page.waitForURL('**/selection/customer**', { timeout: 15000 })
    await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
    await settle()
    assert(await page.getByRole('button', { name: '登录', exact: true }).isVisible(), 'no sign-in affordance after logout')
  })

  await check('A signed-out visitor can still read business data but sees no write controls', async () => {
    await page.locator('.entity-tree').waitFor({ state: 'visible', timeout: 10000 })
    for (const label of ['新建厂区', '新建客户', '新增要求']) {
      assertEqual(
        await page.getByRole('button', { name: label, exact: true }).count(),
        0,
        `guest must not see the "${label}" button`,
      )
    }
  })

  await check('A signed-out visitor does not see the system management nav group', async () => {
    const nav = page.getByRole('navigation', { name: '主导航' })
    for (const label of ['用户管理', '角色管理', '组织架构', '操作日志']) {
      assertEqual(await nav.getByRole('link', { name: label, exact: true }).count(), 0, `guest sees ${label}`)
    }
  })

  await check('A signed-out visitor is redirected away from a system route', async () => {
    await goto('/system/user')
    await settle()
    assert(!page.url().includes('/system/user'), `an unauthenticated visitor reached ${page.url()}`)
  })

  await check('An unknown route renders the not-found page', async () => {
    await goto('/definitely/not/a/route')
    await settle()
    const body = await page.locator('body').innerText()
    assert(/未找到|返回客户\/制程/.test(body), 'not-found page did not render')
  })
}

// ----------------------------------------------------------------- ui audit

async function runUiAudit() {
  section('UI details: fonts, spacing, hit targets, focus, overflow')

  // sign back in so the audit covers the full authenticated UI
  await goto('/login')
  await page.locator('input[autocomplete="username"]').fill(ADMIN_USERNAME)
  await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/selection/customer**', { timeout: 20000 })
  await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await settle()

  await check('Body text uses the ant-design-vue system font stack', async () => {
    // 不再额外加载 Web 字体，直接用 antd 默认的系统字体栈
    const family = await page.locator('body').evaluate((node) => getComputedStyle(node).fontFamily)
    assert(/Segoe UI/.test(family) && /apple-system/i.test(family), `unexpected font stack: ${family}`)
  })

  await check('Body text resolves to a real font family and a sane size', async () => {
    const style = await page.locator('body').evaluate((node) => {
      const computed = getComputedStyle(node)
      return { family: computed.fontFamily, size: parseFloat(computed.fontSize) }
    })
    assert(style.family && style.family !== 'none', 'no font family on body')
    assert(style.size >= 12 && style.size <= 20, `unexpected body font-size ${style.size}px`)
  })

  await check('No design-token variable resolves to an empty value', async () => {
    const unresolved = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const missing = []
      for (const name of Array.from(root)) {
        if (!name.startsWith('--')) continue
        if (root.getPropertyValue(name).trim() === '') missing.push(name)
      }
      return missing
    })
    assertEqual(unresolved.length, 0, `unresolved tokens: ${unresolved.join(', ')}`)
  })

  await check('No element renders text with a var() fallback leak', async () => {
    const leaks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *'))
        .filter((node) => node.children.length === 0 && /var\(--/.test(node.textContent ?? ''))
        .map((node) => `${node.tagName}: ${(node.textContent ?? '').slice(0, 60)}`),
    )
    assertEqual(leaks.length, 0, `raw CSS variables rendered as text: ${leaks.join(' | ')}`)
  })

  await check('Interactive controls meet the 24px minimum hit target', async () => {
    const small = await page.evaluate(() => {
      const results = []
      const nodes = document.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], [role="radio"]')
      for (const node of nodes) {
        // A bare <input> is often only as tall as its text; the styled wrapper
        // around it is what the user actually clicks.
        const host = node.closest('.ant-input-affix-wrapper, .ant-select, .ant-picker, .ant-tabs-tab') ?? node
        const rect = host.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        const style = getComputedStyle(node)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        // The sidebar resizer is a deliberately thin drag handle with keyboard support.
        if (node.getAttribute('role') === 'separator') continue
        if (rect.height < 24 || rect.width < 16) {
          const name = node.getAttribute('aria-label') || (node.textContent ?? '').trim().slice(0, 24) || node.className
          results.push(`${node.tagName}.${String(name)} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
        }
      }
      return results
    })
    assertEqual(small.length, 0, `undersized controls: ${small.slice(0, 8).join(' | ')}`)
  })

  await check('Every icon-only button exposes an accessible name', async () => {
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter((node) => {
          const rect = node.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) return false
          const text = (node.textContent ?? '').trim()
          const label = node.getAttribute('aria-label') || node.getAttribute('title')
          return !text && !label && !node.getAttribute('aria-labelledby')
        })
        .map((node) => node.className || node.outerHTML.slice(0, 60)),
    )
    assertEqual(unnamed.length, 0, `buttons without a name: ${unnamed.slice(0, 6).join(' | ')}`)
  })

  await check('Keyboard focus produces a visible focus ring', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => {
      const node = document.activeElement
      if (!node || node === document.body) return null
      const style = getComputedStyle(node)
      return {
        tag: node.tagName,
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      }
    })
    assert(focus, 'Tab did not move focus to a control')
    const visible =
      (focus.outline !== 'none' && parseFloat(focus.outlineWidth) > 0) ||
      (focus.boxShadow && focus.boxShadow !== 'none')
    assert(visible, `no focus indicator on ${focus.tag} (outline=${focus.outline}, shadow=${focus.boxShadow})`)
  })

  await check('The page does not scroll horizontally at 1440px', async () => {
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    assert(
      overflow.scroll <= overflow.client + 1,
      `horizontal overflow: scrollWidth ${overflow.scroll} > clientWidth ${overflow.client}`,
    )
  })

  await check('The shell fills the viewport without a page-level scrollbar', async () => {
    // 外壳是固定高度布局，滚动条应该只出现在内容区里。哪怕多出 1px（曾经就是
    // visually-hidden 的 aria-live 区域把文档撑高 1px）也会冒出一条整页滚动条。
    const offenders = await page.evaluate(() => {
      const de = document.documentElement
      if (de.scrollHeight <= de.clientHeight) return []
      const vh = de.clientHeight
      return Array.from(document.querySelectorAll('*'))
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter((entry) => entry.box.bottom > vh && entry.box.height > 0)
        .filter((entry) => {
          // 真正可滚动的容器里溢出是正常的；overflow:hidden 不算，因为 body
          // 本身就是 hidden，按它过滤会把所有元素都排除掉。
          let parent = entry.el.parentElement
          while (parent) {
            const overflowY = getComputedStyle(parent).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') return false
            parent = parent.parentElement
          }
          return true
        })
        .slice(0, 6)
        .map((entry) => {
          const cls =
            typeof entry.el.className === 'string'
              ? entry.el.className.trim().split(/\s+/).slice(0, 2).join('.')
              : ''
          return `${entry.el.tagName.toLowerCase()}${cls ? '.' + cls : ''} bottom=${Math.round(entry.box.bottom)}`
        })
    })
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    }))
    // 不留 1px 容差：这条 bug 本身就正好是 1px。
    assert(
      metrics.scroll <= metrics.client,
      `vertical page overflow: scrollHeight ${metrics.scroll} > clientHeight ${metrics.client} | ${offenders.join(' | ')}`,
    )
  })

  await check('The page body does not grow its own scrollbar', async () => {
    // .selection-page 是固定高度的列布局：表格自己滚，页面本身不该滚。
    // 上一条只看文档级溢出，还把可滚动祖先的后代排除了，所以漏掉了分页条上
    // 图标按钮的外扩热区把这一层顶出滚动条的情况。
    const pages = ['/system/audit-log', '/selection/sensor', '/selection/customer', '/system/user']
    const bad = []
    for (const path of pages) {
      await goto(path)
      await settle()
      const m = await page.evaluate(() => {
        const sp = document.querySelector('.selection-page')
        if (!sp) return null
        return {
          h: sp.scrollWidth - sp.clientWidth,
          v: sp.scrollHeight - sp.clientHeight,
        }
      })
      if (m && (m.h > 0 || m.v > 0)) bad.push(`${path} 横${m.h}px 纵${m.v}px`)
    }
    assertEqual(bad.length, 0, `.selection-page 出现了自己的滚动条: ${bad.join(' | ')}`)
  })

  await check('Every table and list keeps its pagination pinned to the card bottom and its header fixed', async () => {
    const pages = [
      '/selection/customer', '/selection/process', '/selection/machine', '/selection/sensor',
      '/selection/dictionary', '/selection/search?q=0', '/system/user', '/system/role', '/system/org',
      '/system/audit-log',
    ]
    const bad = []
    let checked = 0
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 768 })
      for (const path of pages) {
        await goto(path)
        await settle()
        // 只遍历页面卡片里的 Tab；外层「客户 | 制程」是路由 Tab，点了会换页，两页已在 pages 里各自访问
        const tabs = page.locator('.app-shell__content .selection-page .ant-tabs-tab')
        // 每轮重新数：机型页切换一级 Tab 后，二级 Tab 的数量会变
        for (let i = 0; i < Math.max(1, await tabs.count()) && i < 40; i++) {
          if (i < (await tabs.count())) {
            await tabs.nth(i).locator('[role="tab"]').dispatchEvent('click')
            await settle()
          }
          const result = await page.evaluate(() => {
            const out = { count: 0, problems: [] }
            const card = document.querySelector('.selection-page')
            if (!card) return out
            const cardBottom = card.getBoundingClientRect().bottom
            const lists = [...card.querySelectorAll('.ant-table-wrapper, .ant-list.file-list, .ant-list.search-list')]
              .filter((el) => el.getClientRects().length && !el.closest('.ant-modal'))
            for (const list of lists) {
              out.count += 1
              let bar = list.querySelector('.ant-pagination')
              for (let n = list.nextElementSibling; !bar && n; n = n.nextElementSibling) {
                if (n.classList.contains('ant-pagination')) bar = n
              }
              if (!bar || !bar.getClientRects().length) {
                out.problems.push('no pagination bar')
                continue
              }
              const gap = Math.round(cardBottom - bar.getBoundingClientRect().bottom)
              if (gap < 0 || gap > 40) out.problems.push(`pagination ${gap}px above the card bottom`)
              const sortControls = list.querySelectorAll('.ant-table-column-sorter').length
              if (sortControls !== 0) out.problems.push(`${sortControls} column sort controls`)
              const scroller = list.querySelector('.ant-table-content') || list.querySelector(':scope > .ant-spin-nested-loading')
              const th = list.querySelector('thead th')
              if (scroller && th && scroller.scrollHeight > scroller.clientHeight) {
                scroller.scrollTop = 200
                const drift = Math.abs(th.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
                scroller.scrollTop = 0
                if (drift > 2) out.problems.push('table header scrolled away')
              }
            }
            if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
              out.problems.push('document scrolls')
            }
            return out
          })
          checked += result.count
          for (const problem of result.problems) bad.push(`${width}px ${path} tab ${i}: ${problem}`)
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await settle()
    assert(checked > 0, 'no tables or lists were found to check')
    assertEqual(bad.length, 0, `pagination/header problems: ${[...new Set(bad)].slice(0, 8).join(' | ')}`)
  })

  await check('Table headers and short labels never wrap onto a second line', async () => {
    const pages = [
      '/selection/customer', '/selection/process', '/selection/machine', '/selection/sensor',
      '/selection/dictionary', '/system/user', '/system/role', '/system/org', '/system/audit-log',
    ]
    const selector = [
      '.ant-table-thead th', '.ant-btn', '.ant-tabs-tab-btn', '.ant-tag', '.ant-badge-status',
      '.ant-segmented-item-label', '.ant-menu-title-content', '.ant-pagination-options',
    ].join(', ')
    const bad = []
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of pages) {
        await goto(path)
        await settle()
        // 只遍历页面卡片里的 Tab；外层「客户 | 制程」是路由 Tab，点了会换页，两页已在 pages 里各自访问
        const tabs = page.locator('.app-shell__content .selection-page .ant-tabs-tab')
        // 每轮重新数：机型页切换一级 Tab 后，二级 Tab 的数量会变
        for (let i = 0; i < Math.max(1, await tabs.count()) && i < 40; i++) {
          if (i < (await tabs.count())) {
            // 窄屏下放不下的标签会收进 antd 的「…」菜单，直接派发点击，不走真实指针
            await tabs.nth(i).locator('[role="tab"]').dispatchEvent('click')
            await settle()
          }
          // 逐个文字节点数行数：一个节点的矩形落在两条基线上就是换行了
          const wrapped = await page.evaluate((sel) => {
            const out = []
            for (const el of document.querySelectorAll(sel)) {
              if (!el.getClientRects().length) continue
              // antd 按钮默认不折行；样式里特意改成可折行的是完整显示的内容链接（如 Sensor 的替换关系），不算短标签
              if (el.matches('.ant-btn') && getComputedStyle(el).whiteSpace !== 'nowrap') continue
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent.trim()) continue
                const range = document.createRange()
                range.selectNodeContents(n)
                const tops = []
                for (const r of range.getClientRects()) {
                  if (r.width > 0 && !tops.some((t) => Math.abs(t - r.top) < 4)) tops.push(r.top)
                }
                if (tops.length > 1) out.push(n.textContent.trim().slice(0, 20))
              }
            }
            return out
          }, selector)
          for (const text of wrapped) bad.push(`${width}px ${path}: ${text}`)
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await settle()
    assertEqual(bad.length, 0, `wrapped labels: ${[...new Set(bad)].slice(0, 8).join(' | ')}`)
  })

  await check('No text node overflows its container horizontally', async () => {
    const clipped = await page.evaluate(() => {
      const results = []
      for (const node of Array.from(document.querySelectorAll('.app-shell__content *'))) {
        if (node.children.length > 0) continue
        const style = getComputedStyle(node)
        if (style.overflow !== 'visible' || style.position === 'absolute') continue
        if (node.clientWidth === 0) continue
        // 量文字本身的宽度，而不是 scrollWidth：antd 固定列用伪元素画阴影，
        // 会把单元格的 scrollWidth 撑大 30px，但并没有文字溢出。
        const range = document.createRange()
        range.selectNodeContents(node)
        const textWidth = range.getBoundingClientRect().width
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        if (textWidth > node.clientWidth - padding + 2) {
          results.push(`${node.tagName}.${node.className}: ${Math.round(textWidth)}>${node.clientWidth - padding}`)
        }
      }
      return results
    })
    if (clipped.length > 0) {
      throw new Error(`overflowing text nodes: ${clipped.slice(0, 6).join(' | ')}`)
    }
  })

  await check('The layout survives a narrow 1024px viewport', async () => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await settle()
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await settle()
    assert(
      overflow.scroll <= overflow.client + 1,
      `horizontal overflow at 1024px: ${overflow.scroll} > ${overflow.client}`,
    )
  })

  await check('Tooltips appear on hover over an icon button', async () => {
    await navTo('Sensor型号')
    await settle()
    const iconButton = page.locator('.ant-table-tbody .ant-btn-icon-only').first()
    if ((await iconButton.count()) === 0) {
      warn('Tooltip hover', 'no icon buttons available on this page to hover')
      return
    }
    await iconButton.hover()
    await page.waitForTimeout(900)
    const tooltip = page.locator('[role="tooltip"]')
    assert((await tooltip.count()) > 0, 'no tooltip appeared after hovering an icon button')
  })

  await check('A modal sheet traps focus and closes with Escape', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    // antd 在打开动画结束后才把焦点移进弹窗
    const inside = await page
      .waitForFunction(() => Boolean(document.activeElement?.closest('.ant-modal-wrap')), null, { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    assert(inside, 'focus was not moved into the sheet')
    await page.keyboard.press('Escape')
    await sheet().waitFor({ state: 'hidden', timeout: 5000 })
  })

  await check('Light mode keeps text readable (no transparent or identical colours)', async () => {
    const sample = await page.evaluate(() => {
      const node = document.querySelector('.app-shell__content')
      if (!node) return null
      const style = getComputedStyle(node)
      return { color: style.color, background: style.backgroundColor }
    })
    assertEqual(await page.locator('html').getAttribute('data-theme'), null, 'page should stay light')
    assert(sample, 'no content element found')
    assert(sample.color !== sample.background, `text and background are identical (${sample.color})`)
    assert(!/rgba\(0,\s*0,\s*0,\s*0\)/.test(sample.color), 'text colour is fully transparent')
  })

  await check('The browser console stayed clean during the whole run', async () => {
    assertEqual(
      consoleErrors.length,
      0,
      `console errors: ${consoleErrors.slice(0, 5).join(' | ')}`,
    )
  })

  await check('The backend never returned a 5xx during the whole run', async () => {
    assertEqual(serverErrors.length, 0, `server errors: ${serverErrors.slice(0, 5).join(' | ')}`)
  })

  await check('No uncaught page exceptions occurred during the whole run', async () => {
    assertEqual(pageErrors.length, 0, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`)
  })
}

// ----------------------------------------------------------------- teardown

async function teardown() {
  section('Teardown')
  try {
    const token = await loginApi()
    apiOperationHeaders = cleanupOperationHeaders('E2E 测试清理（界面）')
    // Remove the customer/machine created through the UI plus their store keys.
    // 改名步骤中途失败会留下「…改」，一并清掉，免得下次运行撞名
    for (const customer of [NAMES.customer, `${NAMES.customer}改`]) {
      await deleteEntity(token, 'customer', customer, NAMES.site)
    }
    await deleteEntity(token, 'machine', NAMES.machineCategory, NAMES.machine)
    await deleteEntity(token, 'machine', NAMES.machineLeafCategory, '')
    await deleteMachineTabs(token)
    await cleanupStoreKeys(token)
    await cleanupRbac(token)
    passed += 1
    log('  \u2713 UI artifacts removed')
  } catch (error) {
    failures.push({ name: 'Teardown', detail: error.message })
    log(`  \u2717 Teardown\n      ${error.message}`)
  }

  if (page) await page.close().catch(() => {})
  if (context) await context.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
}

// 清理阶段的写入带同一个操作编号和名称，操作日志里归成一行「E2E 测试清理」
function cleanupOperationHeaders(label) {
  return {
    'X-Operation-Id': `e2e-cleanup-${Date.now()}`,
    'X-Operation-Label': encodeURIComponent(label),
  }
}

let apiOperationHeaders = {}

async function api(method, path, token, body) {
  const headers = { ...apiOperationHeaders }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: response.status, data }
}

async function loginApi() {
  const res = await api('POST', '/auth/login', null, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  })
  if (res.status !== 200) throw new Error(`teardown login failed with ${res.status}`)
  return res.data.token
}

function storeRoute(key) {
  return `/store/by-key?key=${encodeURIComponent(key)}`
}

async function deleteEntity(token, kind, groupName, itemName) {
  const key = `entity-groups:${kind}`
  const current = await api('GET', storeRoute(key), token)
  if (current.status !== 200 || !Array.isArray(current.data)) return
  const next = current.data
    .filter((group) => group.name !== groupName)
    .map((group) => {
      const items = (group.items ?? []).filter((item) => item !== itemName)
      // 客户的 regions 只能指向现有厂区，删厂区时一起去掉
      return group.regions
        ? { ...group, items, regions: Object.fromEntries(Object.entries(group.regions).filter(([site]) => items.includes(site))) }
        : { ...group, items }
    })
  if (next.length === current.data.length && JSON.stringify(next) === JSON.stringify(current.data)) return
  if (next.length === 0) return
  const res = await api('PUT', `/store/entity-groups/${kind}`, token, next)
  if (res.status !== 200) throw new Error(`failed to prune ${kind} groups: ${res.status} ${JSON.stringify(res.data)}`)
}

// 这次运行新建的机型 Tab（名字带 TAG），以及挂在 TAG 选单节点下的二级 Tab
async function deleteMachineTabs(token) {
  const key = 'machine-tabs:all'
  const current = await api('GET', storeRoute(key), token)
  if (current.status !== 200 || !Array.isArray(current.data)) return
  const ownTab = (tab) => String(tab.name).startsWith(TAG)
  const ownPage = (page) => String(page.node?.category ?? '').startsWith(TAG) || String(page.node?.item ?? '').startsWith(TAG)
  const removedPageIds = current.data.flatMap((tab) =>
    (tab.pages ?? []).filter((page) => ownTab(tab) || ownPage(page)).map((page) => page.id),
  )
  const next = current.data
    .filter((tab) => !ownTab(tab))
    .map((tab) => (tab.pages ? { ...tab, pages: tab.pages.filter((page) => !ownPage(page)) } : tab))
  if (JSON.stringify(next) === JSON.stringify(current.data)) return
  const res = await api('PUT', storeRoute(key), token, next)
  if (res.status !== 200) throw new Error(`failed to prune machine tabs: ${res.status}`)
  // 删掉的二级 Tab 的内容：只删真的存在的 key，否则每次都在操作日志里留一条「key 不存在」的失败记录
  const store = await api('GET', '/store', token)
  const existing = store.status === 200 ? new Set(Object.keys(store.data)) : new Set()
  for (const id of removedPageIds) {
    for (const prefix of ['machine-section-rows', 'machine-section-images']) {
      const pageKey = `${prefix}:${id}:@tab-page`
      if (existing.has(pageKey)) await api('DELETE', storeRoute(pageKey), token)
    }
  }
}

async function cleanupStoreKeys(token) {
  const store = await api('GET', '/store', token)
  if (store.status !== 200) return
  const stale = Object.keys(store.data).filter(
    (key) => key.includes(NAMES.customer) || key.includes(NAMES.machine) || key.includes(TAG + '-'),
  )
  for (const key of stale) {
    await api('DELETE', storeRoute(key), token)
  }
}

async function cleanupRbac(token) {
  const users = await api('GET', '/rbac/users', token)
  for (const user of users.data ?? []) {
    if (user.username?.startsWith(TAG.toLowerCase())) {
      await api('DELETE', `/rbac/users/${user.id}`, token)
    }
  }
  const roles = await api('GET', '/rbac/roles', token)
  for (const role of roles.data ?? []) {
    if (role.code?.startsWith(TAG.toLowerCase())) {
      await api('DELETE', `/rbac/roles/${role.id}`, token)
    }
  }
  const orgs = await api('GET', '/rbac/org-units', token)
  const sorted = (orgs.data ?? []).filter((unit) => unit.name?.startsWith(TAG)).sort((a, b) => b.id - a.id)
  for (const unit of sorted) {
    await api('DELETE', `/rbac/org-units/${unit.id}`, token)
  }
}

// ------------------------------------------------------------------- report

async function report() {
  log(`\n${'-'.repeat(64)}`)
  log(`passed: ${passed}   failed: ${failures.length}   warnings: ${warnings.length}`)
  log(`expected 4xx responses provoked by negative checks: ${networkErrors.length}`)
  if (warnings.length > 0) {
    log('\nWarnings:')
    for (const item of warnings) log(`  - ${item.name}: ${item.detail}`)
  }
  if (failures.length > 0) {
    log('\nFailures:')
    for (const item of failures) log(`  - ${item.name}\n      ${item.detail}`)
    process.exitCode = 1
    return
  }
  log('UI end-to-end regression passed.')
}

main().catch(async (error) => {
  console.error('\nUnexpected error:', error)
  await teardown().catch(() => {})
  process.exit(1)
})
