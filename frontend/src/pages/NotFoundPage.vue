<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <a-result
    class="missing"
    status="404"
    title="未找到页面"
    sub-title="这个地址不在感应器选型软件里。"
  >
    <template #extra>
      <a-button type="primary" @click="router.push('/selection/customer')">
        返回客户/制程
      </a-button>
    </template>
  </a-result>
</template>

<style scoped>
.missing {
  height: 100%;
  overflow: auto;
  background: var(--color-bg-container);
  border-radius: var(--radius-lg);
}
</style>
