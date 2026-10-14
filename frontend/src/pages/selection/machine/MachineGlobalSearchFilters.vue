<script setup lang="ts">
import type { SelectProps } from 'ant-design-vue';
import { Search } from 'lucide-vue-next';
import { computed } from 'vue';

/**
 * 条件查找的筛选表单，放在左侧目录切换下面（目录浏览时这里是选单树）。
 * 条件由页面持有；这里改任一栏都会立刻写回去，不需要再点「查找」。
 */
const machineModelIds = defineModel<Array<string | number>>('machineModelIds', {
  required: true,
});
const processStepIds = defineModel<Array<string | number>>('processStepIds', {
  required: true,
});
const boardCharacteristicIds = defineModel<Array<string | number>>(
  'boardCharacteristicIds',
  { required: true },
);
const query = defineModel<string>('query', { required: true });

defineProps<{
  boardCharacteristicOptions: NonNullable<SelectProps['options']>;
  machineModelOptions: NonNullable<SelectProps['options']>;
  processStepOptions: NonNullable<SelectProps['options']>;
}>();

const hasCriteria = computed(
  () =>
    machineModelIds.value.length > 0 ||
    processStepIds.value.length > 0 ||
    boardCharacteristicIds.value.length > 0 ||
    Boolean(query.value.trim()),
);

function reset() {
  machineModelIds.value = [];
  processStepIds.value = [];
  boardCharacteristicIds.value = [];
  query.value = '';
}
</script>

<template>
  <a-card
    class="machine-global-search-filters"
    title="全局查找结构"
    size="small"
    aria-label="全局查找结构"
  >
    <a-form layout="vertical">
      <a-form-item
        html-for="machine-global-search-machine-model-ids"
        label="适用机型"
      >
        <a-select
          id="machine-global-search-machine-model-ids"
          v-model:value="machineModelIds"
          mode="multiple"
          :options="machineModelOptions"
          placeholder="选择适用机型"
          allow-clear
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item
        html-for="machine-global-search-process-step-ids"
        label="工艺制程"
      >
        <a-select
          id="machine-global-search-process-step-ids"
          v-model:value="processStepIds"
          mode="multiple"
          :options="processStepOptions"
          placeholder="选择工艺制程"
          allow-clear
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item
        html-for="machine-global-search-board-characteristic-ids"
        label="板件特性"
      >
        <a-select
          id="machine-global-search-board-characteristic-ids"
          v-model:value="boardCharacteristicIds"
          mode="multiple"
          :options="boardCharacteristicOptions"
          placeholder="选择板件特性"
          allow-clear
          option-filter-prop="label"
        />
      </a-form-item>
      <a-form-item html-for="machine-global-search-query" label="关键词">
        <a-input
          id="machine-global-search-query"
          v-model:value="query"
          placeholder="搜索结构名称、功能作用或传感器"
          allow-clear
        >
          <template #prefix><Search :size="14" /></template>
        </a-input>
      </a-form-item>
      <div class="machine-global-search-filters__actions">
        <a-button :disabled="!hasCriteria" @click="reset">重置</a-button>
      </div>
    </a-form>
  </a-card>
</template>

<style scoped src="./MachineGlobalSearchFilters.css"></style>
