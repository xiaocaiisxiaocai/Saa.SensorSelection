<script lang="ts" setup>
import type { SearchItem } from '../domain.js';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ElEmpty, ElTag } from 'element-plus';
import {
  Building2,
  ChevronRight,
  Cpu,
  Factory,
  RadioTower,
} from 'lucide-vue-next';

import { useSelectionStore } from '../store';
import AppToolbar from './AppToolbar.vue';

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const activeType = ref('all');

const query = computed(() => String(route.query.q || '').trim());
const allResults = computed(() => {
  const value = query.value.toLocaleLowerCase('zh-CN');
  if (!value) return [];
  return store.searchIndex.filter((item) =>
    [item.title, item.category, item.sub]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(value),
  );
});
const availableTypes = computed(() => [
  'all',
  ...new Set(allResults.value.map((item) => item.type)),
]);
const results = computed(() =>
  activeType.value === 'all'
    ? allResults.value
    : allResults.value.filter((item) => item.type === activeType.value),
);

const typeMeta = {
  all: '全部',
  customer: '客户',
  machine: '机型',
  process: '制程',
  sensor: 'Sensor',
};

watch(query, () => {
  activeType.value = 'all';
});

function openResult(item: SearchItem) {
  router.push({ path: item.path, query: item.query });
}
</script>

<template>
  <main class="selection-page search-page">
    <AppToolbar subtitle="跨客户、制程、机型与型号字典" title="搜索结果" />
    <section class="search-results">
      <div class="search-results__heading">
        <h2>搜索“{{ query }}”</h2>
        <span>{{ results.length }} 条结果</span>
      </div>
      <div
        v-if="availableTypes.length > 1"
        aria-label="结果类型"
        class="search-type-filter"
        role="group"
      >
        <button
          v-for="type in availableTypes"
          :key="type"
          :aria-pressed="activeType === type"
          :class="{ active: activeType === type }"
          type="button"
          @click="activeType = type"
        >
          {{ typeMeta[type as keyof typeof typeMeta] }}
        </button>
      </div>
      <div v-if="results.length > 0" class="search-result-list">
        <button
          v-for="item in results"
          :key="`${item.type}:${item.category}:${item.title}`"
          class="search-result"
          type="button"
          @click="openResult(item)"
        >
          <span :data-type="item.type" class="search-result__icon">
            <Building2
              v-if="item.type === 'customer'"
              :size="18"
              aria-hidden="true"
            />
            <Factory
              v-else-if="item.type === 'process'"
              :size="18"
              aria-hidden="true"
            />
            <Cpu
              v-else-if="item.type === 'machine'"
              :size="18"
              aria-hidden="true"
            />
            <RadioTower v-else :size="18" aria-hidden="true" />
          </span>
          <span class="search-result__body">
            <strong>{{ item.title }}</strong>
            <small>{{ item.sub }}</small>
          </span>
          <ElTag effect="plain">{{ typeMeta[item.type] }}</ElTag>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
      </div>
      <ElEmpty v-else description="未找到相关内容" />
    </section>
  </main>
</template>
