<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next';

import type { EntityNode } from './entity-tree-data';

/**
 * 目录树的一行：名称、子项数，可编辑时带「更多」下拉菜单。
 * 点分组 / 配置行切换展开；菜单项由父组件给出，选中后回传 key。
 */
defineProps<{
  node: EntityNode;
  editable: boolean;
  actions: readonly { key: string; label: string; danger?: boolean }[];
}>();
const emit = defineEmits<{ toggle: []; action: [key: string] }>();
</script>

<template>
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
      {{ node.title }}
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
          >
            {{ action.label }}
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<style scoped src="./EntityTreeNode.css"></style>
