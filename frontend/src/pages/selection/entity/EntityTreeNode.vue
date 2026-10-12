<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next';
import { ref } from 'vue';

import { dragCarries, dropped, TAB_MACHINE_DRAG } from './entity-drag';
import type { EntityNode } from './entity-tree-data';

/**
 * 目录树的一行：名称、子项数，可编辑时带「更多」下拉菜单。
 * 点分组 / 配置行切换展开；菜单项由父组件给出，选中后回传 key。
 * acceptsDrop 时接收从机型 Tab 拖回来的机型：放在分组 / 配置上归入它，
 * 放在机型上按落点的上半 / 下半插到它前面或后面。
 */
const props = defineProps<{
  node: EntityNode;
  editable: boolean;
  actions: readonly { key: string; label: string; danger?: boolean }[];
  acceptsDrop?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  action: [key: string];
  externalDrop: [name: string, position: 'after' | 'before' | 'inside'];
}>();

const dropPosition = ref<'after' | 'before' | 'inside' | null>(null);

function positionOf(event: DragEvent) {
  if (props.node.kind !== 'item') return 'inside' as const;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
}

function onDragOver(event: DragEvent) {
  if (!props.acceptsDrop || !dragCarries(event, TAB_MACHINE_DRAG)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropPosition.value = positionOf(event);
}

function onDrop(event: DragEvent) {
  if (!props.acceptsDrop || !dragCarries(event, TAB_MACHINE_DRAG)) return;
  event.preventDefault();
  event.stopPropagation();
  const position = positionOf(event);
  dropPosition.value = null;
  const name = dropped(event, TAB_MACHINE_DRAG);
  if (name) emit('externalDrop', name, position);
}
</script>

<template>
  <div
    class="entity-tree__node"
    :class="dropPosition && `entity-tree__node--drop-${dropPosition}`"
    :data-node-kind="node.kind"
    :data-category="node.category"
    :data-configuration="node.configuration ?? undefined"
    :data-item="node.item"
    @click="node.kind !== 'item' && emit('toggle')"
    @dragover="onDragOver"
    @dragleave="dropPosition = null"
    @drop="onDrop"
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
