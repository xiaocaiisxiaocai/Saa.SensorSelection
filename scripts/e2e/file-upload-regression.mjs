#!/usr/bin/env node

// Real-browser regression for every file-bearing business page. The script
// uploads actual files, opens PDF/image previews in place, deletes everything
// it created, and fails on backend 5xx responses or page errors.

import { basename } from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5178'
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123'
const PDF_PATH = process.env.E2E_PDF_PATH
const PPT_PATH = process.env.E2E_PPT_PATH
const IMAGE_PATH = process.env.E2E_IMAGE_PATH

if (!PDF_PATH || !PPT_PATH || !IMAGE_PATH) {
  throw new Error('E2E_PDF_PATH, E2E_PPT_PATH and E2E_IMAGE_PATH are required')
}

const PDF_NAME = basename(PDF_PATH)
const PPT_NAME = basename(PPT_PATH)
const IMAGE_NAME = basename(IMAGE_PATH)
const TAG = `FUPLOAD-${Date.now()}`

let browser
let page
let passed = 0
const failures = []
const serverErrors = []
const pageErrors = []

// 编辑弹窗（a-modal）与确认框（Modal.confirm）
const sheet = () => page.locator('.ant-modal:not(.ant-modal-confirm):visible').last()
const alertBox = () => page.locator('.ant-modal-confirm:visible').last()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    failures.push({ name, detail })
    console.log(`  ✗ ${name}: ${detail}`)
  }
}

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
  await (await controlFor(scope, labelText)).fill(value)
}

/** a-select 的 id 在内部只读的搜索 input 上，点击要落在外层的选择框。 */
function selectBox(control) {
  return control.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select-selector ")][1]')
}

async function pickSelect(scope, labelText, optionText) {
  const control = await controlFor(scope, labelText)
  await selectBox(control).click()
  if ((await control.getAttribute('readonly')) === null) await control.pressSequentially(optionText)
  const panel = page.locator('.ant-select-dropdown:visible')
  await panel.waitFor({ state: 'visible' })
  await panel.locator('.ant-select-item-option-content', { hasText: optionText }).first().click()
  await panel.waitFor({ state: 'hidden' })
}

async function pickFirstToken(scope, labelText) {
  await selectBox(await controlFor(scope, labelText)).click()
  const panel = page.locator('.ant-select-dropdown:visible')
  await panel.waitFor({ state: 'visible' })
  const option = panel.locator('.ant-select-item-option').first()
  const label = (await option.innerText()).trim()
  assert(label, `no option available for "${labelText}"`)
  await option.click()
  // 多选下拉点选后不会自动收起；按 Esc 会冒泡到 a-modal 触发关闭确认，改为点弹窗标题收起
  await scope.locator('.ant-modal-title').click()
  await panel.waitFor({ state: 'hidden' })
}

async function saveSheet() {
  await sheet().getByRole('button', { name: '保存', exact: true }).click()
  await sheet().waitFor({ state: 'hidden', timeout: 10000 })
}

async function expectToast(text) {
  await page.locator('.ant-message-notice', { hasText: text }).first().waitFor({ state: 'visible', timeout: 10000 })
}

async function confirmDelete() {
  await alertBox().waitFor({ state: 'visible' })
  await alertBox().getByRole('button', { name: '删除', exact: true }).click()
  await alertBox().waitFor({ state: 'hidden' })
}

// 客户、制程合并为「客户/制程」一个菜单，页面顶部用 Tab 切换
async function openCustomerProcess(tab) {
  await navTo('客户/制程')
  await page.getByRole('tab', { name: tab, exact: true }).click()
  await page.waitForURL(tab === '制程' ? '**/selection/process**' : '**/selection/customer**', { timeout: 10000 })
}

async function navTo(label) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: label, exact: true }).click()
  await page.locator('.app-shell__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
}

async function upload(path) {
  // a-upload-dragger 里的 file input 是隐藏的；Playwright 仍可直接触发与原生选择框相同的 change 事件
  await page.locator('.ant-upload-drag input[type="file"]').first().setInputFiles(path)
}

function documentRow(fileName) {
  return page.locator('.file-list .ant-list-item', { hasText: fileName }).first()
}

/** 左侧目录树（a-tree）的行操作在每行的「更多」下拉菜单里。 */
async function treeAction(text, actionLabel) {
  // 按「X 的更多操作」精确定位节点：hasText 是子串匹配，会命中同前缀的其他节点
  const more = page.getByRole('button', { name: `${text} 的更多操作`, exact: true })
  const row = page.locator('.ant-tree-treenode').filter({ has: more }).first()
  await row.hover()
  await row.getByRole('button', { name: `${text} 的更多操作`, exact: true }).click()
  await page.getByRole('menuitem', { name: actionLabel, exact: true }).click()
}

