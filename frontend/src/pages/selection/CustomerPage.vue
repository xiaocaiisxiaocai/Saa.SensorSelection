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

const tabs: SegmentOption[] = [
  { label: '客户通用要求', value: 'req' },
  { label: '制程注意事项', value: 'proc' },
  { label: '感应器选用标准', value: 'sop' },
  { label: '厂外反馈问题项', value: 'feedback' },
];

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


function selectEntity(payload: { category: string; item: string }) {
  void router.replace({ path: route.path, query: payload });
}
</script>

<template>
  <section class="selection-page">
    <div class="selection-split">
      <EntitySource
        kind="customer"
        :selected="selection.item"
        @select="selectEntity"
      />
      <div v-if="selection.item" class="selection-panel">
        <ASegmentedControl v-model="customerTab" :segments="tabs" />
        <CustomerReqPanel
          v-if="customerTab === 'req'"
          :key="`req:${selection.item}`"
          :entity-name="selection.item"
        />
        <CustomerProcPanel
          v-else-if="customerTab === 'proc'"
          :key="`proc:${selection.item}`"
          :entity-name="selection.item"
        />
        <CustomerDocsPanel
          v-else-if="customerTab === 'sop'"
          :key="`sop:${selection.item}`"
          :entity-name="selection.item"
        />
        <CustomerFeedbackPanel
          v-else
          :key="`feedback:${selection.item}`"
          :entity-name="selection.item"
        />
      </div>
      <AEmptyState
        v-else
        title="暂无客户，请在左侧新建区域和客户"
      />
    </div>
  </section>
</template>
