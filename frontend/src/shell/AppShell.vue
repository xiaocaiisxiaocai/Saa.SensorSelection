<script setup lang="ts">
import { PanelLeft, Search } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import BrandMark from '@/shell/BrandMark.vue';
import UserMenu from '@/shell/UserMenu.vue';
import { navGroupsFor } from '@/shell/nav';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { ABanner, ASpinner } from '@/ui';
import { toast } from '@/ui/toast';

const SIDEBAR_STORAGE_KEY = 'apple-frontend:sidebar-collapsed';
const COMPACT_MEDIA_QUERY = '(width <= 960px)';
// 960–1200px 的笔记本/小屏：展开的侧栏会挤掉双栏页面里一半的表格列，
// 默认收成图标栏；用户在该宽度下手动展开只在本次会话有效，不改写宽屏偏好。
const MEDIUM_MEDIA_QUERY = '(width <= 1200px)';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const selection = useSelectionStore();

const collapsed = ref(readCollapsed());
const compactViewport = ref(false);
const mediumViewport = ref(false);
const mediumOverride = ref<boolean | null>(null);
const mobileSidebarOpen = ref(false);
const contentScrolled = ref(false);
const searchQuery = ref('');
const searchInput = ref<{ focus?: () => void } | HTMLInputElement | null>(null);

function nativeSearchInput() {
  const target = searchInput.value;
  if (target instanceof HTMLInputElement) return target;
  return document.getElementById('global-search-input') as HTMLInputElement | null;
}

function focusSearch(select = false) {
  const input = nativeSearchInput();
  searchInput.value?.focus?.();
  input?.focus();
  if (select) input?.select();
}

const searchHotkey = /Mac|iPhone|iPad/i.test(navigator.platform)
  ? '⌘K'
  : 'Ctrl+K';

const groups = computed(() => navGroupsFor(auth.permissions));

// 只有首次连接用加载态替换页面；断线后的自动重连保持页面挂载，
// 否则每次重试都会清掉用户编辑到一半的表单和弹窗。
const connecting = computed(
  () => selection.backendStatus === 'connecting' && !selection.hasConnected,
);
const backendUnavailable = computed(
  () => selection.backendStatus === 'offline',
);
const railCollapsed = computed(() =>
  mediumViewport.value ? (mediumOverride.value ?? true) : collapsed.value,
);
const sidebarExpanded = computed(() =>
  compactViewport.value ? mobileSidebarOpen.value : !railCollapsed.value,
);
let compactMedia: MediaQueryList | null = null;
let mediumMedia: MediaQueryList | null = null;

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function toggleSidebar() {
  if (compactViewport.value) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
    return;
  }
  if (mediumViewport.value) {
    mediumOverride.value = !railCollapsed.value;
    return;
  }
  collapsed.value = !collapsed.value;

  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed.value ? '1' : '0');
  } catch {
    /* private browsing */
  }
}

function updateCompactViewport(matches: boolean) {
  compactViewport.value = matches;
  if (!matches) mobileSidebarOpen.value = false;
}

function onCompactMediaChange(event: MediaQueryListEvent) {
  updateCompactViewport(event.matches);
}

function onMediumMediaChange(event: MediaQueryListEvent) {
  mediumViewport.value = event.matches;
  mediumOverride.value = null;
}

function onContentScroll(event: Event) {
  const target = event.target as HTMLElement;
  contentScrolled.value = target.scrollTop > 0;
}

function submitSearch() {
  const value = searchQuery.value.trim();
  if (!value) {
    toast.warning('请输入搜索关键词');
    focusSearch();
    return;
  }
  void router.push({ path: '/selection/search', query: { q: value } });
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  submitSearch();
}

