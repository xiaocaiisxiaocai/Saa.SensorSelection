<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { entityDataName, entityTreeItemKey } from '@/domain';
import EntitySource from '@/pages/selection/EntitySource.vue';
import SourcePane from '@/pages/selection/SourcePane.vue';
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
// 全局搜索结果带 ?tab= 直接打开对应标签页；之后手动切换标签页时把它从地址栏去掉，
// 免得刷新又跳回搜索时的那一页
const CUSTOMER_TABS = ['req', 'proc', 'sop', 'feedback'];
function tabFromQuery(value: unknown): string | null {
  return CUSTOMER_TABS.includes(String(value)) ? String(value) : null;
}
const customerTab = ref(tabFromQuery(route.query.tab) ?? 'req');
watch(
  () => route.query.tab,
  (value) => {
    const tab = tabFromQuery(value);
    if (tab) customerTab.value = tab;
  },
);
watch(customerTab, (tab) => {
  if (route.query.tab === undefined || route.query.tab === tab) return;
  const { tab: _tab, ...query } = route.query;
  void router.replace({ path: route.path, query });
});

const groups = computed(() => store.entityGroups('customer'));

// 用户想选中的叶子。点击/改名后立刻更新，不等路由导航落地：
// 改名会先触发下面的纠正 watcher，若它读的还是旧 URL，就会以为选中项没了、
// 退回第一个客户，并且这次退回的导航晚于改名后的导航，把选中项冲掉。
const requested = ref({
  category: String(route.query.category || ''),
  item: String(route.query.item || ''),
});
watch(
  () => [route.query.category, route.query.item] as const,
  ([category, item]) => {
    requested.value = {
      category: String(category || ''),
      item: String(item || ''),
    };
  },
);

// 客户目录是「客户 → 区域」：category 是客户，item 是区域。
// 区域名在不同客户下会重复，所以定位必须同时匹配客户和区域。
const selection = computed(() => {
  const { category, item } = requested.value;
  const group = groups.value.find((candidate) => candidate.name === category);
  if (group?.items.includes(item)) return { category, item };
  // 只给了客户（或区域已删）：落到该客户的第一个区域
  if (group?.items[0]) return { category, item: group.items[0] };
  const first = groups.value.find((candidate) => candidate.items.length > 0);
  return { category: first?.name || '', item: first?.items[0] || '' };
});
/** 业务数据名：「客户/区域」 */
const entityName = computed(() =>
  entityDataName('customer', selection.value.category, selection.value.item),
);
const selectedKey = computed(() =>
  selection.value.item
    ? entityTreeItemKey({
        category: selection.value.category,
        configuration: null,
        name: selection.value.item,
      })
    : undefined,
);

watch(
  () => [requested.value, groups.value] as const,
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
    ? `${selection.value.category}，${selection.value.item}`
    : selection.value.item,
);

const tabs = computed(() => {
  const name = entityName.value;
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
  requested.value = { category: payload.category, item: payload.item };
  void router.replace({ path: route.path, query: payload });
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">客户管理</h1>
    <div class="selection-split">
      <SourcePane
        storage-key="symtek:source-width:customer"
        :default-width="240"
      >
        <EntitySource
          kind="customer"
          :selected="selection.item"
          :selected-category="selection.category"
          :selected-key="selectedKey"
          @select="selectEntity"
        />
      </SourcePane>
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
              :key="`req:${entityName}`"
              :entity-name="entityName"
            />
            <CustomerProcPanel
              v-else-if="tab.value === 'proc'"
              :key="`proc:${entityName}`"
              :entity-name="entityName"
            />
            <CustomerDocsPanel
              v-else-if="tab.value === 'sop'"
              :key="`sop:${entityName}`"
              :entity-name="entityName"
            />
            <CustomerFeedbackPanel
              v-else
              :key="`feedback:${entityName}`"
              :entity-name="entityName"
            />
          </a-tab-pane>
        </a-tabs>
      </div>
      <a-empty v-else description="暂无客户，请在左侧新建客户和区域" />
    </div>
  </section>
</template>
