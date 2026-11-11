<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import ProcessIntroPanel from '@/pages/selection/process/ProcessIntroPanel.vue';
import ProcessStepsPanel from '@/pages/selection/process/ProcessStepsPanel.vue';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';

import '../shared/selection-page.css';

/** 制程页：「制程介绍 | 工艺制程」两个页签，页签和搜索词同步到地址栏 */
const route = useRoute();

const activeTab = ref(
  String(route.query.tab || '') === 'steps' ? 'steps' : 'intro',
);
const query = ref(String(route.query.q || ''));

useSyncedQuery(() => ({
  tab: activeTab.value === 'steps' ? 'steps' : undefined,
  q: query.value.trim() || undefined,
}));

// 路由组件会在同一路径只改变 query 时复用。地址栏、浏览历史或其它页面
// 导航过来的状态也要落回本地，否则旧状态会被 useSyncedQuery 再写回 URL。
watch(
  () => [route.query.tab, route.query.q] as const,
  ([tab, q]) => {
    activeTab.value = String(tab || '') === 'steps' ? 'steps' : 'intro';
    query.value = String(q || '');
  },
);
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">制程管理</h1>
    <a-tabs
      v-model:active-key="activeTab"
      class="entity-tabs"
      destroy-inactive-tab-pane
    >
      <a-tab-pane key="intro" tab="制程介绍">
        <ProcessIntroPanel />
      </a-tab-pane>
      <!-- 分层筛选随页签销毁而清空；搜索词保留在地址栏里 -->
      <a-tab-pane key="steps" tab="工艺制程">
        <ProcessStepsPanel v-model:query="query" />
      </a-tab-pane>
    </a-tabs>
  </section>
</template>
