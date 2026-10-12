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
    fs.readFileSync(required('frontend/package.json'), 'utf8'),
  )
  assert.equal(appPackage.name, 'saa-sensor-selection-frontend')

  required('frontend/src/pages/selection/CustomerPage.vue')
  required('frontend/src/pages/selection/ProcessPage.vue')
  // 客户、制程合并为一个「客户/制程」菜单，页面内用 Tab 切换
  required('frontend/src/pages/selection/CustomerProcessPage.vue')
  required('frontend/src/pages/selection/MachinePage.vue')
  required('frontend/src/pages/selection/SensorPage.vue')
  assert.equal(fs.existsSync(path.join(root, 'public/index.html')), false)
  assert.equal(fs.existsSync(path.join(root, 'app/page.tsx')), false)
  assert.equal(fs.existsSync(path.join(root, 'apps')), false)

  required('frontend/src/domain/types.ts')
  required('frontend/src/domain/keys.ts')
  required('frontend/src/domain/normalize.ts')
  required('frontend/src/domain/seed.ts')
  required('frontend/src/domain/repository.ts')
  required('frontend/src/domain/search.ts')
  required('frontend/src/domain/storage.ts')
  required('frontend/src/domain/schematic-report.ts')
  required('frontend/docs/07-domain-spec.md')

  const { createServer } = await import(
    pathToFileURL(path.join(root, 'frontend/node_modules/vite/dist/node/index.js'))
      .href,
  )
  const server = await createServer({
    appType: 'custom',
    configFile: path.join(root, 'frontend/vite.config.ts'),
    root: path.join(root, 'frontend'),
    server: { hmr: false, middlewareMode: true },
  })
  try {
    const domain = await server.ssrLoadModule('/src/domain/index.ts')
    const data = domain
    const { BackendStorage } = domain

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

  assert.deepEqual(
    repository.saveSensorSopFile({
      title: '暂不支持的 SOP 格式',
      fileName: 'sensor-sop.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dataUrl: 'data:application/octet-stream;base64,YQ==',
      size: 12,
      uploadedAt: '2026-08-27',
    }),
    { ok: false, reason: 'type' },
  )

  const savedSop = repository.saveSensorSopFile({
    title: '感应器安装 SOP',
    fileName: 'sensor-sop.pdf',
    mimeType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,YQ==',
    size: 12,
    uploadedAt: '2026-08-27',
  })
  assert.equal(savedSop.ok, true)
  assert.equal(repository.getSensorSopFiles()[0]?.fileName, 'sensor-sop.pdf')
  assert.deepEqual(repository.getSensorSops(), [])
  assert.deepEqual(repository.deleteSensorSopFile(savedSop.item.id), { ok: true })

  assert.deepEqual(
    repository.saveSensor3dFile({
      title: '暂不支持的模型格式',
      fileName: 'robot.step',
      mimeType: 'application/step',
      dataUrl: 'data:application/step;base64,YQ==',
      size: 12,
      uploadedAt: '2026-08-27',
    }),
    { ok: false, reason: 'type' },
  )

  const saved3d = repository.saveSensor3dFile({
    title: '六轴机模型',
    fileName: 'robot.pdf',
    mimeType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,YQ==',
    size: 12,
    uploadedAt: '2026-08-27',
  })
  assert.equal(saved3d.ok, true)
  assert.equal(repository.getSensor3dFiles()[0]?.fileName, 'robot.pdf')

  // 附件改为先 multipart 上传、再只把后端返回的 /api/files 引用写进 Store。
  const uploadedFileUrl = '/api/files/0ef1216b-484d-43ed-ad25-c5dd271295d8/content'
  const uploadedSop = repository.saveSensorSopFile({
    title: '已上传 SOP',
    fileName: 'uploaded-sop.pdf',
    mimeType: 'application/pdf',
    dataUrl: uploadedFileUrl,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  assert.equal(uploadedSop.ok, true)
  assert.equal(uploadedSop.item.dataUrl, uploadedFileUrl)
  assert.deepEqual(repository.deleteSensorSopFile(uploadedSop.item.id), { ok: true })
  const uploadedCatalog = repository.saveSensorSop({
    title: '已上传型录',
    fileName: 'uploaded-catalog.pdf',
    mimeType: 'application/pdf',
    dataUrl: uploadedFileUrl,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  assert.equal(uploadedCatalog.ok, true)
  assert.deepEqual(repository.deleteSensorSop(uploadedCatalog.item.id), { ok: true })
  const uploaded3d = repository.saveSensor3dFile({
    title: '已上传模型',
    fileName: 'uploaded-robot.pdf',
    mimeType: 'application/pdf',
    dataUrl: uploadedFileUrl,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  assert.equal(uploaded3d.ok, true)
  assert.deepEqual(repository.deleteSensor3dFile(uploaded3d.item.id), { ok: true })
  assert.deepEqual(
    repository.saveSensorSopFile({
      title: '外部地址',
      fileName: 'external.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'https://example.com/external.pdf',
      size: 12,
      uploadedAt: '2026-09-18',
    }),
    { ok: false, reason: 'validation' },
  )
  const linked3d = repository.saveSensor(
    { ...sensorsBefore[0], model3dId: saved3d.item.id },
    sensorsBefore[0].id,
  )
  assert.equal(linked3d.ok, true)
  assert.equal(linked3d.item.model3dId, saved3d.item.id)
  assert.deepEqual(repository.deleteSensor3dFile(saved3d.item.id), {
    ok: false,
    reason: 'in-use',
  })
  assert.equal(
    repository.saveSensor(
      { ...linked3d.item, model3dId: null },
      linked3d.item.id,
    ).ok,
    true,
  )
  assert.deepEqual(repository.deleteSensor3dFile(saved3d.item.id), { ok: true })

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

  // 桥接层拒绝写入时返回 false（不会 throw），内存同样必须回滚
  const rejectingStorage = {
    getItem: () => null,
    setItem: () => false,
  }
  const rejectedRepository = domain.createSelectionRepository({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
    storage: rejectingStorage,
  })
  const beforeReject = rejectedRepository.getCrud('process-feat', 'DES显影').length
  const rejectedSave = rejectedRepository.saveCrud('process-feat', 'DES显影', {
    type: '特性',
    name: '未登录不能落盘',
    desc: '',
    note: '',
  })
  assert.deepEqual(rejectedSave, { ok: false, reason: 'storage' })
  assert.equal(
    rejectedRepository.getCrud('process-feat', 'DES显影').length,
    beforeReject,
  )

  // 客户目录是「客户 → 区域」，资料挂在区域叶子上，数据键名为「客户/区域」
  assert.equal(domain.entityDataName('customer', '庆鼎', '华东'), '庆鼎/华东')
  assert.equal(domain.entityDataName('machine', '输送机构', '01 单段'), '01 单段')
  const customer = domain.entityDataName('customer', '庆鼎', '华东')
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

  const uploadedDoc = repository.saveControlledFile(customer, {
    ...pdfPayload,
    dataUrl: '/api/files/28b32f82-4fa2-46d2-99f6-12fc26ff24a7/content',
    fileName: 'uploaded.pdf',
  })
  assert.equal(uploadedDoc.ok, true)
  assert.deepEqual(
    repository.deleteControlledFile(customer, uploadedDoc.item.id),
    { ok: true },
  )
  assert.deepEqual(
    repository.saveControlledFile(customer, {
      ...pdfPayload,
      dataUrl: '/api/files/not-a-guid/content',
    }),
    { ok: false, reason: 'validation' },
  )

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
  assert.deepEqual(
    statusTypes.map(({ name, sort }) => ({ name, sort })),
    [
      { name: '01 待处理', sort: 1 },
      { name: '02 处理中', sort: 2 },
      { name: '03 测试中', sort: 3 },
      { name: '04 已解决', sort: 4 },
    ],
  )

  const savedFeedback = repository.saveCrud('customer-feedback', customer, {
    type: '现场临时异常',
    machine: '六轴上板机',
    problem: '字典分类验证',
    measure: '更换真空表头',
    date: '2026-08-11',
    status: '01 待处理',
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
    'measureHistory',
    'problem',
    'status',
    'type',
  ])
  assert.deepEqual(feedbackRow.measureHistory, [
    {
      date: '2026-08-11',
      measure: '更换真空表头',
      status: '现行',
    },
  ])

  const missingProblem = repository.saveCrud('customer-feedback', customer, {
    type: '感应器异常',
    machine: '',
    problem: '  ',
    measure: '',
    date: '2026-08-12',
    status: '01 待处理',
  })
  assert.deepEqual(missingProblem, { ok: false, reason: 'validation' })

  const optionalFields = repository.saveCrud('customer-feedback', customer, {
    type: '其他',
    machine: '',
    problem: '仅问题点',
    measure: '',
    date: '',
    status: '02 处理中',
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
    { name: '01 待处理-改', sort: 1 },
    statusTypes[0].id,
  )
  assert.equal(renamedStatus.ok, true)
  assert.equal(
    repository
      .getCrud('customer-feedback', customer)
      .some((item) => item.status === '01 待处理-改'),
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

  // ── 客户目录：客户（分组）→ 区域（叶子）────────────────────────────
  const customerGroups = repository.getEntityGroups('customer')
  assert.equal(customerGroups.some((group) => group.name === '庆鼎'), true)
  assert.equal(
    customerGroups.find((group) => group.name === '庆鼎').items.includes('华东'),
    true,
  )

  const createdCustomerGroup = repository.saveEntityGroup('customer', {
    name: '测试客户',
  })
  assert.equal(createdCustomerGroup.ok, true)

  // 同名区域可以出现在不同客户下；同一客户下不能重复
  const firstRegion = repository.saveEntityItem('customer', {
    category: '测试客户',
    name: '华东',
  })
  assert.equal(firstRegion.ok, true)
  assert.deepEqual(repository.getCrud('customer-req', '测试客户/华东'), [])
  assert.deepEqual(
    repository.saveEntityItem('customer', { category: '测试客户', name: '华东' }),
    { ok: false, reason: 'duplicate' },
  )
  assert.equal(
    repository.saveEntityItem('customer', { category: '测试客户', name: '华南' })
      .ok,
    true,
  )
  assert.deepEqual(
    repository
      .getEntityGroups('customer')
      .find((group) => group.name === '测试客户').items,
    ['华东', '华南'],
  )
  const normalizedShared = domain.normalizeEntityGroups(
    [
      { name: 'A', items: ['华东'] },
      { name: 'B', items: ['华东', '华东'] },
    ],
    'customer',
  )
  assert.deepEqual(
    normalizedShared.map((group) => group.items),
    [['华东'], ['华东']],
    'region names are unique per customer, not across customers',
  )

  // 同一区域名在两个客户下的资料互不影响
  assert.equal(
    repository.saveCrud('customer-req', '测试客户/华东', {
      type: '输送段-改',
      machine: 'ALL',
      process: 'DES',
      content: '测试客户华东要求',
      source: '验收规范-改',
    }).ok,
    true,
  )
  assert.equal(repository.getCrud('customer-req', '测试客户/华东').length, 1)
  assert.equal(
    repository
      .getCrud('customer-req', customer)
      .some((item) => item.content === '测试客户华东要求'),
    false,
  )

  // 重命名客户：其下所有区域的资料跟着改键
  const renamedCustomer = repository.saveEntityGroup(
    'customer',
    { name: '测试客户-改' },
    '测试客户',
  )
  assert.equal(renamedCustomer.ok, true)
  assert.equal(repository.getCrud('customer-req', '测试客户-改/华东').length, 1)
  assert.equal(
    Object.hasOwn(repository.snapshotStore(), 'customer-req:测试客户/华东'),
    false,
  )

  // 把区域移到另一个客户并改名：资料跟着移动
  const movedRegion = repository.saveEntityItem(
    'customer',
    { category: '健鼎', name: '华中', previousCategory: '测试客户-改' },
    '华东',
  )
  assert.equal(movedRegion.ok, true)
  assert.equal(repository.getCrud('customer-req', '健鼎/华中').length, 1)
  assert.equal(
    Object.hasOwn(repository.snapshotStore(), 'customer-req:测试客户-改/华东'),
    false,
  )

  // 区域名在客户之间不唯一，删除/编辑叶子必须指明客户
  assert.deepEqual(repository.deleteEntityItem('customer', '华东'), {
    ok: false,
    reason: 'validation',
  })
  assert.deepEqual(repository.deleteEntityItem('customer', '华中', '健鼎'), {
    ok: false,
    reason: 'not-empty',
  })
  assert.deepEqual(repository.deleteEntityItem('customer', '华东', '庆鼎'), {
    ok: false,
    reason: 'not-empty',
  })
  assert.equal(
    repository.entityHasData('customer', domain.entityDataName('customer', '测试客户-改', '华南')),
    false,
  )
  assert.equal(
    repository.deleteEntityItem('customer', '华南', '测试客户-改').ok,
    true,
  )
  assert.equal(repository.deleteEntityGroup('customer', '测试客户-改').ok, true)

  const reorderedGroups = repository.reorderEntityGroups('customer', 0, 1)
  assert.equal(reorderedGroups.ok, true)
  assert.equal(repository.getEntityGroups('customer')[1].name, '庆鼎')
  assert.deepEqual(repository.reorderEntityGroups('customer', 0, 99), {
    ok: false,
    reason: 'validation',
  })

  const blockedGroupDelete = repository.deleteEntityGroup('customer', '庆鼎')
  assert.deepEqual(blockedGroupDelete, { ok: false, reason: 'not-empty' })

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

  const machineName = '01 单段输送段（搭配）'
  assert.deepEqual(repository.listResolvedMachineSections(machineName), [])
  const conveyorRows = repository.getMachineSectionRows(1, machineName)
  assert.deepEqual(
    conveyorRows,
    [],
    'missing machine data must stay empty instead of creating demo rows',
  )

  // 结构类分区改为从 Sensor 目录多选，sensorType/spec 由所选型号派生
  const machineSensors = repository.getSensors().slice(0, 2)
  assert.ok(machineSensors.length === 2, 'sensor catalog should provide fixtures')
  const saved = repository.saveMachineSectionRow(1, machineName, {
    role: '进板检测',
    sensorIds: machineSensors.map((sensor) => sensor.id),
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
  assert.deepEqual(
    saved.item.sensorIds,
    machineSensors.map((sensor) => sensor.id),
  )
  assert.equal(
    saved.item.sensorType,
    machineSensors.map((sensor) => sensor.sensorType).join('、'),
  )
  assert.equal(
    saved.item.spec,
    machineSensors
      .map((sensor) => sensor.spec || sensor.model)
      .filter(Boolean)
      .join('、'),
  )
  assert.equal(Boolean(saved.item.image?.dataUrl), true)
  assert.equal(saved.item.type, undefined)
  assert.equal(saved.item.name, '')

  const missingMachineRole = repository.saveMachineSectionRow(1, machineName, {
    role: '  ',
    sensorIds: [machineSensors[0].id],
    purpose: '',
    note: '',
  })
  assert.deepEqual(missingMachineRole, { ok: false, reason: 'validation' })

  // 结构类分区必须选到至少一个目录型号，自由文本不再被接受
  const missingMachineSensor = repository.saveMachineSectionRow(1, machineName, {
    role: '进板检测',
    sensorType: '漫反射传感器',
    spec: 'OMRON E3Z-D61',
    purpose: '',
    note: '',
  })
  assert.deepEqual(missingMachineSensor, { ok: false, reason: 'validation' })

  // 目录中不存在的 ID 视为过期选择
  const staleMachineSensor = repository.saveMachineSectionRow(1, machineName, {
    role: '进板检测',
    sensorIds: [999_999],
    purpose: '',
    note: '',
  })
  assert.deepEqual(staleMachineSensor, { ok: false, reason: 'stale' })

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

  const machineB = '02 多段输送段（搭配）'
  const extraSection = repository.saveExtraMachineSection(machineName, {
    name: '本机专属Tab',
    kind: 'structure',
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
      role: '其他',
      sensorIds: [machineSensors[0].id],
      purpose: '',
      note: '',
    },
  )
  assert.equal(extraRow.ok, true)

  const renamedMachine = repository.saveEntityItem(
    'machine',
    {
      category: '输送机构',
      configuration: '标准输送段配置',
      previousCategory: '输送机构',
      previousConfiguration: '标准输送段配置',
      name: '01 单段输送段（搭配）-改',
    },
    machineName,
  )
  assert.equal(renamedMachine.ok, true)
  assert.equal(
    repository
      .listResolvedMachineSections('01 单段输送段（搭配）-改')
      .some((item) => item.name === '本机专属Tab'),
    true,
  )
  assert.equal(
    repository
      .getMachineSectionRows(extraSection.item.id, '01 单段输送段（搭配）-改')
      .some((item) => item.sensorIds.includes(machineSensors[0].id)),
    true,
  )
  assert.equal(repository.entityHasData('machine', '01 单段输送段（搭配）-改'), true)
  assert.equal(
    repository
      .getEntityGroups('machine')
      .some((group) => domain.listEntityGroupItems(group).includes(machineName)),
    false,
  )

  const rowOnlyMachine = repository.saveEntityItem('machine', {
    category: '输送机构',
    configuration: '标准输送段配置',
    name: '仅行数据机',
  })
  assert.equal(rowOnlyMachine.ok, true)
  assert.equal(repository.entityHasData('machine', '仅行数据机'), false)
  const rowOnlySection = repository.saveExtraMachineSection('仅行数据机', {
    name: '用户结构 Tab',
    kind: 'structure',
    sort: 1,
  })
  assert.equal(rowOnlySection.ok, true)
  const onlyRow = repository.saveMachineSectionRow(rowOnlySection.item.id, '仅行数据机', {
    role: '进板检测',
    sensorIds: [machineSensors[0].id],
    purpose: '',
    note: '',
  })
  assert.equal(onlyRow.ok, true)
  assert.equal(repository.entityHasData('machine', '仅行数据机'), true)

  const machineGroups = repository.getEntityGroups('machine')
  const machineSectionHits = []
  for (const group of machineGroups) {
    for (const name of domain.listEntityGroupItems(group)) {
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
  assert.equal(
    index.some(
      (item) =>
        item.type === 'customer' &&
        item.title === '庆鼎 / 华东' &&
        item.category === '庆鼎' &&
        item.query.category === '庆鼎' &&
        item.query.item === '华东',
    ),
    true,
    'customer search hits point at the customer/region leaf',
  )
  assert.equal(
    index.some(
      (item) =>
        item.title === '02 多段输送段（搭配）' &&
        item.category === '输送机构',
    ),
    true,
  )
  assert.equal(index.some((item) => item.title === 'AOI检测' && item.category === '内层'), true)
  assert.equal(index.some((item) => item.title === '测试客户-改'), false)
  assert.equal(
    index.some(
      (item) =>
        item.title === machineSensors[0].sensorType &&
        item.type === 'machine' &&
        item.query.item === '01 单段输送段（搭配）-改' &&
        item.query.section === String(extraSection.item.id),
    ),
    true,
  )
  assert.equal(
    index.some((item) => item.title === '01 单段输送段（搭配）-改' && item.type === 'machine'),
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

  // 写失败：标记后端离线，不再暴露浏览器本地数据
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
  assert.equal(bridge3.status, 'offline')
  assert.equal(bridge3.getItem('a'), null)
  assert.match(writeFailureMsg, /write blocked/)
  assert.equal(bridge3.lastError, 'write blocked: a')

  // 删除失败：同样标记后端离线，不再继续读取缓存
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
  assert.equal(bridge4.status, 'offline')
  assert.equal(bridge4.getItem('a'), null)
  assert.equal(bridge4.getItem('b'), null)

  // 后端不可达：不读取或写入浏览器本地数据
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
  assert.equal(bridge5.setItem('x', JSON.stringify([1])), false)
  assert.equal(bridge5.getItem('x'), null)
  assert.equal(localMemory5.has('x'), false)

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
  const onlineSnapshot = JSON.parse(localMemory7.get(domain.STORAGE_KEY))
  assert.deepEqual(onlineSnapshot['customer-req:庆鼎'], [
    { id: 1, content: '后端行' },
  ])

  // 后端再次不可达时，不向页面暴露上次在线快照
  const transportDown = createFakeTransport(
    {},
    { fetchError: new Error('network down') },
  )
  const bridgeDown = new BackendStorage({
    transport: transportDown,
    local: makeLocal(localMemory7),
  })
  const offlineFromSnapshot = await bridgeDown.init()
  assert.equal(offlineFromSnapshot.status, 'offline')
  assert.equal(bridgeDown.getItem(domain.STORAGE_KEY), null)

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

  // 未登录（启动即 401）且本地有旧数据：仍不向页面暴露本地缓存
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
  assert.equal(bridge6b.getItem(domain.STORAGE_KEY), null)

  // 会话中 token 失效（写 401）：切换到未登录状态，不再暴露缓存并禁止继续写入
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
  assert.equal(bridge9.getItem('a'), null)
  assert.equal(bridge9.setItem('a', JSON.stringify([{ v: 3 }])), false) // 禁止写入
  assert.equal(bridge9.getItem(domain.STORAGE_KEY), null)

  // 同一 key 连续两次排队写入都失败：回滚必须落到后端已确认的最后值，
  // 不能落到第一次失败前从未真正落地的中间乐观值上
  const localMemory9b = new Map()
  const transport9b = createFakeTransport({ a: [{ v: 1 }], other: [0] })
  transport9b.writeKey = async (key, value) => {
    if (key === 'a') throw new Error('write blocked: a')
    transport9b.remote.set(key, value)
    transport9b.calls.writes.push(key)
  }
  const bridge9b = new BackendStorage({
    transport: transport9b,
    local: makeLocal(localMemory9b),
  })
  await bridge9b.init()
  assert.equal(bridge9b.setItem('a', JSON.stringify([{ v: 2 }])), true)
  assert.equal(bridge9b.setItem('a', JSON.stringify([{ v: 3 }])), true)
  assert.equal(bridge9b.setItem('other', JSON.stringify([1])), true)
  await bridge9b.queue
  // 队列里排在失败之后的写入照常落地，但不能把已掉线的状态静默改回 online：
  // 页面已经收到 offline 并安排了重连，状态必须由重建后的新 bridge 恢复。
  assert.equal(bridge9b.status, 'offline')
  assert.deepEqual(transport9b.remote.get('other'), [1])
  assert.deepEqual(JSON.parse(bridge9b.readStoreJson()).a, [{ v: 1 }])

  // 后端 4xx 校验拒绝：只回滚该 key 并上报，不当作掉线（重连无意义，提示也不对）
  const rejected = new Error('数据格式无效')
  rejected.kind = 'error'
  rejected.status = 400
  const failures4xx = []
  const transport4xx = createFakeTransport(
    { a: [1] },
    { failKeys: ['a'], failError: rejected },
  )
  const bridge4xx = new BackendStorage({
    transport: transport4xx,
    local: makeLocal(new Map()),
    onWriteFailure: (message) => failures4xx.push(message),
  })
  await bridge4xx.init()
  assert.equal(bridge4xx.setItem('a', JSON.stringify([2])), true)
  await bridge4xx.queue
  assert.equal(bridge4xx.status, 'online')
  assert.equal(bridge4xx.getItem('a'), '[1]')
  assert.deepEqual(failures4xx, ['数据格式无效'])

  // 后端 5xx：视为服务不可用，进入 offline 等待重连
  const serverDown = new Error('请求失败（502）')
  serverDown.kind = 'error'
  serverDown.status = 502
  const transport5xx = createFakeTransport(
    { a: [1] },
    { failKeys: ['a'], failError: serverDown },
  )
  const bridge5xx = new BackendStorage({
    transport: transport5xx,
    local: makeLocal(new Map()),
  })
  await bridge5xx.init()
  bridge5xx.setItem('a', JSON.stringify([2]))
  await bridge5xx.queue
  assert.equal(bridge5xx.status, 'offline')

  // 写入失败回调触发时，缓存必须已经回滚，调用方据此重建仓库内存态
  let cacheAtFailure = null
  const transportRollback = createFakeTransport(
    { a: [1], b: [1] },
    { failKeys: ['a'] },
  )
  const bridgeRollback = new BackendStorage({
    transport: transportRollback,
    local: makeLocal(new Map()),
    onWriteFailure: () => {
      cacheAtFailure = JSON.parse(bridgeRollback.readStoreJson())
    },
  })
  await bridgeRollback.init()
  bridgeRollback.setItem(
    domain.STORAGE_KEY,
    JSON.stringify({ a: [2], b: [2] }),
  )
  await bridgeRollback.queue
  assert.deepEqual(cacheAtFailure, { a: [1], b: [2] })

  // 全量写回时，远端不存在且值为空数组的 key 不推送（不存在与空数组等价）；
  // 已存在的 key 被清空时仍要推送
  const transportEmpty = createFakeTransport({ a: [1], b: [1] })
  const bridgeEmpty = new BackendStorage({
    transport: transportEmpty,
    local: makeLocal(new Map()),
  })
  await bridgeEmpty.init()
  bridgeEmpty.setItem(
    domain.STORAGE_KEY,
    JSON.stringify({ a: [2], b: [], 'empty-1': [], 'empty-2': [] }),
  )
  await bridgeEmpty.queue
  assert.deepEqual(transportEmpty.calls.writes.sort(), ['a', 'b'])
  assert.deepEqual(transportEmpty.calls.deletes, [])
  // 之后把空 key 再移除，也不应对后端从未有过的 key 发 DELETE
  bridgeEmpty.setItem(domain.STORAGE_KEY, JSON.stringify({ a: [2], b: [] }))
  await bridgeEmpty.queue
  assert.deepEqual(transportEmpty.calls.deletes, [])

  // 读取路径不能写后端：访客/只读用户打开页面时，字典回填和旧名修正只能停留在内存
  for (const statuses of [
    // 自定义停用项 + 未被引用的「停用」→ 内存里移除「停用」
    [
      { id: 1, name: '现用', sort: 1 },
      { id: 2, name: '3-停用', sort: 2 },
      { id: 3, name: '停用', sort: 3 },
    ],
    // 缺少任何停用项 → 内存里补「停用」
    [{ id: 1, name: '现用', sort: 1 }],
  ]) {
    const readOnlyWrites = []
    const readOnlyRepo = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: {
        getItem: () =>
          JSON.stringify({
            'dict:sensor-status': statuses,
            'machine-global-sections:all': [
              { id: 1, name: '标准输送段', kind: 'structure', sort: 1 },
            ],
          }),
        setItem: (key) => {
          readOnlyWrites.push(key)
          return true
        },
      },
    })
    readOnlyRepo.getSensors()
    const names = readOnlyRepo
      .getDictionaryItems('sensor-status')
      .map((item) => item.name)
    assert.equal(names.filter((name) => name.endsWith('停用')).length, 1)
    readOnlyRepo.getGlobalMachineSections()
    assert.deepEqual(readOnlyWrites, [])
  }

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

  // 机型 Tab：按目录（结构 / 专案机型）共用的一组容器，机型放进 Tab 后
  // 只在 Tab 下显示；一个机型只在一个 Tab 里，内容跟着机型走。
  {
    const memoryTabs = new Map()
    const tabsRepo = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: {
        getItem: (key) => memoryTabs.get(key) ?? null,
        setItem: (key, value) => memoryTabs.set(key, value),
      },
    })
    const groups = tabsRepo.getEntityGroups('machine')
    const mechanismMachine = groups
      .filter((group) => domain.machineCatalogKind(group) === 'mechanism')
      .flatMap((group) => domain.listEntityGroupItems(group))[0]
    const projectMachine = groups
      .filter((group) => domain.machineCatalogKind(group) === 'project')
      .flatMap((group) => domain.listEntityGroupItems(group))[0]
    assert.ok(mechanismMachine && projectMachine)
    assert.deepEqual(tabsRepo.getMachineTabs('mechanism'), [])

    // 旧数据：机型自己的同名 Tab 里已有一条记录，放进 Tab 时要带过去
    const legacy = tabsRepo.saveExtraMachineSection(mechanismMachine, {
      kind: 'structure',
      name: '输送机构',
    })
    assert.equal(legacy.ok, true)
    const sensor = tabsRepo.getSensors()[0]
    assert.equal(
      tabsRepo.saveMachineSectionRow(legacy.item.id, mechanismMachine, {
        role: '旧入料确认',
        sensorIds: [sensor.id],
      }).ok,
      true,
    )

    const conveyor = tabsRepo.saveMachineTab('mechanism', {
      kind: 'structure',
      name: '输送机构',
    })
    assert.equal(conveyor.ok, true)
    assert.deepEqual(
      tabsRepo.saveMachineTab('mechanism', { kind: 'structure', name: '输送机构' }),
      { ok: false, reason: 'duplicate' },
    )
    // 两个目录的 Tab 各自独立，同名不冲突
    assert.equal(
      tabsRepo.saveMachineTab('project', { kind: 'structure', name: '输送机构' }).ok,
      true,
    )
    const lifter = tabsRepo.saveMachineTab('mechanism', {
      kind: 'structure',
      name: '收板机构',
    })
    assert.equal(lifter.ok, true)

    assert.deepEqual(tabsRepo.placeMachineInTab(projectMachine, conveyor.item.id), {
      ok: false,
      reason: 'validation',
    })
    assert.equal(tabsRepo.placeMachineInTab(mechanismMachine, conveyor.item.id).ok, true)
    assert.equal(tabsRepo.machineTabOf(mechanismMachine)?.id, conveyor.item.id)
    // 机型仍在目录数据里（改名/删除/查重照旧），只是目录树不再显示它
    assert.equal(
      tabsRepo
        .getEntityGroups('machine')
        .some((group) => domain.listEntityGroupItems(group).includes(mechanismMachine)),
      true,
    )
    const contentId = domain.MACHINE_CONTENT_SECTION_ID
    assert.deepEqual(
      tabsRepo.getMachineSectionRows(contentId, mechanismMachine).map((row) => row.role),
      ['旧入料确认'],
    )
    assert.deepEqual(tabsRepo.getMachineSectionRows(legacy.item.id, mechanismMachine), [])

    // 换到另一个 Tab：只在一个 Tab 里，内容跟着机型走
    assert.equal(tabsRepo.placeMachineInTab(mechanismMachine, lifter.item.id).ok, true)
    assert.equal(tabsRepo.machineTabOf(mechanismMachine)?.id, lifter.item.id)
    assert.deepEqual(
      tabsRepo.getMachineTabs('mechanism').find((tab) => tab.id === conveyor.item.id)
        ?.machines,
      [],
    )
    assert.equal(tabsRepo.getMachineSectionRows(contentId, mechanismMachine).length, 1)

    // 有内容时不能换到另一种类型（注意事项）的 Tab
    const notes = tabsRepo.saveMachineTab('mechanism', {
      kind: 'notes',
      name: '机型注意事项',
    })
    assert.deepEqual(tabsRepo.placeMachineInTab(mechanismMachine, notes.item.id), {
      ok: false,
      reason: 'not-empty',
    })

    // 改名时 Tab 里的名字跟着改；有内容的机型不能删
    const renamed = `${mechanismMachine}-改`
    const location = groups.find((group) =>
      domain.listEntityGroupItems(group).includes(mechanismMachine),
    )
    const configuration =
      location.configurations?.find((item) => item.items.includes(mechanismMachine))
        ?.name ?? null
    assert.equal(
      tabsRepo.saveEntityItem(
        'machine',
        {
          category: location.name,
          configuration,
          name: renamed,
          previousCategory: location.name,
          previousConfiguration: configuration,
        },
        mechanismMachine,
      ).ok,
      true,
    )
    assert.equal(tabsRepo.machineTabOf(renamed)?.id, lifter.item.id)
    assert.equal(tabsRepo.machineTabOf(mechanismMachine), null)
    assert.equal(tabsRepo.getMachineSectionRows(contentId, renamed).length, 1)
    assert.deepEqual(
      tabsRepo.deleteEntityItem('machine', renamed, location.name, configuration),
      { ok: false, reason: 'not-empty' },
    )

    // 移回目录；删除 Tab 时里面的机型也都回到目录
    assert.equal(tabsRepo.removeMachineFromTab(renamed).ok, true)
    assert.equal(tabsRepo.machineTabOf(renamed), null)
    assert.equal(tabsRepo.placeMachineInTab(renamed, lifter.item.id).ok, true)
    assert.deepEqual(tabsRepo.deleteMachineTab(lifter.item.id), { ok: true })
    assert.equal(tabsRepo.machineTabOf(renamed), null)
    assert.equal(tabsRepo.getMachineSectionRows(contentId, renamed).length, 1)

    const persisted = JSON.parse(memoryTabs.get(domain.STORAGE_KEY))
    assert.equal(Array.isArray(persisted['machine-tabs:all']), true)
    assert.equal(
      persisted['machine-tabs:all'].some((tab) => tab.id === lifter.item.id),
      false,
    )
  }

  // 内置基础数据物化：buildDefaultStore 覆盖字典/分组/制程/Sensor 目录；机型 Tab 由用户逐机型维护
  const defaultStore = domain.buildDefaultStore({
    crudDefaults: data.CRUD_DEFAULTS,
    sensorData: data.SENSOR_DATA,
  })
  assert.equal(
    Object.values(defaultStore).every((value) => Array.isArray(value)),
    true,
  )
  // 客户目录：客户 → 区域，内置资料按「客户/区域」落键
  assert.equal(defaultStore['entity-groups:customer'].length, 15)
  assert.deepEqual(
    defaultStore['entity-groups:customer'].find((group) => group.name === '庆鼎')
      .items,
    ['华东', '华南'],
  )
  assert.equal(defaultStore['customer-req:庆鼎/华东'].length > 0, true)
  assert.equal(defaultStore['customer-req:庆鼎'], undefined)
  assert.equal(defaultStore['entity-groups:machine'].length, 10)
  assert.equal(defaultStore['dict:sensor-type'].length > 0, true)
  assert.equal(
    defaultStore['dict:sensor-status'].some((item) => item.name === '停用'),
    true,
  )
  assert.equal(defaultStore['process-steps:all'].length > 0, true)
  assert.equal(defaultStore['machine-global-sections:all'], undefined)
  assert.equal(defaultStore['general-structure-labels:all'], undefined)
  assert.equal(defaultStore['dict:machine-section'], undefined)
  // 机型数据不再按「制程」分套：没有制程表，也没有 @process: 作用域的 key
  assert.equal(defaultStore['machine-processes:all'], undefined)
  assert.equal(
    Object.keys(defaultStore).some((key) => key.includes('@process:')),
    false,
  )
  assert.equal('getMachineProcesses' in repository, false)
  assert.equal('saveMachineProcess' in repository, false)
  assert.equal('deleteMachineProcess' in repository, false)
  assert.equal(defaultStore['sensor-catalog:all'].length > 0, true)
  assert.deepEqual(defaultStore['sensor-sop:all'], [])
  assert.deepEqual(defaultStore['sensor-sop-file:all'], [])
  assert.deepEqual(defaultStore['sensor-3d:all'], [])
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
  assert.equal(transport8.remote.get('machine-global-sections:all'), undefined)
  const seededRead = JSON.parse(bridge8.getItem(domain.STORAGE_KEY))
  assert.deepEqual(Object.keys(seededRead).sort(), Object.keys(defaultStore).sort())
  assert.deepEqual(seededRead['sensor-catalog:all'], defaultStore['sensor-catalog:all'])

  console.log('Selection domain contract checks passed.')
  } finally {
    await server.close()
  }
}

run().catch((error) => {
  // 打印完整错误（含断言栈），否则断言失败时无法定位到具体用例
  console.error(error)
  process.exitCode = 1
})