async function previewPdf(fileName) {
  const row = documentRow(fileName)
  await row.waitFor({ state: 'visible', timeout: 15000 })
  await row.getByRole('button', { name: '预览', exact: true }).click()
  await sheet().waitFor({ state: 'visible' })
  const viewer = page.locator('.pdf-preview-modal .a-pdf-viewer')
  await viewer.getByText(/共\s*\d+\s*页/).waitFor({ state: 'visible', timeout: 20000 })
  assert(await viewer.locator('.a-pdf-viewer__page canvas').first().isVisible(), `${fileName} rendered no PDF canvas`)
  assert((await viewer.locator('.ant-typography-danger').count()) === 0, `${fileName} preview reports an error`)
  await page.keyboard.press('Escape')
  await sheet().waitFor({ state: 'hidden' })
}

async function deleteDocument(fileName, successText) {
  const row = documentRow(fileName)
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await confirmDelete()
  await expectToast(successText)
  await row.waitFor({ state: 'detached', timeout: 10000 })
}

async function runProcessFiles() {
  await openCustomerProcess('制程')
  await page.getByRole('tab', { name: '制程介绍', exact: true }).click()

  await check('制程介绍: upload and preview a real PDF', async () => {
    await upload(PDF_PATH)
    await expectToast('文件已上传')
    await previewPdf(PDF_NAME)
  })
  await check('制程介绍: upload a valid PPTX', async () => {
    await upload(PPT_PATH)
    await expectToast('文件已上传')
    await documentRow(PPT_NAME).waitFor({ state: 'visible', timeout: 15000 })
  })
  await check('制程介绍: delete uploaded PDF and PPTX', async () => {
    await deleteDocument(PDF_NAME, '文件已删除')
    await deleteDocument(PPT_NAME, '文件已删除')
  })
}

async function runCustomerFile() {
  await openCustomerProcess('客户')
  const site = `${TAG}厂区`
  const customer = `${TAG}客户`

  // 客户目录是「客户 → 厂区」：先建客户，再在客户下建厂区（带区域），资料挂在厂区上
  await page.getByRole('button', { name: '新建客户', exact: true }).click()
  await fillField(sheet(), '客户名称', customer)
  await saveSheet()
  await page.getByRole('button', { name: '新建厂区', exact: true }).click()
  await pickSelect(sheet(), '客户', customer)
  await fillField(sheet(), '厂区名称', site)
  await pickFirstOption(sheet(), '区域')
  await saveSheet()
  await page.locator('.ant-tree-node-content-wrapper', { hasText: site }).first().click()
  await page.getByRole('tab', { name: '感应器选用标准' }).click()

  await check('客户感应器选用标准: upload, preview and delete a real PDF', async () => {
    await upload(PDF_PATH)
    await expectToast('文件已上传')
    await previewPdf(PDF_NAME)
    await deleteDocument(PDF_NAME, '文件已删除')
  })

  await treeAction(site, '删除厂区')
  await confirmDelete()
  await treeAction(customer, '删除客户')
  await confirmDelete()
}

async function runSensorFiles() {
  await navTo('Sensor型号')
  const cases = [
    { tab: 'SOP', uploadToast: 'SOP 已上传', deleteToast: 'SOP 已删除' },
    { tab: '型录', uploadToast: '型录已上传', deleteToast: '型录已删除' },
    { tab: '3D', uploadToast: '3D 文件已上传', deleteToast: '3D 文件已删除' },
  ]

  for (const item of cases) {
    await check(`Sensor ${item.tab}: upload, preview in place and delete a real PDF`, async () => {
      await page.getByRole('tab', { name: item.tab, exact: true }).click()
      await upload(PDF_PATH)
      await expectToast(item.uploadToast)
      const pathBefore = new URL(page.url()).pathname
      await previewPdf(PDF_NAME)
      assert(new URL(page.url()).pathname === pathBefore, `${item.tab} preview navigated away from the Sensor page`)
      const selectedTab = page.locator('.ant-tabs-tab-active [role="tab"]')
      assert((await selectedTab.innerText()).trim() === item.tab, `${item.tab} preview switched to a different Tab`)
      await deleteDocument(PDF_NAME, item.deleteToast)
    })
  }
}