function onSearchHotkey(event: KeyboardEvent) {
  // 与工具栏提示一致：mac 只认 ⌘K，其他平台只认 Ctrl+K；带 Shift/Alt 的组合
  // 留给浏览器或其他快捷键。输入法组字中、或已被别处处理过的按键不抢。
  if (event.isComposing || event.defaultPrevented) return;
  if (event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return;
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
  const primary = isMac ? event.metaKey : event.ctrlKey;
  const other = isMac ? event.ctrlKey : event.metaKey;
  if (!primary || other) return;
  event.preventDefault();
  focusSearch(true);
}

function focusSearchFromSurface(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, button, a, [role="button"]')) return;
  event.preventDefault();
  focusSearch();
}

function onMenuClick(info: { key: string | number }) {
  void router.push(String(info.key));
}

onMounted(() => {
  selection.ensureBackendInit();
  window.addEventListener('keydown', onSearchHotkey);
  compactMedia = window.matchMedia?.(COMPACT_MEDIA_QUERY) ?? null;
  if (compactMedia) {
    updateCompactViewport(compactMedia.matches);
    compactMedia.addEventListener('change', onCompactMediaChange);
  }
  mediumMedia = window.matchMedia?.(MEDIUM_MEDIA_QUERY) ?? null;
  if (mediumMedia) {
    mediumViewport.value = mediumMedia.matches;
    mediumMedia.addEventListener('change', onMediumMediaChange);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSearchHotkey);
  compactMedia?.removeEventListener('change', onCompactMediaChange);
  mediumMedia?.removeEventListener('change', onMediumMediaChange);
});

watch(
  () => [route.path, route.query.q] as const,
  ([path, q]) => {
    mobileSidebarOpen.value = false;
    if (path === '/selection/search') {
      searchQuery.value = String(q || '');
    }
  },
  { immediate: true },
);

watch(
  () => selection.backendStatus,
  (status) => {
    if (
      status === 'unauthorized' &&
      getStoredToken() &&
      route.path !== '/login'
    ) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } });
    }
  },
);
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--collapsed': !compactViewport && railCollapsed,
      'app-shell--compact': compactViewport,
      'app-shell--drawer-open': compactViewport && mobileSidebarOpen,
    }"
  >
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div class="body">
      <nav
        id="app-sidebar"
        class="sidebar"
        aria-label="主导航"
        :aria-hidden="compactViewport && !mobileSidebarOpen ? true : undefined"
        :inert="compactViewport && !mobileSidebarOpen ? true : undefined"
      >
        <RouterLink class="brand" to="/selection/customer">
          <BrandMark />
          <span class="brand__name">感应器选型</span>
        </RouterLink>
        <a-menu
          theme="dark"
          mode="inline"
          :inline-collapsed="!compactViewport && !sidebarExpanded"
          :selected-keys="[route.path]"
          @click="onMenuClick"
        >
          <a-menu-item-group
            v-for="group in groups"
            :key="group.id"
            :title="sidebarExpanded ? group.label : undefined"
          >
            <a-menu-item v-for="item in group.items" :key="item.to">
              <template #icon>
                <component :is="item.icon" :size="16" :stroke-width="1.5" />
              </template>
              {{ item.label }}
            </a-menu-item>
          </a-menu-item-group>
        </a-menu>
      </nav>

      <button
        v-if="compactViewport && mobileSidebarOpen"
        class="sidebar-backdrop"
        type="button"
        aria-label="关闭导航"
        @click="mobileSidebarOpen = false"
      />

      <div class="workspace">
        <header class="toolbar" :class="{ 'toolbar--scrolled': contentScrolled }">
          <a-button
            type="text"
            :aria-expanded="sidebarExpanded"
            aria-controls="app-sidebar"
            :aria-label="sidebarExpanded ? '折叠侧栏' : '展开侧栏'"
            @click="toggleSidebar"
          >
            <PanelLeft :size="18" :stroke-width="1.5" />
          </a-button>
          <form
            class="search"
            role="search"
            @mousedown="focusSearchFromSurface"
            @submit.prevent="submitSearch"
          >
            <a-input
              id="global-search-input"
              ref="searchInput"
              v-model:value="searchQuery"
              allow-clear
              aria-label="全局搜索"
              autocomplete="off"
              placeholder="搜索客户、制程、机型或型号"
              @keydown="onSearchKeydown"
            >
              <template #prefix>
                <Search :size="16" aria-hidden="true" />
              </template>
              <template #suffix>
                <kbd>{{ searchHotkey }}</kbd>
              </template>
            </a-input>
          </form>
          <div class="toolbar__end">
            <UserMenu />
          </div>
        </header>

        <div v-if="selection.backendStatus === 'unauthorized'" class="shell-banner">
          <ABanner
            tone="error"
            message="登录已失效，请重新登录"
            action-label="去登录"
            @action="router.push('/login')"
          />
        </div>
        <div v-else-if="backendUnavailable" class="shell-banner">
          <ABanner
            tone="warning"
            message="无法连接后端服务，页面未加载演示数据。请连接后端后重试。"
            action-label="重新连接"
            @action="selection.reconnect()"
          />
        </div>

        <main
          id="main-content"
          class="content"
          tabindex="-1"
          @scroll="onContentScroll"
        >
          <div v-if="connecting" class="content__loading">
            <ASpinner :size="24" />
          </div>
          <slot v-else />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
  background: var(--bg-window);
  color: var(--label);
}

