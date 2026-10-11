<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import EntitySource from '@/pages/selection/EntitySource.vue';
import CustomerDocsPanel from '@/pages/selection/customer/CustomerDocsPanel.vue';
import CustomerFeedbackPanel from '@/pages/selection/customer/CustomerFeedbackPanel.vue';
import CustomerProcPanel from '@/pages/selection/customer/CustomerProcPanel.vue';
import CustomerReqPanel from '@/pages/selection/customer/CustomerReqPanel.vue';
import { useSelectionStore } from '@/stores/selection';
import { AEmptyState, ASegmentedControl, type SegmentOption } from '@/ui';

import '../shared/selection-page.css';

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const customerTab = ref('req');

const groups = computed(() => store.entityGroups('customer'));

const selection = computed(() => {
  const requested = String(route.query.item || '');
  for (const group of groups.value) {
    if (group.items.includes(requested)) {
      return { category: group.name, item: requested };
    }
  }
  return {
    category: groups.value[0]?.name || '',
    item: groups.value[0]?.items[0] || '',
  };
});

watch(
  () => [route.query.item, route.query.category, groups.value] as const,
  () => {
    const { category, item } = selection.value;
    if (!item) return;
    if (route.query.item === item && route.query.category === category) return;
    void router.replace({ path: route.path, query: { category, item } });
  },
  { immediate: true },
);

const panelLabel = computed(() =>
  selection.value.category
    ? `${selection.value.item}，${selection.value.category}`
    : selection.value.item,
);

const tabs = computed<SegmentOption[]>(() => {
  const name = selection.value.item;
  return [
    {
      label: '客户通用要求',
      value: 'req',
      badge: store.crudItems('customer-req', name).length,
    },
    {
      label: '制程注意事项',
      value: 'proc',
      badge: store.crudItems('customer-proc', name).length,
    },
    {
      label: '感应器选用标准',
      value: 'sop',
      badge: store.controlledDocuments(name).length,
    },
    {
      label: '厂外反馈问题项',
      value: 'feedback',
      badge: store.crudItems('customer-feedback', name).length,
    },
  ];
});

function selectEntity(payload: { category: string; item: string }) {
  void router.replace({ path: route.path, query: payload });
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">客户管理</h1>
    <div class="selection-split">
      <EntitySource
        kind="customer"
        :selected="selection.item"
        @select="selectEntity"
      />
      <div v-if="selection.item" class="selection-panel">
        <header class="entity-header">
          <h2 class="visually-hidden">{{ panelLabel }}</h2>
          <ASegmentedControl
            id="customer-tabs"
            v-model="customerTab"
            class="entity-header__tabs"
            aria-label="客户资料分类"
            :segments="tabs"
          />
        </header>
        <div
          v-if="customerTab === 'req'"
          id="customer-tabs-panel-req"
          role="tabpanel"
          aria-labelledby="customer-tabs-tab-req"
          tabindex="0"
          class="selection-tabpanel"
        >
          <CustomerReqPanel
            :key="`req:${selection.item}`"
            :entity-name="selection.item"
          />
        </div>
        <div
          v-else-if="customerTab === 'proc'"
          id="customer-tabs-panel-proc"
          role="tabpanel"
          aria-labelledby="customer-tabs-tab-proc"
          tabindex="0"
          class="selection-tabpanel"
        >
          <CustomerProcPanel
            :key="`proc:${selection.item}`"
            :entity-name="selection.item"
          />
        </div>
        <div
          v-else-if="customerTab === 'sop'"
          id="customer-tabs-panel-sop"
          role="tabpanel"
          aria-labelledby="customer-tabs-tab-sop"
          tabindex="0"
          class="selection-tabpanel"
        >
          <CustomerDocsPanel
            :key="`sop:${selection.item}`"
            :entity-name="selection.item"
          />
        </div>
        <div
          v-else-if="customerTab === 'feedback'"
          id="customer-tabs-panel-feedback"
          role="tabpanel"
          aria-labelledby="customer-tabs-tab-feedback"
          tabindex="0"
          class="selection-tabpanel"
        >
          <CustomerFeedbackPanel
            :key="`feedback:${selection.item}`"
            :entity-name="selection.item"
          />
        </div>
      </div>
      <AEmptyState v-else title="暂无客户，请在左侧新建区域和客户" />
    </div>
  </section>
</template>
