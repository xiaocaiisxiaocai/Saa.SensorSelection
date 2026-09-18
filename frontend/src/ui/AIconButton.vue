<script setup lang="ts">
import type { Component } from 'vue';
import { computed, markRaw } from 'vue';

import ATooltip from './ATooltip.vue';
import type { IconButtonSize, IconButtonVariant, PopoverSide } from './types';

const props = withDefaults(
  defineProps<{
    icon: Component;
    label: string;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    side?: PopoverSide;
    disabled?: boolean;
  }>(),
  {
    variant: 'borderless',
    size: 'medium',
    side: 'top',
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

if (import.meta.env.DEV && props.label.trim() === '') {
  throw new Error('AIconButton: label is required');
}

const iconSize = computed(() => (props.size === 'small' ? 16 : 18));
const resolvedIcon = computed(() => markRaw(props.icon));

function onClick(event: MouseEvent) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }

  emit('click', event);
}
</script>

<template>
  <span class="a-icon-button-host">
    <ATooltip :content="label" :side="side">
      <template #trigger>
        <button
          class="a-icon-button"
          :class="[`a-icon-button--${variant}`, `a-icon-button--${size}`]"
          type="button"
          :aria-label="label"
          :disabled="disabled"
          @click="onClick"
        >
          <component :is="resolvedIcon" :size="iconSize" :stroke-width="1.5" />
        </button>
      </template>
    </ATooltip>
  </span>
</template>

<style scoped>
.a-icon-button-host {
  display: inline-flex;
  line-height: 0;
  vertical-align: middle;
}

.a-icon-button {
  position: relative;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  transition:
    background-color var(--dur-1) var(--ease-out),
    color var(--dur-1) var(--ease-out),
    opacity var(--dur-1) var(--ease-out);
}

.a-icon-button--small {
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--radius-sm);
}

.a-icon-button--medium {
  width: var(--control-height-md);
  height: var(--control-height-md);
  border-radius: var(--radius-md);
}

.a-icon-button--large {
  width: var(--control-height-lg);
  height: var(--control-height-lg);
  border-radius: var(--radius-md);
}

/*
 * 这里曾经用一个比按钮更大的绝对定位 ::before 来外扩点击热区（small 36px、
 * 其余 --touch-target 44px）。那样做有两个问题：
 *
 * 1. 绝对定位子元素会计入祖先的「可滚动溢出」。按钮贴着滚动容器右/下边缘时，
 *    探出去的 5~7px 会让 overflow:auto 的容器凭空长出滚动条——分页条上的
 *    上/下一页按钮就把 .selection-page 顶出了一条纵向滚动条。
 * 2. 恰恰在制造溢出的右/下两个方向，热区是点不到的：那块区域落在滚动容器的
 *    可视区之外，elementFromPoint 命中的是容器本身而不是按钮。
 *
 * 按钮自身尺寸（small 26px、其余 ≥30px）已经满足设计规范和 test:ui 强制的
 * 24px 下限，所以直接以按钮本体作为热区，不再外扩。
 */

.a-icon-button--borderless {
  color: var(--label-2);
  background: transparent;
}

.a-icon-button--borderless:hover:not(:disabled) {
  background: var(--fill-4);
}

.a-icon-button--plain {
  color: var(--label);
  background: var(--bg-content);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.a-icon-button--plain:hover:not(:disabled) {
  background: var(--fill-4);
}

.a-icon-button--destructive {
  color: var(--sys-red);
  background: transparent;
}

/* 破坏性图标按钮禁用时转中性灰，不保留红色警示 */
.a-icon-button--destructive:disabled {
  color: var(--label-3);
  background: transparent;
}

.a-icon-button--destructive:hover:not(:disabled) {
  background: var(--sys-red-fill);
}

.a-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.a-icon-button:active:not(:disabled) {
  opacity: 0.7;
}
</style>
