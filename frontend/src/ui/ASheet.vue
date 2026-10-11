<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    width?: number | string;
    closeOnOverlay?: boolean;
    viewport?: boolean;
    confirmClose?: () => boolean | Promise<boolean>;
  }>(),
  {
    closeOnOverlay: true,
    viewport: false,
  },
);

const open = defineModel<boolean>('open', { default: false });

const panelWidth = computed(() => {
  if (props.viewport) return 'calc(100vw - 48px)';
  if (props.width == null) return 560;
  return props.width;
});

async function requestClose() {
  if (props.confirmClose && !(await props.confirmClose())) return;
  open.value = false;
}

function onUpdateOpen(next: boolean) {
  if (next) {
    open.value = true;
    return;
  }
  void requestClose();
}
</script>

<template>
  <a-modal
    class="a-sheet"
    :wrap-class-name="viewport ? 'a-sheet--viewport' : undefined"
    :open="open"
    :title="title"
    :width="panelWidth"
    :mask-closable="closeOnOverlay"
    :footer="$slots.footer ? undefined : null"
    destroy-on-close
    @update:open="onUpdateOpen"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </a-modal>
</template>

<style>
.a-sheet .ant-modal-body {
  max-height: calc(100dvh - 220px);
  overflow: auto;
}

/* 标题与第一个字段之间留出分组感（antd 默认只有 8px，几乎贴在一起） */
.ant-modal.a-sheet .ant-modal-header {
  margin-bottom: var(--space-5);
}

/* 直接放在弹窗里的表单行（不经 AFormGrid）与网格内的行用同一行距 */
.ant-modal-wrap:not(.a-sheet--viewport) .a-sheet .ant-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
