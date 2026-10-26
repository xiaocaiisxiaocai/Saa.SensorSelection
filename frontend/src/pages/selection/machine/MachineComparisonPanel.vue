<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import type { MachineSectionItem, MachineSectionRow } from '@/domain';
import { MACHINE_TAB_PAGE_OWNER } from '@/domain';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { cellText } from '@/pages/shared/table';
import { useSelectionStore } from '@/stores/selection';
import { AHighlightText } from '@/ui';

import MachineRowImageCell from './MachineRowImageCell.vue';
import { pairMachineComparisonRows } from './machine-compare-rows';
import {
  buildMachineTableRows,
  filterSectionRows,
  sectionColumns,
} from './table-rows';

interface ComparisonSide {
  name: string;
  path: string;
  section: MachineSectionItem;
}

const props = defineProps<{ left: ComparisonSide; right: ComparisonSide }>();
const store = useSelectionStore();
const query = ref('');
const activeRecordKey = ref('');
const scrollArea = ref<HTMLElement>();
const structure = computed(() => props.left.section.kind === 'structure');
const sides = computed(() => [props.left, props.right]);
const items = computed(() =>
  sides.value.map((side) =>
    store.machineSectionRows(side.section.id, MACHINE_TAB_PAGE_OWNER),
  ),
);
const pairs = computed(() =>
  pairMachineComparisonRows(
    items.value[0] ?? [],
    items.value[1] ?? [],
    structure.value,
  ),
);
// Build labels before filtering so duplicate numbering stays stable during search.
const recordLabels = computed(() => {
  const named = pairs.value.map((pair) => {
    const source = pair.left ?? pair.right;
    const label = structure.value
      ? source?.role.trim()
      : source?.name.trim() || source?.role.trim();
    return { key: pair.key, label: label || '未命名记录' };
  });
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  named.forEach(({ label }) => totals.set(label, (totals.get(label) ?? 0) + 1));
  return new Map(
    named.map(({ key, label }) => {
      const ordinal = (seen.get(label) ?? 0) + 1;
      seen.set(label, ordinal);
      return [
        key,
        (totals.get(label) ?? 0) > 1 ? `${label}（${ordinal}）` : label,
      ];
    }),
  );
});
// Match before filtering: a hit on either side keeps the full comparison pair.
const filtered = computed(() => {
  if (!query.value.trim()) return pairs.value;
  const lookup = {
    sensorById: new Map(store.sensors.map((sensor) => [sensor.id, sensor])),
    processSteps: [],
    machineModels: [],
    boardCharacteristics: store.dictionaryItems('board-characteristic'),
  };
  const matches = items.value.map(
    (rows) =>
      new Set(
        filterSectionRows(
          rows,
          structure.value,
          {
            query: query.value,
            sensorTypes: [],
            machineModelIds: [],
            processStepIds: [],
            boardCharacteristicIds: [],
          },
          lookup,
        ).map((row) => row.id),
      ),
  );
  return pairs.value.filter(
    (pair) =>
      (pair.left && matches[0]?.has(pair.left.id)) ||
      (pair.right && matches[1]?.has(pair.right.id)),
  );
});
const { columns } = useManagedTableColumns(
  () =>
    structure.value ? 'machine-section:structure' : 'machine-section:notes',
  () => sectionColumns({ structure: structure.value, writable: false }),
);
const fields = computed(() =>
  columns.value.map((column) => ({
    key: String(column.key),
    label: String(column.title),
  })),
);
function record(source: MachineSectionRow | null, side: ComparisonSide) {
  return source
    ? {
        source,
        sectionId: side.section.id,
        rows: buildMachineTableRows(
          [source],
          store.sensors,
          structure.value,
          [],
          [],
          store.dictionaryItems('board-characteristic'),
        ),
      }
    : null;
}
const activePair = computed(
  () =>
    filtered.value.find((pair) => pair.key === activeRecordKey.value) ??
    filtered.value[0] ??
    null,
);
const records = computed(() => {
  const pair = activePair.value;
  return pair
    ? [
        {
          key: pair.key,
          cells: [
            record(pair.left, props.left),
            record(pair.right, props.right),
          ],
        },
      ]
    : [];
});
function textValue(
  item: NonNullable<ReturnType<typeof record>>,
  field: string,
) {
  if (field === 'boardCharacteristicName')
    return item.rows[0]?.boardCharacteristicName || '—';
  return cellText(item.source[field as keyof MachineSectionRow]);
}
watch(
  () => [props.left.section.id, props.right.section.id],
  () => {
    query.value = '';
    activeRecordKey.value = '';
  },
);
watch(
  () => filtered.value.map((pair) => pair.key),
  (keys) => {
    if (!keys.includes(activeRecordKey.value))
      activeRecordKey.value = keys[0] ?? '';
  },
  { immediate: true },
);
watch(
  [query, () => activePair.value?.key],
  () => {
    if (scrollArea.value) scrollArea.value.scrollTop = 0;
  },
  { flush: 'post' },
);
</script>

