<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';

import { useTablePagination } from '@/pages/shared/table';

import type { MachineStructureSearchResult } from './machine-structure-search';

const props = defineProps<{
  results: MachineStructureSearchResult[];
}>();

const emit = defineEmits<{
  select: [result: MachineStructureSearchResult];
}>();

// 分页条始终显示；条件变化会换成新的结果数组，并回到第一页
const { listPagination } = useTablePagination(
  () => props.results.length,
  [() => props.results],
);

function path(result: MachineStructureSearchResult): string {
  return [result.category, result.configuration, result.machineName]
    .filter(Boolean)
    .join(' / ');
}

function resultTags(result: MachineStructureSearchResult): string[] {
  return [
    ...result.machineModelNames,
    ...result.processStepNames,
    ...result.boardCharacteristicNames,
  ];
}
</script>

<template>
  <section
    class="selection-panel machine-global-search-results"
    aria-live="polite"
  >
    <a-page-header
      class="machine-global-search-results__heading"
      :title="`找到 ${results.length} 个结构`"
    />
    <a-list
      class="search-list"
      :data-source="results"
      :pagination="listPagination"
      :locale="{ emptyText: '没有找到符合条件的结构' }"
      bordered
      size="small"
    >
      <template #renderItem="{ item: result }">
        <a-list-item>
          <a-list-item-meta>
            <template #title>{{ path(result) }}</template>
            <template #description>
              {{ result.sectionName }} · 匹配 {{ result.matchCount }} 条记录
              <div class="machine-global-search-results__tags">
                <a-tag
                  v-for="tag in resultTags(result)"
                  :key="tag"
                  color="blue"
                >
                  {{ tag }}
                </a-tag>
              </div>
            </template>
          </a-list-item-meta>
          <template #actions>
            <a-button type="link" @click="emit('select', result)">
              查看结构
              <ArrowRight :size="14" />
            </a-button>
          </template>
        </a-list-item>
      </template>
    </a-list>
  </section>
</template>

<style scoped src="./MachineGlobalSearchResults.css"></style>
