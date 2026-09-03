<script setup lang="ts">
import type { BadgeTone } from './types';

withDefaults(
  defineProps<{
    label: string;
    tone?: BadgeTone;
  }>(),
  {
    tone: 'neutral',
  },
);
</script>

<template>
  <span class="a-badge" :class="`a-badge--${tone}`">{{ label }}</span>
</template>

<style scoped>
.a-badge {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  overflow: hidden;
  font: var(--text-caption);
  letter-spacing: var(--tracking-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--radius-pill);
}

.a-badge--neutral {
  color: var(--label-2);
  background: var(--fill-2);
  box-shadow: inset 0 0 0 0.5px var(--separator);
}

.a-badge--blue {
  color: var(--sys-blue);
  background: var(--sys-blue-fill);
}

.a-badge--green {
  color: var(--sys-green);
  background: var(--sys-green-fill);
}

.a-badge--orange {
  color: var(--sys-orange);
  background: var(--sys-orange-fill);
}

.a-badge--red {
  color: var(--sys-red);
  background: var(--sys-red-fill);
}

.a-badge--yellow {
  color: var(--sys-yellow);
  background: var(--sys-yellow-fill);
}

.a-badge--indigo {
  color: var(--sys-indigo);
  background: var(--sys-indigo-fill);
}
</style>
