<script setup lang="ts">
import type { SelectProps } from 'ant-design-vue';
import { Search } from 'lucide-vue-next';
import { computed } from 'vue';

/**
 * 条件查找的筛选表单，放在左侧目录切换下面（目录浏览时这里是选单树）。
 * 条件由页面持有；这里改任一栏都会立刻写回去，不需要再点「查找」。
 */
const boardCharacteristicIds = defineModel<Array<string | number>>(
  'boardCharacteristicIds',
  { required: true },
);
const query = defineModel<string>('query', { required: true });

defineProps<{
  boardCharacteristicOptions: NonNullable<SelectProps['options']>;
}>();

const hasCriteria = computed(
  () =>
    boardCharacteristicIds.value.length > 0 ||
    Boolean(query.value.trim()),
);

function reset() {
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
          placeholder="搜索结构名称、Sensor名称或传感器"
          allow-clear
        >
          <template #prefix><Search :size="14" /></template>
        </a-input>
      </a-form-item>
      <div class="machine-global-search-filters__actions">
        <a-tooltip
          :title="hasCriteria ? '清除搜索条件' : '当前没有可清除的筛选'"
        >
          <span class="tooltip-host">
            <a-button :disabled="!hasCriteria" @click="reset">重置</a-button>
          </span>
        </a-tooltip>
      </div>
    </a-form>
  </a-card>
</template>

<style scoped src="./MachineGlobalSearchFilters.css"></style>
