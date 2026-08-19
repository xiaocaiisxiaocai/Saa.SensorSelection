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
  const backendStorageUrl = pathToFileURL(
    required('apps/web-ele/src/modules/selection/backend-storage.js'),
  ).href
  const domain = await import(domainUrl)
  const data = await import(dataUrl)
  const { BackendStorage } = await import(backendStorageUrl)

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

  const reqSourceTypes = repository.getDictionaryItems('customer-req-source')
  assert.equal(reqSourceTypes.length, 5)
  assert.deepEqual(
    reqSourceTypes.map((item) => item.name),
    ['验收规范', '厂外改善', '客户要求', '产品更新迭代', '其他'],
  )

  const savedReq = repository.saveCrud('customer-req', customer, {
    type: '输送段',
    machine: 'ALL',
    process: 'DES',
    content: '板件有无检测距离不大于 300mm',
    source: '验收规范',
    note: '示例备注',
  })
  assert.equal(savedReq.ok, true)
  assert.equal(savedReq.item.content, '板件有无检测距离不大于 300mm')
  assert.equal(savedReq.item.machine, 'ALL')
  assert.equal(savedReq.item.source, '验收规范')
  assert.equal(savedReq.item.name, undefined)
  assert.equal(savedReq.item.desc, undefined)

  const reqRow = repository
    .getCrud('customer-req', customer)
    .find((item) => item.content === '板件有无检测距离不大于 300mm')
  assert.ok(reqRow)
  assert.deepEqual(Object.keys(reqRow).sort(), [
    'content',
    'id',
    'machine',
    'note',
    'process',
    'source',
    'type',
  ])

  const missingContent = repository.saveCrud('customer-req', customer, {
    type: '输送段',
    machine: '',
    process: '',
    content: '  ',
    source: '其他',
    note: '',
  })
  assert.deepEqual(missingContent, { ok: false, reason: 'validation' })

  const optionalReq = repository.saveCrud('customer-req', customer, {
    type: '特殊要求',
    machine: '',
    process: '',
    content: '仅要求内容',
    source: '客户要求',
    note: '',
  })
  assert.equal(optionalReq.ok, true)
  assert.equal(optionalReq.item.machine, '')
  assert.equal(optionalReq.item.process, '')
  assert.equal(optionalReq.item.note, '')

  const renamedSource = repository.saveDictionaryItem(
    'customer-req-source',
    { name: '验收规范-改', sort: 1 },
    reqSourceTypes[0].id,
  )
  assert.equal(renamedSource.ok, true)
  assert.equal(
    repository
      .getCrud('customer-req', customer)
      .some((item) => item.source === '验收规范-改'),
    true,
  )

  const savedProc = repository.saveCrud('customer-proc', customer, {
    type: 'DES 制程',
    role: '板件传送检测',
    feature: '进出口设置漫反射传感器',
    sensorNote: '注意检测距离',
    note: '防止空喷损耗',
  })
  assert.equal(savedProc.ok, true)
  assert.equal(savedProc.item.role, '板件传送检测')
  assert.equal(savedProc.item.feature, '进出口设置漫反射传感器')
  assert.equal(savedProc.item.sensorNote, '注意检测距离')
  assert.equal(savedProc.item.name, undefined)
  assert.equal(savedProc.item.desc, undefined)

  const procRow = repository
    .getCrud('customer-proc', customer)
    .find((item) => item.role === '板件传送检测')
  assert.ok(procRow)
  assert.deepEqual(Object.keys(procRow).sort(), [
    'feature',
    'id',
    'note',
    'role',
    'sensorNote',
    'type',
  ])

  const missingRole = repository.saveCrud('customer-proc', customer, {
    type: 'AOI 制程',
    role: '  ',
    feature: '有特性',
    sensorNote: '',
    note: '',
  })
  assert.deepEqual(missingRole, { ok: false, reason: 'validation' })

  const missingFeature = repository.saveCrud('customer-proc', customer, {
    type: 'AOI 制程',
    role: '有作用',
    feature: '  ',
    sensorNote: '',
    note: '',
  })
  assert.deepEqual(missingFeature, { ok: false, reason: 'validation' })

  const optionalProc = repository.saveCrud('customer-proc', customer, {
    type: '通用',
    role: '仅作用与特性',
    feature: '特性正文',
    sensorNote: '',
    note: '',
  })
  assert.equal(optionalProc.ok, true)
  assert.equal(optionalProc.item.sensorNote, '')
  assert.equal(optionalProc.item.note, '')

  const renamedReq = repository.saveDictionaryItem(
    'customer-req',
    { name: '输送段-改', sort: 1 },
    reqTypes[0].id,
  )
  assert.equal(renamedReq.ok, true)
  assert.equal(
    repository
      .getCrud('customer-req', customer)
      .some((item) => item.type === '输送段-改'),
    true,
  )

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

  const reorderedGroups = repository.reorderEntityGroups('customer', 0, 2)
  assert.equal(reorderedGroups.ok, true)
  assert.deepEqual(
    repository.getEntityGroups('customer').map((group) => group.name),
    ['华南', 'SAT', '华东', '华中'],
  )
  const reorderedItems = repository.reorderEntityItems(
    'customer',
    '华东',
    0,
    1,
  )
  assert.equal(reorderedItems.ok, true)
  assert.deepEqual(repository.getEntityGroups('customer')[2].items.slice(0, 2), [
    '健鼎',
    '庆鼎',
  ])
  assert.deepEqual(repository.reorderEntityGroups('customer', 0, 99), {
    ok: false,
    reason: 'validation',
  })

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
  assert.equal(
    conveyorRows.some((row) => row.role && row.sensorType),
    true,
    'migrated conveyor rows should have role and sensorType',
  )

  const saved = repository.saveMachineSectionRow(1, machineName, {
    role: '进板检测',
    sensorType: '漫反射传感器',
    spec: 'OMRON E3Z-D61',
    purpose: '安装于进板口',
    note: '',
    image: {
      dataUrl: 'data:image/png;base64,aaa',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 3,
    },
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.item.role, '进板检测')
  assert.equal(saved.item.sensorType, '漫反射传感器')
  assert.equal(Boolean(saved.item.image?.dataUrl), true)
  assert.equal(saved.item.type, undefined)
  assert.equal(saved.item.name, '')

  const missingMachineRole = repository.saveMachineSectionRow(1, machineName, {
    role: '  ',
    sensorType: '有类型',
    spec: '',
    purpose: '',
    note: '',
  })
  assert.deepEqual(missingMachineRole, { ok: false, reason: 'validation' })

  const notesSave = repository.saveMachineSectionRow(4, machineName, {
    role: '自由注意分类',
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
  assert.equal(notesSave.item.role, '自由注意分类')
  assert.equal(notesSave.item.name, '无图')
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
    { role: '其他', sensorType: '专属行', spec: '', purpose: '', note: '' },
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
      .some((item) => item.sensorType === '专属行'),
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
    role: '进板检测',
    sensorType: '唯一行',
    spec: '',
    purpose: '',
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
            title: row.sensorType || row.name || row.role,
            category: group.name,
            sub: [name, section.name, row.role].filter(Boolean).join(' · '),
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

  // ---- 后端存储桥接层：迁移 / diff PUT / 回滚 / 离线与未登录降级 ----

  function createFakeTransport(initial, opts = {}) {
    const remote = new Map(Object.entries(initial))
    const calls = { writes: [], deletes: [], writeAlls: 0, fetches: 0 }
    return {
      calls,
      remote,
      async fetchStore() {
        calls.fetches += 1
        if (opts.fetchError) throw opts.fetchError
        return Object.fromEntries(remote)
      },
      async writeKey(key, value) {
        if (opts.failKeys && opts.failKeys.includes(key)) {
          throw opts.failError || new Error(`write blocked: ${key}`)
        }
        remote.set(key, value)
        calls.writes.push(key)
      },
      async deleteKey(key) {
        if (opts.failDeletes && opts.failDeletes.includes(key)) {
          throw new Error(`delete blocked: ${key}`)
        }
        remote.delete(key)
        calls.deletes.push(key)
      },
      async writeAll(store) {
        if (opts.failWriteAll) throw new Error('writeAll blocked')
        remote.clear()
        for (const [key, value] of Object.entries(store)) {
          remote.set(key, value)
        }
        calls.writeAlls += 1
      },
    }
  }

  const makeLocal = (memory) => ({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  })

  // 迁移：后端空库 + 本地有数据 → 自动导入
  const localMemory1 = new Map()
  localMemory1.set(
    domain.STORAGE_KEY,
    JSON.stringify({ 'customer-req': [{ id: 1, type: '输送段' }] }),
  )
  const transport1 = createFakeTransport({})
  const bridge1 = new BackendStorage({
    transport: transport1,
    local: makeLocal(localMemory1),
    migrateOnEmpty: true,
  })
  const migrated = await bridge1.init()
  assert.equal(migrated.status, 'online')
  assert.equal(migrated.migrated, true)
  assert.equal(migrated.seeded, false)
  assert.equal(migrated.keyCount, 1)
  assert.equal(transport1.calls.writeAlls, 1)
  assert.deepEqual(
    transport1.remote.get('customer-req'),
    [{ id: 1, type: '输送段' }],
  )

  // diff PUT：只推送变更的 key
  const localMemory2 = new Map()
  const transport2 = createFakeTransport({ a: [1], b: [2] })
  const bridge2 = new BackendStorage({
    transport: transport2,
    local: makeLocal(localMemory2),
  })
  await bridge2.init()
  assert.equal(bridge2.getItem('a'), '[1]')
  assert.equal(bridge2.setItem('a', JSON.stringify([1, 2])), true)
  assert.equal(bridge2.setItem('b', JSON.stringify([2])), true) // 值未变 → 不推送
  assert.equal(bridge2.setItem('c', JSON.stringify([3])), true) // 新 key
  await bridge2.queue
  assert.deepEqual(transport2.calls.writes.sort(), ['a', 'c'])
  assert.equal(transport2.calls.fetches, 1)
  assert.equal(transport2.calls.writeAlls, 0) // 后端非空 → 不迁移也不种子

  // 全量 store 写回：同一 key 只能产生一次 PUT，并保持远端与缓存一致
  const localMemoryFullStore = new Map()
  const fullStoreRemote = new Map([['a', [0]]])
  const fullStoreWrites = []
  const transportFullStore = {
    async fetchStore() {
      return Object.fromEntries(fullStoreRemote)
    },
    async writeKey(key, value) {
      fullStoreWrites.push({ key, value })
      if (fullStoreWrites.length === 1) {
        fullStoreRemote.set(key, value)
        return
      }
      throw new Error('unexpected duplicate write')
    },
    async deleteKey(key) {
      fullStoreRemote.delete(key)
    },
  }
  const bridgeFullStore = new BackendStorage({
    transport: transportFullStore,
    local: makeLocal(localMemoryFullStore),
  })
  await bridgeFullStore.init()
  assert.equal(
    bridgeFullStore.setItem(domain.STORAGE_KEY, JSON.stringify({ a: [1] })),
    true,
  )
  await bridgeFullStore.queue
  assert.equal(fullStoreWrites.length, 1)
  assert.deepEqual(fullStoreRemote.get('a'), [1])
  assert.equal(bridgeFullStore.getItem('a'), '[1]')

  // 写失败：乐观更新回滚到上次同步值
  const localMemory3 = new Map()
  let writeFailureMsg = ''
  const transport3 = createFakeTransport({ a: [{ v: 1 }] }, { failKeys: ['a'] })
  const bridge3 = new BackendStorage({
    transport: transport3,
    local: makeLocal(localMemory3),
    onWriteFailure: (message) => {
      writeFailureMsg = message
    },
  })
  await bridge3.init()
  assert.equal(bridge3.setItem('a', JSON.stringify([{ v: 2 }])), true)
  assert.equal(bridge3.getItem('a'), '[{"v":2}]') // 乐观读
  await bridge3.queue
  assert.equal(bridge3.getItem('a'), '[{"v":1}]') // 已回滚
  assert.match(writeFailureMsg, /write blocked/)
  assert.equal(bridge3.lastError, 'write blocked: a')

  // 删除失败：从已同步状态恢复该 key
  const localMemory4 = new Map()
  const transport4 = createFakeTransport(
    { a: [1], b: [2] },
    { failDeletes: ['a'] },
  )
  const bridge4 = new BackendStorage({
    transport: transport4,
    local: makeLocal(localMemory4),
  })
  await bridge4.init()
  bridge4.setItem(domain.STORAGE_KEY, JSON.stringify({ b: [2] })) // 整体写回：删除 a
  await bridge4.queue
  assert.equal(bridge4.getItem('a'), '[1]') // 删除失败 → 恢复
  assert.equal(bridge4.getItem('b'), '[2]')

  // 后端不可达：退化为本地模式（可读写）
  const localMemory5 = new Map()
  const transport5 = createFakeTransport(
    {},
    { fetchError: new Error('network down') },
  )
  const bridge5 = new BackendStorage({
    transport: transport5,
    local: makeLocal(localMemory5),
  })
  const offline = await bridge5.init()
  assert.equal(offline.status, 'offline')
  assert.equal(bridge5.setItem('x', JSON.stringify([1])), true)
  assert.equal(bridge5.getItem('x'), '[1]')
  assert.equal(localMemory5.get('x'), '[1]')

  // 在线模式：getItem(STORAGE_KEY) 必须把扁平缓存组装成完整 store（仓库按整库读取）
  const localMemory7 = new Map()
  const transport7 = createFakeTransport({
    'customer-req:庆鼎': [{ id: 1, content: '后端行' }],
    'dict:customer-req': [{ id: 9, name: '输送段' }],
  })
  const bridge7 = new BackendStorage({
    transport: transport7,
    local: makeLocal(localMemory7),
  })
  await bridge7.init()
  const fullStore = JSON.parse(bridge7.getItem(domain.STORAGE_KEY))
  assert.deepEqual(Object.keys(fullStore).sort(), [
    'customer-req:庆鼎',
    'dict:customer-req',
  ])
  assert.deepEqual(fullStore['customer-req:庆鼎'], [{ id: 1, content: '后端行' }])
  assert.equal(bridge7.getItem('customer-req:庆鼎'), '[{"id":1,"content":"后端行"}]')

  // 未登录：读本地缓存、拒绝写入
  const unauthorized = new Error('token expired')
  unauthorized.kind = 'unauthorized'
  const localMemory6 = new Map()
  const transport6 = createFakeTransport({}, { fetchError: unauthorized })
  const bridge6 = new BackendStorage({
    transport: transport6,
    local: makeLocal(localMemory6),
  })
  const authState = await bridge6.init()
  assert.equal(authState.status, 'unauthorized')
  assert.equal(bridge6.setItem('y', JSON.stringify([1])), false)
  assert.equal(bridge6.getItem('y'), null)

  // 未登录（启动即 401）但本地有旧数据：整库读取仍回退到本地缓存
  const localMemory6b = new Map()
  localMemory6b.set(
    domain.STORAGE_KEY,
    JSON.stringify({ 'customer-req:庆鼎': [{ id: 1, content: '本地旧数据' }] }),
  )
  const transport6b = createFakeTransport({}, { fetchError: unauthorized })
  const bridge6b = new BackendStorage({
    transport: transport6b,
    local: makeLocal(localMemory6b),
  })
  const authState6b = await bridge6b.init()
  assert.equal(authState6b.status, 'unauthorized')
  const localRead = JSON.parse(bridge6b.getItem(domain.STORAGE_KEY))
  assert.deepEqual(localRead['customer-req:庆鼎'], [
    { id: 1, content: '本地旧数据' },
  ])

  // 会话中 token 失效（写 401）：切换到未登录状态并保留已同步缓存供只读，禁止继续写入
  const localMemory9 = new Map()
  const expired = new Error('token expired')
  expired.kind = 'unauthorized'
  const transport9 = createFakeTransport(
    { a: [{ v: 1 }] },
    { failKeys: ['a'], failError: expired },
  )
  const bridge9 = new BackendStorage({
    transport: transport9,
    local: makeLocal(localMemory9),
  })
  await bridge9.init()
  assert.equal(bridge9.status, 'online')
  assert.equal(bridge9.setItem('a', JSON.stringify([{ v: 2 }])), true)
  await bridge9.queue
  assert.equal(bridge9.status, 'unauthorized') // 已切换到未登录（前端引导跳转登录页）
  assert.equal(bridge9.getItem('a'), '[{"v":1}]') // 缓存保留上次同步值
  assert.equal(bridge9.setItem('a', JSON.stringify([{ v: 3 }])), false) // 禁止写入
  const full9 = JSON.parse(bridge9.getItem(domain.STORAGE_KEY))
  assert.deepEqual(full9.a, [{ v: 1 }])

  // 种子版本化回填：远端版本落后时补种缺失默认 key，不覆盖用户已有数据
  const localMemory10 = new Map()
  const transport10 = createFakeTransport({
    a: [1],
    'customer-req:庆鼎': [{ id: 1, content: '用户数据' }],
    'dict:sensor-type': [{ id: 1, name: '旧类型' }],
  })
  const bridge10 = new BackendStorage({
    transport: transport10,
    local: makeLocal(localMemory10),
    migrateOnEmpty: true,
    seedDefaults: {
      b: [2],
      // 已存在 → 必须不被覆盖
      'dict:sensor-type': [{ id: 1, name: '新类型' }],
      'meta:seed-version': [{ version: 2 }],
    },
  })
  await bridge10.init()
  assert.equal(bridge10.status, 'online')
  // 只补缺失 key + 版本号
  assert.deepEqual(transport10.calls.writes.sort(), ['b', 'meta:seed-version'])
  assert.equal(transport10.calls.writeAlls, 0)
  assert.deepEqual(transport10.remote.get('a'), [1])
  assert.deepEqual(transport10.remote.get('dict:sensor-type'), [
    { id: 1, name: '旧类型' },
  ])
  assert.deepEqual(transport10.remote.get('b'), [2])
  assert.deepEqual(transport10.remote.get('meta:seed-version'), [
    { version: 2 },
  ])
  // 缓存已包含回填数据
  const full10 = JSON.parse(bridge10.getItem(domain.STORAGE_KEY))
  assert.deepEqual(full10.b, [2])
  assert.deepEqual(full10['dict:sensor-type'], [{ id: 1, name: '旧类型' }])

  // 版本一致（已是最新）：不产生任何写入
  const localMemory11 = new Map()
  const transport11 = createFakeTransport({
    a: [1],
    'meta:seed-version': [{ version: 2 }],
  })
  const bridge11 = new BackendStorage({
    transport: transport11,
    local: makeLocal(localMemory11),
    seedDefaults: {
      b: [2],
      'meta:seed-version': [{ version: 2 }],
    },
  })
  await bridge11.init()
  assert.deepEqual(transport11.calls.writes, [])
  assert.equal(transport11.calls.writeAlls, 0)

  // 内置基础数据物化：buildDefaultStore 覆盖字典/分组/制程/机型结构/Sensor 目录
  const defaultStore = domain.buildDefaultStore({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
  })
  assert.equal(
    Object.values(defaultStore).every((value) => Array.isArray(value)),
    true,
  )
  assert.equal(defaultStore['entity-groups:customer'].length, 3) // 华东/华南/SAT
  assert.equal(defaultStore['entity-groups:machine'].length, 4)
  assert.equal(defaultStore['dict:sensor-type'].length > 0, true)
  assert.equal(
    defaultStore['dict:sensor-status'].some((item) => item.name === '停用'),
    true,
  )
  assert.equal(defaultStore['process-steps:all'].length > 0, true)
  assert.equal(defaultStore['machine-global-sections:all'].length, 4)
  assert.equal(defaultStore['general-structure-labels:all'].length, 3)
  assert.equal(defaultStore['sensor-catalog:all'].length > 0, true)
  assert.deepEqual(defaultStore['sensor-sop:all'], [])
  assert.deepEqual(defaultStore['meta:seed-version'], [
    { version: data.SEED_VERSION },
  ])

  // 种子导入：后端空库 + 本地无数据 + 提供 seedDefaults → 初始化基础数据
  const localMemory8 = new Map()
  const transport8 = createFakeTransport({})
  const bridge8 = new BackendStorage({
    transport: transport8,
    local: makeLocal(localMemory8),
    migrateOnEmpty: true,
    seedDefaults: defaultStore,
  })
  const seeded = await bridge8.init()
  assert.equal(seeded.status, 'online')
  assert.equal(seeded.seeded, true)
  assert.equal(seeded.migrated, false)
  assert.equal(transport8.calls.writeAlls, 1)
  assert.deepEqual(
    transport8.remote.get('machine-global-sections:all'),
    defaultStore['machine-global-sections:all'],
  )
  const seededRead = JSON.parse(bridge8.getItem(domain.STORAGE_KEY))
  assert.deepEqual(Object.keys(seededRead).sort(), Object.keys(defaultStore).sort())
  assert.deepEqual(seededRead['sensor-catalog:all'], defaultStore['sensor-catalog:all'])

  // 旧机型结构名修复：必须经注入的 storage 持久化（online 下即桥接层 → 后端）
  const legacyMemory = new Map()
  legacyMemory.set(
    domain.STORAGE_KEY,
    JSON.stringify({
      'machine-global-sections:all': [
        {
          id: 1,
          name: '标准输送段',
          sort: 1,
          kind: 'structure',
          scope: 'global',
        },
        {
          id: 2,
          name: '手臂机构',
          sort: 2,
          kind: 'structure',
          scope: 'global',
        },
        {
          id: 3,
          name: '台车工位结构',
          sort: 3,
          kind: 'structure',
          scope: 'global',
        },
        {
          id: 4,
          name: '机型注意事项',
          sort: 4,
          kind: 'notes',
          locked: true,
          scope: 'global',
        },
      ],
    }),
  )
  const legacyStorage = {
    getItem: (key) => legacyMemory.get(key) ?? null,
    setItem: (key, value) => legacyMemory.set(key, value),
  }
  const legacyRepo = domain.createSelectionRepository({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
    storage: legacyStorage,
  })
  legacyRepo.getGlobalMachineSections()
  const repaired = JSON.parse(legacyMemory.get(domain.STORAGE_KEY))
  assert.equal(
    repaired['machine-global-sections:all'].find((item) => item.id === 1).name,
    '输送机构',
  )

  console.log('Vben migration contract checks passed.')
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
