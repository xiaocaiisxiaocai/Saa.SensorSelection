<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { AuditLogItem } from '@/api';
import { formatLocalDateTime } from '@/domain';
import { formatAuditTarget } from '@/pages/system/audit-target';

import { actionLabel, parseAuditDetail } from './audit-actions';

/** 一条操作日志的完整详情（只读）；置空即关闭 */
const log = defineModel<AuditLogItem | null>({ required: true });

// 关闭动画期间仍显示刚才那条，不要先变成空白再淡出
const shown = ref<AuditLogItem | null>(null);
watch(
  log,
  (value) => {
    if (value) shown.value = value;
  },
  { immediate: true },
);
const parsedDetail = computed(() => parseAuditDetail(shown.value?.detail));
</script>

<template>
  <a-modal
    :open="Boolean(log)"
    title="操作详情"
    :width="640"
    destroy-on-close
    @cancel="log = null"
  >
    <a-descriptions
      v-if="shown"
      bordered
      size="small"
      :column="1"
      :label-style="{ width: '96px' }"
    >
      <a-descriptions-item label="日志编号">
        #{{ shown.id }}
      </a-descriptions-item>
      <a-descriptions-item label="时间">
        {{ formatLocalDateTime(new Date(shown.timestamp)) }}
      </a-descriptions-item>
      <a-descriptions-item label="用户">
        {{ shown.username || '—' }}
      </a-descriptions-item>
      <a-descriptions-item label="操作">
        {{ actionLabel(shown.action) }}
      </a-descriptions-item>
      <a-descriptions-item label="操作编码">
        {{ shown.action }}
      </a-descriptions-item>
      <a-descriptions-item label="目标">
        {{ formatAuditTarget(shown.target) || '—' }}
      </a-descriptions-item>
      <a-descriptions-item
        v-if="shown.target && formatAuditTarget(shown.target) !== shown.target"
        label="目标键"
      >
        <a-typography-text code>{{ shown.target }}</a-typography-text>
      </a-descriptions-item>
      <a-descriptions-item label="结果">
        <a-tag :color="shown.result ? 'green' : 'red'">
          {{ shown.result ? '成功' : '失败' }}
        </a-tag>
      </a-descriptions-item>
      <a-descriptions-item label="IP">
        {{ shown.ip || '—' }}
      </a-descriptions-item>
      <a-descriptions-item label="业务详情">
        <template v-if="parsedDetail">
          <a-typography-paragraph
            v-if="parsedDetail.summary"
            class="audit-detail__summary"
          >
            {{ parsedDetail.summary }}
          </a-typography-paragraph>
          <a-descriptions class="audit-detail__pairs" size="small" :column="1">
            <a-descriptions-item
              v-for="pair in parsedDetail.pairs"
              :key="pair.label"
              :label="pair.label"
            >
              <!-- 权限/角色这类是顿号分隔的长列表，排成标签块比挤成
                   一行好读；单值仍然按普通文本显示。 -->
              <a-space v-if="pair.items" :size="[4, 4]" wrap>
                <a-tag v-for="item in pair.items" :key="item">
                  {{ item }}
                </a-tag>
              </a-space>
              <template v-else>{{ pair.value }}</template>
            </a-descriptions-item>
          </a-descriptions>
        </template>
        <span v-else class="audit-detail__text">{{ shown.detail || '—' }}</span>
      </a-descriptions-item>
      <a-descriptions-item label="说明">
        <span class="audit-detail__text">{{ shown.error || '—' }}</span>
      </a-descriptions-item>
    </a-descriptions>
    <template #footer>
      <a-button @click="log = null">关闭</a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./AuditDetailDialog.css"></style>
