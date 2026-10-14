<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import Sensor3dPanel from '@/pages/selection/sensor/Sensor3dPanel.vue';
import SensorModelsPanel from '@/pages/selection/sensor/SensorModelsPanel.vue';
import SensorSopFilePanel from '@/pages/selection/sensor/SensorSopFilePanel.vue';
import SensorSopPanel from '@/pages/selection/sensor/SensorSopPanel.vue';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

/*
 * Sensor 型号页：只负责页签切换和地址栏同步。
 * section 是型号或资源页签。状态筛选在型号表头，空选就是分组的「全部」。
 */
const route = useRoute();
const store = useSelectionStore();

const RESOURCE_TABS = ['sop-library', 'sop', '3d'] as const;
type ResourceTab = (typeof RESOURCE_TABS)[number];

const section = ref<'models' | ResourceTab>(initialSection());
const query = ref(String(route.query.model || ''));
const statusFilters = ref<string[]>(initialStatusFilters());
const sensorTypeFilters = ref<Array<string | number>>(
  parseSensorTypeFilters(String(route.query.sensorTypes || '')),
);
const focusSopId = ref<null | number>(positiveId(route.query.sopId));
const focusModel3dId = ref<null | number>(positiveId(route.query.model3dId));

const sectionTab = computed({
  get: () => section.value,
  set: (value: string) => {
    section.value = isResourceTab(value) ? value : 'models';
  },
});

useSyncedQuery(() => {
  if (section.value === 'sop-library') {
    return { tab: 'sop-library' };
  }
  if (section.value === 'sop') {
    return {
      tab: 'sop',
      sopId: focusSopId.value ? String(focusSopId.value) : undefined,
    };
  }
  if (section.value === '3d') {
    return {
      tab: '3d',
      model3dId: focusModel3dId.value
        ? String(focusModel3dId.value)
        : undefined,
    };
  }
  return {
    tab: statusFilters.value.length
      ? statusFilters.value.join(',')
      : undefined,
    model: query.value.trim() || undefined,
    sensorTypes: sensorTypeFilters.value.length
      ? sensorTypeFilters.value.map(String).join(',')
      : undefined,
  };
});

watch(
  () => String(route.query.model || ''),
  (model) => {
    // 搜索框输入会经 useSyncedQuery 回写 ?model=，那次变化与当前搜索词相同，
    // 不能当成外部深链接把状态筛选清掉。
    if (!model || model === query.value.trim()) return;
    statusFilters.value = [];
    query.value = model;
  },
);
watch(
  () => String(route.query.sensorTypes || ''),
  (sensorTypes) => {
    const next = parseSensorTypeFilters(sensorTypes);
    if (next.join(',') !== sensorTypeFilters.value.map(String).join(',')) {
      sensorTypeFilters.value = next;
    }
  },
);
watch(
  () => [route.query.tab, route.query.sopId, route.query.model3dId] as const,
  ([tab, sopId, model3dId]) => {
    const nextTab = String(tab || '');
    if (nextTab === 'sop-library') {
      section.value = 'sop-library';
    } else if (nextTab === 'sop') {
      section.value = 'sop';
      focusSopId.value = positiveId(sopId);
    }
    if (nextTab === '3d') {
      section.value = '3d';
      focusModel3dId.value = positiveId(model3dId);
    }
  },
);

function isResourceTab(value: string): value is ResourceTab {
  return (RESOURCE_TABS as readonly string[]).includes(value);
}

function initialSection(): 'models' | ResourceTab {
  const tab = String(route.query.tab || '');
  return isResourceTab(tab) ? tab : 'models';
}

/** 空或「全部」是分组视图。认不出的状态名留着，让列表滤成空的扁平表。 */
function initialStatusFilters() {
  const tab = String(route.query.tab || '');
  if (isResourceTab(tab) || route.query.model) return [];
  return parseStatusFilters(tab);
}

function parseStatusFilters(value: string) {
  const parts = [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (parts.length === 0 || (parts.length === 1 && parts[0] === '全部')) {
    return [];
  }
  const allowed = new Set(store.dictionaryNames('sensor-status'));
  const known = parts.filter((item) => allowed.has(item));
  return known.length > 0 ? known : parts;
}

function parseSensorTypeFilters(value: string) {
  const allowed = new Set(store.dictionaryNames('sensor-type'));
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].filter((item) => allowed.has(item));
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">Sensor型号</h1>
    <a-tabs
      v-model:active-key="sectionTab"
      class="entity-tabs"
      destroy-inactive-tab-pane
    >
      <a-tab-pane key="models" tab="型号">
        <SensorModelsPanel
          v-model:statuses="statusFilters"
          v-model:query="query"
          v-model:sensor-types="sensorTypeFilters"
        />
      </a-tab-pane>
      <a-tab-pane key="sop-library" tab="SOP">
        <SensorSopFilePanel />
      </a-tab-pane>
      <a-tab-pane key="sop" tab="型录">
        <SensorSopPanel
          :focus-sop-id="focusSopId"
          @previewed="focusSopId = $event"
        />
      </a-tab-pane>
      <a-tab-pane key="3d" tab="3D">
        <Sensor3dPanel
          :focus-model3d-id="focusModel3dId"
          @previewed="focusModel3dId = $event"
        />
      </a-tab-pane>
    </a-tabs>
  </section>
</template>