.skip-link {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: var(--z-toast);
  padding: 8px 12px;
  color: var(--label-on-color);
  text-decoration: none;
  background: var(--sys-blue-solid);
  border-radius: var(--radius-md);
  transform: translateY(-150%);
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-window);
}

.toolbar {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  align-items: center;
  height: var(--toolbar-height);
  padding: 0 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--separator-opaque);
}

.toolbar__end {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}

.brand {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  height: var(--toolbar-height);
  min-width: 0;
  padding: 0 16px;
  color: var(--sider-text);
  text-decoration: none;
}

.brand :deep(.brand-mark) {
  filter: brightness(0) invert(1);
}

.brand__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search {
  flex: 1;
  min-width: 0;
  max-width: 28rem;
}

.search input {
  font: var(--text-field);
}

.search input::placeholder {
  color: var(--label-placeholder);
}

.search kbd {
  color: var(--label-placeholder);
}

.shell-banner {
  flex-shrink: 0;
  padding: 8px 16px 0;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 220px;
  overflow: auto;
  background: var(--sider-bg);
  color: var(--sider-text);
}

.sidebar :deep(.ant-menu) {
  flex: 1;
  background: transparent;
  border-inline-end: 0;
}

/* 分组标题是导航的“目录”，不能和菜单项同字号同亮度 */
.sidebar :deep(.ant-menu-item-group-title) {
  padding-top: var(--space-5);
  padding-bottom: var(--space-2);
  font: var(--text-toolbar-em);
  color: var(--sider-text-2);
}

.app-shell--collapsed .sidebar {
  width: 80px;
}

.app-shell--collapsed .brand {
  justify-content: center;
  padding: 0;
}

.app-shell--collapsed .brand__name {
  display: none;
}

.app-shell--compact .toolbar {
  gap: var(--space-2);
  padding: 0 var(--space-3);
}

.app-shell--compact .search kbd {
  display: none;
}

.app-shell--compact .search,
.app-shell--compact .search :deep(.ant-input-affix-wrapper) {
  width: 100%;
  min-width: 0;
}

.app-shell--compact .sidebar {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  width: min(240px, calc(100vw - 48px));
  transform: translateX(-100%);
}

.app-shell--compact .sidebar :deep(.ant-menu) {
  width: 100%;
}

.app-shell--drawer-open .sidebar {
  transform: none;
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: var(--overlay);
  border: 0;
}

.content {
  flex: 1;
  min-width: 0;
  padding: var(--space-5);
  overflow: auto;
  background: var(--bg-window);
}

.content__loading {
  display: grid;
  height: 100%;
  place-items: center;
}
</style>
