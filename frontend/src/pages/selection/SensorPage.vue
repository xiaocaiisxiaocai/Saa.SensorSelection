<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { findSensorStatusName, isSensorStatus } from '@/domain';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import Sensor3dPanel from '@/pages/selection/sensor/Sensor3dPanel.vue';
import SensorModelsPanel from '@/pages/selection/sensor/SensorModelsPanel.vue';
import SensorSopFilePanel from '@/pages/selection/sensor/SensorSopFilePanel.vue';
import SensorSopPanel from '@/pages/selection/sensor/SensorSopPanel.vue';
import { useSelectionStore } from '@/stores/selection';

import '../shared/selection-page.css';

/*
 * Sensor 型号页：只负责页签切换和地址栏同步。
 * mainTab 是状态名（型号页签下的状态筛选）或资源页签 sop-library / sop / 3d。
 */
const route = useRoute();
const store = useSelectionStore();

const RESOURCE_TABS = ['sop-library', 'sop', '3d'];

const mainTab = ref(initialTab());
const query = ref(String(route.query.model || ''));
const sensorTypeFilters = ref<Array<string | number>>(
  parseSensorTypeFilters(String(route.query.sensorTypes || '')),
);
const focusSopId = ref<null | number>(positiveId(route.query.sopId));
const focusModel3dId = ref<null | number>(positiveId(route.query.model3dId));

// 切到资源页签再切回「型号」时，回到之前的状态筛选
const lastStatusTab = ref(
  RESOURCE_TABS.includes(mainTab.value)
    ? currentStatusName() || '全部'
    : mainTab.value,
);
const sectionTab = computed({
  get: () => (RESOURCE_TABS.includes(mainTab.value) ? mainTab.value : 'models'),
  set: (value: string) => {
    mainTab.value = value === 'models' ? lastStatusTab.value : value;
  },
});

useSyncedQuery(() => {
  if (mainTab.value === 'sop-library') {
    return { tab: 'sop-library' };
  }
  if (mainTab.value === 'sop') {
    return {
      tab: 'sop',
      sopId: focusSopId.value ? String(focusSopId.value) : undefined,
    };
  }
  if (mainTab.value === '3d') {
    return {
      tab: '3d',
      model3dId: focusModel3dId.value
        ? String(focusModel3dId.value)
        : undefined,
    };
  }
  return {
    tab: isSensorStatus(mainTab.value, 'current') ? undefined : mainTab.value,
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
    // 不能当成外部深链接把状态页签重置为“全部”。
    if (!model || model === query.value.trim()) return;
    mainTab.value = '全部';
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
      mainTab.value = 'sop-library';
    } else if (nextTab === 'sop') {
      mainTab.value = 'sop';
      focusSopId.value = positiveId(sopId);
    }
    if (nextTab === '3d') {
      mainTab.value = '3d';
      focusModel3dId.value = positiveId(model3dId);
    }
  },
);
watch(mainTab, (tab) => {
  if (!RESOURCE_TABS.includes(tab)) lastStatusTab.value = tab;
});

function initialTab() {
  const tab = String(route.query.tab || '');
  if (RESOURCE_TABS.includes(tab)) return tab;
  if (route.query.model) return '全部';
  return tab || currentStatusName() || '全部';
}

function currentStatusName() {
  return findSensorStatusName(
    store.dictionaryNames('sensor-status'),
    'current',
  );
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
          v-model:status="mainTab"
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