async function runMachineImage() {
  await navTo('机型结构')
  const category = `${TAG}分类`
  const machine = `${TAG}机型`
  const tab = `${TAG}机构`
  const role = `${TAG}内容`

  await page.getByRole('button', { name: '新建分类', exact: true }).click()
  await fillField(sheet(), '分类名称', category)
  await saveSheet()
  // 结构目录标题栏只有「新建分类 / 新建配置」，机型从分类的「更多」菜单里建
  await page.getByPlaceholder('搜索分类或机型…').fill(category)
  const more = page.getByRole('button', { name: `${category} 的更多操作`, exact: true })
  await page.locator('.ant-tree-treenode').filter({ has: more }).first().hover()
  await more.click()
  await page.getByRole('menuitem', { name: '新建机型', exact: true }).click()
  await fillField(sheet(), '机型名称', machine)
  await saveSheet()
  await page.getByPlaceholder('搜索分类或机型…').fill(machine)

  // 机型 Tab 是共用的：新建一个结构 Tab；机型没有二级 Tab，Tab 下直接是这个机型的表格
  await page.locator('.machine-section-tabs .ant-tabs-nav-add:visible, button:has-text("新建 Tab")').first().click()
  await fillField(sheet(), 'Tab 名称', tab)
  await pickSelect(sheet(), 'Tab 类型', '结构')
  await saveSheet()
  await page.getByText(`「${machine}」在「${tab}」下还没有选型记录`).first().waitFor({ state: 'visible' })

  // 示意图在表格「操作」前一列，挂在记录上：先有记录才有格子
  await check('机型结构: the schematic column appears with the first record', async () => {
    assert((await page.locator('.machine-row-image').count()) === 0, 'schematic cell exists before any record')
  })

  await page.getByRole('button', { name: '新增选型', exact: true }).first().click()
  await fillField(sheet(), '功能作用', role)
  await pickFirstToken(sheet(), '关联传感器')
  await saveSheet()
  await page.locator('.ant-table-tbody tr.ant-table-row', { hasText: role }).first().waitFor({ state: 'visible' })

  await check('机型结构: upload, preview and delete a real image in the table', async () => {
    const cell = page.locator('.machine-row-image').first()
    await cell.locator(`button[aria-label="给 ${role} 新增示意图"]`).waitFor({ state: 'visible' })
    await cell.locator('input[type="file"]').setInputFiles(IMAGE_PATH)
    await expectToast('示意图已更新')
    // 文件名不单独显示，放在图片的 alt / title 上
    const image = cell.locator(`img[alt="${IMAGE_NAME}"]`)
    await image.waitFor({ state: 'visible', timeout: 15000 })
    assert(await image.isVisible(), 'uploaded image is not visible')
    // a-image 自带的点击放大预览（悬停时的遮罩层接收点击）
    await cell.locator('.ant-image').click()
    await page.locator('.ant-image-preview-img').waitFor({ state: 'visible' })
    // 预览工具栏的第一个按钮是关闭
    await page.locator('.ant-image-preview-operations-operation').first().click()
    await page.locator('.ant-image-preview-img').waitFor({ state: 'hidden' })
    // 预览、按钮都不能打开整行编辑
    assert((await page.locator('.ant-modal:visible').count()) === 0, 'clicking the image opened the row editor')
    await cell.getByRole('button', { name: `删除 ${role} 的示意图`, exact: true }).click()
    await confirmDelete()
    await expectToast('示意图已删除')
    await cell.locator(`button[aria-label="给 ${role} 新增示意图"]`).waitFor({ state: 'visible' })
  })

  const contentRow = page.locator('.ant-table-tbody tr.ant-table-row', { hasText: role }).first()
  await contentRow.getByRole('button', { name: '删除', exact: true }).click()
  await confirmDelete()
  // 删除 Tab 在「编辑 Tab」对话框里（Tab 上没有关闭按钮），连同其下的表格一起删除
  await page.locator('.ant-tabs-tab', { hasText: tab }).getByRole('button', { name: '编辑 Tab', exact: true }).click()
  await sheet().getByRole('button', { name: '删除 Tab', exact: true }).click()
  await confirmDelete()
  await page.getByPlaceholder('搜索分类或机型…').fill(machine)

  await treeAction(machine, '删除机型')
  await confirmDelete()
  await page.getByPlaceholder('搜索分类或机型…').fill('')
  await treeAction(category, '删除分类')
  await confirmDelete()
}

async function main() {
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' })
  page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`)
  })

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[autocomplete="username"]').fill(ADMIN_USERNAME)
  await page.locator('input[autocomplete="current-password"]').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/selection/customer**', { timeout: 20000 })

  console.log(`Real file regression against ${BASE_URL}`)
  await runProcessFiles()
  await runCustomerFile()
  await runSensorFiles()
  await runMachineImage()

  await browser.close()
  browser = null

  if (serverErrors.length > 0) failures.push({ name: 'backend 5xx audit', detail: serverErrors.join(' | ') })
  if (pageErrors.length > 0) failures.push({ name: 'page error audit', detail: pageErrors.join(' | ') })

  console.log(`\n${passed} passed, ${failures.length} failed`)
  for (const failure of failures) console.log(`  - ${failure.name}: ${failure.detail}`)
  if (failures.length > 0) process.exitCode = 1
}

main().catch(async (error) => {
  console.error(error)
  process.exitCode = 1
  if (browser) await browser.close().catch(() => {})
})
