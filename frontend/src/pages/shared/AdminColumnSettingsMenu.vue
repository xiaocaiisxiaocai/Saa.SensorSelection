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
const pending = ref(0);
const saving = computed(() => pending.value > 0);
const visibleCount = computed(
  () => props.columns.filter((column) => !props.hidden.has(column.key)).length,
);
const hiddenCount = computed(
  () => props.columns.filter((column) => props.hidden.has(column.key)).length,
);
const summary = computed(() =>
  hiddenCount.value ? `已隐藏 ${hiddenCount.value} 列` : '全部列已显示',
);
const statusText = computed(() =>
  saving.value
    ? '保存中…'
    : `已显示 ${visibleCount.value} / ${props.columns.length} 列`,
);

async function run(task: () => Promise<void>) {
  pending.value += 1;
  try {
    await task();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存列设置失败');
  } finally {
    pending.value -= 1;
  }
}

function setVisible(key: string, visible: boolean) {
  void run(() => props.onSetVisible(key, visible));
}

function showAll() {
  void run(() => props.onShowAll());
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
    <a-tooltip :title="summary">
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
    </a-tooltip>
    <template #content>
      <div class="table-column-settings">
        <p class="table-column-settings__status" aria-live="polite">
          {{ statusText }}
        </p>
        <div
          class="table-column-settings__list"
          role="group"
          aria-label="显示的列"
        >
          <a-checkbox
            v-for="column in columns"
            :key="column.key"
            :checked="!hidden.has(column.key)"
            :disabled="!hidden.has(column.key) && visibleCount <= 1"
            @change="setVisible(column.key, $event.target.checked)"
          >
            {{ column.label }}
          </a-checkbox>
        </div>
        <a-button
          type="link"
          size="small"
          :disabled="saving || hiddenCount === 0"
          @click="showAll"
        >
          全部显示
        </a-button>
      </div>
    </template>
  </a-popover>
</template>

<style scoped src="./AdminColumnSettingsMenu.css"></style>
