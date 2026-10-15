<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type {
  AuditChangeSummary,
  AuditLogItem,
  AuditOperationItem,
} from '@/api';
import { formatLocalDateTime } from '@/domain';
import { formatAuditTarget } from '@/pages/system/audit-target';
import { useSelectionStore } from '@/stores/selection';

import { parseAuditDetail } from './audit-actions';
import {
  displayFieldValue,
  entryName,
  entrySummary,
  fieldLabel,
  operationTitle,
  parseChanges,
  targetNamespace,
  unchangedStoreWrite,
  type AuditValueLookups,
} from './audit-changes';

/** 一次操作的完整详情（只读）：每条日志改了哪些记录、哪些字段从什么改成什么；置空即关闭 */
const operation = defineModel<AuditOperationItem | null>({ required: true });

// 关闭动画期间仍显示刚才那次操作，不要先变成空白再淡出
const shown = ref<AuditOperationItem | null>(null);
watch(
  operation,
  (value) => {
    if (value) shown.value = value;
  },
  { immediate: true },
);

// 选型记录里存的是传感器、字典项、工艺制程的编号，详情里换成名称
const store = useSelectionStore();
const lookups = computed<AuditValueLookups>(() => ({
  boardCharacteristics: new Map(
    store
      .dictionaryItems('board-characteristic')
      .map((item) => [item.id, item.name]),
  ),
  machineModels: new Map(
    store.dictionaryItems('machine-model').map((item) => [item.id, item.name]),
  ),
  processSteps: new Map(
    store.processSteps.map((item) => [item.id, `${item.layer} · ${item.name}`]),
  ),
  sensors: new Map(
    store.sensors.map((item) => [
      item.id,
      [item.brand, item.model].filter(Boolean).join(' '),
    ]),
  ),
}));

interface EntryView {
  entry: AuditLogItem;
  namespace: null | string;
  title: string;
  changes: ReturnType<typeof parseChanges>;
  detail: ReturnType<typeof parseAuditDetail>;
  /** 目标被翻成了中文时，另外给出原始数据键供排查 */
  rawKey: boolean;
}

const entries = computed<EntryView[]>(() =>
  (shown.value?.entries ?? []).map((entry) => {
    const target = formatAuditTarget(entry.target);
    return {
      entry,
      namespace: targetNamespace(entry.target),
      title: entryName(entry),
      changes: parseChanges(entry.changes),
      detail: parseAuditDetail(entry.detail),
      rawKey: Boolean(entry.target) && target !== entry.target,
    };
  }),
);

function value(field: string, text: string | undefined) {
  return displayFieldValue(field, text, lookups.value);
}

function truncatedNote(changes: AuditChangeSummary): string {
  const hidden =
    changes.addedCount -
    changes.added.length +
    changes.modifiedCount -
    changes.modified.length +
    changes.removedCount -
    changes.removed.length;
  return `改动太多，只记录了前一部分：共新增 ${changes.addedCount} 条、修改 ${changes.modifiedCount} 条、删除 ${changes.removedCount} 条（未显示 ${hidden} 条）。`;
}

const userText = computed(() => {
  const item = shown.value;
  if (!item?.username) return '—';
  return item.displayName && item.displayName !== item.username
    ? `${item.displayName}（${item.username}）`
    : item.username;
});
</script>

