<script setup lang="ts">
import { ArrowRight, Search } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import {
  AButton,
  AEmptyState,
  AFormRow,
  ASearchField,
  ATokenField,
  type SelectOption,
} from '@/ui';
import {
  searchMachineStructures,
  type MachineStructureSearchDocument,
  type MachineStructureSearchResult,
} from './machine-structure-search';

const props = defineProps<{
  boardCharacteristicOptions: SelectOption[];
  documents: MachineStructureSearchDocument[];
  machineModelOptions: SelectOption[];
  processOptions: SelectOption[];
  processStepOptions: SelectOption[];
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
    <aside class="machine-global-search__filters" aria-label="全局查找结构">
      <h2>全局查找结构</h2>
      <AFormRow label="适用机型">
        <ATokenField
          v-model="machineModelIds"
          :options="machineModelOptions"
          placeholder="选择适用机型"
          filterable
          :max-visible-tokens="3"
        />
      </AFormRow>
      <AFormRow label="工艺制程">
        <ATokenField
          v-model="processStepIds"
          :options="processStepOptions"
          placeholder="选择工艺制程"
          filterable
          :max-visible-tokens="3"
        />
      </AFormRow>
      <AFormRow label="板件特性">
        <ATokenField
          v-model="boardCharacteristicIds"
          :options="boardCharacteristicOptions"
          placeholder="选择板件特性"
          filterable
          :max-visible-tokens="3"
        />
      </AFormRow>
      <AFormRow label="上层制程">
        <ATokenField
          v-model="processIds"
          :options="processOptions"
          :placeholder="processScopeLabel"
          filterable
          :max-visible-tokens="3"
        />
      </AFormRow>
      <AFormRow label="关键词">
        <ASearchField
          v-model="query"
          placeholder="搜索结构名称、功能作用或传感器"
          @keydown.enter="executeSearch"
        />
      </AFormRow>
      <div class="machine-global-search__actions">
        <AButton :disabled="!hasCriteria && !submitted" @click="reset">
          重置
        </AButton>
        <AButton
          variant="filled"
          :disabled="!hasCriteria"
          @click="executeSearch"
        >
          查找
        </AButton>
      </div>
    </aside>

    <section class="machine-global-search__results" aria-live="polite">
      <template v-if="submitted">
        <header class="machine-global-search__heading">
          <h2>找到 {{ resultCount }} 个结构</h2>
          <span v-if="coveredProcesses">覆盖：{{ coveredProcesses }}</span>
          <span v-else>全部上层制程均无匹配结果</span>
        </header>
        <div v-if="groups.length" class="machine-global-search__groups">
          <section
            v-for="group in groups"
            :key="group.processId"
            class="machine-global-search__group"
          >
            <h3>{{ group.processName }}（{{ group.results.length }}个结构）</h3>
            <button
              v-for="result in group.results"
              :key="`${result.processId}:${result.category}:${result.configuration}:${result.machineName}:${result.sectionId}`"
              class="machine-global-search__result"
              type="button"
              @click="emit('select', result)"
            >
              <span class="machine-global-search__result-body">
                <strong>{{ path(result) }}</strong>
                <span class="machine-global-search__meta">
                  {{ result.sectionName }} · 匹配 {{ result.matchCount }} 条记录
                </span>
                <span class="machine-global-search__tags">
                  <span v-for="tag in resultTags(result)" :key="tag">{{
                    tag
                  }}</span>
                </span>
              </span>
              <span class="machine-global-search__open">
                查看结构
                <ArrowRight :size="16" />
              </span>
            </button>
          </section>
        </div>
        <AEmptyState v-else title="没有找到符合条件的结构" />
      </template>
      <AEmptyState
        v-else
        title="按条件查找全部结构"
      >
        <template #icon>
          <Search :size="36" />
        </template>
      </AEmptyState>
    </section>
  </div>
</template>

<style scoped>
.machine-global-search {
  display: grid;
  grid-template-columns:
    clamp(280px, var(--machine-source-width, 300px), 320px)
    minmax(0, 1fr);
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.machine-global-search__filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  overflow: auto;
  border: 1px solid var(--separator);
  border-radius: var(--radius-lg);
  background: var(--bg-content);
}

.machine-global-search__filters h2,
.machine-global-search__heading h2,
.machine-global-search__group h3 {
  margin: 0;
  color: var(--label);
}

.machine-global-search__filters h2,
.machine-global-search__heading h2 {
  font: var(--text-headline);
}

.machine-global-search__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-top: auto;
}

.machine-global-search__actions :deep(.a-button) {
  width: 100%;
}

.machine-global-search__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.machine-global-search__heading {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
}

.machine-global-search__heading span,
.machine-global-search__meta {
  color: var(--label-2);
  font: var(--text-caption);
}

.machine-global-search__groups,
.machine-global-search__group {
  display: grid;
  gap: var(--space-2);
}

.machine-global-search__group h3 {
  padding: var(--space-2) var(--space-3);
  font: var(--text-control-em);
  border-left: 3px solid var(--sys-blue-solid);
  background: var(--fill-4);
}

.machine-global-search__result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  width: 100%;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  color: var(--label);
  text-align: start;
  border: 1px solid var(--separator);
  border-radius: var(--radius-md);
  background: var(--bg-content);
  cursor: pointer;
  transition:
    background-color var(--dur-1) var(--ease-out),
    border-color var(--dur-1) var(--ease-out);
}

.machine-global-search__result:hover {
  border-color: var(--sys-blue);
  background: var(--fill-4);
}

.machine-global-search__result:focus-visible {
  outline: 0;
  box-shadow: var(--focus-ring);
}

.machine-global-search__result-body {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.machine-global-search__result-body strong {
  overflow: hidden;
  font: var(--text-control-em);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.machine-global-search__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.machine-global-search__tags > span {
  padding: 1px var(--space-2);
  color: var(--sys-blue);
  font: var(--text-caption);
  border-radius: var(--radius-pill);
  background: var(--sys-blue-fill);
}

.machine-global-search__open {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  color: var(--sys-blue);
  font: var(--text-control-em);
}

@media (48rem < width <= 60rem) {
  .machine-global-search {
    grid-template-columns:
      clamp(200px, var(--machine-source-width, 220px), 220px)
      minmax(0, 1fr);
  }
}

@media (width <= 48rem) {
  .machine-global-search {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(18rem, 1fr);
  }

  .machine-global-search__filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    max-height: 48vh;
  }

  .machine-global-search__filters h2,
  .machine-global-search__actions {
    grid-column: 1 / -1;
  }
}

@media (width < 36rem) {
  .machine-global-search__filters {
    grid-template-columns: 1fr;
  }

  .machine-global-search__filters h2,
  .machine-global-search__actions {
    grid-column: auto;
  }

  .machine-global-search__result {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
