<script setup lang="ts">
import { Tooltip as AntTooltip } from 'ant-design-vue';

import type { PopoverSide } from './types';

withDefaults(
  defineProps<{
    content?: string;
    side?: PopoverSide;
    disabled?: boolean;
  }>(),
  {
    side: 'top',
  },
);

const open = defineModel<boolean>('open');
</script>

<template>
  <AntTooltip
    v-model:open="open"
    :title="disabled ? undefined : content"
    :placement="side"
  >
    <slot name="trigger">
      <slot />
    </slot>
  </AntTooltip>
</template>
