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
    partNumber: ' PN-001 ',
  })
  assert.equal(added.ok, true)
  assert.equal(added.item.partNumber, 'PN-001')
  assert.equal(repository.getSensors().length, sensorsBefore.length + 1)
  assert.equal(
    repository.getSensors().find((item) => item.model === 'CODEX-REGRESSION-UNIQUE')
      ?.partNumber,
    'PN-001',
  )

  const sensorStatusesEarly = repository.getDictionaryItems('sensor-status')
  assert.equal(
    sensorStatusesEarly.some((item) => item.name === '停用'),
    true,
    'sensor-status should include 停用',
  )

  const currentSeed = repository
    .getSensors()
    .find((item) => item.status === '现用' && item.sensorType === '漫反射')
  const alternateSeed = repository
    .getSensors()
    .find((item) => item.status === '备选' && item.sensorType === '漫反射')
  assert.ok(currentSeed && alternateSeed, 'seed should have 现用 and 备选')

  const replaceMissingNote = repository.replaceSensorCurrent(
    alternateSeed.id,
    currentSeed.id,
    '   ',
  )
  assert.deepEqual(replaceMissingNote, { ok: false, reason: 'validation' })

  const replaceBadTarget = repository.replaceSensorCurrent(
    alternateSeed.id,
    alternateSeed.id,
    '误触发',
  )
  assert.deepEqual(replaceBadTarget, { ok: false, reason: 'validation' })

  const replaced = repository.replaceSensorCurrent(
    alternateSeed.id,
    currentSeed.id,
    '检测不稳定',
  )
  assert.equal(replaced.ok, true)
  const afterReplace = repository.getSensors()
  const newCurrent = afterReplace.find((item) => item.id === alternateSeed.id)
  const retired = afterReplace.find((item) => item.id === currentSeed.id)
  assert.equal(newCurrent?.status, '现用')
  assert.equal(newCurrent?.replacesId, currentSeed.id)
  assert.equal(newCurrent?.problemNote, '检测不稳定')
  assert.equal(retired?.status, '停用')
  assert.equal(retired?.replacedById, alternateSeed.id)
  assert.equal(retired?.problemNote, '检测不稳定')
  assert.ok(retired?.replacedAt)

  const withPart = repository.saveSensor(
    {
      ...newCurrent,
      partNumber: 'PN-ALT-9',
    },
    newCurrent.id,
  )
  assert.equal(withPart.ok, true)
  const searchSensors = repository.getSensors()
  const replaceIndex = domain.buildSearchIndex({
    customerGroups: repository.getEntityGroups('customer'),
    machineDetails: data.MACHINE_DETAILS,
    machineGroups: repository.getEntityGroups('machine'),
    machineSectionHits: [],
    processSteps: repository.getProcessSteps(),
    sensors: searchSensors,
  })
  assert.equal(
    replaceIndex.some(
      (item) =>
        item.type === 'sensor' &&
        item.title.includes('PN-ALT-9') &&
        item.sub.includes('现用'),
    ),
    true,
  )
  assert.equal(
    replaceIndex.some(
      (item) =>
        item.type === 'sensor' &&
        item.sub.includes('停用') &&
        item.sub.includes('检测不稳定'),
    ),
    true,
  )

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

  const customer = '庆鼎'
  const defaultDocs = repository.getControlledDocuments(customer)
  assert.equal(defaultDocs.length, 0)

  const pdfPayload = {
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    fileName: 'sop.pdf',
    mimeType: 'application/pdf',
    size: 128,
    uploadedAt: '2026-08-11',
  }
  const savedPdf = repository.saveControlledFile(customer, pdfPayload)
  assert.equal(savedPdf.ok, true)
  const withPdf = repository.getControlledDocuments(customer)
  assert.equal(withPdf.length, 1)
  assert.equal(withPdf[0].fileName, 'sop.pdf')
  assert.equal(withPdf[0].kind, 'pdf')

  const wordPayload = {
    dataUrl: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=',
    fileName: 'sop.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 256,
    uploadedAt: '2026-08-11',
  }
  const savedWord = repository.saveControlledFile(customer, wordPayload)
  assert.equal(savedWord.ok, true)
  assert.equal(repository.getControlledDocuments(customer).length, 2)

  const invalidType = repository.saveControlledFile(customer, {
    ...pdfPayload,
    fileName: 'bad.exe',
    mimeType: 'application/octet-stream',
  })
  assert.deepEqual(invalidType, { ok: false, reason: 'type' })

  const pdfId = withPdf[0].id
  const deletedPdf = repository.deleteControlledFile(customer, pdfId)
  assert.equal(deletedPdf.ok, true)
  assert.equal(repository.getControlledDocuments(customer).length, 1)
  assert.equal(repository.getControlledDocuments(customer)[0].fileName, 'sop.docx')

  const staleDoc = repository.deleteControlledFile(customer, pdfId)
  assert.deepEqual(staleDoc, { ok: false, reason: 'stale' })

  const legacyDocs = domain.normalizeControlledDocuments([
    {
      label: '常规结构配置 SOP',
      pdf: pdfPayload,
      word: null,
    },
  ])
  assert.equal(legacyDocs.length, 1)
  assert.equal(legacyDocs[0].kind, 'pdf')

  const feedbackTypes = repository.getDictionaryItems('customer-feedback')
  assert.equal(feedbackTypes.length, 8)
  assert.deepEqual(
    feedbackTypes.map((item) => item.name),
    [
      '感应器异常',
      '测板厚异常',
      '智能化异常',
      '选型配置异常',
      '客户要求',
      '料件损坏',
      '厂外改善',
      '其他',
    ],
  )

  const reqTypes = repository.getDictionaryItems('customer-req')
  assert.equal(reqTypes.some((item) => item.name === '输送段'), true)

  const addedType = repository.saveDictionaryItem('customer-feedback', {
    name: '现场临时异常',
    sort: 9,
  })
  assert.equal(addedType.ok, true)
  assert.equal(repository.getDictionaryItems('customer-feedback').length, 9)

  const duplicateType = repository.saveDictionaryItem('customer-feedback', {
    name: '现场临时异常',
    sort: 5,
  })
  assert.deepEqual(duplicateType, { ok: false, reason: 'duplicate' })

  const statusTypes = repository.getDictionaryItems('customer-feedback-status')
  assert.equal(statusTypes.length, 3)
  assert.equal(statusTypes[0].name, '待处理')

  const savedFeedback = repository.saveCrud('customer-feedback', customer, {
    type: '现场临时异常',
    machine: '六轴上板机',
    problem: '字典分类验证',
    measure: '更换真空表头',
    date: '2026-08-11',
    status: '待处理',
  })
  assert.equal(savedFeedback.ok, true)
  assert.equal(savedFeedback.item.problem, '字典分类验证')
  assert.equal(savedFeedback.item.machine, '六轴上板机')
  assert.equal(savedFeedback.item.measure, '更换真空表头')
  assert.equal(savedFeedback.item.title, undefined)
  assert.equal(savedFeedback.item.desc, undefined)
  assert.equal(savedFeedback.item.actions, undefined)

  const feedbackRow = repository
    .getCrud('customer-feedback', customer)
    .find((item) => item.problem === '字典分类验证')
  assert.ok(feedbackRow)
  assert.deepEqual(Object.keys(feedbackRow).sort(), [
    'date',
    'id',
    'machine',
    'measure',
    'problem',
    'status',
    'type',
  ])

  const missingProblem = repository.saveCrud('customer-feedback', customer, {
    type: '感应器异常',
    machine: '',
    problem: '  ',
    measure: '',
    date: '2026-08-12',
    status: '待处理',
  })
  assert.deepEqual(missingProblem, { ok: false, reason: 'validation' })

  const optionalFields = repository.saveCrud('customer-feedback', customer, {
    type: '其他',
    machine: '',
    problem: '仅问题点',
    measure: '',
    date: '',
    status: '处理中',
  })
  assert.equal(optionalFields.ok, true)
  assert.equal(optionalFields.item.machine, '')
  assert.equal(optionalFields.item.measure, '')

  const renamed = repository.saveDictionaryItem(
    'customer-feedback',
    { name: '现场临时异常-改', sort: 9 },
    addedType.item.id,
  )
  assert.equal(renamed.ok, true)
  assert.equal(
    repository
      .getCrud('customer-feedback', customer)
      .some((item) => item.type === '现场临时异常-改'),
    true,
  )

  const renamedStatus = repository.saveDictionaryItem(
    'customer-feedback-status',
    { name: '待处理-改', sort: 1 },
    statusTypes[0].id,
  )
  assert.equal(renamedStatus.ok, true)
  assert.equal(
    repository
      .getCrud('customer-feedback', customer)
      .some((item) => item.status === '待处理-改'),
    true,
  )

  const renamedReq = repository.saveDictionaryItem(
    'customer-req',
    { name: '输送段-改', sort: 1 },
    reqTypes[0].id,
  )
  assert.equal(renamedReq.ok, true)

  const customerGroups = repository.getEntityGroups('customer')
  assert.equal(customerGroups.some((group) => group.name === '华东'), true)
  assert.equal(
    customerGroups.some((group) => group.items.includes('庆鼎')),
    true,
  )

  const createdRegion = repository.saveEntityGroup('customer', {
    name: '华中',
  })
  assert.equal(createdRegion.ok, true)

  const createdCustomer = repository.saveEntityItem('customer', {
    category: '华中',
    name: '测试客户',
  })
  assert.equal(createdCustomer.ok, true)
  assert.deepEqual(repository.getCrud('customer-req', '测试客户'), [])

  const blockedDelete = repository.deleteEntityItem('customer', '庆鼎')
  assert.deepEqual(blockedDelete, { ok: false, reason: 'not-empty' })

  const movedCustomer = repository.saveEntityItem(
    'customer',
    { category: '华南', name: '测试客户-改' },
    '测试客户',
  )
  assert.equal(movedCustomer.ok, true)
  assert.equal(
    repository
      .getEntityGroups('customer')
      .some(
        (group) =>
          group.name === '华南' && group.items.includes('测试客户-改'),
      ),
    true,
  )
  assert.deepEqual(repository.getCrud('customer-req', '测试客户-改'), [])

  const deletedCustomer = repository.deleteEntityItem('customer', '测试客户-改')
  assert.equal(deletedCustomer.ok, true)

  const blockedGroupDelete = repository.deleteEntityGroup('customer', '华东')
  assert.deepEqual(blockedGroupDelete, { ok: false, reason: 'not-empty' })

  const deletedRegion = repository.deleteEntityGroup('customer', '华中')
  assert.equal(deletedRegion.ok, true)

  const sensorStatuses = repository.getDictionaryItems('sensor-status')
  assert.equal(sensorStatuses.some((item) => item.name === '现用'), true)
  const sensorTypes = repository.getDictionaryItems('sensor-type')
  assert.equal(sensorTypes.some((item) => item.name === '漫反射'), true)

  const renamedSensorType = repository.saveDictionaryItem(
    'sensor-type',
    { name: '漫反射-改', sort: 1 },
    sensorTypes.find((item) => item.name === '漫反射').id,
  )
  assert.equal(renamedSensorType.ok, true)
  assert.equal(
    repository.getSensors().some((item) => item.sensorType === '漫反射-改'),
    true,
  )

  const sections = repository.getGlobalMachineSections()
  assert.equal(sections.some((item) => item.name === '机型注意事项' && item.kind === 'notes' && item.locked), true)

  const machineName = '中间六轴机'
  const conveyorRows = repository.getMachineSectionRows(1, machineName)
  assert.ok(conveyorRows.length >= 1, 'legacy conveyor rows should migrate')

  const saved = repository.saveMachineSectionRow(1, machineName, {
    type: '进板检测',
    name: '测试图行',
    desc: '带图',
    note: '',
    image: {
      dataUrl: 'data:image/png;base64,aaa',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 3,
    },
  })
  assert.equal(saved.ok, true)
  assert.equal(Boolean(saved.item.image?.dataUrl), true)

  const notesSave = repository.saveMachineSectionRow(4, machineName, {
    type: '安装注意',
    name: '无图',
    desc: '',
    note: '',
    image: {
      dataUrl: 'data:image/png;base64,aaa',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 3,
    },
  })
  assert.equal(notesSave.ok, true)
  assert.equal(notesSave.item.image == null, true)

  const delNotes = repository.deleteGlobalMachineSection(
    sections.find((item) => item.kind === 'notes').id,
  )
  assert.equal(delNotes.ok, false)

  const machineB = '中间翻板机'
  const extraSection = repository.saveExtraMachineSection(machineName, {
    name: '本机专属Tab',
    sort: 10,
  })
  assert.equal(extraSection.ok, true)
  assert.equal(
    repository
      .listResolvedMachineSections(machineName)
      .some((item) => item.name === '本机专属Tab' && item.scope === 'machine'),
    true,
  )
  assert.equal(
    repository
      .listResolvedMachineSections(machineB)
      .some((item) => item.name === '本机专属Tab'),
    false,
  )

  const delStructure = repository.deleteGlobalMachineSection(1)
  assert.deepEqual(delStructure, { ok: false, reason: 'not-empty' })

  const extraRow = repository.saveMachineSectionRow(
    extraSection.item.id,
    machineName,
    {
      type: '其他',
      name: '专属行',
      desc: '',
      note: '',
    },
  )
  assert.equal(extraRow.ok, true)

  const renamedMachine = repository.saveEntityItem(
    'machine',
    { category: '中间段', name: '中间六轴机-改' },
    machineName,
  )
  assert.equal(renamedMachine.ok, true)
  assert.equal(
    repository
      .listResolvedMachineSections('中间六轴机-改')
      .some((item) => item.name === '本机专属Tab'),
    true,
  )
  assert.equal(
    repository
      .getMachineSectionRows(extraSection.item.id, '中间六轴机-改')
      .some((item) => item.name === '专属行'),
    true,
  )
  assert.equal(repository.entityHasData('machine', '中间六轴机-改'), true)
  assert.equal(
    repository
      .getEntityGroups('machine')
      .some((group) => group.items.includes('中间六轴机')),
    false,
  )

  const rowOnlyMachine = repository.saveEntityItem('machine', {
    category: '中间段',
    name: '仅行数据机',
  })
  assert.equal(rowOnlyMachine.ok, true)
  assert.equal(repository.entityHasData('machine', '仅行数据机'), false)
  const onlyRow = repository.saveMachineSectionRow(1, '仅行数据机', {
    type: '进板检测',
    name: '唯一行',
    desc: '',
    note: '',
  })
  assert.equal(onlyRow.ok, true)
  assert.equal(repository.entityHasData('machine', '仅行数据机'), true)

  const machineGroups = repository.getEntityGroups('machine')
  const machineSectionHits = []
  for (const group of machineGroups) {
    for (const name of group.items) {
      for (const section of repository.listResolvedMachineSections(name)) {
        for (const row of repository.getMachineSectionRows(section.id, name)) {
          machineSectionHits.push({
            type: 'machine',
            title: row.name,
            category: group.name,
            sub: [name, section.name, row.type].filter(Boolean).join(' · '),
            path: '/selection/machine',
            query: {
              category: group.name,
              item: name,
              section: String(section.id),
            },
          })
        }
      }
    }
  }

  const index = domain.buildSearchIndex({
    customerGroups: repository.getEntityGroups('customer'),
    machineDetails: data.MACHINE_DETAILS,
    machineGroups,
    machineSectionHits,
    processSteps: repository.getProcessSteps(),
    sensors: repository.getSensors(),
  })
  assert.equal(index.some((item) => item.title.includes('E3Z-D61')), true)
  assert.equal(index.some((item) => item.title === '庆鼎' && item.category === '华东'), true)
  assert.equal(index.some((item) => item.title === 'AOI专用机' && item.category === '特殊机型'), true)
  assert.equal(index.some((item) => item.title === 'AOI检测' && item.category === '内层'), true)
  assert.equal(index.some((item) => item.title === '测试客户-改'), false)
  assert.equal(
    index.some(
      (item) =>
        item.title === '专属行' &&
        item.type === 'machine' &&
        item.query.item === '中间六轴机-改' &&
        item.query.section === String(extraSection.item.id),
    ),
    true,
  )
  assert.equal(
    index.some((item) => item.title === '中间六轴机-改' && item.type === 'machine'),
    true,
  )

  console.log('Vben migration contract checks passed.')
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
