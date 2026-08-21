<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="missing">
    <h1>未找到页面</h1>
    <p>这个地址不在感应器选型软件里。</p>
    <RouterLink to="/selection/customer">返回客户管理</RouterLink>
  </section>
</template>

<style scoped>
.missing {
  display: grid;
  gap: var(--space-3);
  max-width: 36rem;
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
