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

const sheet = () => page.locator('.a-sheet')
const alertBox = () => page.locator('.a-alert')

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
  await (await controlFor(scope, labelText)).fill(value)
}

async function pickSelect(scope, labelText, optionText) {
  await (await controlFor(scope, labelText)).click()
  const panel = page.locator('.a-select__panel:visible')
  await panel.waitFor({ state: 'visible' })
  await panel.locator('.a-menu-item__label', { hasText: optionText }).first().click()
  await panel.waitFor({ state: 'hidden' })
}

async function pickFirstToken(scope, labelText) {
  await (await controlFor(scope, labelText)).click()
  const panel = page.locator('.a-select__panel:visible')
  await panel.waitFor({ state: 'visible' })
  const option = panel.locator('.a-menu-item').first()
  const label = (await option.innerText()).trim()
  assert(label, `no option available for "${labelText}"`)
  await option.click()
  await page.keyboard.press('Escape')
  await panel.waitFor({ state: 'hidden' })
}

async function saveSheet() {
  await sheet().getByRole('button', { name: '保存', exact: true }).click()
  await sheet().waitFor({ state: 'hidden', timeout: 10000 })
}

async function expectToast(text) {
  await page.locator('.a-toast', { hasText: text }).first().waitFor({ state: 'visible', timeout: 10000 })
}

async function confirmDelete() {
  await alertBox().waitFor({ state: 'visible' })
  await alertBox().getByRole('button', { name: '删除', exact: true }).click()
  await alertBox().waitFor({ state: 'hidden' })
}

async function navTo(label) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: label, exact: true }).click()
  await page.locator('.content__loading').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
}

async function upload(path) {
  const input = page.locator('.a-file-drop input[type="file"]:visible').first()
  // The input is visually hidden by design; Playwright can still drive the
  // same change event used by the native file picker.
  const hiddenInput = (await input.count()) > 0 ? input : page.locator('.a-file-drop input[type="file"]').first()
  await hiddenInput.setInputFiles(path)
}

function documentRow(fileName) {
  return page.locator('.docs-list li', { hasText: fileName }).first()
}

async function previewPdf(fileName) {
  const row = documentRow(fileName)
  await row.waitFor({ state: 'visible', timeout: 15000 })
  await row.getByRole('button', { name: '预览', exact: true }).click()
  await sheet().waitFor({ state: 'visible' })
  await page.locator('.a-pdf-viewer__count', { hasText: /共\s*\d+\s*页/ }).waitFor({ state: 'visible', timeout: 20000 })
  assert(await page.locator('.a-pdf-viewer__page canvas').first().isVisible(), `${fileName} rendered no PDF canvas`)
  assert((await page.locator('.a-pdf-viewer__status--error').count()) === 0, `${fileName} preview reports an error`)
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
  await navTo('制程管理')
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
  await navTo('客户管理')
  const region = `${TAG}区域`
  const customer = `${TAG}客户`

  await page.getByRole('button', { name: '新建区域', exact: true }).click()
  await fillField(sheet(), '区域名称', region)
  await saveSheet()
  await page.getByRole('button', { name: '新建客户', exact: true }).click()
  await pickSelect(sheet(), '区域', region)
  await fillField(sheet(), '客户名称', customer)
  await saveSheet()
  await page.locator('.a-source-list__item', { hasText: customer }).first().click()
  await page.getByRole('tab', { name: '感应器选用标准', exact: true }).click()

  await check('客户感应器选用标准: upload, preview and delete a real PDF', async () => {
    await upload(PDF_PATH)
    await expectToast('文件已上传')
    await previewPdf(PDF_NAME)
    await deleteDocument(PDF_NAME, '文件已删除')
  })

  const customerRow = page.locator('.a-source-list__row--item', { hasText: customer }).first()
  await customerRow.hover()
  await customerRow.getByRole('button', { name: '删除客户', exact: true }).click()
  await confirmDelete()
  const regionRow = page.locator('.a-source-list__row--group', { hasText: region }).first()
  await regionRow.hover()
  await regionRow.getByRole('button', { name: '删除区域', exact: true }).click()
  await confirmDelete()
}

async function runSensorFiles() {
  await navTo('Sensor型号')
  const cases = [
    { tab: 'SOP', uploadToast: 'SOP 已上传', deleteToast: 'SOP 已删除' },
    { tab: '资料', uploadToast: '资料已上传', deleteToast: '资料已删除' },
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
      const selectedTab = page.locator('[role="tab"][aria-selected="true"]')
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

  await page.getByRole('button', { name: '分类', exact: true }).click()
  await fillField(sheet(), '分类名称', category)
  await saveSheet()
  await page.getByRole('button', { name: '机型', exact: true }).click()
  await pickSelect(sheet(), '分类', category)
  await fillField(sheet(), '机型名称', machine)
  await saveSheet()
  await page.getByPlaceholder('搜索分类、配置或机型…').fill(machine)
  const machineRow = page.locator('.machine-tree-row--item', { hasText: machine }).first()
  await machineRow.click()

  await page.getByRole('button', { name: '新增 Tab', exact: true }).first().click()
  await fillField(sheet(), 'Tab 名称', tab)
  await pickSelect(sheet(), 'Tab 类型', '机构/结构')
  await saveSheet()
  await page.getByRole('tab', { name: tab }).click()

  await check('机型结构: image upload stays hidden until the Tab has content', async () => {
    assert((await page.locator('.a-file-drop input[type="file"]').count()) === 0, 'image upload is visible before the Tab has content')
    await page.getByText('请先新增内容后再添加图片', { exact: true }).waitFor({ state: 'visible' })
  })

  await page.getByRole('button', { name: '新增', exact: true }).first().click()
  await fillField(sheet(), '功能作用', role)
  await pickFirstToken(sheet(), '关联传感器')
  await saveSheet()
  await page.locator('.a-table tbody tr', { hasText: role }).first().waitFor({ state: 'visible' })

  await check('机型结构: upload, preview and delete a real image', async () => {
    await upload(IMAGE_PATH)
    await expectToast('示意图已更新')
    const card = page.locator('.image-card', { hasText: IMAGE_NAME }).first()
    await card.waitFor({ state: 'visible', timeout: 15000 })
    const image = card.locator('img')
    assert(await image.isVisible(), 'uploaded image is not visible')
    const box = await image.boundingBox()
    assert(box && box.width >= 160, `uploaded image is still too narrow (${box?.width ?? 0}px)`)
    await card.click()
    await page.locator('.a-image-viewer').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.locator('.a-image-viewer').waitFor({ state: 'detached' })
    await card.getByRole('button', { name: '删除', exact: true }).click()
    await confirmDelete()
    await expectToast('示意图已删除')
    await card.waitFor({ state: 'detached' })
  })

  const contentRow = page.locator('.a-table tbody tr', { hasText: role }).first()
  await contentRow.getByRole('button', { name: '删除', exact: true }).click()
  await confirmDelete()
  await page.getByRole('button', { name: `删除${tab}`, exact: true }).click()
  await confirmDelete()

  await machineRow.hover()
  await machineRow.getByRole('button', { name: `删除机型 ${machine}`, exact: true }).click()
  await confirmDelete()
  await page.getByPlaceholder('搜索分类、配置或机型…').fill('')
  const categoryRow = page.locator('.machine-tree-row--group', { hasText: category }).first()
  await categoryRow.hover()
  await categoryRow.getByRole('button', { name: `删除分类 ${category}`, exact: true }).click()
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
  await page.getByRole('button', { name: '登 录' }).click()
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
