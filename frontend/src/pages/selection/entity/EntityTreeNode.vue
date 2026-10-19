<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next';

import type { EntityNode } from './entity-tree-data';
import { AHighlightText } from '@/ui';

/**
 * 目录树的一行：名称、子项数，可编辑时带「更多」下拉菜单。
 * 点分组 / 配置行切换展开；菜单项由父组件给出，选中后回传 key。
 */
const props = defineProps<{
  node: EntityNode;
  query?: string;
  editable: boolean;
  compareEnabled?: boolean;
  compareCurrent?: boolean;
  actions: readonly {
    key: string;
    label: string;
    danger?: boolean;
    disabled?: boolean;
  }[];
}>();
const emit = defineEmits<{
  toggle: [];
  action: [key: string];
  compare: [];
  chooseCompare: [];
}>();

function onContextMenuClick({ key }: { key: string | number }) {
  if (!props.compareEnabled) return;
  if (String(key) === 'choose-compare' && props.compareCurrent) {
    emit('chooseCompare');
  } else if (String(key) === 'compare' && !props.compareCurrent) {
    emit('compare');
  }
}
</script>

<template>
  <a-dropdown :trigger="compareEnabled ? ['contextmenu'] : []">
    <div
      class="entity-tree__node"
      :data-node-kind="node.kind"
      :data-category="node.category"
      :data-configuration="node.configuration ?? undefined"
      :data-item="node.item"
      @click="node.kind !== 'item' && emit('toggle')"
    >
      <span
        class="entity-tree__label"
        :class="{ 'entity-tree__label--group': node.kind === 'group' }"
        :title="node.title"
      >
        <AHighlightText :text="node.title" :query="query" />
      </span>
      <a-typography-text
        v-if="node.count !== undefined"
        type="secondary"
        class="entity-tree__count"
      >
        {{ node.count }}
      </a-typography-text>
      <a-dropdown v-if="editable" :trigger="['click']">
        <a-button
          class="entity-tree__more"
          type="text"
          size="small"
          :aria-label="`${node.title} 的更多操作`"
          @click.stop
        >
          <template #icon><Ellipsis :size="14" /></template>
        </a-button>
        <template #overlay>
          <a-menu
            @click="
              ({ key }: { key: string | number }) => emit('action', String(key))
            "
          >
            <a-menu-item
              v-for="action in actions"
              :key="action.key"
              :danger="action.danger"
              :disabled="action.disabled"
            >
              {{ action.label }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <template #overlay>
      <a-menu @click="onContextMenuClick">
        <a-menu-item v-if="compareCurrent" key="choose-compare">
          选择其他机型对比…
        </a-menu-item>
        <a-menu-item v-else key="compare"> 与当前条目对比 </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<style scoped src="./EntityTreeNode.css"></style>
