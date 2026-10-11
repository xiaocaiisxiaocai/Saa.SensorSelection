<script setup lang="ts">
import { Segmented as AntSegmented } from 'ant-design-vue';
import { computed, h, useId } from 'vue';

import type { SegmentedSize, SegmentOption } from './types';

const props = withDefaults(
  defineProps<{
    segments: SegmentOption[];
    size?: SegmentedSize;
    ariaLabel?: string;
    id?: string;
  }>(),
  {
    size: 'medium',
  },
);

const fallbackId = useId();
const baseId = computed(() => props.id ?? fallbackId);
const model = defineModel<string>({ required: true });
// antd Segmented 只有 large / small，默认尺寸即中号
const antdSize = computed(() => (props.size === 'large' ? 'large' : undefined));
const options = computed(() =>
  props.segments.map((segment) => ({
    value: segment.value,
    label: h(
      'span',
      { id: `${baseId.value}-tab-${segment.value}` },
      segment.badge == null
        ? segment.label
        : [
            segment.label,
            // 计数是信息不是告警：不用 antd Badge（红底徽标），用弱化的数字
            h('span', { class: 'a-segmented__count' }, String(segment.badge)),
          ],
    ),
  })),
);

defineExpose({
  tabId: (value: string) => `${baseId.value}-tab-${value}`,
  panelId: (value: string) => `${baseId.value}-panel-${value}`,
});
</script>

<template>
  <AntSegmented
    v-model:value="model"
    class="a-segmented"
    :aria-label="ariaLabel"
    :options="options"
    :size="antdSize"
  />
</template>
