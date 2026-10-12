<script setup lang="ts">
import { ref } from 'vue';
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
