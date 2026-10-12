<script setup lang="ts">
import { computed, ref } from 'vue';

import type { MachineTab } from '@/domain';
import { fieldError } from '@/pages/shared/form';

/**
 * 「移到 Tab…」：不方便拖动时（触屏、键盘）用菜单把机型放进某个 Tab。
 * 父组件调用 open(机型名, 当前所在 Tab id) 打开，选好后发出 confirm。
 */
const props = defineProps<{ tabs: readonly MachineTab[] }>();
const emit = defineEmits<{ confirm: [machineName: string, tabId: number] }>();

const visible = ref(false);
const machineName = ref('');
const currentTabId = ref<number | null>(null);
const targetId = ref<number | null>(null);
const attempted = ref(false);

const options = computed(() =>
  props.tabs
    .filter((tab) => tab.id !== currentTabId.value)
    .map((tab) => ({ label: tab.name, value: tab.id })),
);

function open(name: string, currentTab: number | null = null) {
  machineName.value = name;
  currentTabId.value = currentTab;
  targetId.value = null;
  attempted.value = false;
  visible.value = true;
}

function confirm() {
  attempted.value = true;
  if (targetId.value === null) return;
  visible.value = false;
  emit('confirm', machineName.value, targetId.value);
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="visible"
    :title="`把「${machineName}」移到`"
    :width="420"
    destroy-on-close
    @cancel="visible = false"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="machine-move-target"
        label="目标 Tab"
        required
        v-bind="
          fieldError(
            attempted && targetId === null ? '请选择目标 Tab' : undefined,
          )
        "
      >
        <a-select
          id="machine-move-target"
          v-model:value="targetId"
          :options="options"
          placeholder="选择 Tab"
          :not-found-content="'没有其他 Tab，请先点「+」新建'"
        />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="visible = false">取消</a-button>
      <a-button type="primary" @click="confirm">移动</a-button>
    </template>
  </a-modal>
</template>
