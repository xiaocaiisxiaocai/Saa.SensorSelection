<script setup lang="ts">
import type { SelectProps } from 'ant-design-vue';
import { ArrowRight, Search } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  searchMachineStructures,
  type MachineStructureSearchDocument,
  type MachineStructureSearchResult,
} from './machine-structure-search';

const props = defineProps<{
  boardCharacteristicOptions: NonNullable<SelectProps['options']>;
  documents: MachineStructureSearchDocument[];
  machineModelOptions: NonNullable<SelectProps['options']>;
  processOptions: NonNullable<SelectProps['options']>;
  processStepOptions: NonNullable<SelectProps['options']>;
}>();

const emit = defineEmits<{
  select: [result: MachineStructureSearchResult];
}>();

const processIds = ref<Array<string | number>>([]);
const machineModelIds = ref<Array<string | number>>([]);
const processStepIds = ref<Array<string | number>>([]);
const boardCharacteristicIds = ref<Array<string | number>>([]);
const query = ref('');
const submitted = ref(false);

const hasCriteria = computed(
  () =>
    processIds.value.length > 0 ||
    machineModelIds.value.length > 0 ||
    processStepIds.value.length > 0 ||
    boardCharacteristicIds.value.length > 0 ||
    Boolean(query.value.trim()),
);
const processScopeLabel = computed(() => {
  if (processIds.value.length === 0) {
    return `全部制程（${props.processOptions.map((item) => item.label).join('、')}）`;
  }
  return '选择上层制程';
});
const groups = computed(() =>
  submitted.value && hasCriteria.value
    ? searchMachineStructures(props.documents, {
        boardCharacteristicIds: boardCharacteristicIds.value.map(Number),
        machineModelIds: machineModelIds.value.map(Number),
        processIds: processIds.value.map(Number),
        processStepIds: processStepIds.value.map(Number),
        query: query.value,
      })
    : [],
);
const resultCount = computed(() =>
  groups.value.reduce((total, group) => total + group.results.length, 0),
);
const coveredProcesses = computed(() =>
  groups.value.map((group) => group.processName).join('、'),
);

function executeSearch() {
  submitted.value = hasCriteria.value;
}

function reset() {
  processIds.value = [];
  machineModelIds.value = [];
  processStepIds.value = [];
  boardCharacteristicIds.value = [];
  query.value = '';
  submitted.value = false;
}

function path(result: MachineStructureSearchResult): string {
  return [result.category, result.configuration, result.machineName]
    .filter(Boolean)
    .join(' / ');
}

function resultTags(result: MachineStructureSearchResult): string[] {
  return [
    ...result.machineModelNames,
    ...result.processStepNames,
    ...result.boardCharacteristicNames,
  ];
}
</script>

<template>
  <div class="machine-global-search">
    <a-card
      class="machine-global-search__filters"
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
        <a-form-item
          html-for="machine-global-search-process-ids"
          label="上层制程"
        >
          <a-select
            id="machine-global-search-process-ids"
            v-model:value="processIds"
            mode="multiple"
            :options="processOptions"
            :placeholder="processScopeLabel"
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
            @keydown.enter="executeSearch"
          >
            <template #prefix><Search :size="14" /></template>
          </a-input>
        </a-form-item>
        <a-space class="machine-global-search__actions">
          <a-button :disabled="!hasCriteria && !submitted" @click="reset">
            重置
          </a-button>
          <a-button
            type="primary"
            :disabled="!hasCriteria"
            @click="executeSearch"
          >
            查找
          </a-button>
        </a-space>
      </a-form>
    </a-card>

    <section class="machine-global-search__results" aria-live="polite">
      <template v-if="submitted">
        <a-page-header
          class="machine-global-search__heading"
          :title="`找到 ${resultCount} 个结构`"
          :sub-title="
            coveredProcesses
              ? `覆盖：${coveredProcesses}`
              : '全部上层制程均无匹配结果'
          "
        />
        <template v-if="groups.length">
          <a-list
            v-for="group in groups"
            :key="group.processId"
            class="machine-global-search__group"
            :data-source="group.results"
            bordered
            size="small"
          >
            <template #header>
              <a-typography-text strong>
                {{ group.processName }}（{{ group.results.length }}个结构）
              </a-typography-text>
            </template>
            <template #renderItem="{ item: result }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>{{ path(result) }}</template>
                  <template #description>
                    {{ result.sectionName }} · 匹配
                    {{ result.matchCount }} 条记录
                    <div class="machine-global-search__tags">
                      <a-tag
                        v-for="tag in resultTags(result)"
                        :key="tag"
                        color="blue"
                      >
                        {{ tag }}
                      </a-tag>
                    </div>
                  </template>
                </a-list-item-meta>
                <template #actions>
                  <a-button type="link" @click="emit('select', result)">
                    查看结构
                    <ArrowRight :size="14" />
                  </a-button>
                </template>
              </a-list-item>
            </template>
          </a-list>
        </template>
        <a-empty v-else description="没有找到符合条件的结构" />
      </template>
      <a-empty v-else description="按条件查找全部结构">
        <template #image>
          <Search :size="36" />
        </template>
      </a-empty>
    </section>
  </div>
</template>

<style scoped src="./MachineGlobalSearch.css"></style>
