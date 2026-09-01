<script setup lang="ts">
import { Monitor, Moon, PanelLeft, Search, Sun } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import BrandMark from '@/shell/BrandMark.vue';
import UserMenu from '@/shell/UserMenu.vue';
import { navGroupsFor } from '@/shell/nav';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { useThemeStore } from '@/stores/theme';
import type { ThemePreference } from '@/theme/theme';
import { ABanner, ASpinner, ATooltip } from '@/ui';
import { toast } from '@/ui/toast';

const SIDEBAR_STORAGE_KEY = 'apple-frontend:sidebar-collapsed';
const COMPACT_MEDIA_QUERY = '(width < 960px)';

const route = useRoute();
const router = useRouter();
const theme = useThemeStore();
const auth = useAuthStore();
const selection = useSelectionStore();

const collapsed = ref(readCollapsed());
const compactViewport = ref(false);
const mobileSidebarOpen = ref(false);
const contentScrolled = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const searchHotkey = /Mac|iPhone|iPad/i.test(navigator.platform)
  ? '⌘K'
  : 'Ctrl+K';

const groups = computed(() => navGroupsFor(auth.permissions));

const connecting = computed(() => selection.backendStatus === 'connecting');
const sidebarExpanded = computed(() =>
  compactViewport.value ? mobileSidebarOpen.value : !collapsed.value,
);
let compactMedia: MediaQueryList | null = null;

const themeOptions: {
  icon: typeof Sun;
  label: string;
  value: ThemePreference;
}[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

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

function onContentScroll(event: Event) {
  const target = event.target as HTMLElement;
  contentScrolled.value = target.scrollTop > 0;
}

function isActive(path: string) {
  return route.path === path;
}

function submitSearch() {
  const value = searchQuery.value.trim();
  if (!value) {
    toast.warning('请输入搜索关键词');
    searchInput.value?.focus();
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
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') {
    return;
  }
  event.preventDefault();
  searchInput.value?.focus();
  searchInput.value?.select();
}

function focusSearchFromSurface(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, button, a, [role="button"]')) return;
  event.preventDefault();
  searchInput.value?.focus();
}

onMounted(() => {
  selection.ensureBackendInit();
  window.addEventListener('keydown', onSearchHotkey);
  compactMedia = window.matchMedia?.(COMPACT_MEDIA_QUERY) ?? null;
  if (compactMedia) {
    updateCompactViewport(compactMedia.matches);
    compactMedia.addEventListener('change', onCompactMediaChange);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSearchHotkey);
  compactMedia?.removeEventListener('change', onCompactMediaChange);
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
      'app-shell--collapsed': !compactViewport && collapsed,
      'app-shell--compact': compactViewport,
      'app-shell--drawer-open': compactViewport && mobileSidebarOpen,
    }"
  >
    <header
      class="toolbar material-toolbar"
      :class="{ 'toolbar--scrolled': contentScrolled }"
    >
      <div class="toolbar__start">
        <button
          class="icon-button"
          type="button"
          :aria-expanded="sidebarExpanded"
          aria-controls="app-sidebar"
          :aria-label="sidebarExpanded ? '折叠侧栏' : '展开侧栏'"
          @click="toggleSidebar"
        >
          <PanelLeft :size="18" :stroke-width="1.5" />
        </button>

        <RouterLink class="brand" to="/selection/customer">
          <BrandMark />
          <span class="brand__name">感应器选型</span>
        </RouterLink>
      </div>

      <form
        class="search"
        role="search"
        @mousedown="focusSearchFromSurface"
        @submit.prevent="submitSearch"
      >
        <Search :size="18" :stroke-width="1.5" aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          aria-label="全局搜索"
          autocomplete="off"
          placeholder="搜索客户、制程、机型或型号"
          @keydown="onSearchKeydown"
        >
        <kbd>{{ searchHotkey }}</kbd>
      </form>

      <div class="toolbar__end">
        <div class="theme-switch" role="radiogroup" aria-label="外观">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            class="icon-button"
            type="button"
            role="radio"
            :aria-checked="theme.preference === option.value"
            :aria-label="option.label"
            :title="option.label"
            @click="theme.setPreference(option.value)"
          >
            <component :is="option.icon" :size="18" :stroke-width="1.5" />
          </button>
        </div>

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

    <div class="body">
      <nav
        id="app-sidebar"
        class="sidebar material-sidebar"
        aria-label="主导航"
        :aria-hidden="compactViewport && !mobileSidebarOpen ? true : undefined"
        :inert="compactViewport && !mobileSidebarOpen ? true : undefined"
      >
        <section v-for="group in groups" :key="group.id" class="nav-group">
          <h2 v-if="sidebarExpanded" class="nav-group__label">
            {{ group.label }}
          </h2>
          <ATooltip
            v-for="item in group.items"
            :key="item.to"
            :content="item.label"
            side="right"
            :disabled="sidebarExpanded"
          >
            <template #trigger>
              <RouterLink
                class="nav-item"
                :class="{ 'nav-item--active': isActive(item.to) }"
                :to="item.to"
                :title="sidebarExpanded ? undefined : item.label"
              >
                <component
                  :is="item.icon"
                  class="nav-item__icon"
                  :size="18"
                  :stroke-width="1.5"
                />
                <span v-if="sidebarExpanded" class="nav-item__label">{{
                  item.label
                }}</span>
              </RouterLink>
            </template>
          </ATooltip>
        </section>
      </nav>

      <button
        v-if="compactViewport && mobileSidebarOpen"
        class="sidebar-backdrop"
        type="button"
        aria-label="关闭导航"
        @click="mobileSidebarOpen = false"
      />

      <main class="content" @scroll="onContentScroll">
        <div v-if="connecting" class="content__loading">
          <ASpinner :size="24" />
        </div>
        <slot v-else />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg-window);
  color: var(--label);
}

