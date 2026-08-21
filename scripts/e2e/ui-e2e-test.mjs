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
const ARTIFACT_DIR = new URL('./artifacts/', import.meta.url).pathname.replace(/^\//, '')
const HEADED = process.argv.includes('--headed')
const SLOW = process.argv.includes('--slow')

const TAG = 'E2E'
const NAMES = {
  region: `${TAG}区域`,
  customer: `${TAG}客户`,
  machineCategory: `${TAG}机型分类`,
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
    if (await isVisible(page.locator('.a-popover'))) {
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

const sheet = () => page.locator('.a-sheet')
const alertBox = () => page.locator('.a-alert')

/** Resolve the control inside an AFormRow by its exact label text. */
async function controlFor(scope, labelText) {
  const id = await scope.locator('label.a-form-row__label').evaluateAll(
    (labels, text) =>
      labels
        .map((label) => ({
          own: (label.childNodes[0]?.textContent ?? '').trim(),
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

async function pickSelect(scope, labelText, optionText) {
  const trigger = await controlFor(scope, labelText)
  await trigger.click()
  const panel = page.locator('.a-select__panel:visible')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  await panel.locator('.a-menu-item__label', { hasText: optionText }).first().click()
  await panel.waitFor({ state: 'hidden', timeout: 5000 })
}

/** Open a select and choose its first option, returning the chosen label. */
async function pickFirstOption(scope, labelText) {
  const trigger = await controlFor(scope, labelText)
  await trigger.click()
  const panel = page.locator('.a-select__panel:visible')
  await panel.waitFor({ state: 'visible', timeout: 5000 })
  const option = panel.locator('.a-menu-item__label').first()
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
  const toast = page.locator('.a-toast', { hasText: text })
  await toast.first().waitFor({ state: 'visible', timeout: 8000 })
}

async function confirmDelete() {
  await alertBox().waitFor({ state: 'visible', timeout: 5000 })
  await alertBox().getByRole('button', { name: '删除', exact: true }).click()
  await alertBox().waitFor({ state: 'hidden', timeout: 5000 })
}

/** Row locator for a table row containing the given text. */
function tableRow(text) {
  return page.locator('.a-table tbody tr', { hasText: text })
}

async function rowAction(text, actionLabel) {
  const row = tableRow(text).first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  await row.getByRole('button', { name: actionLabel, exact: true }).click()
}

/**
 * Source-list row actions are hover-revealed (`pointer-events: none` until the
 * row is hovered or focused), so the row has to be hovered before clicking.
 */
async function sourceListAction(rowClass, text, actionLabel) {
  const row = page.locator(rowClass, { hasText: text }).first()
  await row.waitFor({ state: 'visible', timeout: 8000 })
  await row.hover()
  await row.getByRole('button', { name: actionLabel, exact: true }).click()
}

async function goto(path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
}

async function navTo(label) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: label, exact: true }).click()
  await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
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
    await page.getByRole('button', { name: '登 录' }).waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('input[autocomplete="username"]').fill('admin')
    await page.locator('input[autocomplete="current-password"]').fill('wrong-password')
    await page.getByRole('button', { name: '登 录' }).click()
    await expectToast('用户名或密码错误')
    assert(page.url().includes('/login'), 'should stay on the login page')
  })

  await check('Signing in as admin lands on the customer page', async () => {
    await page.locator('input[autocomplete="current-password"]').fill('admin123')
    await page.getByRole('button', { name: '登 录' }).click()
    await page.waitForURL('**/selection/customer**', { timeout: 20000 })
    await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
    await page.getByRole('navigation', { name: '主导航' }).waitFor({ state: 'visible' })
    // The shell mounts before BackendStorage finishes its first sync. Waiting
    // for the real source list prevents the first write from racing the
    // connecting state when the test starts with a cold API process.
    await page.locator('.a-source-list').waitFor({ state: 'visible', timeout: 20000 })
  })

  await check('The shell shows no offline or session banner when the backend is reachable', async () => {
    await settle()
    const banner = page.locator('.shell-banner')
    assertEqual(await banner.count(), 0, 'unexpected shell banner')
  })

  await check('Admin sees both the business and the system nav groups', async () => {
    const nav = page.getByRole('navigation', { name: '主导航' })
    for (const label of ['客户管理', '制程管理', '机型结构', 'Sensor 型号字典', '数据字典']) {
      assert(await nav.getByRole('link', { name: label, exact: true }).isVisible(), `missing nav item ${label}`)
    }
    for (const label of ['用户管理', '角色管理', '组织架构', '操作日志']) {
      assert(await nav.getByRole('link', { name: label, exact: true }).isVisible(), `missing system nav item ${label}`)
    }
  })

  await check('The sidebar collapse toggle works and is reversible', async () => {
    const shell = page.locator('.app-shell')
    const before = await shell.getAttribute('class')
    await page.getByRole('button', { name: /折叠侧栏|展开侧栏/ }).click()
    await settle()
    const after = await shell.getAttribute('class')
    assert(before !== after, 'collapsing did not change the shell state')
    await page.getByRole('button', { name: /折叠侧栏|展开侧栏/ }).click()
    await settle()
    assertEqual(await shell.getAttribute('class'), before, 'sidebar did not restore')
  })

  await check('The theme switch applies dark mode and returns to light', async () => {
    const root = page.locator('html')
    await page.getByRole('radio', { name: '深色' }).click()
    await settle()
    assertEqual(await root.getAttribute('data-theme'), 'dark', 'dark theme not applied')
    // light mode is the default and clears the attribute rather than setting it
    await page.getByRole('radio', { name: '浅色' }).click()
    await settle()
    assertEqual(await root.getAttribute('data-theme'), null, 'light theme not restored')
  })
}

// ----------------------------------------------------------------- customer

async function runCustomerCrud() {
  section('Customer module CRUD')

  await navTo('客户管理')

  await check('Creating a region (区域) works', async () => {
    await page.getByRole('button', { name: '新建区域', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新建区域', 'sheet title')
    await fillField(sheet(), '区域名称', NAMES.region)
    await saveSheet()
    await expectToast('区域已新增')
    await page.locator('.a-source-list__name', { hasText: NAMES.region }).first().waitFor({ state: 'visible' })
  })

  await check('A duplicate region name is rejected', async () => {
    await page.getByRole('button', { name: '新建区域', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '区域名称', NAMES.region)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('该区域已存在')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('An empty region name is rejected', async () => {
    await page.getByRole('button', { name: '新建区域', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请填写区域名称')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('Creating a customer inside the region works', async () => {
    await page.getByRole('button', { name: '新建客户', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await pickSelect(sheet(), '区域', NAMES.region)
    await fillField(sheet(), '客户名称', NAMES.customer)
    await saveSheet()
    await expectToast('客户已新增')
    await page.locator('.a-source-list__item', { hasText: NAMES.customer }).first().waitFor({ state: 'visible' })
  })

  await check('Selecting the customer opens its four tabs', async () => {
    await page.locator('.a-source-list__item', { hasText: NAMES.customer }).first().click()
    await settle()
    for (const tab of ['客户通用要求', '制程注意事项', '感应器选用标准', '厂外反馈问题项']) {
      await page.getByRole('tab', { name: tab }).waitFor({ state: 'visible', timeout: 8000 })
    }
  })

  // ---- 客户通用要求
  await check('客户通用要求: create a requirement', async () => {
    await page.getByRole('tab', { name: '客户通用要求' }).click()
    await settle()
    await page.getByRole('button', { name: '新增要求', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新增要求', 'sheet title')
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
    await expectToast('请填写要求内容并选择有效分类与来源')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('客户通用要求: edit the requirement', async () => {
    await rowAction(`${TAG} 要求内容 A`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑要求', 'sheet title')
    await fillField(sheet(), '要求内容', `${TAG} 要求内容 B`)
    await saveSheet()
    await expectToast('要求已更新')
    await tableRow(`${TAG} 要求内容 B`).first().waitFor({ state: 'visible' })
    assertEqual(await tableRow(`${TAG} 要求内容 A`).count(), 0, 'old content still present')
  })

  await check('客户通用要求: the search box filters rows', async () => {
    const search = page.getByPlaceholder('搜索分类、机型、制程、内容、来源或备注')
    await search.fill('绝对不存在的关键词')
    await settle()
    assertEqual(await tableRow(`${TAG} 要求内容 B`).count(), 0, 'row should be filtered out')
    await page.locator('.a-table', { hasText: '没有匹配的要求记录' }).waitFor({ state: 'visible' })
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
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
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
    await page.getByRole('button', { name: '新增', exact: true }).click()
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
    await page.getByRole('button', { name: '新增', exact: true }).click()
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

  await check('Renaming the customer works', async () => {
    await page.getByRole('tab', { name: '客户通用要求' }).click()
    await settle()
    await sourceListAction('.a-source-list__row--item', NAMES.customer, '编辑客户')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '客户名称', `${NAMES.customer}改`)
    await saveSheet()
    await expectToast('客户已更新')
    await page.locator('.a-source-list__item', { hasText: `${NAMES.customer}改` }).first().waitFor({ state: 'visible' })
    // rename back so the rest of the run uses a stable name
    await sourceListAction('.a-source-list__row--item', `${NAMES.customer}改`, '编辑客户')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '客户名称', NAMES.customer)
    await saveSheet()
    await expectToast('客户已更新')
  })

  await check('A region that still has customers cannot be deleted', async () => {
    await sourceListAction('.a-source-list__row--group', NAMES.region, '删除区域')
    await confirmDelete()
    await expectToast('请先清空该区域下的全部客户')
  })
}

// ------------------------------------------------------------------ process

async function runProcessCrud() {
  section('Process module CRUD')
  await navTo('制程管理')

  await check('工艺制程: create a step', async () => {
    await page.getByRole('tab', { name: '工艺制程' }).click()
    await settle()
    await page.getByRole('button', { name: '新增', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新增工艺制程', 'sheet title')
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
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑工艺制程', 'sheet title')
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
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
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
  await navTo('Sensor 型号字典')

  await check('Sensor: create a model', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新增 Sensor 型号', 'sheet title')
    await fillField(sheet(), '料号', `${TAG}-PN-001`)
    await fillField(sheet(), '品牌', `${TAG}Brand`)
    await fillField(sheet(), '型号', NAMES.sensorModel)
    await fillField(sheet(), '规格参数', `${TAG} 规格`)
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
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('Sensor: a model without a name is rejected', async () => {
    await page.getByRole('button', { name: '新增型号', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请填写型号并选择感应器类型')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('Sensor: edit the model', async () => {
    await rowAction(NAMES.sensorModel, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑 Sensor 型号', 'sheet title')
    await fillField(sheet(), '适用场景', `${TAG} 场景`)
    await saveSheet()
    await expectToast('型号已更新')
  })

  await check('Sensor: the search box filters the catalogue', async () => {
    const search = page.getByPlaceholder('搜索类型、品牌、型号、料号、停用或问题点')
    await search.fill(NAMES.sensorModel)
    await settle()
    await tableRow(NAMES.sensorModel).first().waitFor({ state: 'visible' })
    const rows = await page.locator('.a-table tbody tr').count()
    assertEqual(rows, 1, 'search should narrow the table to one row')
    await search.fill('')
    await settle()
  })

  await check('Sensor: status tabs switch the visible set', async () => {
    await page.getByRole('tab', { name: '停用', exact: true }).click()
    await settle()
    assertEqual(await tableRow(NAMES.sensorModel).count(), 0, 'a 现用 model must not show under 停用')
    await page.getByRole('tab', { name: '全部', exact: true }).click()
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
    await page.getByRole('button', { name: '新增', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '分类名称', NAMES.dictItem)
    await saveSheet()
    await expectToast('分类已新增')
    await tableRow(NAMES.dictItem).first().waitFor({ state: 'visible' })
  })

  await check('Dictionary: a duplicate entry is rejected', async () => {
    await page.getByRole('button', { name: '新增', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '分类名称', NAMES.dictItem)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('该分类名称已存在')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('Dictionary: edit the entry', async () => {
    await rowAction(NAMES.dictItem, '编辑分类')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '分类名称', `${NAMES.dictItem}改`)
    await saveSheet()
    await expectToast('分类已更新')
    await tableRow(`${NAMES.dictItem}改`).first().waitFor({ state: 'visible' })
  })

  await check('Dictionary: delete the entry', async () => {
    await rowAction(`${NAMES.dictItem}改`, '删除分类')
    await confirmDelete()
    await expectToast('分类已删除')
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

    await page.getByRole('button', { name: '新建机型', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    await pickSelect(sheet(), '分类', NAMES.machineCategory)
    await fillField(sheet(), '机型名称', NAMES.machine)
    await saveSheet()
    await expectToast('机型已新增')
    await page.locator('.a-source-list__item', { hasText: NAMES.machine }).first().waitFor({ state: 'visible' })
  })

  await check('Machine: selecting it shows the structure tabs', async () => {
    await page.locator('.a-source-list__item', { hasText: NAMES.machine }).first().click()
    await settle()
    const tabs = page.locator('[role="tab"]')
    assert((await tabs.count()) > 0, 'no structure tabs rendered')
  })

  // The 机型注意事项 tab is the locked notes tab: its form is plain text only,
  // whereas structure tabs additionally require an associated sensor.
  await check('Machine: create, edit and delete a 注意事项 row', async () => {
    await page.getByRole('tab', { name: '机型注意事项' }).click()
    await settle()
    await page.getByRole('button', { name: '新增', exact: true }).first().click()
    await sheet().waitFor({ state: 'visible', timeout: 8000 })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新增记录', 'sheet title')
    await fillField(sheet(), '注意分类', `${TAG}分类`)
    await fillField(sheet(), '事项名称', `${TAG}事项`)
    await fillField(sheet(), '说明', `${TAG}说明`)
    await saveSheet()
    await expectToast('记录已新增')
    await tableRow(`${TAG}事项`).first().waitFor({ state: 'visible', timeout: 8000 })

    await rowAction(`${TAG}事项`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑记录', 'sheet title')
    await fillField(sheet(), '事项名称', `${TAG}事项改`)
    await saveSheet()
    await expectToast('记录已更新')
    await tableRow(`${TAG}事项改`).first().waitFor({ state: 'visible', timeout: 8000 })

    await rowAction(`${TAG}事项改`, '删除')
    await confirmDelete()
    await expectToast('记录已删除')
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
      `${TAG}事项改`,
      { timeout: 8000 },
    )
  })

  await check('Machine: a structure row requires an associated sensor', async () => {
    const structureTab = page.locator('[role="tab"]').filter({ hasNotText: '机型注意事项' }).first()
    await structureTab.click()
    await settle()
    await page.getByRole('button', { name: '新增', exact: true }).first().click()
    await sheet().waitFor({ state: 'visible', timeout: 8000 })
    await fillField(sheet(), '功能作用', `${TAG}作用`)
    await sheet().getByRole('button', { name: '保存', exact: true }).click()
    await expectToast('请填写功能作用并选择关联传感器')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('Machine: the report toolbar exposes selection and export actions', async () => {
    for (const label of ['全选机型', '清空']) {
      assert(await page.getByRole('button', { name: label, exact: true }).isVisible(), `missing ${label}`)
    }
  })
}

// ------------------------------------------------------------------- search

async function runSearch() {
  section('Global search')

  await check('Global search finds the machine created by this run', async () => {
    const search = page.getByRole('searchbox', { name: '全局搜索' })
    await search.fill(NAMES.machine)
    await search.press('Enter')
    await page.waitForURL('**/selection/search**', { timeout: 10000 })
    await settle()
    const body = await page.locator('.content').innerText()
    assert(body.includes(NAMES.machine), 'search results do not mention the machine')
  })

  await check('An empty search query warns instead of navigating', async () => {
    await navTo('客户管理')
    const search = page.getByRole('searchbox', { name: '全局搜索' })
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
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新建用户', 'sheet title')
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
    await page.locator('.a-toast').first().waitFor({ state: 'visible', timeout: 8000 })
    assert(await sheet().isVisible(), 'the sheet should stay open after a rejected save')
    await sheet().getByRole('button', { name: '取消', exact: true }).click()
    await sheet().waitFor({ state: 'hidden' })
  })

  await check('User: edit the display name', async () => {
    await rowAction(NAMES.user, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑用户', 'sheet title')
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
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '重置密码', 'sheet title')
    await fillField(sheet(), '新密码', 'newpass1')
    await saveSheet()
    await settle()
  })

  await check('User: delete', async () => {
    await rowAction(NAMES.user, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
      NAMES.user,
      { timeout: 10000 },
    )
  })

  // ---- roles
  await navTo('角色管理')

  await check('Role: create with permissions', async () => {
    await page.getByRole('button', { name: '新增角色', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新建角色', 'sheet title')
    await fillField(sheet(), '角色标识', NAMES.role)
    await fillField(sheet(), '角色名称', `${TAG} 界面角色`)
    await fillField(sheet(), '描述', `${TAG} 自动化创建`)
    await sheet().locator('.permission-item').first().click()
    await saveSheet()
    await tableRow(NAMES.role).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Role: edit the name', async () => {
    await rowAction(NAMES.role, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑角色', 'sheet title')
    await fillField(sheet(), '角色名称', `${TAG} 界面角色改`)
    await saveSheet()
    await settle()
    assert(
      (await tableRow(NAMES.role).first().innerText()).includes(`${TAG} 界面角色改`),
      'role name not updated in the table',
    )
  })

  await check('Role: the built-in admin role has no delete action', async () => {
    const adminRow = page.locator('.a-table tbody tr', { hasText: '系统内置' }).first()
    await adminRow.waitFor({ state: 'visible' })
    assertEqual(
      await adminRow.getByRole('button', { name: '删除', exact: true }).count(),
      0,
      'the system role must not expose a delete button',
    )
  })

  await check('Role: delete', async () => {
    await rowAction(NAMES.role, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
      NAMES.role,
      { timeout: 10000 },
    )
  })

  // ---- org units
  await navTo('组织架构')

  await check('Org: create a root unit', async () => {
    await page.getByRole('button', { name: '新建组织', exact: true }).click()
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '新建组织', 'sheet title')
    await fillField(sheet(), '组织名称', NAMES.org)
    await pickSelect(sheet(), '层级', '事业部')
    await saveSheet()
    await tableRow(NAMES.org).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Org: create a child unit', async () => {
    await rowAction(NAMES.org, '新建子节点')
    await sheet().waitFor({ state: 'visible' })
    await fillField(sheet(), '组织名称', `${NAMES.org}子`)
    await pickSelect(sheet(), '层级', '部门')
    await saveSheet()
    await tableRow(`${NAMES.org}子`).first().waitFor({ state: 'visible', timeout: 10000 })
  })

  await check('Org: a unit with children cannot be deleted', async () => {
    await rowAction(NAMES.org, '删除')
    await confirmDelete()
    await page.locator('.a-toast').first().waitFor({ state: 'visible', timeout: 8000 })
    await settle()
    assert((await tableRow(NAMES.org).count()) > 0, 'the parent must survive a rejected delete')
  })

  await check('Org: edit the child then delete both', async () => {
    await rowAction(`${NAMES.org}子`, '编辑')
    await sheet().waitFor({ state: 'visible' })
    assertEqual(await sheet().locator('.a-sheet__title').innerText(), '编辑组织', 'sheet title')
    await fillField(sheet(), '组织名称', `${NAMES.org}子改`)
    await saveSheet()
    await tableRow(`${NAMES.org}子改`).first().waitFor({ state: 'visible', timeout: 10000 })

    await rowAction(`${NAMES.org}子改`, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
      `${NAMES.org}子改`,
      { timeout: 10000 },
    )
    await rowAction(NAMES.org, '删除')
    await confirmDelete()
    await page.waitForFunction(
      (text) => !Array.from(document.querySelectorAll('.a-table tbody tr')).some((row) => row.innerText.includes(text)),
      NAMES.org,
      { timeout: 10000 },
    )
  })

  // ---- audit log
  await check('Audit log lists the operations from this run', async () => {
    await navTo('操作日志')
    await settle()
    await page.locator('.a-table tbody tr').first().waitFor({ state: 'visible', timeout: 10000 })
    // The table renders friendly Chinese labels, not the raw action codes.
    const body = await page.locator('.content').innerText()
    assert(/创建用户|创建角色|创建组织|写入数据|登录/.test(body), `no audit rows from this run: ${body.slice(0, 200)}`)
    assert(body.includes('admin'), 'audit rows do not mention the acting user')
  })
}

// ---------------------------------------------------------------- read-only

async function runReadOnlyGuest() {
  section('Guest read-only mode')

  await check('Signing out drops back to the read-only customer page', async () => {
    await page.locator('.user-chip--menu').click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    await page.waitForURL('**/selection/customer**', { timeout: 15000 })
    await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
    await settle()
    assert(await page.getByRole('button', { name: '登录', exact: true }).isVisible(), 'no sign-in affordance after logout')
  })

  await check('A signed-out visitor can still read business data but sees no write controls', async () => {
    await page.locator('.a-source-list').waitFor({ state: 'visible', timeout: 10000 })
    for (const label of ['新建区域', '新建客户', '新增要求']) {
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
    assert(/未找到|返回客户管理/.test(body), 'not-found page did not render')
  })
}

// ----------------------------------------------------------------- ui audit

async function runUiAudit() {
  section('UI details: fonts, spacing, hit targets, focus, overflow')

  // sign back in so the audit covers the full authenticated UI
  await goto('/login')
  await page.locator('input[autocomplete="username"]').fill('admin')
  await page.locator('input[autocomplete="current-password"]').fill('admin123')
  await page.getByRole('button', { name: '登 录' }).click()
  await page.waitForURL('**/selection/customer**', { timeout: 20000 })
  await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await settle()

  await check('The Latin and CJK webfonts actually load', async () => {
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready
      const loaded = new Set()
      document.fonts.forEach((face) => {
        if (face.status === 'loaded') loaded.add(face.family.replace(/['"]/g, ''))
      })
      return Array.from(loaded)
    })
    assert(fonts.some((name) => /Inter/i.test(name)), `Inter not loaded (loaded: ${fonts.join(', ') || 'none'})`)
    assert(
      fonts.some((name) => /Noto Sans SC/i.test(name)),
      `Noto Sans SC not loaded (loaded: ${fonts.join(', ') || 'none'})`,
    )
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
        const host = node.closest('.a-control, .search') ?? node
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

  await check('No text node overflows its container horizontally', async () => {
    const clipped = await page.evaluate(() => {
      const results = []
      for (const node of Array.from(document.querySelectorAll('.content *'))) {
        if (node.children.length > 0) continue
        const style = getComputedStyle(node)
        if (style.overflow !== 'visible' || style.position === 'absolute') continue
        if (node.scrollWidth > node.clientWidth + 2 && node.clientWidth > 0) {
          results.push(`${node.tagName}.${node.className}: ${node.scrollWidth}>${node.clientWidth}`)
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
    await navTo('Sensor 型号字典')
    await settle()
    const iconButton = page.locator('.a-table tbody .a-icon-button').first()
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
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('.a-sheet')))
    assert(inside, 'focus was not moved into the sheet')
    await page.keyboard.press('Escape')
    await sheet().waitFor({ state: 'hidden', timeout: 5000 })
  })

  await check('Dark mode keeps text readable (no transparent or identical colours)', async () => {
    await page.getByRole('radio', { name: '深色' }).click()
    await settle()
    const sample = await page.evaluate(() => {
      const node = document.querySelector('.content')
      if (!node) return null
      const style = getComputedStyle(node)
      return { color: style.color, background: style.backgroundColor }
    })
    await page.getByRole('radio', { name: '浅色' }).click()
    await settle()
    assert(sample, 'no content element found')
    assert(sample.color !== sample.background, `text and background are identical in dark mode (${sample.color})`)
    assert(!/rgba\(0,\s*0,\s*0,\s*0\)/.test(sample.color), 'text colour is fully transparent in dark mode')
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
    // Remove the customer/machine created through the UI plus their store keys.
    await deleteEntity(token, 'customer', NAMES.region, NAMES.customer)
    await deleteEntity(token, 'machine', NAMES.machineCategory, NAMES.machine)
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

const API = 'http://localhost:5080/api'

async function api(method, path, token, body) {
  const headers = {}
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
  const res = await api('POST', '/auth/login', null, { username: 'admin', password: 'admin123' })
  if (res.status !== 200) throw new Error(`teardown login failed with ${res.status}`)
  return res.data.token
}

async function deleteEntity(token, kind, groupName, itemName) {
  const key = `entity-groups:${kind}`
  const current = await api('GET', `/store/${encodeURIComponent(key)}`, token)
  if (current.status !== 200 || !Array.isArray(current.data)) return
  const next = current.data
    .filter((group) => group.name !== groupName)
    .map((group) => ({ ...group, items: (group.items ?? []).filter((item) => item !== itemName) }))
  if (next.length === current.data.length && JSON.stringify(next) === JSON.stringify(current.data)) return
  if (next.length === 0) return
  const res = await api('PUT', `/store/entity-groups/${kind}`, token, next)
  if (res.status !== 200) throw new Error(`failed to prune ${kind} groups: ${res.status} ${JSON.stringify(res.data)}`)
}

async function cleanupStoreKeys(token) {
  const store = await api('GET', '/store', token)
  if (store.status !== 200) return
  const stale = Object.keys(store.data).filter(
    (key) => key.includes(NAMES.customer) || key.includes(NAMES.machine) || key.includes(TAG + '-'),
  )
  for (const key of stale) {
    await api('DELETE', `/store/${encodeURIComponent(key)}`, token)
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
