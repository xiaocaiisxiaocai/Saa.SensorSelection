<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import type { SearchItem } from '@/domain';
import { useSelectionStore } from '@/stores/selection';
import { ABadge, AEmptyState, ASegmentedControl, type BadgeTone, type SegmentOption } from '@/ui';

import '../shared/selection-page.css';

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
const results = computed(() =>
  activeType.value === 'all'
    ? allResults.value
    : allResults.value.filter((item) => item.type === activeType.value),
);

const tabs = computed<SegmentOption[]>(() => [
  { label: '全部', value: 'all', badge: allResults.value.length },
  { label: '客户', value: 'customer' },
  { label: '制程', value: 'process' },
  { label: '机型', value: 'machine' },
  { label: 'Sensor', value: 'sensor' },
]);

const typeLabel: Record<SearchItem['type'], string> = {
  customer: '客户',
  process: '制程',
  machine: '机型',
  sensor: 'Sensor',
};

const typeTone: Record<SearchItem['type'], BadgeTone> = {
  customer: 'green',
  process: 'indigo',
  machine: 'orange',
  sensor: 'blue',
};

watch(
  query,
  () => {
    activeType.value = 'all';
    if (!query.value) {
      void router.replace('/selection/customer');
    }
  },
  { immediate: true },
);

function openResult(item: SearchItem) {
  void router.push({ path: item.path, query: item.query });
}
</script>

<template>
  <section class="selection-page">
    <header class="search-heading">
      <h1>搜索“{{ query }}”</h1>
      <p>{{ results.length }} 条结果</p>
    </header>
    <ASegmentedControl v-model="activeType" :segments="tabs" />
    <AEmptyState
      v-if="results.length === 0"
      title="没有匹配的结果"
      description="换个关键词试试，可搜索客户、制程、机型和 Sensor 型号"
    />
    <ul v-else class="search-list">
      <li v-for="(item, index) in results" :key="`${item.path}-${item.title}-${index}`">
        <button type="button" @click="openResult(item)">
          <span class="search-list__title">{{ item.title }}</span>
          <ABadge :label="typeLabel[item.type]" :tone="typeTone[item.type]" />
          <span class="search-list__meta">{{ item.category }}</span>
          <span class="search-list__sub">{{ item.sub }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.selection-page {
  overflow: auto;
}

.search-heading {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
}

.search-heading h1 {
  margin: 0;
  font: var(--text-title-1);
  letter-spacing: var(--tracking-title-1);
}

.search-heading p {
  margin: 0;
  font: var(--text-control);
  color: var(--label-2);
}

.search-list {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.search-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-1) var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  text-align: start;
  cursor: pointer;
  background: var(--fill-2);
  border: 0;
  border-radius: var(--radius-md);
}

.search-list button:hover {
  background: var(--fill-3);
}

.search-list__title {
  font: var(--text-headline);
  letter-spacing: var(--tracking-headline);
}

.search-list__meta,
.search-list__sub {
  font: var(--text-caption);
  color: var(--label-2);
}

.search-list__sub {
  grid-column: 1 / -1;
}
</style>