<template>
  <div class="machine-comparison-panel">
    <a-input
      v-model:value="query"
      aria-label="搜索对比内容"
      placeholder="搜索两侧机型内容"
      allow-clear
    >
      <template #prefix><Search :size="14" /></template>
    </a-input>
    <div class="machine-comparison-record-navigation">
      <a-tabs
        v-if="filtered.length"
        class="machine-comparison-tabs"
        aria-label="对比记录"
        type="card"
        size="small"
        :active-key="activePair?.key"
        @change="activeRecordKey = String($event)"
      >
        <a-tab-pane v-for="pair in filtered" :key="pair.key">
          <template #tab>
            <AHighlightText :text="recordLabels.get(pair.key)" :query="query" />
          </template>
        </a-tab-pane>
      </a-tabs>
      <span class="machine-comparison-count">共 {{ filtered.length }} 项</span>
    </div>
    <div ref="scrollArea" class="machine-comparison-records">
      <table class="machine-comparison-table" aria-label="机型内容对比">
        <colgroup>
          <col class="machine-comparison-label-column">
          <col>
          <col>
        </colgroup>
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th
              v-for="(side, index) in sides"
              :key="index"
              scope="col"
              class="machine-comparison-heading"
            >
              <h2>{{ side.name }}</h2>
              <div>{{ side.path }}</div>
              <div
                v-if="
                  activePair &&
                    !(index === 0 ? activePair.left : activePair.right)
                "
                class="machine-comparison-missing"
              >
                该机型无此记录
              </div>
            </th>
          </tr>
        </thead>
        <tbody v-if="records.length === 0">
          <tr>
            <td colspan="3">
              <a-empty
                :description="query.trim() ? '没有匹配的记录' : '暂无记录'"
              />
            </td>
          </tr>
        </tbody>
        <tbody
          v-for="item in records"
          :key="item.key"
          class="machine-comparison-record"
        >
          <tr
            v-for="field in fields"
            :key="field.key"
            :class="{
              'machine-comparison-row--key': structure && field.key === 'role',
            }"
          >
            <th scope="row">{{ field.label }}</th>
            <td
              v-for="(cell, index) in item.cells"
              :key="index"
              class="machine-comparison-value"
            >
              <template v-if="!cell">—</template>
              <template v-else-if="structure && field.key === 'sensorType'">
                <a-space :size="[4, 4]" wrap>
                  <a-tag
                    v-for="type in [
                      ...new Set(
                        cell.rows.map((row) => row.sensorType).filter(Boolean),
                      ),
                    ]"
                    :key="type"
                    color="blue"
                  >
                    <AHighlightText :text="type" :query="query" />
                  </a-tag>
                  <span v-if="cell.rows.every((row) => !row.sensorType)">—</span>
                </a-space>
              </template>
              <template v-else-if="structure && field.key === 'spec'">
                <div
                  v-for="row in cell.rows"
                  :key="row.displayId"
                  class="machine-comparison-spec"
                >
                  <template v-if="row.sensor">
                    <div class="machine-comparison-spec__identity">
                      <strong><AHighlightText
                        :text="row.sensor.brand"
                        :query="query"
                      /></strong>
                      <span class="machine-comparison-model"><AHighlightText
                        :text="row.sensor.model"
                        :query="query"
                      /></span>
                    </div>
                    <div>
                      <AHighlightText
                        :text="row.sensor.spec || '—'"
                        :query="query"
                      />
                    </div>
                  </template>
                  <AHighlightText
                    v-else
                    :text="row.spec || '—'"
                    :query="query"
                  />
                </div>
              </template>
              <MachineRowImageCell
                v-else-if="field.key === 'image'"
                :rows="[cell.source]"
                :section-id="cell.sectionId"
                :machine-name="MACHINE_TAB_PAGE_OWNER"
                :writable="false"
              />
              <AHighlightText
                v-else
                :text="textValue(cell, field.key)"
                :query="query"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped src="./MachineComparisonPanel.css"></style>