.toolbar {
  position: relative;
  z-index: 30;
  display: grid;
  flex-shrink: 0;
  grid-template-columns: 1fr minmax(0, 28rem) 1fr;
  gap: var(--space-3);
  align-items: center;
  height: var(--toolbar-height);
  padding: 0 var(--space-4);
}

.toolbar__start,
.toolbar__end {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.toolbar__start {
  min-width: 0;
}

.toolbar__end {
  justify-self: end;
}

.toolbar--scrolled::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  pointer-events: none;
  content: '';
  background: var(--separator);
  box-shadow: var(--shadow-1);
  transform: scaleY(0.5);
  transform-origin: bottom;
}

.brand {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  color: var(--label);
}

.brand:focus-visible {
  border-radius: var(--radius-sm);
}

.brand__name {
  font: var(--text-headline);
  letter-spacing: var(--tracking-headline);
}

.search {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  min-width: 0;
  height: var(--control-height-lg);
  padding: 0 var(--space-4);
  color: var(--label-3);
  background: var(--fill-2);
  border: 0;
  border-radius: var(--radius-pill);
  transition:
    background-color var(--dur-1) var(--ease-out),
    box-shadow var(--dur-1) var(--ease-out);
}

.search input {
  align-self: stretch;
  flex: 1;
  min-width: 0;
  padding: 0;
  font: var(--text-field);
  color: var(--label);
  appearance: none;
  background: transparent;
  border: 0;
  outline: none;
}

.search input[type='search']::-webkit-search-decoration,
.search input[type='search']::-webkit-search-cancel-button,
.search input[type='search']::-webkit-search-results-button,
.search input[type='search']::-webkit-search-results-decoration {
  display: none;
}

.search input::placeholder {
  color: var(--label-placeholder);
}

.search input:focus,
.search input:focus-visible {
  outline: none;
  box-shadow: none;
}

.search kbd {
  flex-shrink: 0;
  padding: var(--space-1) var(--space-2);
  font: var(--text-caption);
  color: var(--label-placeholder);
  letter-spacing: var(--tracking-caption);
  background: var(--fill-3);
  border-radius: var(--radius-sm);
}

.search:hover {
  background: var(--fill-3);
}

.search:has(:focus-visible) {
  box-shadow: var(--focus-ring);
}

.theme-switch {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--fill-4);
  border-radius: var(--radius-lg);
}

.icon-button {
  display: grid;
  place-items: center;
  width: var(--control-height-md);
  height: var(--control-height-md);
  color: var(--label-2);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
}

.icon-button:hover {
  background: var(--fill-3);
}

.icon-button:active {
  opacity: 0.7;
}

.icon-button[aria-checked='true'] {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.shell-banner {
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4) 0;
}

.body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: var(--space-4);
  width: var(--sidebar-width);
  padding: var(--space-3);
  overflow: auto;
  box-shadow: inset -1px 0 0 var(--separator);
  transition:
    width var(--dur-4) var(--ease-in-out),
    padding var(--dur-4) var(--ease-in-out);
}

.app-shell--collapsed .sidebar {
  width: var(--sidebar-collapsed-width);
  padding: var(--space-3) var(--space-2);
}

.app-shell--collapsed .brand {
  display: none;
}

.app-shell--collapsed .toolbar__start {
  width: calc(var(--sidebar-collapsed-width) - var(--space-4) * 2);
  justify-content: center;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nav-group__label {
  padding: var(--space-1) var(--space-3);
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
  text-transform: uppercase;
}

.nav-item {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-height: var(--control-height-lg);
  padding: var(--space-1) var(--space-3);
  color: var(--label);
  border-radius: var(--radius-md);
  transition: background-color var(--dur-1) var(--ease-out);
}

.nav-item:hover {
  background: var(--fill-3);
}

.nav-item:active {
  opacity: 0.7;
}

.nav-item--active {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.nav-item--active:hover {
  background: var(--sys-blue-fill);
}

.nav-item__icon {
  flex-shrink: 0;
}

.nav-item__label {
  overflow: hidden;
  font: var(--text-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell--collapsed .nav-item {
  justify-content: center;
  padding: var(--space-2);
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: var(--space-5);
  overflow: hidden;
  background: var(--bg-content);
}

.content > * {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden auto;
}

.content__loading {
  display: grid;
  place-items: center;
  min-height: calc(var(--space-9) * 6);
}

@media (width < 960px) {
  .toolbar {
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    gap: var(--space-3);
    padding: 0 var(--space-3);
  }

  .toolbar__start,
  .toolbar__end {
    gap: var(--space-2);
  }

  .brand__name,
  .search kbd {
    display: none;
  }

  .sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: min(var(--sidebar-width), calc(100vw - 48px));
    padding: var(--space-3);
    box-shadow: var(--shadow-4);
    transform: translateX(-105%);
    transition: transform var(--dur-3) var(--ease-sheet);
  }

  .app-shell--drawer-open .sidebar {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    position: absolute;
    inset: 0;
    z-index: 10;
    padding: 0;
    background: var(--overlay);
    border: 0;
    backdrop-filter: var(--overlay-blur);
  }

  .content {
    padding: var(--space-4);
  }
}

@media (width < 560px) {
  .toolbar {
    gap: var(--space-2);
    padding: 0 var(--space-2);
  }

  .brand {
    display: none;
  }

  .search {
    height: var(--control-height-md);
    padding: 0 var(--space-3);
  }

  .theme-switch {
    gap: 0;
    padding: 0;
  }

  .content {
    padding: var(--space-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .sidebar-backdrop,
  .nav-item {
    transition: none;
  }
}
</style>