<template>
  <a-drawer
    :open="Boolean(operation)"
    :title="shown ? operationTitle(shown) : '操作详情'"
    width="min(760px, 100vw)"
    destroy-on-close
    @close="operation = null"
  >
    <template v-if="shown">
      <a-descriptions
        bordered
        size="small"
        :column="1"
        :label-style="{ width: '96px' }"
      >
        <a-descriptions-item label="时间">
          {{ formatLocalDateTime(new Date(shown.timestamp)) }}
        </a-descriptions-item>
        <a-descriptions-item label="用户">{{ userText }}</a-descriptions-item>
        <a-descriptions-item label="结果">
          <a-tag :color="shown.result ? 'green' : 'red'">
            {{ shown.result ? '成功' : '失败' }}
          </a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="IP">
          {{ shown.ip || '—' }}
        </a-descriptions-item>
        <a-descriptions-item v-if="shown.entryCount > 1" label="包含">
          {{ shown.entryCount }} 条记录
          <template v-if="shown.entryCount > shown.entries.length">
            （只显示前 {{ shown.entries.length }} 条）
          </template>
        </a-descriptions-item>
      </a-descriptions>

      <section
        v-for="view in entries"
        :key="view.entry.id"
        class="audit-entry"
        :aria-label="view.title"
      >
        <header class="audit-entry__head">
          <span class="audit-entry__title">{{ view.title }}</span>
          <a-tag v-if="!view.entry.result" color="red">失败</a-tag>
        </header>
        <a-alert
          v-if="!view.entry.result && view.entry.error"
          type="error"
          show-icon
          :message="view.entry.error"
        />

        <template v-if="view.changes">
          <div
            v-for="row in view.changes.modified"
            :key="`m-${row.label}`"
            class="audit-change"
          >
            <div class="audit-change__label">
              <a-tag color="blue">修改</a-tag>{{ row.label }}
            </div>
            <dl class="audit-diff">
              <template v-for="field in row.fields" :key="field.name">
                <dt>{{ fieldLabel(view.namespace, field.name) }}</dt>
                <dd>
                  <del class="audit-diff__before">{{
                    value(field.name, field.before)
                  }}</del>
                  <span class="audit-diff__arrow" aria-label="改为">→</span>
                  <ins class="audit-diff__after">{{
                    value(field.name, field.after)
                  }}</ins>
                </dd>
              </template>
            </dl>
          </div>
          <div
            v-for="row in view.changes.added"
            :key="`a-${row.label}`"
            class="audit-change"
          >
            <div class="audit-change__label">
              <a-tag color="green">新增</a-tag>{{ row.label }}
            </div>
            <dl v-if="row.fields.length" class="audit-diff">
              <template v-for="field in row.fields" :key="field.name">
                <dt>{{ fieldLabel(view.namespace, field.name) }}</dt>
                <dd>{{ value(field.name, field.after) }}</dd>
              </template>
            </dl>
          </div>
          <div
            v-for="row in view.changes.removed"
            :key="`r-${row.label}`"
            class="audit-change"
          >
            <div class="audit-change__label">
              <a-tag color="red">删除</a-tag>{{ row.label }}
            </div>
            <dl v-if="row.fields.length" class="audit-diff">
              <template v-for="field in row.fields" :key="field.name">
                <dt>{{ fieldLabel(view.namespace, field.name) }}</dt>
                <dd>{{ value(field.name, field.before) }}</dd>
              </template>
            </dl>
          </div>
          <p v-if="view.changes.reordered" class="audit-entry__note">
            调整了顺序
          </p>
          <p v-if="view.changes.truncated" class="audit-entry__note">
            {{ truncatedNote(view.changes) }}
          </p>
        </template>

        <template v-else-if="view.detail">
          <p v-if="view.detail.summary" class="audit-entry__note">
            {{ view.detail.summary }}
          </p>
          <dl class="audit-diff">
            <template v-for="pair in view.detail.pairs" :key="pair.label">
              <dt>{{ pair.label }}</dt>
              <dd>
                <a-space v-if="pair.items" :size="[4, 4]" wrap>
                  <a-tag v-for="item in pair.items" :key="item">
                    {{ item }}
                  </a-tag>
                </a-space>
                <template v-else>{{ pair.value }}</template>
              </dd>
            </template>
          </dl>
        </template>
        <p
          v-else-if="unchangedStoreWrite(view.entry)"
          class="audit-entry__note"
        >
          {{ entrySummary(view.entry) }}
        </p>
        <p v-else-if="view.entry.detail" class="audit-entry__note">
          {{ view.entry.detail }}
        </p>
        <p v-else-if="view.entry.result" class="audit-entry__note">
          这条是早期日志，没有记录具体改动。
        </p>

        <p v-if="view.rawKey" class="audit-entry__key">
          数据键：<a-typography-text code>
            {{ view.entry.target }}
          </a-typography-text>
        </p>
      </section>
    </template>
  </a-drawer>
</template>

<style scoped src="./AuditOperationDrawer.css"></style>
