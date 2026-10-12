<script setup lang="ts">
import { computed } from 'vue';

import type { PermissionInfo } from '@/api';

/** 按模块分组勾选权限；模块标题可整组全选 / 取消（部分选中显示半选） */
const props = defineProps<{ permissions: readonly PermissionInfo[] }>();
const selected = defineModel<number[]>({ required: true });

const groups = computed(() => {
  const map = new Map<string, PermissionInfo[]>();
  for (const permission of props.permissions) {
    const module = permission.module || '其他';
    const list = map.get(module) ?? [];
    list.push(permission);
    map.set(module, list);
  }
  return [...map.entries()];
});

function groupState(items: PermissionInfo[]) {
  const count = items.filter((item) => selected.value.includes(item.id)).length;
  if (count === 0) return false;
  if (count === items.length) return true;
  return 'indeterminate' as const;
}

function toggleGroup(items: PermissionInfo[], checked: boolean) {
  const ids = new Set(selected.value);
  for (const item of items) {
    if (checked) ids.add(item.id);
    else ids.delete(item.id);
  }
  selected.value = [...ids];
}

function togglePermission(id: number, checked: boolean) {
  if (checked) {
    if (!selected.value.includes(id)) selected.value = [...selected.value, id];
    return;
  }
  selected.value = selected.value.filter((item) => item !== id);
}
</script>

<template>
  <div>
    <div
      v-for="[module, items] in groups"
      :key="module"
      class="permission-group"
    >
      <a-checkbox
        class="permission-group__head"
        :checked="groupState(items) === true"
        :indeterminate="groupState(items) === 'indeterminate'"
        @change="toggleGroup(items, $event.target.checked)"
      >
        {{ module }}
      </a-checkbox>
      <a-row :gutter="[16, 4]">
        <a-col v-for="item in items" :key="item.id" :xs="24" :sm="12">
          <a-checkbox
            :checked="selected.includes(item.id)"
            @change="togglePermission(item.id, $event.target.checked)"
          >
            {{ item.name }}
          </a-checkbox>
        </a-col>
      </a-row>
    </div>
  </div>
</template>

<style scoped src="./RolePermissionPicker.css"></style>
