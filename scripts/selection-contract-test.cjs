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

  const pdf = 'data:application/pdf;base64,JVBERi0xLjAK'
  const currentCatalog = repository.saveSensorSop({
    title: '现用型录',
    fileName: 'current-catalog.pdf',
    mimeType: 'application/pdf',
    dataUrl: pdf,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  const alternateCatalog = repository.saveSensorSop({
    title: '备选型录',
    fileName: 'alternate-catalog.pdf',
    mimeType: 'application/pdf',
    dataUrl: pdf,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  const alternateModel = repository.saveSensor3dFile({
    title: '备选模型',
    fileName: 'alternate-model.pdf',
    mimeType: 'application/pdf',
    dataUrl: pdf,
    size: 12,
    uploadedAt: '2026-09-18',
  })
  assert.equal(currentCatalog.ok, true)
  assert.equal(alternateCatalog.ok, true)
  assert.equal(alternateModel.ok, true)
  // 现用有型录、没有 3D；备选自己两者都有。替换后型录沿用现用，3D 留备选自己的。
  assert.equal(
    repository.saveSensor(
      { ...currentSeed, sopId: currentCatalog.item.id, model3dId: null },
      currentSeed.id,
    ).ok,
    true,
  )
  assert.equal(
    repository.saveSensor(
      {
        ...alternateSeed,
        sopId: alternateCatalog.item.id,
        model3dId: alternateModel.item.id,
      },
      alternateSeed.id,
    ).ok,
    true,
  )

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
  assert.equal(newCurrent?.sopId, currentCatalog.item.id)
  assert.equal(newCurrent?.model3dId, alternateModel.item.id)
  assert.equal(retired?.status, '停用')
  assert.equal(retired?.replacedById, alternateSeed.id)
  assert.equal(retired?.problemNote, '检测不稳定')
  assert.equal(retired?.sopId, currentCatalog.item.id)
  assert.equal(retired?.model3dId, null)
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

  // 备选必须有现用；停用只能由替换产生；唯一现用底下还有备选时不能直接改走。
  const NEEDS_CURRENT = '请先新增该类型的现用型号'
  const DISABLED_MANUAL = '停用只能通过「替换」产生'
  const HAS_ALTERNATES = '该现用型号下还有备选，请先用「替换」处理'

  function freshStatusRepository() {
    return domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    })
  }

  function requireSensor(repo, model) {
    const item = repo.getSensors().find((entry) => entry.model === model)
    assert.ok(item, `missing sensor ${model}`)
    return item
  }

  const statusRepo = freshStatusRepository()
  const diffuseCurrent = requireSensor(statusRepo, 'E3Z-D61')
  const diffuseAlternate = requireSensor(statusRepo, 'WL12-2B530')
  assert.deepEqual(
    statusRepo.saveSensor(
      { ...diffuseCurrent, status: '备选' },
      diffuseCurrent.id,
    ),
    { ok: false, reason: 'validation', message: HAS_ALTERNATES },
  )
  assert.deepEqual(
    statusRepo.saveSensor(
      { ...diffuseCurrent, sensorType: '对照式' },
      diffuseCurrent.id,
    ),
    { ok: false, reason: 'validation', message: HAS_ALTERNATES },
  )
  assert.deepEqual(
    statusRepo.saveSensor(
      { ...diffuseCurrent, status: '停用' },
      diffuseCurrent.id,
    ),
    { ok: false, reason: 'validation', message: HAS_ALTERNATES },
  )
  assert.deepEqual(statusRepo.deleteSensor(diffuseCurrent.id), {
    ok: false,
    reason: 'not-empty',
    message: HAS_ALTERNATES,
  })
  assert.equal(
    statusRepo.getSensors().some((item) => item.id === diffuseCurrent.id),
    true,
  )
  const renamedCurrent = statusRepo.saveSensor(
    { ...diffuseCurrent, brand: 'OMRON-EDIT' },
    diffuseCurrent.id,
  )
  assert.equal(renamedCurrent.ok, true)
  assert.equal(renamedCurrent.item.brand, 'OMRON-EDIT')
  assert.equal(renamedCurrent.item.status, '现用')
  assert.equal(renamedCurrent.item.sensorType, '漫反射')
  assert.deepEqual(statusRepo.deleteSensor(requireSensor(statusRepo, 'PZ-G61CP').id), {
    ok: true,
  })
  assert.deepEqual(statusRepo.deleteSensor(diffuseCurrent.id), {
    ok: false,
    reason: 'not-empty',
    message: HAS_ALTERNATES,
  })

  const laserCurrent = requireSensor(statusRepo, 'LV-H62')
  const laserAlternate = statusRepo.saveSensor({
    status: '备选',
    sensorType: '激光式',
    brand: 'TEST',
    model: 'LASER-ALT-OK',
    spec: '规格',
  })
  assert.equal(laserAlternate.ok, true)
  assert.deepEqual(statusRepo.deleteSensor(laserAlternate.item.id), { ok: true })
  assert.deepEqual(statusRepo.deleteSensor(laserCurrent.id), { ok: true })
  assert.deepEqual(
    statusRepo.saveSensor({
      status: '备选',
      sensorType: '激光式',
      brand: 'TEST',
      model: 'LASER-ALT-BLOCKED',
      spec: '规格',
    }),
    { ok: false, reason: 'validation', message: NEEDS_CURRENT },
  )
  assert.deepEqual(
    statusRepo.saveSensor(
      { ...diffuseAlternate, sensorType: '激光式' },
      diffuseAlternate.id,
    ),
    { ok: false, reason: 'validation', message: NEEDS_CURRENT },
  )
  assert.equal(
    statusRepo.saveSensor({
      status: '现用',
      sensorType: '激光式',
      brand: 'Keyence',
      model: 'LASER-CURRENT',
      spec: '规格',
    }).ok,
    true,
  )
  assert.equal(
    statusRepo.saveSensor({
      status: '备选',
      sensorType: '激光式',
      brand: 'TEST',
      model: 'LASER-ALT-AGAIN',
      spec: '规格',
    }).ok,
    true,
  )

  const ultrasonic = requireSensor(statusRepo, 'UM30-213113')
  assert.deepEqual(
    statusRepo.saveSensor({
      status: '停用',
      sensorType: '超声波式',
      brand: 'TEST',
      model: 'MANUAL-OFF',
      spec: '规格',
      replacedById: ultrasonic.id,
    }),
    { ok: false, reason: 'validation', message: DISABLED_MANUAL },
  )
  assert.deepEqual(
    statusRepo.saveSensor({ ...ultrasonic, status: '停用' }, ultrasonic.id),
    { ok: false, reason: 'validation', message: DISABLED_MANUAL },
  )

  const replacedCurrent = statusRepo.replaceSensorCurrent(
    diffuseAlternate.id,
    diffuseCurrent.id,
    '检测不稳定',
  )
  assert.equal(replacedCurrent.ok, true)
  const retiredCurrent = statusRepo
    .getSensors()
    .find((item) => item.id === diffuseCurrent.id)
  assert.equal(retiredCurrent.status, '停用')
  const editedRetired = statusRepo.saveSensor(
    {
      ...retiredCurrent,
      brand: 'RETIRED',
      spec: '停用后规格',
      sensorType: '激光式',
    },
    retiredCurrent.id,
  )
  assert.equal(editedRetired.ok, true)
  assert.equal(editedRetired.item.status, '停用')
  assert.equal(editedRetired.item.brand, 'RETIRED')
  assert.equal(editedRetired.item.spec, '停用后规格')
  assert.equal(editedRetired.item.sensorType, '激光式')

  const twoCurrentRepo = freshStatusRepository()
  const firstCurrent = requireSensor(twoCurrentRepo, 'E3Z-D61')
  const secondCurrent = twoCurrentRepo.saveSensor({
    status: '现用',
    sensorType: '漫反射',
    brand: 'TEST',
    model: 'SECOND-CURRENT',
    spec: '规格',
  })
  assert.equal(secondCurrent.ok, true)
  assert.equal(
    twoCurrentRepo.saveSensor(
      { ...firstCurrent, status: '备选' },
      firstCurrent.id,
    ).ok,
    true,
  )
  assert.equal(
    twoCurrentRepo.saveSensor(
      { ...requireSensor(twoCurrentRepo, 'E3Z-D61'), status: '现用' },
      firstCurrent.id,
    ).ok,
    true,
  )
  assert.deepEqual(twoCurrentRepo.deleteSensor(firstCurrent.id), { ok: true })
  assert.deepEqual(twoCurrentRepo.deleteSensor(secondCurrent.item.id), {
    ok: false,
    reason: 'not-empty',
    message: HAS_ALTERNATES,
  })
  assert.equal(
    twoCurrentRepo
      .getSensors()
      .some((item) => item.id === secondCurrent.item.id),
    true,
  )

  const orphanRepo = freshStatusRepository()
  assert.deepEqual(
    orphanRepo.deleteSensor(requireSensor(orphanRepo, 'LV-H62').id),
    { ok: true },
  )
  const orphanSnapshot = orphanRepo.snapshotStore()
  const catalogKey = domain.keyFor('sensor-catalog', 'all')
  orphanSnapshot[catalogKey].push(
    {
      id: 9001,
      status: '备选',
      sensorType: '激光式',
      brand: 'ORPHAN',
      model: 'ORPHAN-ALT',
      spec: '原规格',
      partNumber: '',
      feature: '',
      scene: '',
      sopId: null,
      model3dId: null,
      replacesId: null,
      replacedById: null,
      problemNote: '',
      replacedAt: '',
    },
    {
      id: 9002,
      status: '停用',
      sensorType: '激光式',
      brand: 'ORPHAN',
      model: 'ORPHAN-OFF',
      spec: '停用规格',
      partNumber: '',
      feature: '',
      scene: '',
      sopId: null,
      model3dId: null,
      replacesId: null,
      replacedById: null,
      problemNote: '',
      replacedAt: '',
    },
  )
  orphanRepo.replaceFromStorage(JSON.stringify(orphanSnapshot))
  const loadedOrphan = orphanRepo
    .getSensors()
    .find((item) => item.model === 'ORPHAN-ALT')
  const loadedDisabled = orphanRepo
    .getSensors()
    .find((item) => item.model === 'ORPHAN-OFF')
  assert.equal(loadedOrphan?.status, '备选')
  assert.equal(loadedOrphan?.sensorType, '激光式')
  assert.equal(loadedOrphan?.spec, '原规格')
  assert.equal(loadedDisabled?.status, '停用')
  assert.equal(loadedDisabled?.replacedById, null)
  assert.deepEqual(
    orphanRepo.saveSensor({ ...loadedOrphan, spec: '改规格' }, loadedOrphan.id),
    { ok: false, reason: 'validation', message: NEEDS_CURRENT },
  )
  assert.equal(
    orphanRepo.getSensors().find((item) => item.id === loadedOrphan.id)?.spec,
    '原规格',
  )

  const prefixedRepo = freshStatusRepository()
  for (const [previousName, nextName] of [
    ['现用', '01 现用'],
    ['备选', '02 备选'],
    ['停用', '03 停用'],
  ]) {
    const entry = prefixedRepo
      .getDictionaryItems('sensor-status')
      .find((item) => item.name === previousName)
    assert.ok(entry, `missing status ${previousName}`)
    assert.equal(
      prefixedRepo.saveDictionaryItem(
        'sensor-status',
        { name: nextName, sort: entry.sort },
        entry.id,
      ).ok,
      true,
    )
  }
  const prefixedLaser = requireSensor(prefixedRepo, 'LV-H62')
  assert.equal(prefixedLaser.status, '01 现用')
  assert.deepEqual(prefixedRepo.deleteSensor(prefixedLaser.id), { ok: true })
  assert.deepEqual(
    prefixedRepo.saveSensor({
      status: '02 备选',
      sensorType: '激光式',
      brand: 'TEST',
      model: 'PREFIX-ALT',
      spec: '规格',
    }),
    { ok: false, reason: 'validation', message: NEEDS_CURRENT },
  )
  assert.deepEqual(
    prefixedRepo.saveSensor({
      status: '03 停用',
      sensorType: '激光式',
      brand: 'TEST',
      model: 'PREFIX-OFF',
      spec: '规格',
    }),
    { ok: false, reason: 'validation', message: DISABLED_MANUAL },
  )
  const prefixedCurrent = prefixedRepo
    .getSensors()
    .find((item) => item.status === '01 现用' && item.sensorType === '漫反射')
  const prefixedAlternate = prefixedRepo
    .getSensors()
    .find((item) => item.status === '02 备选' && item.sensorType === '漫反射')
  assert.ok(prefixedCurrent && prefixedAlternate)
  const prefixedReplace = prefixedRepo.replaceSensorCurrent(
    prefixedAlternate.id,
    prefixedCurrent.id,
    '前缀停用',
  )
  assert.equal(prefixedReplace.ok, true)
  const prefixedRetired = prefixedRepo
    .getSensors()
    .find((item) => item.id === prefixedCurrent.id)
  assert.equal(prefixedRetired.status, '03 停用')
  const prefixedEdited = prefixedRepo.saveSensor(
    { ...prefixedRetired, spec: '改过的规格' },
    prefixedRetired.id,
  )
  assert.equal(prefixedEdited.ok, true)
  assert.equal(prefixedEdited.item.status, '03 停用')
  assert.equal(prefixedEdited.item.spec, '改过的规格')
  assert.deepEqual(prefixedRepo.deleteSensor(prefixedAlternate.id), {
    ok: false,
    reason: 'not-empty',
    message: HAS_ALTERNATES,
  })

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
    customerCrud: repository.getCrud,
  })
  assert.equal(index.some((item) => item.title.includes('E3Z-D61')), true)
  // 客户资料（通用要求 / 制程注意事项 / 厂外反馈）的内容也能被全局搜到，
  // 结果指向该客户区域并打开对应的标签页
  const reqHit = index.find(
    (item) => item.type === 'customer' && item.title === '板件有无检测距离不大于 300mm',
  )
  assert.ok(reqHit, 'customer requirement content is searchable')
  assert.equal(reqHit.category, '庆鼎')
  assert.deepEqual(reqHit.query, { category: '庆鼎', item: '华东', tab: 'req' })
  assert.match(reqHit.sub, /客户通用要求/)
  assert.match(reqHit.sub, /示例备注/, 'requirement note is indexed')
  const feedbackHit = index.find(
    (item) => item.type === 'customer' && item.title === '字典分类验证',
  )
  assert.ok(feedbackHit, 'customer feedback problem is searchable')
  assert.deepEqual(feedbackHit.query, { category: '庆鼎', item: '华东', tab: 'feedback' })
  assert.match(feedbackHit.sub, /更换真空表头/, 'feedback measure is indexed')
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

  // 机型上的旧二级 Tab（不是直属表格）一律不再显示，下次写入 Tab 时连同内容删掉；
  // 直属表格保留。删除机型时，空的直属表格跟着删掉
  {
    const memory = new Map()
    const rowsKey = (id) => `machine-section-rows:${id}:${domain.MACHINE_TAB_PAGE_OWNER}`
    const machineAt = { category: '旧分类', configuration: null, item: '旧机型' }
    memory.set(
      domain.STORAGE_KEY,
      JSON.stringify({
        'entity-groups:machine': [
          { name: '旧分类', machineType: 'mechanism', items: ['旧机型', '空机型'], configurations: [] },
        ],
        'machine-tabs:all': [
          {
            id: 1,
            catalog: 'mechanism',
            name: '旧 Tab',
            sort: 1,
            kind: 'structure',
            pages: [
              { id: 1, name: '入料段', node: machineAt },
              { id: 2, name: '出料段', node: machineAt },
              { id: 3, name: '旧 Tab', node: machineAt, direct: true },
              { id: 4, name: '旧 Tab', node: { ...machineAt, item: '空机型' }, direct: true },
            ],
          },
        ],
        [rowsKey(1)]: [],
        [rowsKey(2)]: [],
        [rowsKey(3)]: [],
      }),
    )
    const legacyRepo = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    })
    assert.deepEqual(
      legacyRepo.getMachineTabs('mechanism')[0].pages.map((page) => page.id),
      [3, 4],
      'second-level tabs on machines are dropped, direct tables stay',
    )
    assert.equal(legacyRepo.saveMachineTab('mechanism', { kind: 'structure', name: '新 Tab' }).ok, true)
    const stored = JSON.parse(memory.get(domain.STORAGE_KEY))
    assert.equal(Object.hasOwn(stored, rowsKey(1)), false, 'dropped page content is removed on write')
    assert.equal(Object.hasOwn(stored, rowsKey(2)), false)
    assert.equal(Object.hasOwn(stored, rowsKey(3)), true)
    // 空机型的直属表格是空的：机型可以删，直属表格跟着删
    assert.equal(legacyRepo.deleteEntityItem('machine', '空机型', '旧分类', null).ok, true)
    assert.deepEqual(
      legacyRepo.getMachineTabs('mechanism').find((tab) => tab.id === 1).pages.map((page) => page.id),
      [3],
    )
  }

  // 机型 Tab：按目录（结构 / 专案机型）共用；二级 Tab 属于「选单节点 × Tab」。
  // 选单节点的下一层只能二选一：有子选单就不能有二级 Tab，有二级 Tab 就不能再加子选单。
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
    const owner = domain.MACHINE_TAB_PAGE_OWNER
    const sensor = tabsRepo.getSensors()[0]
    assert.deepEqual(tabsRepo.getMachineTabs('mechanism'), [])

    // 选单：契约分类 → 空配置（叶子） / 带机型配置 → 契约机型
    const GROUP = '契约分类'
    assert.equal(tabsRepo.saveEntityGroup('machine', { name: GROUP, machineType: 'mechanism' }).ok, true)
    assert.equal(tabsRepo.saveMachineConfiguration(GROUP, { name: '空配置' }).ok, true)
    assert.equal(tabsRepo.saveMachineConfiguration(GROUP, { name: '带机型配置' }).ok, true)
    assert.equal(
      tabsRepo.saveEntityItem('machine', { category: GROUP, configuration: '带机型配置', name: '契约机型' }).ok,
      true,
    )
    const leafConfig = { category: GROUP, configuration: '空配置', item: null }
    const busyConfig = { category: GROUP, configuration: '带机型配置', item: null }
    const machineNode = { category: GROUP, configuration: '带机型配置', item: '契约机型' }
    const groupNode = { category: GROUP, configuration: null, item: null }

    const conveyor = tabsRepo.saveMachineTab('mechanism', { kind: 'structure', name: '输送机构' })
    assert.equal(conveyor.ok, true)
    assert.deepEqual(conveyor.item.pages, [])
    assert.deepEqual(
      tabsRepo.saveMachineTab('mechanism', { kind: 'structure', name: '输送机构' }),
      { ok: false, reason: 'duplicate' },
    )
    // 两个目录的 Tab 各自独立，同名不冲突
    const projectTab = tabsRepo.saveMachineTab('project', { kind: 'structure', name: '输送机构' })
    assert.equal(projectTab.ok, true)
    const lifter = tabsRepo.saveMachineTab('mechanism', { kind: 'structure', name: '收板机构' })
    assert.equal(lifter.ok, true)

    // 有子选单的节点（分组、带机型的配置）不能有二级 Tab；没有子选单的分组 / 配置可以。
    // 机型（最末一层）不能有二级 Tab：它在每个一级 Tab 下只有一张直属表格（direct 页）
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '页', node: groupNode }),
      { ok: false, reason: 'not-empty' },
    )
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '页', node: busyConfig }),
      { ok: false, reason: 'not-empty' },
    )
    // 节点要属于 Tab 所在的目录；不存在的节点 / Tab 是 stale
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(projectTab.item.id, { name: '页', node: leafConfig }),
      { ok: false, reason: 'validation' },
    )
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(conveyor.item.id, {
        name: '页',
        node: { category: GROUP, configuration: '不存在', item: null },
      }),
      { ok: false, reason: 'stale' },
    )
    assert.deepEqual(tabsRepo.saveMachineTabPage(9999, { name: '页', node: leafConfig }), {
      ok: false,
      reason: 'stale',
    })

    const page = tabsRepo.saveMachineTabPage(conveyor.item.id, {
      name: '01 单段输送段（搭配）',
      node: leafConfig,
    })
    assert.equal(page.ok, true)
    assert.deepEqual(page.item.node, leafConfig)
    // 名称在同一 Tab、同一节点内不重复；别的节点 / 别的 Tab 可以同名
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '01 单段输送段（搭配）', node: leafConfig }),
      { ok: false, reason: 'duplicate' },
    )
    assert.deepEqual(tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '  ', node: leafConfig }), {
      ok: false,
      reason: 'validation',
    })
    assert.deepEqual(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '01 单段输送段（搭配）', node: machineNode }),
      { ok: false, reason: 'validation' },
    )
    // 机型的直属表格按需创建：一个机型在一个一级 Tab 下只有一个，名称跟 Tab 一致
    const onMachine = tabsRepo.ensureMachineDirectPage(conveyor.item.id, machineNode)
    assert.equal(onMachine.ok, true)
    assert.equal(onMachine.item.direct, true)
    assert.equal(onMachine.item.name, '输送机构')
    assert.deepEqual(onMachine.item.node, machineNode)
    assert.equal(tabsRepo.ensureMachineDirectPage(conveyor.item.id, machineNode).item.id, onMachine.item.id)
    // 只有机型有直属表格；分组 / 配置走二级 Tab
    assert.deepEqual(tabsRepo.ensureMachineDirectPage(conveyor.item.id, leafConfig), {
      ok: false,
      reason: 'validation',
    })
    assert.deepEqual(
      tabsRepo.ensureMachineDirectPage(conveyor.item.id, { ...machineNode, item: '不存在' }),
      { ok: false, reason: 'stale' },
    )
    assert.equal(
      tabsRepo.saveMachineSectionRow(onMachine.item.id, owner, { role: '机型直属', sensorIds: [sensor.id] }).ok,
      true,
    )
    // 机型在某个一级 Tab 下的第一笔记录：直属表格和记录一起写入；记录不合法时不能留下空表格
    const lifterPages = () =>
      tabsRepo.getMachineTabs('mechanism').find((tab) => tab.id === lifter.item.id).pages.map((page) => page.id)
    const lifterBefore = lifterPages()
    assert.deepEqual(tabsRepo.saveMachineDirectRow(lifter.item.id, machineNode, { role: '缺传感器' }), {
      ok: false,
      reason: 'validation',
    })
    assert.deepEqual(lifterPages(), lifterBefore)
    const firstDirectRow = tabsRepo.saveMachineDirectRow(lifter.item.id, machineNode, {
      role: '收板直属',
      sensorIds: [sensor.id],
    })
    assert.equal(firstDirectRow.ok, true)
    const lifterDirect = tabsRepo
      .getMachineTabs('mechanism')
      .find((tab) => tab.id === lifter.item.id)
      .pages.find((page) => page.direct)
    assert.ok(lifterDirect, 'direct page created with the first valid row')
    assert.deepEqual(
      tabsRepo.getMachineSectionRows(lifterDirect.id, owner).map((row) => row.role),
      ['收板直属'],
    )
    const samePage = tabsRepo.saveMachineTabPage(lifter.item.id, {
      name: '01 单段输送段（搭配）',
      node: leafConfig,
    })
    assert.equal(samePage.ok, true)

    // 有二级 Tab 的节点不能再加子选单：配置下不能加机型，分组（叶子时）下不能加配置 / 机型
    assert.deepEqual(
      tabsRepo.saveEntityItem('machine', { category: GROUP, configuration: '空配置', name: '新机型' }),
      { ok: false, reason: 'not-empty' },
    )
    // 机型也不能移进有二级 Tab 的配置
    assert.deepEqual(
      tabsRepo.saveEntityItem(
        'machine',
        {
          category: GROUP,
          configuration: '空配置',
          name: '契约机型',
          previousCategory: GROUP,
          previousConfiguration: '带机型配置',
        },
        '契约机型',
      ),
      { ok: false, reason: 'not-empty' },
    )
    const LEAF_GROUP = '契约空分类'
    assert.equal(tabsRepo.saveEntityGroup('machine', { name: LEAF_GROUP, machineType: 'mechanism' }).ok, true)
    const leafGroupNode = { category: LEAF_GROUP, configuration: null, item: null }
    assert.equal(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '分类页', node: leafGroupNode }).ok,
      true,
    )
    assert.deepEqual(tabsRepo.saveMachineConfiguration(LEAF_GROUP, { name: '配置' }), {
      ok: false,
      reason: 'not-empty',
    })
    assert.deepEqual(
      tabsRepo.saveEntityItem('machine', { category: LEAF_GROUP, name: '机型' }),
      { ok: false, reason: 'not-empty' },
    )
    // 有二级 Tab 的节点不能删；机型的直属表格有内容时也不能删
    assert.deepEqual(tabsRepo.deleteEntityGroup('machine', LEAF_GROUP), {
      ok: false,
      reason: 'not-empty',
    })
    assert.deepEqual(tabsRepo.deleteMachineConfiguration(GROUP, '空配置'), {
      ok: false,
      reason: 'not-empty',
    })
    assert.deepEqual(tabsRepo.deleteEntityItem('machine', '契约机型', GROUP, '带机型配置'), {
      ok: false,
      reason: 'not-empty',
    })

    // 改名时二级 Tab 跟着节点走
    assert.equal(tabsRepo.saveMachineConfiguration(GROUP, { name: '空配置改' }, '空配置').ok, true)
    assert.equal(
      tabsRepo
        .getMachineTabs('mechanism')
        .flatMap((tab) => tab.pages)
        .filter((item) => item.node.configuration === '空配置改').length,
      2,
    )
    assert.equal(
      tabsRepo.saveEntityItem(
        'machine',
        {
          category: GROUP,
          configuration: '带机型配置',
          name: '契约机型改',
          previousCategory: GROUP,
          previousConfiguration: '带机型配置',
        },
        '契约机型',
      ).ok,
      true,
    )
    assert.equal(
      tabsRepo.getMachineTabs('mechanism').flatMap((tab) => tab.pages).find((item) => item.id === onMachine.item.id)
        .node.item,
      '契约机型改',
    )
    assert.equal(tabsRepo.saveEntityGroup('machine', { name: '契约分类改' }, GROUP).ok, true)
    assert.equal(
      tabsRepo.getMachineTabs('mechanism').flatMap((tab) => tab.pages).find((item) => item.id === page.item.id)
        .node.category,
      '契约分类改',
    )

    // 内容按页 id 存放，两个同名页互不影响
    assert.equal(
      tabsRepo.saveMachineSectionRow(page.item.id, owner, { role: '入料确认', sensorIds: [sensor.id] }).ok,
      true,
    )
    assert.deepEqual(
      tabsRepo.getMachineSectionRows(page.item.id, owner).map((row) => row.role),
      ['入料确认'],
    )
    assert.deepEqual(tabsRepo.getMachineSectionRows(samePage.item.id, owner), [])
    assert.equal(
      Array.isArray(
        JSON.parse(memoryTabs.get(domain.STORAGE_KEY))[`machine-section-rows:${page.item.id}:${owner}`],
      ),
      true,
    )

    // 左移 / 右移只在同一节点的二级 Tab 之间；改名不动内容
    const second = tabsRepo.saveMachineTabPage(conveyor.item.id, {
      name: '出料确认段',
      node: tabsRepo.getMachineTabs('mechanism').flatMap((tab) => tab.pages).find((item) => item.id === page.item.id).node,
    })
    assert.equal(second.ok, true)
    const nodePages = () => {
      const tab = tabsRepo.getMachineTabs('mechanism').find((item) => item.id === conveyor.item.id)
      const node = tab.pages.find((item) => item.id === page.item.id).node
      return tab.pages
        .filter((item) => JSON.stringify(item.node) === JSON.stringify(node))
        .map((item) => item.name)
    }
    assert.deepEqual(nodePages(), ['01 单段输送段（搭配）', '出料确认段'])
    assert.equal(tabsRepo.moveMachineTabPage(conveyor.item.id, second.item.id, -1).ok, true)
    assert.deepEqual(nodePages(), ['出料确认段', '01 单段输送段（搭配）'])
    assert.deepEqual(tabsRepo.moveMachineTabPage(conveyor.item.id, second.item.id, -1), {
      ok: false,
      reason: 'validation',
    })
    assert.equal(
      tabsRepo.saveMachineTabPage(conveyor.item.id, { name: '入料输送（改）' }, page.item.id).ok,
      true,
    )
    assert.equal(tabsRepo.getMachineSectionRows(page.item.id, owner).length, 1)

    // 示意图挂在记录上：表格最后一列显示，相邻记录用同一张图（「沿用上一笔的图」）时合并成一格。
    // saveMachineRowsImage 一次给多条记录设 / 清示意图
    {
      const imageA = {
        dataUrl: 'data:image/png;base64,QQ==',
        fileName: 'a.png',
        mimeType: 'image/png',
        size: 1,
      }
      const second = tabsRepo.saveMachineSectionRow(page.item.id, owner, {
        role: '入料减速',
        sensorIds: [sensor.id],
        image: imageA,
      })
      assert.equal(second.ok, true)
      assert.deepEqual(second.item.image, imageA)
      const ids = tabsRepo.getMachineSectionRows(page.item.id, owner).map((row) => row.id)
      assert.deepEqual(tabsRepo.saveMachineRowsImage(page.item.id, owner, ids, imageA), { ok: true })
      assert.deepEqual(
        tabsRepo.getMachineSectionRows(page.item.id, owner).map((row) => row.image?.fileName),
        ['a.png', 'a.png'],
      )
      assert.deepEqual(tabsRepo.saveMachineRowsImage(page.item.id, owner, [ids[0]], null), { ok: true })
      assert.deepEqual(
        tabsRepo.getMachineSectionRows(page.item.id, owner).map((row) => row.image?.fileName ?? null),
        [null, 'a.png'],
      )
      assert.deepEqual(tabsRepo.saveMachineRowsImage(page.item.id, owner, [9999], imageA), {
        ok: false,
        reason: 'stale',
      })
      assert.deepEqual(
        tabsRepo.saveMachineRowsImage(page.item.id, owner, ids, { ...imageA, mimeType: 'image/gif', fileName: 'a.gif' }),
        { ok: false, reason: 'validation' },
      )
      assert.deepEqual(tabsRepo.deleteMachineSectionRow(page.item.id, owner, second.item.id), { ok: true })
    }

    // 旧的分区示意图（右侧示意图栏，最多 2 张）读出时挂到记录上：第一张给全部记录（合并成一格），
    // 有第二张且不止一条记录时给最后一条
    {
      const legacyPage = tabsRepo.saveMachineTabPage(conveyor.item.id, {
        name: '旧示意图页',
        node: tabsRepo.getMachineTabs('mechanism').flatMap((tab) => tab.pages).find((item) => item.id === page.item.id).node,
      })
      assert.equal(legacyPage.ok, true)
      for (const role of ['甲', '乙', '丙']) {
        assert.equal(
          tabsRepo.saveMachineSectionRow(legacyPage.item.id, owner, { role, sensorIds: [sensor.id] }).ok,
          true,
        )
      }
      const legacyImages = [
        { dataUrl: 'data:image/png;base64,MQ==', fileName: '1.png', mimeType: 'image/png', size: 1 },
        { dataUrl: 'data:image/png;base64,Mg==', fileName: '2.png', mimeType: 'image/png', size: 1 },
      ]
      assert.equal(tabsRepo.saveMachineSectionImages(legacyPage.item.id, owner, legacyImages).ok, true)
      const legacyStore = JSON.parse(memoryTabs.get(domain.STORAGE_KEY))
      const reread = domain.createSelectionRepository({
        crudDefaults: data.CRUD_DEFAULTS,
        sensorData: data.SENSOR_DATA,
        storage: { getItem: () => JSON.stringify(legacyStore), setItem: () => true },
      })
      assert.deepEqual(
        reread.getMachineSectionRows(legacyPage.item.id, owner).map((row) => row.image?.fileName),
        ['1.png', '1.png', '2.png'],
      )
      assert.deepEqual(reread.getMachineSectionImages(legacyPage.item.id, owner), [])
      assert.deepEqual(tabsRepo.deleteMachineTabPage(conveyor.item.id, legacyPage.item.id), { ok: true })
    }

    // 有内容时不能换 Tab 类型；注意事项 Tab 的页不能放示意图
    assert.deepEqual(
      tabsRepo.saveMachineTab('mechanism', { kind: 'notes', name: '输送机构' }, conveyor.item.id),
      { ok: false, reason: 'not-empty' },
    )
    const notes = tabsRepo.saveMachineTab('mechanism', { kind: 'notes', name: '机型注意事项' })
    const notePage = tabsRepo.saveMachineTabPage(notes.item.id, { name: '电镀区', node: leafGroupNode })
    assert.equal(notePage.ok, true)
    assert.equal(
      tabsRepo.saveMachineSectionRow(notePage.item.id, owner, { role: '防护', name: '传感器防腐', desc: 'IP67' }).ok,
      true,
    )
    assert.deepEqual(tabsRepo.getMachineSectionImages(notePage.item.id, owner), [])

    // 删页 / 删 Tab 会连同内容一起删；删光二级 Tab 后节点又能加子选单
    assert.deepEqual(tabsRepo.deleteMachineTabPage(conveyor.item.id, second.item.id), { ok: true })
    assert.deepEqual(tabsRepo.deleteMachineTab(conveyor.item.id), { ok: true })
    const persisted = JSON.parse(memoryTabs.get(domain.STORAGE_KEY))
    assert.equal(persisted['machine-tabs:all'].some((tab) => tab.id === conveyor.item.id), false)
    assert.equal(persisted[`machine-section-rows:${page.item.id}:${owner}`], undefined)
    assert.equal(Array.isArray(persisted[`machine-section-rows:${notePage.item.id}:${owner}`]), true)
    assert.deepEqual(tabsRepo.deleteMachineTab(lifter.item.id), { ok: true })
    assert.equal(
      tabsRepo.saveEntityItem('machine', { category: '契约分类改', configuration: '空配置改', name: '新机型' }).ok,
      true,
    )

    // 拖放那一套已经拿掉：机型不再「放进」Tab
    for (const removed of ['placeMachineInTab', 'removeMachineFromTab', 'moveMachineToCatalog', 'machineTabOf']) {
      assert.equal(removed in tabsRepo, false, removed)
    }
  }

  // 旧格式（Tab 里记的是机型名，内容在机型的 1000 分区）读出时转成同名二级 Tab，
  // 挂在同名的机型节点下，内容搬到页下面
  {
    const memoryOld = new Map()
    const oldRepo = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: {
        getItem: (key) => memoryOld.get(key) ?? null,
        setItem: (key, value) => memoryOld.set(key, value),
      },
    })
    const group = oldRepo
      .getEntityGroups('machine')
      .find((item) => domain.machineCatalogKind(item) === 'mechanism' && item.configurations?.some((c) => c.items.length))
    const configuration = group.configurations.find((item) => item.items.length)
    const machine = configuration.items[0]
    const contentId = domain.MACHINE_CONTENT_SECTION_ID
    assert.equal(
      oldRepo.saveMachineSectionRow(contentId, machine, {
        role: '旧机型内容',
        sensorIds: [oldRepo.getSensors()[0].id],
      }).ok,
      true,
    )
    const legacyStore = JSON.parse(memoryOld.get(domain.STORAGE_KEY))
    legacyStore['machine-tabs:all'] = [
      { id: 1, catalog: 'mechanism', name: '输送机构', sort: 1, kind: 'structure', machines: [machine] },
    ]
    const migrated = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage: { getItem: () => JSON.stringify(legacyStore), setItem: () => true },
    })
    const [tab] = migrated.getMachineTabs('mechanism')
    // 旧数据里机型自己的内容变成该机型在这个 Tab 下的直属表格（名称同 Tab）
    assert.deepEqual(
      tab.pages.map((item) => [item.name, item.node, item.direct]),
      [['输送机构', { category: group.name, configuration: configuration.name, item: machine }, true]],
    )
    assert.equal('machines' in tab, false)
    assert.deepEqual(
      migrated.getMachineSectionRows(tab.pages[0].id, domain.MACHINE_TAB_PAGE_OWNER).map((row) => row.role),
      ['旧机型内容'],
    )
    assert.deepEqual(migrated.getMachineSectionRows(contentId, machine), [])
  }

  // 内置基础数据物化：buildDefaultStore 覆盖字典/分组/制程/Sensor 目录；机型 Tab 由用户维护
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

  // Excel 导入 / 字典还原：一次写入、按型号合并、按名称保留 id，被引用的字典项不删
  function transferFixture() {
    let raw = null
    let writes = 0
    const storage = {
      getItem: () => raw,
      setItem: (_key, value) => {
        writes += 1
        raw = value
        return true
      },
    }
    const repo = domain.createSelectionRepository({
      crudDefaults: data.CRUD_DEFAULTS,
      sensorData: data.SENSOR_DATA,
      storage,
      demoData: false,
    })
    return { repo, get writes() { return writes } }
  }

  assert.equal(domain.sanitizeExcelSheetName('History'), 'History (1)')
  assert.equal(domain.sanitizeExcelSheetName("'要求分类'"), '要求分类')

  {
    const fx = transferFixture()
    const { repo } = fx
    assert.equal(repo.saveDictionaryItem('sensor-type', { name: '漫反射', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-type', { name: '对射', sort: 2 }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-status', { name: '现用', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-status', { name: '备选', sort: 2 }).ok, true)
    const base = {
      sensorType: '漫反射',
      status: '现用',
      brand: 'ACME',
      spec: '原规格',
      feature: '特性',
      scene: '场景',
    }
    assert.equal(repo.saveSensor({ ...base, model: 'M-STAY', partNumber: 'PN-STAY' }).ok, true)
    const sop = repo.saveSensorSop({
      title: '型录',
      fileName: 'catalog.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 12,
      uploadedAt: '2026-10-14',
    })
    assert.equal(sop.ok, true)
    const linked = repo.saveSensor({
      ...base,
      model: 'M-KEEP',
      partNumber: 'PN-KEEP',
      sopId: sop.item.id,
      problemNote: '保留问题',
    })
    assert.equal(linked.ok, true)
    const before = fx.writes
    assert.deepEqual(repo.importSensors({ hasModelColumn: false, rows: [] }), {
      ok: false,
      reason: 'validation',
      message: '缺少「型号」列，无法导入',
    })
    const invalid = repo.importSensors({
      hasModelColumn: true,
      rows: [
        { rowNumber: 2, values: { partNumber: 'PN-X', model: '—', status: '现用', sensorType: '漫反射' } },
        { rowNumber: 3, values: { partNumber: 'PN-BAD-STATUS', model: 'X1', status: '不存在', sensorType: '漫反射' } },
        { rowNumber: 4, values: { partNumber: 'PN-BAD-TYPE', model: 'X2', status: '现用', sensorType: '不存在' } },
        { rowNumber: 5, values: { partNumber: 'PN-NO-STATUS', model: 'X3', sensorType: '漫反射' } },
      ],
    })
    assert.equal(invalid.ok, true)
    assert.equal(invalid.created, 0)
    assert.equal(invalid.updated, 0)
    assert.deepEqual(
      invalid.skipped.map((item) => item.reason),
      ['型号为空', '状态不在数据字典中', '感应器类型不在数据字典中', '缺少状态'],
    )
    assert.equal(fx.writes, before)

    // 型号是匹配键（全局唯一）：已有的更新、没有的新增；料号可以为空
    const newRow = {
      partNumber: '',
      model: 'M-NEW',
      status: '现用',
      sensorType: '漫反射',
      brand: 'N',
      spec: '新规格',
      feature: '',
      scene: '',
    }
    const created = repo.importSensors({
      hasModelColumn: true,
      rows: [
        { rowNumber: 2, values: newRow },
        { rowNumber: 3, values: { ...newRow } },
        { rowNumber: 4, values: { ...newRow, brand: 'OTHER' } },
        { rowNumber: 5, values: { partNumber: 'PN-ALT', model: 'M-ALT', status: '备选', sensorType: '对射', brand: 'N' } },
        { rowNumber: 6, values: { partNumber: 'PN-OFF', model: 'M-OFF', status: '停用', sensorType: '漫反射', brand: 'N' } },
        { rowNumber: 7, values: { partNumber: 'PN-STAY-2', model: 'm-stay', status: '现用', sensorType: '漫反射', brand: 'N' } },
      ],
    })
    assert.equal(created.ok, true)
    assert.equal(created.created, 1)
    assert.equal(created.updated, 1)
    assert.deepEqual(created.skipped, [
      { rowNumber: 4, reason: '型号重复' },
      { rowNumber: 5, reason: domain.SENSOR_NEEDS_CURRENT },
      { rowNumber: 6, reason: domain.SENSOR_DISABLED_MANUAL },
    ])
    assert.equal(fx.writes, before + 1)
    const stay = repo.getSensors().find((item) => item.partNumber === 'PN-STAY-2')
    assert.equal(stay.model, 'm-stay')
    assert.equal(stay.brand, 'N')
    assert.equal(repo.getSensors().find((item) => item.model === 'M-NEW').partNumber, '')
    assert.equal(repo.getSensors().some((item) => item.model === 'M-OFF'), false)

    // 缺的列保留原值；关联与替换信息不受影响
    const writesAfterCreate = fx.writes
    const updated = repo.importSensors({
      hasModelColumn: true,
      rows: [
        {
          rowNumber: 2,
          values: {
            model: 'M-KEEP',
            status: '现用',
            sensorType: '漫反射',
            brand: 'ACME-2',
          },
        },
      ],
    })
    assert.equal(updated.ok, true)
    assert.equal(updated.updated, 1)
    assert.equal(updated.created, 0)
    assert.deepEqual(updated.skipped, [])
    const keptSensor = repo.getSensors().find((item) => item.model === 'M-KEEP')
    assert.equal(keptSensor.brand, 'ACME-2')
    assert.equal(keptSensor.partNumber, 'PN-KEEP')
    assert.equal(keptSensor.spec, '原规格')
    assert.equal(keptSensor.feature, '特性')
    assert.equal(keptSensor.sopId, sop.item.id)
    assert.equal(keptSensor.problemNote, '保留问题')
    assert.equal(fx.writes, writesAfterCreate + 1)

    // 原样再导入一次：没有变化，不计更新也不写入
    const writesAfterUpdate = fx.writes
    const unchanged = repo.importSensors({
      hasModelColumn: true,
      rows: [{ rowNumber: 2, values: { model: 'M-KEEP', status: '现用', sensorType: '漫反射', brand: 'ACME-2' } }],
    })
    assert.deepEqual(unchanged, { created: 0, ok: true, skipped: [], updated: 0 })
    assert.equal(fx.writes, writesAfterUpdate)
  }

  {
    const fx = transferFixture()
    const { repo } = fx
    assert.equal(repo.saveEntityGroup('customer', { name: '导入客户' }).ok, true)
    assert.equal(repo.saveEntityItem('customer', { category: '导入客户', name: '华东' }).ok, true)
    assert.equal(repo.saveDictionaryItem('customer-req', { name: 'Alpha', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('customer-req', { name: 'Beta', sort: 2 }).ok, true)
    assert.equal(repo.saveDictionaryItem('customer-req', { name: 'Gamma', sort: 3 }).ok, true)
    assert.equal(repo.saveDictionaryItem('customer-req-source', { name: '其他', sort: 1 }).ok, true)
    const alpha = repo.getDictionaryItems('customer-req').find((item) => item.name === 'Alpha')
    assert.equal(repo.saveCrud('customer-req', '导入客户/华东', {
      type: 'Alpha',
      content: '距离限制',
      source: '其他',
    }).ok, true)
    assert.equal(repo.saveDictionaryItem('process-layer', { name: '内层', sort: 1 }).ok, true)
    assert.equal(repo.saveProcessStep({ name: '导入步骤', layer: '内层' }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-type', { name: '漫反射', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-status', { name: '现用', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('sensor-status', { name: '备选', sort: 2 }).ok, true)
    const sensor = repo.saveSensor({
      model: 'M-ROW',
      sensorType: '漫反射',
      status: '现用',
      partNumber: 'PN-ROW',
    })
    assert.equal(sensor.ok, true)
    assert.equal(repo.saveDictionaryItem('machine-model', { name: '机型甲', sort: 1 }).ok, true)
    assert.equal(repo.saveDictionaryItem('machine-model', { name: '机型乙', sort: 2 }).ok, true)
    const modelA = repo.getDictionaryItems('machine-model').find((item) => item.name === '机型甲')
    assert.equal(repo.saveDictionaryItem('board-characteristic', { name: '板A', sort: 1 }).ok, true)
    assert.equal(repo.saveEntityGroup('machine', { name: '导入分类' }).ok, true)
    assert.equal(repo.saveEntityItem('machine', { category: '导入分类', name: '导入机型' }).ok, true)
    const section = repo.saveExtraMachineSection('导入机型', { kind: 'structure', name: '结构', sort: 1 })
    assert.equal(section.ok, true)
    assert.equal(repo.saveMachineSectionRow(section.item.id, '导入机型', {
      role: '进板检测',
      sensorIds: [sensor.item.id],
      machineModelId: modelA.id,
    }).ok, true)

    const before = fx.writes
    const restored = repo.restoreDictionaries([
      {
        name: '要求分类',
        hasNameColumn: true,
        rows: [
          { rowNumber: 5, name: 'alpha', sort: 'nope' },
          { rowNumber: 3, name: 'Gamma', sort: '10' },
          { rowNumber: 6, name: 'Gamma', sort: '1' },
          { rowNumber: 7, name: '  ', sort: '4' },
        ],
      },
      {
        name: '制程分层',
        hasNameColumn: true,
        rows: [{ rowNumber: 4, name: '内层', sort: 'nope' }],
      },
      {
        name: '机型',
        hasNameColumn: true,
        rows: [{ rowNumber: 2, name: '机型丙', sort: '1' }],
      },
      {
        name: 'Sensor 状态',
        hasNameColumn: true,
        rows: [{ rowNumber: 2, name: '现用', sort: '1' }],
      },
      { name: '感应器类型', hasNameColumn: false, rows: [] },
      { name: '板件特性', hasNameColumn: true, rows: [{ rowNumber: 2, name: '', sort: '1' }] },
      { name: '随便', hasNameColumn: true, rows: [{ rowNumber: 2, name: '无关', sort: '1' }] },
    ])
    assert.equal(restored.ok, true)
    assert.equal(fx.writes, before + 1)
    assert.equal(restored.unknownSheets.join(), '随便')
    assert.equal(restored.missingSheets.includes('要求来源'), true)
    assert.equal(restored.missingSheets.includes('要求分类'), false)

    const req = restored.categories.find((item) => item.code === 'customer-req')
    assert.equal(req.created, 0)
    assert.equal(req.updated, 2)
    assert.equal(req.deleted, 1)
    assert.equal(req.kept, 0)
    assert.deepEqual(req.skipped, [
      { rowNumber: 6, reason: '名称重复' },
      { rowNumber: 7, reason: '名称为空' },
    ])
    const reqItems = repo.getDictionaryItems('customer-req')
    assert.deepEqual(reqItems.map((item) => [item.name, item.sort]), [
      ['alpha', 5],
      ['Gamma', 10],
    ])
    assert.equal(reqItems.find((item) => item.name === 'alpha').id, alpha.id)
    assert.equal(
      repo.getCrud('customer-req', '导入客户/华东').some((item) => item.type === 'alpha'),
      true,
    )
    assert.equal(repo.getDictionaryItems('customer-req-source')[0].name, '其他')

    const layer = restored.categories.find((item) => item.code === 'process-layer')
    assert.equal(layer.updated, 1)
    assert.deepEqual(
      repo.getDictionaryItems('process-layer').map((item) => [item.name, item.sort]),
      [['内层', 4]],
    )
    assert.equal(repo.getProcessSteps()[0].layer, '内层')

    const models = restored.categories.find((item) => item.code === 'machine-model')
    assert.equal(models.created, 1)
    assert.equal(models.deleted, 1)
    assert.equal(models.kept, 1)
    const modelItems = repo.getDictionaryItems('machine-model')
    assert.deepEqual(modelItems.map((item) => item.name), ['机型丙', '机型甲'])
    assert.equal(modelItems.find((item) => item.name === '机型甲').id, modelA.id)
    assert.equal(
      repo.getMachineSectionRows(section.item.id, '导入机型')[0].machineModelId,
      modelA.id,
    )

    const statuses = restored.categories.find((item) => item.code === 'sensor-status')
    assert.equal(statuses.deleted, 1)
    assert.equal(statuses.kept, 1)
    assert.equal(
      repo.getDictionaryItems('sensor-status').some((item) => item.name === '停用'),
      true,
    )
    assert.equal(
      repo.getDictionaryItems('sensor-status').some((item) => item.name === '备选'),
      false,
    )
    const types = restored.categories.find((item) => item.code === 'sensor-type')
    assert.equal(types.unchangedReason, '缺少「字典项名称」列')
    assert.equal(repo.getDictionaryItems('sensor-type')[0].name, '漫反射')
    const boards = restored.categories.find((item) => item.code === 'board-characteristic')
    assert.equal(boards.unchangedReason, '至少保留一个字典项')
    assert.equal(repo.getDictionaryItems('board-characteristic')[0].name, '板A')

    const quietWrites = fx.writes
    const mirror = domain.DICTIONARY_DEFINITIONS.map((definition) => ({
      name: definition.title,
      hasNameColumn: true,
      rows: repo.getDictionaryItems(definition.code).map((item) => ({
        rowNumber: item.sort,
        name: item.name,
        sort: String(item.sort),
      })),
    }))
    const quiet = repo.restoreDictionaries(mirror)
    assert.equal(quiet.ok, true)
    assert.equal(fx.writes, quietWrites)
    assert.equal(
      quiet.categories.every((item) => item.created === 0 && item.updated === 0 && item.deleted === 0 && item.kept === 0),
      true,
    )
  }

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
