<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Menu, Search } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getStoredToken } from '@/api';
import AppNav from '@/shell/AppNav.vue';
import UserMenu from '@/shell/UserMenu.vue';
import { useSelectionStore } from '@/stores/selection';

// 宽屏侧栏常驻、不可折叠；只有 960px 以下的窄屏把导航收进抽屉。
const COMPACT_MEDIA_QUERY = '(width <= 960px)';

const route = useRoute();
const router = useRouter();
const selection = useSelectionStore();

const compactViewport = ref(false);
const mobileSidebarOpen = ref(false);
const searchQuery = ref('');

// 只有首次连接用加载态替换页面；断线后的自动重连保持页面挂载，
// 否则每次重试都会清掉用户编辑到一半的表单和弹窗。
const connecting = computed(
  () => selection.backendStatus === 'connecting' && !selection.hasConnected,
);
const backendUnavailable = computed(
  () => selection.backendStatus === 'offline',
);
let compactMedia: MediaQueryList | null = null;

function updateCompactViewport(matches: boolean) {
  compactViewport.value = matches;
  if (!matches) mobileSidebarOpen.value = false;
}

function onCompactMediaChange(event: MediaQueryListEvent) {
  updateCompactViewport(event.matches);
}

function submitSearch() {
  const value = searchQuery.value.trim();
  if (!value) {
    message.warning('请输入搜索关键词');
    document.getElementById('global-search-input')?.focus();
    return;
  }
  void router.push({ path: '/selection/search', query: { q: value } });
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  submitSearch();
}

onMounted(() => {
  selection.ensureBackendInit();
  compactMedia = window.matchMedia?.(COMPACT_MEDIA_QUERY) ?? null;
  if (compactMedia) {
    updateCompactViewport(compactMedia.matches);
    compactMedia.addEventListener('change', onCompactMediaChange);
  }
});

onBeforeUnmount(() => {
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
  <a-layout class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <a-layout-sider
      v-if="!compactViewport"
      id="app-sidebar"
      class="app-shell__sider"
      :width="200"
    >
      <AppNav />
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
          v-if="compactViewport"
          type="text"
          :aria-expanded="mobileSidebarOpen"
          aria-controls="app-sidebar"
          aria-label="打开导航"
          @click="mobileSidebarOpen = !mobileSidebarOpen"
        >
          <template #icon>
            <Menu :size="18" />
          </template>
        </a-button>
        <form
          class="app-shell__search"
          role="search"
          @submit.prevent="submitSearch"
        >
          <a-input
            id="global-search-input"
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

<style scoped src="./AppShell.css"></style>
