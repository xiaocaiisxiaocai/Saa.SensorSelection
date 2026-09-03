<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  text?: string | null;
  query?: string | null;
}>();

type TextPart = {
  highlighted: boolean;
  text: string;
};

const parts = computed<TextPart[]>(() => {
  const source = String(props.text ?? '');
  const needle = String(props.query ?? '').trim();
  if (!source || !needle) return [{ highlighted: false, text: source }];

  const normalizedSource = source.toLocaleLowerCase('zh-CN');
  const normalizedNeedle = needle.toLocaleLowerCase('zh-CN');
  const result: TextPart[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const index = normalizedSource.indexOf(normalizedNeedle, cursor);
    if (index < 0) break;
    if (index > cursor) {
      result.push({ highlighted: false, text: source.slice(cursor, index) });
    }
    const end = index + needle.length;
    result.push({ highlighted: true, text: source.slice(index, end) });
    cursor = end;
  }

  if (cursor < source.length) {
    result.push({ highlighted: false, text: source.slice(cursor) });
  }

  return result.length ? result : [{ highlighted: false, text: source }];
});
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <mark v-if="part.highlighted" class="a-highlight-text">{{
      part.text
    }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<style scoped>
.a-highlight-text {
  padding: 0 var(--space-1);
  margin: 0 calc(var(--space-1) * -0.5);
  color: inherit;
  background: var(--sys-yellow-fill);
  border-radius: var(--radius-xs);
}
</style>
