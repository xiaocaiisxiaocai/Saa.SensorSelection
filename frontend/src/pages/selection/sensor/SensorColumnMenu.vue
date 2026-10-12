<script setup lang="ts">
import { Columns3 } from 'lucide-vue-next';
import { ref } from 'vue';

/** 工具栏「列」按钮：勾选要显示的列，按钮里显示已隐藏几列 */
const props = defineProps<{
  columns: readonly { key: string; label: string }[];
  hidden: ReadonlySet<string>;
}>();
const emit = defineEmits<{ change: [key: string, visible: boolean] }>();

const open = ref(false);
</script>

<template>
  <a-popover
    v-model:open="open"
    trigger="click"
    placement="bottomRight"
    title="显示的列"
  >
    <!--
      隐藏列数放在按钮内：角标会伸出按钮上沿，而工具栏贴着
      .selection-panel 的 overflow: hidden 边界，上半截会被裁掉。
    -->
    <a-button
      :aria-label="
        props.hidden.size > 0
          ? `显示的列（已隐藏 ${props.hidden.size} 列）`
          : '显示的列'
      "
    >
      <template #icon><Columns3 :size="14" /></template>
      列
      <a-badge
        v-if="props.hidden.size > 0"
        class="column-menu-count"
        :count="props.hidden.size"
        size="small"
      />
    </a-button>
    <template #content>
      <a-space direction="vertical" role="group" aria-label="显示的列">
        <a-checkbox
          v-for="column in columns"
          :key="column.key"
          :checked="!hidden.has(column.key)"
          @change="emit('change', column.key, $event.target.checked)"
        >
          {{ column.label }}
        </a-checkbox>
      </a-space>
    </template>
  </a-popover>
</template>

<style scoped src="./SensorColumnMenu.css"></style>
