const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

function required(relativePath) {
  const absolutePath = path.join(root, relativePath)
  assert.equal(fs.existsSync(absolutePath), true, `missing ${relativePath}`)
  return absolutePath
}

async function run() {
  const rootPackage = JSON.parse(fs.readFileSync(required('package.json'), 'utf8'))
  assert.match(rootPackage.packageManager || '', /^pnpm@/)
  assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), false)

  const appPackage = JSON.parse(
    fs.readFileSync(required('apps/web-ele/package.json'), 'utf8'),
  )
  assert.equal(appPackage.name, '@vben/web-ele')

  required('apps/web-ele/src/router/routes/modules/selection.ts')
  required('apps/web-ele/src/modules/selection/views/customer.vue')
  required('apps/web-ele/src/modules/selection/views/process.vue')
  required('apps/web-ele/src/modules/selection/views/machine.vue')
  required('apps/web-ele/src/modules/selection/views/sensor.vue')
  assert.equal(fs.existsSync(path.join(root, 'public/index.html')), false)
  assert.equal(fs.existsSync(path.join(root, 'app/page.tsx')), false)

  const domainUrl = pathToFileURL(
    required('apps/web-ele/src/modules/selection/domain.js'),
  ).href
  const dataUrl = pathToFileURL(
    required('apps/web-ele/src/modules/selection/data.js'),
  ).href
  const domain = await import(domainUrl)
  const data = await import(dataUrl)

  const safeStore = domain.parsePersistedStore(
    '{"__proto__":[],"constructor":[],"safe":[],"invalid":{}}',
  )
  assert.equal(Object.getPrototypeOf(safeStore), null)
  assert.equal(Object.hasOwn(safeStore, '__proto__'), false)
  assert.deepEqual(safeStore.safe, [])
  assert.equal(Object.hasOwn(safeStore, 'invalid'), false)

  const normalized = domain.normalizeCrudItems('process-feat', [
    { id: -1, type: 7, name: '<img src=x>', desc: null, note: {} },
    { id: -1, type: '特性', name: '重复编号' },
  ])
  assert.equal(normalized.length, 2)
  assert.equal(new Set(normalized.map((item) => item.id)).size, 2)
  assert.equal(normalized.every((item) => Number.isSafeInteger(item.id) && item.id > 0), true)
  assert.equal(normalized[0].type, '7')
  assert.equal(normalized[0].note, '')

  const memory = new Map()
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  }
  const repository = domain.createSelectionRepository({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
    storage,
  })

  const sensorsBefore = repository.getSensors()
  assert.equal(sensorsBefore.length, 13)
  const duplicate = repository.saveSensor({
    ...sensorsBefore[0],
    id: undefined,
    model: sensorsBefore[0].model.toLowerCase(),
  })
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate' })

  const added = repository.saveSensor({
    status: '现用',
    sensorType: '漫反射',
    brand: 'TEST',
    model: 'CODEX-REGRESSION-UNIQUE',
    spec: '12~24V DC',
    feature: '回归测试',
    scene: '测试场景',
  })
  assert.equal(added.ok, true)
  assert.equal(repository.getSensors().length, sensorsBefore.length + 1)

  const stale = repository.saveCrud(
    'process-feat',
    '__stale__',
    { type: '特性', name: '已删除项目', desc: '', note: '' },
    999,
  )
  assert.deepEqual(stale, { ok: false, reason: 'stale' })

  const failingStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('storage blocked')
    },
  }
  const rollbackRepository = domain.createSelectionRepository({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
    storage: failingStorage,
  })
  const beforeRollback = rollbackRepository.getCrud('process-feat', 'DES显影').length
  const failedSave = rollbackRepository.saveCrud('process-feat', 'DES显影', {
    type: '特性',
    name: '不能落盘',
    desc: '',
    note: '',
  })
  assert.deepEqual(failedSave, { ok: false, reason: 'storage' })
  assert.equal(
    rollbackRepository.getCrud('process-feat', 'DES显影').length,
    beforeRollback,
  )

  const index = domain.buildSearchIndex({
    customerGroups: data.CUSTOMER_GROUPS,
    machineDetails: data.MACHINE_DETAILS,
    machineGroups: data.MACHINE_GROUPS,
    processDetails: data.PROCESS_DETAILS,
    processGroups: data.PROCESS_GROUPS,
    sensors: repository.getSensors(),
  })
  assert.equal(index.some((item) => item.title.includes('E3Z-D61')), true)
  assert.equal(index.some((item) => item.title === '庆鼎' && item.category === '华东'), true)
  assert.equal(index.some((item) => item.title === 'AOI专用机' && item.category === '特殊机型'), true)

  console.log('Vben migration contract checks passed.')
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
