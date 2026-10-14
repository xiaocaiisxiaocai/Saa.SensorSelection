<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ChevronDown } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import { api, ApiError } from '@/api';
import { openMachineSchematicReport } from '@/domain';
import { useSelectionStore } from '@/stores/selection';

import { buildReportSections, hasReportContent } from './machine-report';

/**
 * 机型结构示意图报告：显示已勾选的二级 Tab 数，「报告」下拉里提供全选 / 清空、
 * 后端生成下载和浏览器预览打印（收进下拉，给同一行的一级 Tab 让出位置）。
 * 勾选状态由父页面持有。
 */
const props = defineProps<{
  /** 勾选的二级 Tab id */
  pageIds: readonly number[];
  /** 当前目录可勾选的二级 Tab 总数 */
  availableCount: number;
}>();
const emit = defineEmits<{ selectAll: []; clear: [] }>();

const store = useSelectionStore();
const generating = ref(false);
const noneSelected = computed(() => props.pageIds.length === 0);
const NONE_SELECTED_HINT = '请先勾选至少一个二级 Tab';
// 菜单项禁用时原因直接写在菜单文字里
const NONE_SELECTED_SUFFIX = '（请先勾选）';

const reportSections = computed(() =>
  buildReportSections(store, props.pageIds),
);
// 报告抬头列出的名称：按报告里出现的顺序
const pageNames = computed(() =>
  reportSections.value.flatMap((section) =>
    section.blocks.map((block) => block.machineName),
  ),
);

function ready() {
  if (noneSelected.value) {
    message.warning(NONE_SELECTED_HINT);
    return false;
  }
  if (!hasReportContent(reportSections.value)) {
    message.warning('所选二级 Tab 暂无可生成的内容');
    return false;
  }
  return true;
}

function preview() {
  if (!ready()) return;
  const opened = openMachineSchematicReport(
    pageNames.value,
    reportSections.value,
  );
  if (!opened) {
    message.warning('报告窗口被浏览器拦截，请允许弹窗后重试');
  }
}

function onMenuClick({ key }: { key: string | number }) {
  if (key === 'select-all') emit('selectAll');
  else if (key === 'clear') emit('clear');
  else if (key === 'generate') void generate();
  else if (key === 'preview') preview();
}

async function generate() {
  if (!ready()) return;
  generating.value = true;
  try {
    const blob = await api.downloadMachineSchematicReport({
      machineNames: pageNames.value,
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
      已选 {{ pageIds.length }} / {{ availableCount }}
    </span>
    <a-dropdown :trigger="['click']">
      <a-button size="small" :loading="generating" aria-label="报告操作">
        报告
        <ChevronDown :size="14" />
      </a-button>
      <template #overlay>
        <a-menu @click="onMenuClick">
          <a-menu-item key="select-all">全选</a-menu-item>
          <a-menu-item key="clear" :disabled="noneSelected">清空</a-menu-item>
          <a-menu-divider />
          <a-menu-item key="generate" :disabled="noneSelected || generating">
            生成并下载报告{{ noneSelected ? NONE_SELECTED_SUFFIX : '' }}
          </a-menu-item>
          <a-menu-item key="preview" :disabled="noneSelected">
            预览 / 打印 PDF{{ noneSelected ? NONE_SELECTED_SUFFIX : '' }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<style scoped src="./MachineReportBar.css"></style>
