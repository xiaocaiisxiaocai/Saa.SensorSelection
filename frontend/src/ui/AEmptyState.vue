<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';
import { computed, markRaw, type Component } from 'vue';

const props = defineProps<{
  title: string;
  description?: string;
  icon?: Component;
}>();

const resolvedIcon = computed(() => markRaw(props.icon ?? Inbox));
</script>

<template>
  <div class="a-empty-state">
    <component
      :is="resolvedIcon"
      class="a-empty-state__icon"
      :size="48"
      :stroke-width="1.5"
      aria-hidden="true"
    />
    <p class="a-empty-state__title">{{ title }}</p>
    <p v-if="description" class="a-empty-state__description">{{ description }}</p>
    <div v-if="$slots.action" class="a-empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.a-empty-state {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
  text-align: center;
}

.a-empty-state__icon {
  color: var(--label-3);
}

.a-empty-state__title {
  margin: 0;
  font: var(--text-body);
  color: var(--label);
}

.a-empty-state__description {
  margin: 0;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}

.a-empty-state__action {
  margin-top: var(--space-2);
}
</style>
