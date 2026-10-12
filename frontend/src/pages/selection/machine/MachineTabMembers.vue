<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next';
import { ref } from 'vue';

import type { MachineTab } from '@/domain';
import {
  dragCarries,
  dropped,
  startDrag,
  TAB_MACHINE_DRAG,
  TREE_ITEM_DRAG,
} from '@/pages/selection/entity/entity-drag';

/**
 * Tab 下的机型：一行机型标签，点标签在下方显示它的内容。
 * 可写时：标签可拖动（排序、拖到别的 Tab、拖回左侧目录），
 * 也接收从左侧目录拖来的机型；「…」菜单提供同样的操作，触屏也能用。
 */
const props = defineProps<{
  tab: MachineTab;
  active: string;
  writable: boolean;
  /** 显示报告用的勾选框 */
  checkable: boolean;
  checked: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  select: [name: string];
  check: [name: string, checked: boolean];
  action: [key: 'delete' | 'move' | 'rename' | 'return', name: string];
  /** 机型放进这个 Tab 的第 index 位（不传为末尾） */
  place: [name: string, index?: number];
}>();

const MENU = [
  { key: 'move', label: '移到其他 Tab…' },
  { key: 'return', label: '移回目录' },
  { key: 'rename', label: '改名' },
  { key: 'delete', label: '删除', danger: true },
] as const;

const dropHint = ref<{ name: string; side: 'after' | 'before' } | null>(null);
const rowHint = ref(false);

const accepts = (event: DragEvent) =>
  props.writable &&
  (dragCarries(event, TREE_ITEM_DRAG) || dragCarries(event, TAB_MACHINE_DRAG));

function draggedName(event: DragEvent) {
  return (
    dropped(event, TAB_MACHINE_DRAG) || dropped(event, TREE_ITEM_DRAG) || ''
  );
}

function sideOf(event: DragEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return event.clientX < box.left + box.width / 2 ? 'before' : 'after';
}

function onChipDragOver(event: DragEvent, name: string) {
  if (!accepts(event)) return;
  event.preventDefault();
  event.stopPropagation();
  dropHint.value = { name, side: sideOf(event) };
}

function onChipDrop(event: DragEvent, target: string) {
  if (!accepts(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const side = sideOf(event);
  dropHint.value = null;
  const name = draggedName(event);
  if (!name || name === target) return;
  // 位置按「去掉被拖的那个之后」的列表算
  const others = props.tab.machines.filter((machine) => machine !== name);
  const index = others.indexOf(target) + (side === 'after' ? 1 : 0);
  emit('place', name, index);
}

function onRowDragOver(event: DragEvent) {
  if (!accepts(event)) return;
  event.preventDefault();
  rowHint.value = true;
}

function onRowDrop(event: DragEvent) {
  if (!accepts(event)) return;
  event.preventDefault();
  rowHint.value = false;
  const name = draggedName(event);
  if (name) emit('place', name);
}
</script>

<template>
  <div
    class="machine-tab-members"
    :class="{ 'machine-tab-members--drop': rowHint }"
    role="list"
    :aria-label="`${tab.name} 下的机型`"
    @dragover="onRowDragOver"
    @dragleave.self="rowHint = false"
    @drop="onRowDrop"
  >
    <div
      v-for="name in tab.machines"
      :key="name"
      class="machine-chip"
      :class="{
        'machine-chip--active': name === active,
        'machine-chip--drop-before':
          dropHint?.name === name && dropHint.side === 'before',
        'machine-chip--drop-after':
          dropHint?.name === name && dropHint.side === 'after',
      }"
      role="listitem"
      :draggable="writable"
      @dragstart="startDrag($event, TAB_MACHINE_DRAG, name)"
      @dragover="onChipDragOver($event, name)"
      @dragleave="dropHint = null"
      @drop="onChipDrop($event, name)"
    >
      <a-checkbox
        v-if="checkable"
        :checked="checked.has(name)"
        :aria-label="`报告中包含 ${name}`"
        @change="emit('check', name, $event.target.checked)"
      />
      <button
        type="button"
        class="machine-chip__name"
        :aria-current="name === active ? 'true' : undefined"
        @click="emit('select', name)"
      >
        {{ name }}
      </button>
      <a-dropdown v-if="writable" :trigger="['click']">
        <a-button
          class="machine-chip__more"
          type="text"
          size="small"
          :aria-label="`${name} 的更多操作`"
        >
          <template #icon><Ellipsis :size="14" /></template>
        </a-button>
        <template #overlay>
          <a-menu
            @click="
              ({ key }: { key: string | number }) =>
                emit('action', key as (typeof MENU)[number]['key'], name)
            "
          >
            <a-menu-item
              v-for="item in MENU"
              :key="item.key"
              :danger="'danger' in item"
            >
              {{ item.label }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <span v-if="tab.machines.length === 0" class="machine-tab-members__empty">
      {{
        writable
          ? '把左侧目录里的机型拖到这里，或在机型的「…」菜单里选「移到 Tab…」'
          : '这个 Tab 下还没有机型'
      }}
    </span>
  </div>
</template>

<style scoped src="./MachineTabMembers.css"></style>
