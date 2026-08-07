<script lang="ts" setup>
import type { EntityDetail, EntityGroup } from '../data.js';

import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ElTabPane, ElTabs, ElTag } from 'element-plus';
import { Building2, Cpu, Factory, FileLock2 } from 'lucide-vue-next';

import {
  CUSTOMER_GROUPS,
  MACHINE_DETAILS,
  MACHINE_GROUPS,
  PROCESS_DETAILS,
  PROCESS_GROUPS,
} from '../data.js';
import AppToolbar from './AppToolbar.vue';
import CrudTable from './CrudTable.vue';
import DocumentsPanel from './DocumentsPanel.vue';
import EntitySidebar from './EntitySidebar.vue';
import TimelinePanel from './TimelinePanel.vue';

type WorkspaceKind = 'customer' | 'machine' | 'process';

const props = defineProps<{ kind: WorkspaceKind }>();
const route = useRoute();
const router = useRouter();

const workspace = computed(() => {
  const definitions: Record<
    WorkspaceKind,
    {
      accent: string;
      groups: EntityGroup[];
      label: string;
      subtitle: string;
      title: string;
    }
  > = {
    customer: {
      accent: '#0f766e',
      groups: CUSTOMER_GROUPS,
      label: '客户',
      subtitle: '客户要求、制程注意和现场反馈',
      title: '客户管理',
    },
    process: {
      accent: '#6d28d9',
      groups: PROCESS_GROUPS,
      label: '制程',
      subtitle: 'PCB 制程规范与感应器选用标准',
      title: '制程管理',
    },
    machine: {
      accent: '#b45309',
      groups: MACHINE_GROUPS,
      label: '机型',
      subtitle: '设备结构、检测位置和安装注意事项',
      title: '机型结构',
    },
  };
  return definitions[props.kind];
});

const selection = computed(() => {
  const requested = String(route.query.item || '');
  for (const group of workspace.value.groups) {
    const item = group.items.includes(requested) ? requested : undefined;
    if (item) return { category: group.name, item };
  }
  return {
    category: workspace.value.groups[0]?.name || '',
    item: workspace.value.groups[0]?.items[0] || '',
  };
});

function controlledFileName(label: string) {
  return `${selection.value.item}_${label.replace(' ', '')}.pdf`;
}

const detail = computed<EntityDetail>(() => {
  if (props.kind === 'process') {
    return PROCESS_DETAILS[selection.value.item] || { desc: '' };
  }
  if (props.kind === 'machine') {
    return MACHINE_DETAILS[selection.value.item] || { desc: '' };
  }
  return {
    desc: `${selection.value.item}是${selection.value.category}区域 PCB 制造客户，全线配套 Symtek 自动化输送及机械手系统。`,
  };
});

watch(
  () => [props.kind, route.query.item],
  () => {
    if (!route.query.item && selection.value.item) {
      router.replace({
        query: {
          ...route.query,
          category: selection.value.category,
          item: selection.value.item,
        },
      });
    }
  },
  { immediate: true },
);

function selectEntity(payload: { category: string; item: string }) {
  router.push({ query: payload });
}
</script>

<template>
  <main :style="{ '--module-accent': workspace.accent }" class="selection-page">
    <AppToolbar :subtitle="workspace.subtitle" :title="workspace.title" />
    <div class="entity-workspace">
      <EntitySidebar
        :groups="workspace.groups"
        :label="workspace.label"
        :selected="selection.item"
        @select="selectEntity"
      />

      <section
        :aria-labelledby="`${props.kind}-detail-title`"
        class="entity-detail"
      >
        <nav aria-label="面包屑" class="selection-breadcrumb">
          <span>{{ workspace.title }}</span>
          <span>/</span>
          <span>{{ selection.category }}</span>
          <span>/</span>
          <strong>{{ selection.item }}</strong>
        </nav>
        <div class="entity-detail__header">
          <div aria-hidden="true" class="entity-detail__icon">
            <Building2 v-if="props.kind === 'customer'" :size="21" />
            <Factory v-else-if="props.kind === 'process'" :size="21" />
            <Cpu v-else :size="21" />
          </div>
          <div>
            <h2 :id="`${props.kind}-detail-title`">{{ selection.item }}</h2>
            <ElTag effect="light">{{ selection.category }}</ElTag>
          </div>
        </div>
        <p class="entity-detail__description">{{ detail.desc }}</p>

        <DocumentsPanel
          v-if="props.kind === 'process' && detail.files"
          :files="detail.files"
        />

        <ElTabs v-else class="detail-tabs">
          <template v-if="props.kind === 'customer'">
            <ElTabPane label="客户通用要求">
              <CrudTable :entity-name="selection.item" list-id="customer-req" />
            </ElTabPane>
            <ElTabPane label="制程注意事项">
              <CrudTable
                :entity-name="selection.item"
                list-id="customer-proc"
              />
            </ElTabPane>
            <ElTabPane label="感应器选用标准">
              <div class="controlled-files">
                <div
                  v-for="label in [
                    '常规结构配置 SOP',
                    '特殊结构配置 SOP',
                    '特殊制程配置 SOP',
                  ]"
                  :key="label"
                  class="controlled-file"
                >
                  <FileLock2 :size="19" aria-hidden="true" />
                  <div>
                    <strong>{{ controlledFileName(label) }}</strong>
                    <span>受控文档 · 仅显示索引</span>
                  </div>
                </div>
              </div>
            </ElTabPane>
            <ElTabPane label="厂外反馈问题项">
              <TimelinePanel :entity-name="selection.item" />
            </ElTabPane>
          </template>

          <template v-else-if="props.kind === 'process'">
            <ElTabPane label="制程特性">
              <CrudTable :entity-name="selection.item" list-id="process-feat" />
            </ElTabPane>
            <ElTabPane label="感应器选用标准">
              <CrudTable
                :entity-name="selection.item"
                list-id="process-sensor"
              />
            </ElTabPane>
          </template>

          <template v-else>
            <ElTabPane label="输送机构">
              <CrudTable
                :entity-name="selection.item"
                list-id="machine-conveyor"
              />
            </ElTabPane>
            <ElTabPane label="手臂机构">
              <CrudTable :entity-name="selection.item" list-id="machine-arm" />
            </ElTabPane>
            <ElTabPane label="台车工位结构">
              <CrudTable
                :entity-name="selection.item"
                list-id="machine-platform"
              />
            </ElTabPane>
            <ElTabPane label="机型注意事项">
              <CrudTable
                :entity-name="selection.item"
                list-id="machine-notes"
              />
            </ElTabPane>
          </template>
        </ElTabs>
      </section>
    </div>
  </main>
</template>
