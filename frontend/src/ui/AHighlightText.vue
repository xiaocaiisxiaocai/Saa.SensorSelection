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

  // Include individual words for values rendered across separate fields, such
  // as a sensor's brand and model. Escape all input: search text is never regex.
  const terms = [...new Set([needle, ...needle.split(/\s+/u)])]
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(terms.join('|'), 'giu');
  const result: TextPart[] = [];
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) {
      result.push({ highlighted: false, text: source.slice(cursor, index) });
    }
    const end = index + match[0].length;
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

<style scoped src="./AHighlightText.css"></style>
