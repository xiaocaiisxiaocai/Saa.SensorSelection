<script setup lang="ts">
import { TreeSelect as AntTreeSelect } from 'ant-design-vue';
import { computed } from 'vue';

import type { TreeNode } from './tree-select';
import { useFormControl } from './use-form-control';

const props = withDefaults(
  defineProps<{
    nodes: TreeNode[];
    placeholder?: string;
    filterable?: boolean;
    clearable?: boolean;
    describedBy?: string;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
  }>(),
  {
    placeholder: '请选择',
    filterable: true,
    clearable: true,
  },
);

const model = defineModel<string | number | null>({ default: null });
const { id, describedBy, invalid } = useFormControl(props);

interface AntdTreeNode {
  title: string;
  value: string | number;
  key: string | number;
  disabled?: boolean;
  children?: AntdTreeNode[];
}

function toTree(nodes: TreeNode[]): AntdTreeNode[] {
  return nodes.map((node) => ({
    title: node.hint ? `${node.label}（${node.hint}）` : node.label,
    value: node.id,
    key: node.id,
    disabled: node.disabled,
    children: node.children ? toTree(node.children) : undefined,
  }));
}

const treeData = computed(() => toTree(props.nodes));
</script>

<template>
  <AntTreeSelect
    :id="id"
    v-model:value="model"
    class="a-tree-select"
    allow-clear
    :aria-describedby="describedBy"
    :disabled="disabled"
    :placeholder="placeholder"
    :show-search="filterable"
    :status="invalid ? 'error' : ''"
    :tree-data="treeData"
    tree-default-expand-all
    tree-node-filter-prop="title"
    style="width: 100%"
  />
</template>
