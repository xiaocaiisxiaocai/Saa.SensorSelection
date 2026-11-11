<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { onBeforeUnmount, ref } from 'vue';

import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { useTablePagination } from '@/pages/shared/table';

export interface ImportResultCategory {
  created: number;
  deleted: number;
  kept: number;
  skipped: number;
  title: string;
  unchangedReason?: string;
  updated: number;
}

export interface ImportResultSkip {
  location: string;
  reason: string;
}

export interface ImportResultPayload {
  categories: ImportResultCategory[];
  notes: string[];
  skips: ImportResultSkip[];
  summary?: string;
  title: string;
}

const openState = ref(false);
const confirmMode = ref(false);
let resolveConfirmation: ((confirmed: boolean) => void) | undefined;
const payload = ref<ImportResultPayload>({
  categories: [],
  notes: [],
  skips: [],
  title: '导入结果',
});
const revision = ref(0);
const { pagination, onChange } = useTablePagination(
  () => payload.value.skips.length,
  [revision],
);

const baseColumns: TableColumnType<ImportResultSkip & { key: number }>[] = [
  { dataIndex: 'location', key: 'location', title: '位置', width: 220 },
  { dataIndex: 'reason', key: 'reason', title: '原因' },
];
const {
  canManage: canManageColumns,
  columns,
  hidden: hiddenColumns,
  onResizeColumn,
  options: columnOptions,
  setVisible: setColumnVisible,
  showAll: showAllColumns,
} = useManagedTableColumns('import-result', () => baseColumns);

function categoryLine(item: ImportResultCategory) {
  const kept =
    item.kept > 0
      ? `保留 ${item.kept}（仍被引用，未删除）`
      : `保留 ${item.kept}`;
  const line = [
    `新增 ${item.created}`,
    `更新 ${item.updated}`,
    `删除 ${item.deleted}`,
    kept,
    `跳过 ${item.skipped}`,
  ].join(' / ');
  return item.unchangedReason ? `${line} · ${item.unchangedReason}` : line;
}

function open(next: ImportResultPayload) {
  settleConfirmation(false);
  payload.value = next;
  revision.value += 1;
  confirmMode.value = false;
  openState.value = true;
}

function confirm(next: ImportResultPayload): Promise<boolean> {
  settleConfirmation(false);
  payload.value = next;
  revision.value += 1;
  confirmMode.value = true;
  openState.value = true;
  return new Promise<boolean>((resolve) => {
    resolveConfirmation = resolve;
  });
}

function settleConfirmation(confirmed: boolean) {
  openState.value = false;
  const resolve = resolveConfirmation;
  resolveConfirmation = undefined;
  resolve?.(confirmed);
}

onBeforeUnmount(() => settleConfirmation(false));

defineExpose({ confirm, open });
</script>

<template>
  <a-modal
    :open="openState"
    :title="payload.title"
    :width="720"
    destroy-on-close
    @cancel="settleConfirmation(false)"
  >
    <div class="import-result">
      <p v-if="payload.summary" class="import-result__summary">
        {{ payload.summary }}
      </p>
      <div v-if="payload.skips.length" class="selection-toolbar">
        <div class="selection-toolbar__actions">
          <AdminColumnSettingsMenu
            :can-manage="canManageColumns"
            :columns="columnOptions"
            :hidden="hiddenColumns"
            :on-set-visible="setColumnVisible"
            :on-show-all="showAllColumns"
          />
        </div>
      </div>
      <ul v-if="payload.categories.length" class="import-result__categories">
        <li v-for="item in payload.categories" :key="item.title">
          {{ item.title }}：{{ categoryLine(item) }}
        </li>
      </ul>
      <ul v-if="payload.notes.length" class="import-result__notes">
        <li v-for="(note, index) in payload.notes" :key="`${note}-${index}`">
          {{ note }}
        </li>
      </ul>
      <a-table
        v-if="payload.skips.length"
        :columns="columns"
        :data-source="
          payload.skips.map((item, index) => ({ ...item, key: index }))
        "
        row-key="key"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        @resize-column="onResizeColumn"
        @change="onChange"
      />
    </div>
    <template #footer>
      <template v-if="confirmMode">
        <a-button @click="settleConfirmation(false)">取消</a-button>
        <a-button type="primary" danger @click="settleConfirmation(true)">
          确认还原
        </a-button>
      </template>
      <a-button v-else type="primary" @click="settleConfirmation(false)">
        关闭
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./ImportResultDialog.css"></style>
