<script setup lang="ts">
import { message } from 'ant-design-vue';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import AppNav from '@/shell/AppNav.vue';
import UserMenu from '@/shell/UserMenu.vue';
import { useSelectionStore } from '@/stores/selection';

const SIDEBAR_STORAGE_KEY = 'symtek:sidebar-collapsed';
const COMPACT_MEDIA_QUERY = '(width <= 960px)';
// 960–1200px 的笔记本/小屏：展开的侧栏会挤掉双栏页面里一半的表格列，
// 默认收成图标栏；用户在该宽度下手动展开只在本次会话有效，不改写宽屏偏好。
const MEDIUM_MEDIA_QUERY = '(width <= 1200px)';

const route = useRoute();
const router = useRouter();
const selection = useSelectionStore();

const collapsed = ref(readCollapsed());
const compactViewport = ref(false);
const mediumViewport = ref(false);
const mediumOverride = ref<boolean | null>(null);
const mobileSidebarOpen = ref(false);
const searchQuery = ref('');
const searchInput = ref<{ focus?: () => void } | HTMLInputElement | null>(null);

function nativeSearchInput() {
  const target = searchInput.value;
  if (target instanceof HTMLInputElement) return target;
  return document.getElementById(
    'global-search-input',
  ) as HTMLInputElement | null;
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

function submitSearch() {
  const value = searchQuery.value.trim();
  if (!value) {
    message.warning('请输入搜索关键词');
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
  <a-layout class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <a-layout-sider
      v-if="!compactViewport"
      id="app-sidebar"
      class="app-shell__sider"
      :collapsed="railCollapsed"
      :trigger="null"
      collapsible
      :width="200"
      :collapsed-width="80"
    >
      <AppNav :collapsed="railCollapsed" />
    </a-layout-sider>
    <a-drawer
      v-else
      :open="mobileSidebarOpen"
      placement="left"
      :width="240"
      :closable="false"
      :body-style="{ padding: 0 }"
      root-class-name="app-shell__drawer"
      @close="mobileSidebarOpen = false"
    >
      <div id="app-sidebar" class="app-shell__drawer-body">
        <AppNav />
      </div>
    </a-drawer>

    <a-layout class="app-shell__main">
      <a-layout-header class="app-shell__header">
        <a-button
          type="text"
          :aria-expanded="sidebarExpanded"
          aria-controls="app-sidebar"
          :aria-label="sidebarExpanded ? '折叠侧栏' : '展开侧栏'"
          @click="toggleSidebar"
        >
          <template #icon>
            <PanelLeftClose v-if="sidebarExpanded" :size="18" />
            <PanelLeftOpen v-else :size="18" />
          </template>
        </a-button>
        <form
          class="app-shell__search"
          role="search"
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
            <template v-if="!compactViewport" #suffix>
              <a-typography-text keyboard>{{ searchHotkey }}</a-typography-text>
            </template>
          </a-input>
        </form>
        <div class="app-shell__header-end">
          <UserMenu />
        </div>
      </a-layout-header>

      <a-alert
        v-if="selection.backendStatus === 'unauthorized'"
        class="app-shell__banner"
        type="error"
        show-icon
        banner
        message="登录已失效，请重新登录"
      >
        <template #action>
          <a-button size="small" type="link" @click="router.push('/login')">
            去登录
          </a-button>
        </template>
      </a-alert>
      <a-alert
        v-else-if="backendUnavailable"
        class="app-shell__banner"
        type="warning"
        show-icon
        banner
        message="无法连接后端服务，页面未加载演示数据。请连接后端后重试。"
      >
        <template #action>
          <a-button size="small" type="link" @click="selection.reconnect()">
            重新连接
          </a-button>
        </template>
      </a-alert>

      <a-layout-content
        id="main-content"
        class="app-shell__content"
        tabindex="-1"
      >
        <div v-if="connecting" class="app-shell__loading">
          <a-spin size="large" />
        </div>
        <slot v-else />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.app-shell {
  height: 100dvh;
  min-height: 0;
}

.skip-link {
  position: fixed;
  top: var(--space-4);
  left: var(--space-4);
  z-index: 1000;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text-light-solid);
  text-decoration: none;
  background: var(--color-primary);
  border-radius: var(--radius-md);
  transform: translateY(-150%);
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.app-shell__sider {
  overflow: auto;
}

.app-shell__main {
  min-width: 0;
  min-height: 0;
}

.app-shell__header {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  height: var(--header-height);
  padding: 0 var(--space-5);
  line-height: normal;
  background: var(--color-bg-container);
  border-bottom: 1px solid var(--color-border-secondary);
}

.app-shell__search {
  flex: 1;
  min-width: 0;
  max-width: 28rem;
}

.app-shell__header-end {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-left: auto;
}

.app-shell__content {
  min-width: 0;
  min-height: 0;
  padding: var(--space-5);
  overflow: auto;
}

.app-shell__loading {
  display: grid;
  height: 100%;
  place-items: center;
}

.app-shell__drawer-body {
  height: 100%;
  background: var(--layout-sider-bg);
}
</style>
