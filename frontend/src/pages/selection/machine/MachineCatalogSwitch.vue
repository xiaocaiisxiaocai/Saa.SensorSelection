<script setup lang="ts">
import type { MachineCatalogKind } from '@/domain';

/**
 * 机型页左栏顶部：当前浏览的制程（可进入「管理制程」）、
 * 「结构 | 专案机型」目录切换，以及结构目录下「目录浏览 | 条件查找」。
 */
defineProps<{
  processId: number;
  processOptions: readonly { label: string; value: number }[];
  catalog: MachineCatalogKind;
  view: 'browse' | 'find';
  writable: boolean;
}>();
const emit = defineEmits<{
  process: [processId: number];
  catalog: [catalog: string];
  view: [view: string];
  manageProcesses: [];
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
  <div class="machine-process-context" aria-label="当前浏览制程">
    <a-select
      :value="processId"
      class="machine-process-context__select"
      :options="processOptions"
      placeholder="选择制程"
      aria-label="当前浏览制程"
      size="small"
      @update:value="emit('process', Number($event))"
    />
    <a-button
      v-if="writable"
      type="text"
      class="machine-process-context__manage"
      size="small"
      @click="emit('manageProcesses')"
    >
      管理制程
    </a-button>
  </div>
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

<style scoped src="./MachineCatalogSwitch.css"></style>
