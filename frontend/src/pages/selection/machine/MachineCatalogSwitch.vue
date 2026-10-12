<script setup lang="ts">
import type { MachineCatalogKind } from '@/domain';

/**
 * 机型页左栏顶部：「结构 | 专案机型」目录切换，
 * 以及结构目录下「目录浏览 | 条件查找」。
 */
defineProps<{
  catalog: MachineCatalogKind;
  view: 'browse' | 'find';
}>();
const emit = defineEmits<{
  catalog: [catalog: string];
  view: [view: string];
}>();

const CATALOG_TABS = [
  { label: '结构', value: 'mechanism' },
  { label: '专案机型', value: 'project' },
];
const VIEW_TABS = [
  { label: '目录浏览', value: 'browse' },
  { label: '条件查找', value: 'find' },
];
</script>

<template>
  <a-segmented
    class="machine-catalog-tabs"
    block
    aria-label="机型目录"
    :value="catalog"
    :options="CATALOG_TABS"
    @change="emit('catalog', String($event))"
  />
  <a-segmented
    v-if="catalog === 'mechanism'"
    class="machine-view-tabs"
    block
    aria-label="机型浏览方式"
    :value="view"
    :options="VIEW_TABS"
    @change="emit('view', String($event))"
  />
</template>
