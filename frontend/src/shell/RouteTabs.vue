<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/*
 * 页面级卡片 Tab：一个菜单下的几个子路由用顶部 Tab 切换（如「客户/制程」）。
 * 每张 Tab 对应一个子路由，当前子路由渲染在选中 Tab 的 tabpanel 里。
 * 卡片式外观与页面内部的线条式 Tab 区分层级；样式随组件走，页面不用再写。
 */
export interface RouteTab {
  /** Tab 标题 */
  label: string;
  /** 子路由路径；当前路径等于它或在它之下时该 Tab 选中 */
  path: string;
}

const props = defineProps<{ tabs: readonly RouteTab[] }>();

const route = useRoute();
const router = useRouter();

const within = (base: string) =>
  route.path === base || route.path.startsWith(`${base}/`);

const activePath = computed(
  () => props.tabs.find((tab) => within(tab.path))?.path ?? props.tabs[0]?.path,
);

// 记住每张 Tab 最后停留的完整地址（含 query）：切走再切回来回到原处，
// 而不是回到默认状态（如重新从第一个客户开始）。
const lastVisited = reactive<Record<string, string>>({});
watch(
  () => route.fullPath,
  () => {
    if (activePath.value) lastVisited[activePath.value] = route.fullPath;
  },
  { immediate: true },
);

function switchTab(key: string | number) {
  const path = String(key);
  if (path === activePath.value) return;
  void router.push(lastVisited[path] ?? path);
}
</script>

<template>
  <a-tabs
    :active-key="activePath"
    type="card"
    class="route-tabs"
    @change="switchTab"
  >
    <a-tab-pane v-for="tab in tabs" :key="tab.path" :tab="tab.label">
      <RouterView v-if="tab.path === activePath" />
    </a-tab-pane>
  </a-tabs>
</template>

<style scoped src="./RouteTabs.css"></style>
