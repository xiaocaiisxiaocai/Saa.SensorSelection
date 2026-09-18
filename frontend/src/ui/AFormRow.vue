<script setup lang="ts">
import { computed, nextTick, provide, ref, useId, watch } from 'vue';

import { formRowKey } from './form-context';

const props = defineProps<{
  error?: string;
  hint?: string;
  label: string;
  required?: boolean;
  wide?: boolean;
}>();

const controlId = useId();
const labelId = `${controlId}-label`;
const messageId = `${controlId}-message`;
const root = ref<HTMLElement | null>(null);

const describedBy = computed(() =>
  props.error || props.hint ? messageId : undefined,
);
const invalid = computed(() => Boolean(props.error));
const required = computed(() => Boolean(props.required));

provide(formRowKey, {
  describedBy,
  id: controlId,
  labelId,
  invalid,
  required,
});

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), select:not([disabled]), button:not([disabled])';

// 校验失败后，把焦点移到文档中第一个出现错误的字段，而不是留在“保存”
// 按钮上——键盘用户才知道具体是哪一项没填对。只对“从没错→有错”的
// 那一次转变生效，避免重复提交同一个错误时反复抢焦点。
watch(
  () => props.error,
  async (next, prev) => {
    if (!next || prev) return;
    await nextTick();
    const container = root.value?.closest<HTMLElement>(
      '.a-sheet, form, [data-form-scope]',
    );
    const scope = container ?? document;
    const firstInvalid = scope.querySelector<HTMLElement>(
      '.a-form-row--invalid',
    );
    if (firstInvalid !== root.value) return;
    root.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  },
);
</script>

<template>
  <div
    ref="root"
    class="a-form-row"
    :class="{ 'a-form-row--wide': wide, 'a-form-row--invalid': invalid }"
  >
    <label :id="labelId" class="a-form-row__label" :for="controlId">
      {{ label }}
      <span v-if="required" class="a-form-row__req" aria-hidden="true">*</span>
      <span v-if="required" class="visually-hidden">必填</span>
    </label>
    <slot />
    <p v-if="error" :id="messageId" class="a-form-row__error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="messageId" class="a-form-row__hint">{{ hint }}</p>
    <span v-else class="a-form-row__message-spacer" aria-hidden="true" />
  </div>
</template>

<style scoped>
.a-form-row {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  min-width: 0;
}

.a-form-row--wide {
  grid-column: 1 / -1;
}

.a-form-row__label {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  font: var(--text-control-em);
  color: var(--label);
}

/*
 * 红色星号而不是小圆点：原来是紧贴标签的 4px 实心圆点（「状态•」），
 * 既没有间距也没有公认语义，看上去更像排版失误。星号是通用的必填记号。
 * 读屏另有 .visually-hidden 的「必填」，所以这里 aria-hidden。
 */
.a-form-row__req {
  align-self: flex-start;
  margin-left: var(--space-1);
  font: var(--text-caption);
  line-height: 1.2;
  color: var(--sys-red);
}

.a-form-row__error {
  margin: 0;
  font: var(--text-caption);
  color: var(--sys-red);
  letter-spacing: var(--tracking-caption);
}

.a-form-row__hint {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}

/* 始终占住一行说明文字的高度，避免校验出错时表单突然变高、
   把下面的按钮往下推。 */
.a-form-row__message-spacer {
  display: block;
  height: 18px;
}
</style>
