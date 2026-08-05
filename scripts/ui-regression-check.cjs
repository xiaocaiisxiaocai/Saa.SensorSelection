const fs = require('fs')
const vm = require('vm')

const html = fs.readFileSync('public/index.html', 'utf8')
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS ${name}`)
    return
  }
  failures.push(name)
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
}

check('desktop layout uses a left sidebar', html.includes('class="app-sidebar"'))
check('legacy top navigation is removed', !html.includes('class="topbar-nav"'))
check('redundant homepage is removed', !html.includes('data-view="home"') && !html.includes('id="view-home"'))
check('dark mode rules are removed', !html.includes('prefers-color-scheme: dark'))
check('narrow-screen rules are out of scope', !html.includes('@media (max-width'))
check('tables stay inside their content panels', html.includes('.table-scroll {') && /\.detail-panel\s*\{[^}]*min-width:\s*0/s.test(html) && /\.sensor-table-scroll\s*\{[^}]*max-width:\s*100%/s.test(html))
check('keyboard focus styling exists', html.includes(':focus-visible'))
check('reduced-motion preference is respected', html.includes('prefers-reduced-motion'))
check('list items are semantic buttons', !/<div class="list-item"[^>]*onclick=/.test(html))
check('tabs use button semantics', html.includes('role="tab"'))
check('breadcrumbs use navigation semantics', html.includes('class="breadcrumb" aria-label="面包屑"'))
check('all four modals expose dialog semantics', (html.match(/role="dialog"/g) || []).length === 4)
check('modal focus management is implemented', html.includes('function openAccessibleModal') && html.includes('function trapModalFocus'))
check('detail selection does not depend on global event', !/setActiveItem\('(customer|process|machine)',\s*event\.currentTarget\)/.test(html))
check('global search index is rebuilt from current data', html.includes('function buildSearchIndex'))
check('stray CSS declarations are removed', !/\n\s*}\n\s+color:\s*var\(--text-sec\)/.test(html))
check('emoji UI icons are removed', !/[📌🔒]/u.test(html))

function staticMarkupIsBalanced() {
  const bodyShell = html.slice(html.indexOf('<body'), html.indexOf('<script>'))
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const stack = []
  for (const match of bodyShell.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const rawTag = match[0]
    const tagName = match[1].toLowerCase()
    if (rawTag.startsWith('</')) {
      if (stack.pop() !== tagName) return false
    } else if (!rawTag.endsWith('/>') && !voidElements.has(tagName)) {
      stack.push(tagName)
    }
  }
  return stack.length === 1 && stack[0] === 'body'
}

check('static HTML shell is structurally balanced', staticMarkupIsBalanced())
check('collapsed list categories expose expansion state', (html.match(/class="list-category-btn[^>]*aria-expanded=/g) || []).length === 10)
check('list search opens matching categories and reports no results', html.includes('function setCategoryExpanded') && html.includes('category.hidden = matchCount === 0') && html.includes('class="list-search-status"'))
check('timeline defaults use local calendar date', html.includes('function formatLocalDate') && !html.includes("new Date().toISOString().split('T')[0]"))
check('save handlers ignore duplicate queued clicks', (html.match(/if \(!modalIsOpen\('/g) || []).length >= 3)
check('CRUD actions provide status feedback', html.includes('id="appToast"') && html.includes('function showToast'))
check('dynamic result counts are announced', html.includes('id="sensorCatalogSummary" aria-live="polite"') && html.includes('id="searchTitle" aria-live="polite"'))
check('CRUD rerenders restore focus to a live control', html.includes('function focusCrudRecord') && html.includes('data-crud-id='))
check('skip navigation does not corrupt hash routing', html.includes('onclick="focusMainContent(event)"') && !html.includes("window.addEventListener('hashchange'"))

function makeElement(id = '') {
  const classes = new Set()
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    dataset: {},
    style: {},
    onclick: null,
    parentElement: { querySelectorAll: () => [] },
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle(value, force) {
        if (force === undefined) {
          if (classes.has(value)) classes.delete(value)
          else classes.add(value)
        } else if (force) classes.add(value)
        else classes.delete(value)
      },
      contains: value => classes.has(value),
    },
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    click() { if (typeof this.onclick === 'function') this.onclick() },
    closest() { return makeElement('closest') },
    querySelectorAll() { return [] },
    querySelector() { return null },
  }
}

function runBehaviorChecks() {
  const storage = new Map()
  const elements = new Map()
  const navs = ['客户', '制程', '机型结构', 'Sensor 选型'].map(label => {
    const element = makeElement(`nav-${label}`)
    element.textContent = label
    element.dataset.view = ({ 客户: 'customer', 制程: 'process', 机型结构: 'machine', 'Sensor 选型': 'sensor' })[label]
    return element
  })
  const views = ['search', 'customer', 'process', 'machine', 'sensor'].map(name => makeElement(`view-${name}`))
  const location = { hash: '', pathname: '/', search: '' }

  global.localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  }
  global.location = location
  global.history = {
    pushState(_state, _title, url) { location.hash = String(url).split('#')[1] ? `#${String(url).split('#')[1]}` : '' },
    replaceState(_state, _title, url) { location.hash = String(url).split('#')[1] ? `#${String(url).split('#')[1]}` : '' },
  }
  global.requestAnimationFrame = callback => callback()
  global.window = { addEventListener() {} }
  global.document = {
    activeElement: makeElement('active'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id))
      return elements.get(id)
    },
    querySelectorAll(selector) {
      if (selector === '.sidebar-nav-item' || selector === '.topbar-nav-item') return navs
      if (selector === '.view') return views
      return []
    },
    querySelector() { return null },
    addEventListener() {},
  }

  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), match => match[1]).join('\n')
  vm.runInThisContext(scripts)

  doSearch('E3Z-D61')
  check('global search finds a concrete sensor model', !document.getElementById('searchResults').innerHTML.includes('未找到相关内容'))
  const encodedSearchHash = location.hash
  check('search history preserves the query', encodedSearchHash.startsWith('#search:') && decodeURIComponent(encodedSearchHash.slice('#search:'.length)) === 'E3Z-D61')
  document.getElementById('searchResults').innerHTML = ''
  restoreViewFromLocation()
  check('search deep links restore their results', document.getElementById('view-search').classList.contains('active') && document.getElementById('searchResults').innerHTML.includes('E3Z-D61'))

  setFilter('customer', '庆鼎')
  doSearch('中间六轴机')
  check('a new query resets stale type filters', !document.getElementById('searchResults').innerHTML.includes('未找到相关内容'))

  showView('search')
  check('search view does not highlight an unrelated navigation item', navs.every(nav => !nav.classList.contains('active')))

  if (typeof buildSearchIndex === 'function') {
    const index = buildSearchIndex()
    check('customer search preserves the correct region', index.some(item => item.title === '深南' && item.category === '华南'))
    check('process search preserves the correct category', index.some(item => item.title === '外层前处理' && item.category === '外层制程'))
    check('machine search preserves the correct category', index.some(item => item.title === 'AOI专用机' && item.category === '特殊机型'))
  }

  function makeSearchCategory(open, labels) {
    const category = makeElement('category')
    const button = makeElement('category-button')
    const items = labels.map(label => {
      const item = makeElement(`item-${label}`)
      item.dataset.search = label
      item.textContent = label
      return item
    })
    if (open) category.classList.add('open')
    category.querySelector = selector => selector === '.list-category-btn' ? button : null
    category.querySelectorAll = selector => selector === '.list-item' ? items : []
    return { category, button, items }
  }
  const eastCategory = makeSearchCategory(true, ['庆鼎', '健鼎'])
  const southCategory = makeSearchCategory(false, ['深南', '兴森'])
  const listStatus = makeElement('customerListStatus')
  const originalQuerySelectorAll = document.querySelectorAll
  const originalGetElementById = document.getElementById
  document.querySelectorAll = selector => selector === '#view-customer .list-category'
    ? [eastCategory.category, southCategory.category]
    : originalQuerySelectorAll(selector)
  document.getElementById = id => id === 'customerListStatus' ? listStatus : originalGetElementById(id)
  const listSearchInput = { value: '深南' }
  filterList(listSearchInput, 'customer')
  check('list search reveals matches from collapsed categories', eastCategory.category.hidden && !southCategory.category.hidden && southCategory.category.classList.contains('open') && !southCategory.items[0].hidden)
  listSearchInput.value = ''
  filterList(listSearchInput, 'customer')
  check('clearing list search restores expansion state', eastCategory.category.classList.contains('open') && !southCategory.category.classList.contains('open') && !eastCategory.category.hidden && !southCategory.category.hidden)
  listSearchInput.value = '不存在'
  filterList(listSearchInput, 'customer')
  check('list search presents an actionable empty state', !listStatus.hidden && listStatus.textContent.includes('不存在'))
  document.querySelectorAll = originalQuerySelectorAll
  document.getElementById = originalGetElementById

  selectMachine('AOI专用机', '特殊机型', null)
  const encodedMachineHash = location.hash
  check('detail history preserves the selected entity', encodedMachineHash.startsWith('#machine:') && decodeURIComponent(encodedMachineHash.split(':').at(-1)) === 'AOI专用机')
  document.getElementById('machine-content').innerHTML = ''
  restoreViewFromLocation()
  check('detail deep links restore the selected entity', document.getElementById('machine-content').innerHTML.includes('AOI专用机'))

  const duplicateTarget = getSensorCatalogData()[0]
  const sensorCountBeforeDuplicate = getSensorCatalogData().length
  openAddSensorCatalog()
  document.getElementById('sensorCatalogStatus').value = duplicateTarget.status
  document.getElementById('sensorCatalogType').value = duplicateTarget.sensorType
  document.getElementById('sensorCatalogBrand').value = duplicateTarget.brand
  document.getElementById('sensorCatalogModel').value = duplicateTarget.model.toLowerCase()
  saveSensorCatalogItem()
  check('sensor catalog rejects duplicate model names', getSensorCatalogData().length === sensorCountBeforeDuplicate && document.getElementById('sensorCatalogModelError').textContent.includes('已存在'))
  closeSensorCatalogModal()

  const sensorCountBeforeLifecycle = getSensorCatalogData().length
  openAddSensorCatalog()
  document.getElementById('sensorCatalogModel').value = 'CODEX-REGRESSION-UNIQUE'
  document.getElementById('sensorCatalogBrand').value = 'TEST'
  saveSensorCatalogItem()
  const addedSensorItem = getSensorCatalogData().find(item => item.model === 'CODEX-REGRESSION-UNIQUE')
  check('sensor add flow persists a unique model', Boolean(addedSensorItem) && getSensorCatalogData().length === sensorCountBeforeLifecycle + 1)
  openDeleteSensorCatalog(addedSensorItem.id)
  document.getElementById('confirmOkBtn').click()
  check('sensor delete flow removes the confirmed model', !getSensorCatalogData().some(item => item.id === addedSensorItem.id) && getSensorCatalogData().length === sensorCountBeforeLifecycle)

  const duplicateClickEntity = '__regression_double_click__'
  const crudCountBeforeSave = getCrudData('process-feat', duplicateClickEntity).length
  openAddCrud('process-feat', duplicateClickEntity, '')
  document.getElementById('crudName').value = '回归条目'
  document.getElementById('crudDesc').value = '验证保存按钮快速连点'
  saveCrudItem()
  saveCrudItem()
  check('double save click creates only one CRUD record', getCrudData('process-feat', duplicateClickEntity).length === crudCountBeforeSave + 1)
  const addedCrudItem = getCrudData('process-feat', duplicateClickEntity).find(item => item.name === '回归条目')
  openEditCrud('process-feat', duplicateClickEntity, addedCrudItem.id)
  document.getElementById('crudName').value = '回归条目（已编辑）'
  saveCrudItem()
  check('CRUD edit flow updates the selected record', getCrudData('process-feat', duplicateClickEntity).some(item => item.id === addedCrudItem.id && item.name === '回归条目（已编辑）'))
  openDeleteCrud('process-feat', duplicateClickEntity, addedCrudItem.id)
  document.getElementById('confirmOkBtn').click()
  check('CRUD delete flow removes the confirmed record', !getCrudData('process-feat', duplicateClickEntity).some(item => item.id === addedCrudItem.id))

  const timelineEntity = '__regression_timeline_lifecycle__'
  const timelineCountBefore = getCrudData('customer-feedback', timelineEntity).length
  openAddTimeline('customer-feedback', timelineEntity)
  document.getElementById('timelineDate').value = '2026-08-05'
  document.getElementById('timelineTitle').value = '回归反馈'
  saveTimelineItem()
  const addedTimelineItem = getCrudData('customer-feedback', timelineEntity).find(item => item.title === '回归反馈')
  check('timeline add flow persists a feedback record', Boolean(addedTimelineItem) && getCrudData('customer-feedback', timelineEntity).length === timelineCountBefore + 1)
  openDeleteTimeline('customer-feedback', timelineEntity, addedTimelineItem.id)
  document.getElementById('confirmOkBtn').click()
  check('timeline delete flow removes the confirmed feedback', getCrudData('customer-feedback', timelineEntity).length === timelineCountBefore)

  const staleEditEntity = '__regression_stale_edit__'
  const staleEditItems = getCrudData('process-feat', staleEditEntity)
  const staleEditId = staleEditItems[0].id
  openEditCrud('process-feat', staleEditEntity, staleEditId)
  staleEditItems.splice(0, staleEditItems.length)
  document.getElementById('crudName').value = '已被其他窗口删除的条目'
  saveCrudItem()
  check('stale edits stay open and report the conflict', document.getElementById('crudModal').classList.contains('open') && document.getElementById('appToast').textContent.includes('不存在'))
  closeCrudModal()

  const unsafeCrudEntity = '__regression_unsafe_store__'
  const unsafeCrudItems = getCrudData('process-feat', unsafeCrudEntity)
  unsafeCrudItems.splice(0, unsafeCrudItems.length, { id: '1);globalThis.injected=true;//', type: 7, name: '<img src=x>', desc: null, note: {} })
  const normalizedCrudItem = getCrudData('process-feat', unsafeCrudEntity)[0]
  check('stored CRUD records are normalized before rendering', Number.isSafeInteger(normalizedCrudItem.id) && typeof normalizedCrudItem.type === 'string' && typeof normalizedCrudItem.name === 'string' && typeof normalizedCrudItem.note === 'string')

  const unsafeTimelineEntity = '__regression_unsafe_timeline__'
  const unsafeTimelineItems = getCrudData('customer-feedback', unsafeTimelineEntity)
  unsafeTimelineItems.splice(0, unsafeTimelineItems.length, { id: 'bad-id', date: 20260805, title: 42, desc: null, actions: {}, status: 'injected-class' })
  const normalizedTimelineItem = getCrudData('customer-feedback', unsafeTimelineEntity)[0]
  check('stored timeline status and ids are normalized', Number.isSafeInteger(normalizedTimelineItem.id) && normalizedTimelineItem.status === 'pending' && typeof normalizedTimelineItem.date === 'string')

  const unsafeSensorItems = getSensorCatalogData()
  unsafeSensorItems.splice(0, unsafeSensorItems.length,
    { id: -1, status: '现用', sensorType: '漫反射', model: 'INVALID-ID-A' },
    { id: -1, status: '备选', sensorType: '对照式', model: 'INVALID-ID-B' },
    { id: 1.5, status: '现用', sensorType: '近接式', model: 'INVALID-ID-C' },
  )
  const normalizedSensorItems = getSensorCatalogData()
  const normalizedSensorIds = normalizedSensorItems.map(item => item.id)
  check('stored sensor ids are positive unique integers', normalizedSensorIds.every(id => Number.isSafeInteger(id) && id > 0) && new Set(normalizedSensorIds).size === normalizedSensorIds.length)

  const sanitizedStore = parseCrudStore('{"__proto__":[],"constructor":[],"safe":[],"invalid":{}}')
  check('stored data ignores prototype keys and non-array entries', Object.getPrototypeOf(sanitizedStore) === null && !Object.hasOwn(sanitizedStore, '__proto__') && !Object.hasOwn(sanitizedStore, 'constructor') && Array.isArray(sanitizedStore.safe) && !Object.hasOwn(sanitizedStore, 'invalid'))

  check('local date formatter preserves the user calendar date', typeof formatLocalDate === 'function' && formatLocalDate(new Date(2026, 0, 2, 0, 30)) === '2026-01-02')

  const originalSetItem = localStorage.setItem
  const originalConsoleError = console.error
  localStorage.setItem = () => { throw new Error('storage blocked') }
  console.error = () => {}
  let persistenceThrew = false
  let persistenceResult
  try {
    persistenceResult = persistCrudStore()
  } catch (_error) {
    persistenceThrew = true
  }
  localStorage.setItem = originalSetItem
  console.error = originalConsoleError
  check('storage failures are handled without crashing the UI', !persistenceThrew && persistenceResult === false)
}

try {
  runBehaviorChecks()
} catch (error) {
  failures.push('behavior checks execute')
  console.error(`FAIL behavior checks execute: ${error.message}`)
}

if (failures.length) {
  console.error(`\n${failures.length} UI regression check(s) failed.`)
  process.exit(1)
}

console.log('\nAll UI regression checks passed.')
