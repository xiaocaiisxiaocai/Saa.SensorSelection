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
