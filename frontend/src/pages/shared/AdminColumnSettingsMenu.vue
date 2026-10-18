<script setup lang="ts">
import { message } from 'ant-design-vue';
import { Columns3 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import type { ManagedColumnOption } from './managed-table-columns';

const props = defineProps<{
  canManage: boolean;
  columns: readonly ManagedColumnOption[];
  hidden: ReadonlySet<string>;
  onShowAll: () => Promise<void>;
  onSetVisible: (key: string, visible: boolean) => Promise<void>;
}>();

const open = ref(false);
const visibleCount = computed(
  () => props.columns.filter((column) => !props.hidden.has(column.key)).length,
);
const hiddenCount = computed(
  () => props.columns.filter((column) => props.hidden.has(column.key)).length,
);

async function setVisible(key: string, visible: boolean) {
  try {
    await props.onSetVisible(key, visible);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存列设置失败');
  }
}

async function showAll() {
  try {
    await props.onShowAll();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存列设置失败');
  }
}
</script>

<template>
  <a-popover
    v-if="canManage"
    v-model:open="open"
    trigger="click"
    placement="bottomRight"
    title="显示的列"
  >
    <a-button aria-label="管理员设置显示列">
      <template #icon><Columns3 :size="14" /></template>
      显示列
      <a-badge
        v-if="hiddenCount"
        class="table-column-settings-count"
        :count="hiddenCount"
        size="small"
      />
    </a-button>
    <template #content>
      <a-space direction="vertical" role="group" aria-label="显示的列">
        <a-checkbox
          v-for="column in columns"
          :key="column.key"
          :checked="!hidden.has(column.key)"
          :disabled="!hidden.has(column.key) && visibleCount <= 1"
          @change="setVisible(column.key, $event.target.checked)"
        >
          {{ column.label }}
        </a-checkbox>
        <a-button type="link" size="small" @click="showAll">
          全部显示
        </a-button>
      </a-space>
    </template>
  </a-popover>
</template>
