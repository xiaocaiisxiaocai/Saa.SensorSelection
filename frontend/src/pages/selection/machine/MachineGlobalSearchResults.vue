<script setup lang="ts">
import { Empty } from 'ant-design-vue';
import { ArrowRight } from 'lucide-vue-next';
import { computed, h } from 'vue';

import { useTablePagination } from '@/pages/shared/table';
import { AHighlightText } from '@/ui';

import type {
  MachineStructureSearchDocument,
  MachineStructureSearchResult,
} from './machine-structure-search';

const props = defineProps<{
  results: MachineStructureSearchResult[];
  /** 设了任一条件；没设条件时结果就是全部结构，空了是还没有记录，不是没匹配上 */
  filtered: boolean;
  query?: string;
  documents?: readonly MachineStructureSearchDocument[];
}>();

const emit = defineEmits<{
  select: [result: MachineStructureSearchResult];
}>();

// 分页条始终显示；条件变化会换成新的结果数组，并回到第一页
const { listPagination } = useTablePagination(
  () => props.results.length,
  [() => props.results],
);

// 和其它页面一样用 antd 的空状态插图
const emptyLocale = computed(() => ({
  emptyText: h(Empty, {
    image: Empty.PRESENTED_IMAGE_SIMPLE,
    description: props.filtered
      ? '没有找到符合条件的结构，换个条件试试'
      : '还没有任何结构记录，先在「目录浏览」里给机型新增选型',
  }),
}));

function path(result: MachineStructureSearchResult): string {
  return [result.category, result.configuration, result.machineName]
    .filter(Boolean)
    .join(' / ');
}

function resultTags(result: MachineStructureSearchResult): string[] {
  return [...result.boardCharacteristicNames];
}

// Include the matched record text when the keyword is found inside a sensor
// or note rather than in the structure path shown by the result heading.
function matchingContent(result: MachineStructureSearchResult): string {
  const keyword = props.query
    ?.trim()
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN');
  if (!keyword) return '';
  return (
    props.documents?.find(
      (document) =>
        document.sectionId === result.sectionId &&
        document.category === result.category &&
        document.configuration === result.configuration &&
        document.machineName === result.machineName &&
        result.rowIds.includes(document.rowId) &&
        document.searchableText
          .normalize('NFKC')
          .toLocaleLowerCase('zh-CN')
          .includes(keyword),
    )?.searchableText ?? ''
  );
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
      :locale="emptyLocale"
      bordered
      size="small"
    >
      <template #renderItem="{ item: result }">
        <a-list-item>
          <a-list-item-meta>
            <template #title>
              <AHighlightText :text="path(result)" :query="query" />
            </template>
            <template #description>
              <AHighlightText :text="result.sectionName" :query="query" /> ·
              匹配 {{ result.matchCount }} 条记录
              <div
                v-if="matchingContent(result)"
                class="machine-global-search-results__match"
              >
                匹配内容：<AHighlightText
                  :text="matchingContent(result)"
                  :query="query"
                />
              </div>
              <div class="machine-global-search-results__tags">
                <a-tag
                  v-for="tag in resultTags(result)"
                  :key="tag"
                  color="blue"
                >
                  <AHighlightText :text="tag" :query="query" />
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
