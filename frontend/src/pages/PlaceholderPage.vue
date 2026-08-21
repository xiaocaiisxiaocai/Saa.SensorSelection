<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : '页面',
);
</script>

<template>
  <section class="placeholder">
    <p class="placeholder__kicker">Phase 3</p>
    <h1>{{ title }}</h1>
    <p>登录、权限与后端状态已经接通。业务表格会在下一阶段按页接入。</p>
  </section>
</template>

<style scoped>
.placeholder {
  display: grid;
  gap: var(--space-3);
  max-width: 40rem;
}

.placeholder__kicker {
  margin: 0;
  font: var(--text-caption);
  color: var(--sys-blue);
  letter-spacing: var(--tracking-caption);
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font: var(--text-title-1);
  letter-spacing: var(--tracking-title-1);
}

p {
  margin: 0;
  font: var(--text-body);
  color: var(--label-2);
}
</style>
