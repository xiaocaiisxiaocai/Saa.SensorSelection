<script setup lang="ts">
import type { MachineRowImage, SensorItem } from '@/domain';
import { notifyResult } from '@/pages/shared/save-feedback';
import { useSelectionStore } from '@/stores/selection';

import SensorImageEditor from './SensorImageEditor.vue';

/** 表格「图片」列。点在格子里不打开整行编辑；增删立刻写入这一条型号。 */
const props = defineProps<{
  item: SensorItem;
  writable: boolean;
}>();

const store = useSelectionStore();

function onImages(images: MachineRowImage[]) {
  const removed = images.length < (props.item.images?.length ?? 0);
  notifyResult(
    store.saveSensor({ ...props.item, images }, props.item.id),
    removed ? '图片已删除' : '图片已更新',
    { stale: '该型号已被其他页面删除' },
  );
}
</script>

<template>
  <SensorImageEditor
    compact
    :images="item.images ?? []"
    :writable="writable"
    @update:images="onImages"
  />
</template>
