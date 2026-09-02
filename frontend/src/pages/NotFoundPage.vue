<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="missing">
    <h1>未找到页面</h1>
    <p>这个地址不在感应器选型软件里。</p>
    <RouterLink class="missing__link" to="/selection/customer">
      返回客户管理
    </RouterLink>
  </section>
</template>

<style scoped>
.missing {
  display: grid;
  gap: var(--space-4);
  align-content: start;
  justify-items: start;
  max-width: 36rem;
  padding: var(--space-6) 0;
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

.missing__link {
  display: inline-flex;
  align-items: center;
  height: var(--control-height-md);
  padding: 0 var(--control-pad-md);
  font: var(--text-control-em);
  color: var(--label-on-color);
  text-decoration: none;
  background: var(--sys-blue-solid);
  border-radius: var(--radius-md);
  transition: filter var(--dur-1) var(--ease-out);
}

.missing__link:hover {
  filter: brightness(1.08);
}
</style>
