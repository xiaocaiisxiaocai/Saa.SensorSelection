<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import EntitySource from '@/pages/selection/EntitySource.vue';
import CustomerDocsPanel from '@/pages/selection/customer/CustomerDocsPanel.vue';
import CustomerFeedbackPanel from '@/pages/selection/customer/CustomerFeedbackPanel.vue';
import CustomerProcPanel from '@/pages/selection/customer/CustomerProcPanel.vue';
import CustomerReqPanel from '@/pages/selection/customer/CustomerReqPanel.vue';
import { TAB_COUNT_STYLE } from '@/pages/shared/tabs';
import { useSelectionStore } from '@/stores/selection';

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

const tabs = computed(() => {
  const name = selection.value.item;
  return [
    {
      label: '客户通用要求',
      value: 'req',
      count: store.crudItems('customer-req', name).length,
    },
    {
      label: '制程注意事项',
      value: 'proc',
      count: store.crudItems('customer-proc', name).length,
    },
    {
      label: '感应器选用标准',
      value: 'sop',
      count: store.controlledDocuments(name).length,
    },
    {
      label: '厂外反馈问题项',
      value: 'feedback',
      count: store.crudItems('customer-feedback', name).length,
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
        <h2 class="visually-hidden">{{ panelLabel }}</h2>
        <a-tabs
          v-model:active-key="customerTab"
          class="entity-tabs"
          destroy-inactive-tab-pane
        >
          <a-tab-pane v-for="tab in tabs" :key="tab.value">
            <template #tab>
              {{ tab.label }}
              <a-badge
                :count="tab.count"
                show-zero
                :overflow-count="999"
                :number-style="TAB_COUNT_STYLE"
              />
            </template>
            <CustomerReqPanel
              v-if="tab.value === 'req'"
              :key="`req:${selection.item}`"
              :entity-name="selection.item"
            />
            <CustomerProcPanel
              v-else-if="tab.value === 'proc'"
              :key="`proc:${selection.item}`"
              :entity-name="selection.item"
            />
            <CustomerDocsPanel
              v-else-if="tab.value === 'sop'"
              :key="`sop:${selection.item}`"
              :entity-name="selection.item"
            />
            <CustomerFeedbackPanel
              v-else
              :key="`feedback:${selection.item}`"
              :entity-name="selection.item"
            />
          </a-tab-pane>
        </a-tabs>
      </div>
      <a-empty v-else description="暂无客户，请在左侧新建区域和客户" />
    </div>
  </section>
</template>
