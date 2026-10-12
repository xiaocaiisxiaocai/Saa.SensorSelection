<script setup lang="ts">
import { message } from 'ant-design-vue';
import { computed, ref } from 'vue';

import { api, ApiError } from '@/api';
import { openMachineSchematicReport } from '@/domain';
import { useSelectionStore } from '@/stores/selection';

import { buildReportSections, hasReportContent } from './machine-report';

/**
 * 机型结构示意图报告：显示已勾选机型数，提供全选 / 清空、
 * 后端生成下载和浏览器预览打印。勾选状态由父页面持有。
 */
const props = defineProps<{
  /** 左侧目录里勾选的机型名 */
  machineNames: readonly string[];
  /** 当前目录可勾选的机型总数 */
  availableCount: number;
  processId: number;
}>();
const emit = defineEmits<{ selectAll: []; clear: [] }>();

const store = useSelectionStore();
const generating = ref(false);
const noneSelected = computed(() => props.machineNames.length === 0);
const NONE_SELECTED_HINT = '请先在左侧勾选至少一个机型';

const reportSections = computed(() =>
  buildReportSections(store, props.machineNames, props.processId),
);

function ready() {
  if (noneSelected.value) {
    message.warning(NONE_SELECTED_HINT);
    return false;
  }
  if (!hasReportContent(reportSections.value)) {
    message.warning('所选机型暂无可生成的内容');
    return false;
  }
  return true;
}

function preview() {
  if (!ready()) return;
  const opened = openMachineSchematicReport(
    [...props.machineNames],
    reportSections.value,
  );
  if (!opened) {
    message.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
  }
}

async function generate() {
  if (!ready()) return;
  generating.value = true;
  try {
    const blob = await api.downloadMachineSchematicReport({
      machineNames: [...props.machineNames],
      sections: reportSections.value,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `机型结构示意图报告-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.success('后端报告已生成并下载，可打开后打印为 PDF');
  } catch (error) {
    message.error(
      error instanceof ApiError ? error.message : '报告生成失败，请稍后重试',
    );
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <div class="machine-report">
    <span class="selection-toolbar__count">
      已选 {{ machineNames.length }} / {{ availableCount }} 个机型
    </span>
    <a-button type="text" size="small" @click="emit('selectAll')">
      全选机型
    </a-button>
    <a-button
      type="text"
      :disabled="noneSelected"
      size="small"
      @click="emit('clear')"
    >
      清空
    </a-button>
    <a-tooltip :title="noneSelected ? NONE_SELECTED_HINT : ''">
      <span class="inline-flex">
        <a-button
          type="primary"
          :disabled="noneSelected"
          :loading="generating"
          size="small"
          @click="generate"
        >
          生成并下载报告
        </a-button>
      </span>
    </a-tooltip>
    <a-tooltip :title="noneSelected ? NONE_SELECTED_HINT : ''">
      <span class="inline-flex">
        <a-button :disabled="noneSelected" size="small" @click="preview">
          预览 / 打印 PDF
        </a-button>
      </span>
    </a-tooltip>
  </div>
</template>

<style scoped src="./MachineReportBar.css"></style>
