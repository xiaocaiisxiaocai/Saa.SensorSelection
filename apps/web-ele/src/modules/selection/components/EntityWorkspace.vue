<script lang="ts" setup>
import type { EntityKind } from '../domain.js';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ElTabPane, ElTabs } from 'element-plus';

import { useSelectionStore } from '../store';
import ControlledFilesPanel from './ControlledFilesPanel.vue';
import CrudTable from './CrudTable.vue';
import CustomerReqPanel from './CustomerReqPanel.vue';
import EntitySidebar from './EntitySidebar.vue';
import TimelinePanel from './TimelinePanel.vue';

/** Customer-only workspace; machine uses MachineWorkspace. */
defineProps<{ kind?: Extract<EntityKind, 'customer'> }>();

const route = useRoute();
const router = useRouter();
const store = useSelectionStore();
const customerTab = ref('req');

const groups = computed(() => store.entityGroups('customer'));

const selection = computed(() => {
  const requested = String(route.query.item || '');
  for (const group of groups.value) {
    const item = group.items.includes(requested) ? requested : undefined;
    if (item) return { category: group.name, item };
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
    router.replace({ path: route.path, query: { category, item } });
  },
  { immediate: true },
);

watch(
  () => selection.value.item,
  () => {
    customerTab.value = 'req';
  },
);

function selectEntity(payload: { category: string; item: string }) {
  router.replace({ path: route.path, query: payload });
}
</script>

<template>
  <main class="selection-page" style="--module-accent: #0f766e">
    <div class="entity-workspace">
      <EntitySidebar
        :groups="groups"
        :selected="selection.item"
        kind="customer"
        label="客户"
        @select="selectEntity"
      />

      <section
        v-if="selection.item"
        :aria-label="selection.item"
        class="entity-detail"
      >
        <ElTabs v-model="customerTab" class="detail-tabs">
          <ElTabPane label="客户通用要求" lazy name="req">
            <CustomerReqPanel :entity-name="selection.item" />
          </ElTabPane>
          <ElTabPane label="制程注意事项" lazy name="proc">
            <CrudTable :entity-name="selection.item" list-id="customer-proc" />
          </ElTabPane>
          <ElTabPane label="感应器选用标准" lazy name="sop">
            <ControlledFilesPanel :entity-name="selection.item" />
          </ElTabPane>
          <ElTabPane label="厂外反馈问题项" lazy name="feedback">
            <TimelinePanel :entity-name="selection.item" />
          </ElTabPane>
        </ElTabs>
      </section>
      <section v-else class="entity-detail">
        <div class="entity-empty">暂无客户，请在左侧新建区域和客户</div>
      </section>
    </div>
  </main>
</template>
