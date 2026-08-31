<script setup lang="ts">
import { Upload } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import { describeFileRule, validateFile, type FileDropRule } from './file-drop';
import { toast } from './toast';

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxBytes?: number;
    mimeTypes?: string[];
    extensions?: string[];
    multiple?: boolean;
    disabled?: boolean;
    sizeMessage?: string;
    typeMessage?: string;
    title?: string;
    hint?: string;
  }>(),
  {
    sizeMessage: '文件大小超出限制',
    typeMessage: '文件类型不受支持',
    title: '将文件拖到此处，或点击选择',
  },
);

const emit = defineEmits<{
  files: [files: File[]];
}>();

const dragging = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
let dragDepth = 0;

const rule = computed<FileDropRule>(() => ({
  accept: props.accept,
  maxBytes: props.maxBytes,
  mimeTypes: props.mimeTypes,
  extensions: props.extensions,
}));

const hintText = computed(() => props.hint ?? describeFileRule(rule.value));

function takeFiles(list: FileList | File[] | null) {
  if (!list || props.disabled) {
    return;
  }

  const files = [...list];
  if (inputEl.value) {
    inputEl.value.value = '';
  }

  const accepted: File[] = [];
  for (const file of files) {
    const reason = validateFile(file, rule.value);
    if (reason === 'size') {
      toast.error(props.sizeMessage);
      continue;
    }
    if (reason === 'type') {
      toast.error(props.typeMessage);
      continue;
    }
    accepted.push(file);
  }

  if (accepted.length > 0) {
    emit('files', accepted);
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  dragDepth = 0;
  dragging.value = false;
  takeFiles(event.dataTransfer?.files ?? null);
}

function onDragEnter(event: DragEvent) {
  event.preventDefault();
  dragDepth += 1;
  dragging.value = true;
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dragging.value = false;
  }
}

function openPicker() {
  if (!props.disabled) {
    inputEl.value?.click();
  }
}
</script>

<template>
  <div
    class="a-file-drop"
    :class="{
      'a-file-drop--active': dragging,
      'a-file-drop--disabled': disabled,
    }"
    role="button"
    tabindex="0"
    :aria-disabled="disabled ? true : undefined"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <input
      ref="inputEl"
      class="visually-hidden"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @click.stop
      @change="takeFiles(($event.target as HTMLInputElement).files)"
    >
    <Upload :size="24" :stroke-width="1.5" aria-hidden="true" />
    <p class="a-file-drop__title">{{ title }}</p>
    <p v-if="hintText" class="a-file-drop__hint">{{ hintText }}</p>
  </div>
</template>

<style scoped>
.a-file-drop {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  padding: var(--space-7) var(--space-6);
  color: var(--label-2);
  text-align: center;
  cursor: pointer;
  background: var(--bg-content);
  border: var(--space-1) dashed var(--separator);
  border-radius: var(--radius-xl);
}

.a-file-drop--active {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
  border-color: var(--sys-blue);
}

.a-file-drop--disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.a-file-drop__title {
  margin: 0;
  font: var(--text-control-em);
  color: var(--label);
}

.a-file-drop--active .a-file-drop__title {
  color: var(--sys-blue);
}

.a-file-drop__hint {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-3);
  letter-spacing: var(--tracking-caption);
}
</style>
