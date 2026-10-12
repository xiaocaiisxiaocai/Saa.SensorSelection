<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { searchItemDetail, type SearchItem } from '@/domain';
import { TAB_COUNT_STYLE } from '@/pages/shared/tabs';
import { useSelectionStore } from '@/stores/selection';
import { AHighlightText } from '@/ui';

import '../shared/selection-page.css';
import { useTablePagination } from '@/pages/shared/table';

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

const resultCounts = computed(() => {
  const counts: Record<SearchItem['type'], number> = {
    customer: 0,
    process: 0,
    machine: 0,
    sensor: 0,
  };
  for (const item of allResults.value) counts[item.type] += 1;
  return counts;
});

const tabs = computed(() => [
  { label: '全部', value: 'all', count: allResults.value.length },
  { label: '客户', value: 'customer', count: resultCounts.value.customer },
  { label: '制程', value: 'process', count: resultCounts.value.process },
  { label: '机型', value: 'machine', count: resultCounts.value.machine },
  { label: 'Sensor', value: 'sensor', count: resultCounts.value.sensor },
]);

const typeLabel: Record<SearchItem['type'], string> = {
  customer: '客户',
  process: '制程',
  machine: '机型',
  sensor: 'Sensor',
};

// a-tag 预设色
const typeColor: Record<SearchItem['type'], string> = {
  customer: 'green',
  process: 'purple',
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

// 列表分页：分页条固定在底部、始终显示；筛选变化回到第一页
const { listPagination } = useTablePagination(
  () => results.value.length,
  [query, activeType],
);
</script>

<template>
  <section class="selection-page">
    <a-page-header
      class="search-heading"
      :title="`搜索“${query}”`"
      :sub-title="`${results.length} 条结果`"
    />
    <a-tabs v-model:active-key="activeType" class="entity-tabs">
      <a-tab-pane v-for="tab in tabs" :key="tab.value">
        <template #tab>
          {{ tab.label }}
          <a-badge
            :count="tab.count"
            show-zero
            :overflow-count="999"
            :number-style="TAB_COUNT_STYLE"
          />
        </template>
        <a-list
          v-if="tab.value === activeType"
          class="search-list"
          :data-source="results"
          :pagination="listPagination"
          item-layout="vertical"
          :locale="{
            emptyText:
              '没有匹配的结果，换个关键词试试，可搜索客户、制程、机型和 Sensor 型号',
          }"
        >
          <template #renderItem="{ item }">
            <a-list-item class="search-list__item">
              <template #extra>
                <a-tag :color="typeColor[(item as SearchItem).type]">
                  {{ typeLabel[(item as SearchItem).type] }}
                </a-tag>
              </template>
              <a-list-item-meta>
                <template #title>
                  <a-button
                    class="search-list__title"
                    type="link"
                    @click="openResult(item as SearchItem)"
                  >
                    <AHighlightText
                      :text="(item as SearchItem).title"
                      :query="query"
                    />
                  </a-button>
                </template>
                <template #description>
                  <AHighlightText
                    :text="(item as SearchItem).category"
                    :query="query"
                  />
                </template>
              </a-list-item-meta>
              <a-typography-paragraph
                v-if="searchItemDetail(item as SearchItem)"
                class="search-list__sub"
                type="secondary"
                :title="searchItemDetail(item as SearchItem)"
              >
                <AHighlightText
                  :text="searchItemDetail(item as SearchItem)"
                  :query="query"
                />
              </a-typography-paragraph>
            </a-list-item>
          </template>
        </a-list>
      </a-tab-pane>
    </a-tabs>
  </section>
</template>

<style scoped>
.selection-page {
  overflow: auto;
}

.search-heading {
  padding: 0;
}

.search-list__title {
  height: auto;
  padding: 0;
  font: var(--font-heading-5);
  white-space: normal;
  text-align: start;
}

/* 正文行长控制在 ~70 字符，完整显示不截断 */
.search-list__sub {
  max-width: 70ch;
  margin-bottom: 0;
  overflow-wrap: anywhere;
}
</style>
