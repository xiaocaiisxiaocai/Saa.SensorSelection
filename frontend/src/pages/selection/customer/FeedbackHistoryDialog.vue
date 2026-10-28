<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { TimelineItem } from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';

/** 一条客户反馈的改善对策历史（只读）；置空即关闭 */
const item = defineModel<TimelineItem | undefined>({ required: true });
// 关闭动画期间仍显示刚才那条，不要先变成空白再淡出
const shown = ref<TimelineItem>();
watch(
  item,
  (value) => {
    if (value) shown.value = value;
  },
  { immediate: true },
);

type MeasureEntry = NonNullable<TimelineItem['measureHistory']>[number];
const HISTORY_COLUMNS = [
  { key: 'measure', title: '改善对策' },
  { key: 'date', title: '反馈时间', width: 112, align: 'center' as const },
  { key: 'status', title: '状态', width: 88, align: 'center' as const },
];
const {
  canManage: canManageColumns,
  columns,
  hidden: hiddenColumns,
  onResizeColumn,
  options: columnOptions,
  setVisible: setColumnVisible,
  showAll: showAllColumns,
} = useManagedTableColumns('feedback-history', () => HISTORY_COLUMNS);
// 新的在前；同一天可能有内容相同的多条记录，用序号作 row-key
const rows = computed(() =>
  [...(shown.value?.measureHistory ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date, 'zh-CN'))
    .map((entry, index) => ({ ...entry, rowKey: index })),
);
</script>

<template>
  <a-modal
    :open="Boolean(item)"
    title="改善对策历史"
    :width="680"
    :footer="null"
    destroy-on-close
    @cancel="item = undefined"
  >
    <template v-if="shown">
      <a-descriptions bordered size="small" :column="1">
        <a-descriptions-item label="问题点">
          {{ shown.problem }}
        </a-descriptions-item>
      </a-descriptions>
      <div class="selection-toolbar">
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
      <a-table
        class="feedback-history__table"
        :columns="columns"
        :data-source="rows"
        row-key="rowKey"
        :pagination="false"
        size="small"
        :locale="{ emptyText: '暂无改善对策历史' }"
        @resize-column="onResizeColumn"
      >
        <template #bodyCell="{ column, record: entry }">
          <a-typography-text
            v-if="column.key === 'measure'"
            :delete="(entry as MeasureEntry).status === '已作废'"
            :type="
              (entry as MeasureEntry).status === '已作废'
                ? 'secondary'
                : undefined
            "
          >
            {{ (entry as MeasureEntry).measure || '—' }}
          </a-typography-text>
          <template v-else-if="column.key === 'date'">
            {{ (entry as MeasureEntry).date || '—' }}
          </template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="
              (entry as MeasureEntry).status === '现行' ? 'green' : 'default'
            "
          >
            {{ (entry as MeasureEntry).status }}
          </a-tag>
        </template>
      </a-table>
    </template>
  </a-modal>
</template>

<style scoped src="./FeedbackHistoryDialog.css"></style>
