<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import BrandMark from '@/shell/BrandMark.vue';
import { navGroupsFor } from '@/shell/nav';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const groups = computed(() => navGroupsFor(auth.permissions));
</script>

<template>
  <nav class="app-nav" aria-label="主导航">
    <RouterLink class="app-nav__brand" to="/selection/customer">
      <BrandMark />
      <span class="app-nav__name">感应器选型</span>
    </RouterLink>
    <a-menu theme="dark" mode="inline" :selected-keys="[route.path]">
      <a-menu-item-group
        v-for="group in groups"
        :key="group.id"
        :title="group.label"
      >
        <a-menu-item v-for="item in group.items" :key="item.to">
          <RouterLink :to="item.to">{{ item.label }}</RouterLink>
        </a-menu-item>
      </a-menu-item-group>
    </a-menu>
  </nav>
</template>

<style scoped>
.app-nav__brand {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  height: var(--header-height);
  padding: 0 var(--space-6);
  overflow: hidden;
  color: var(--layout-sider-text-active);
  text-decoration: none;
  white-space: nowrap;
}

.app-nav__brand :deep(.brand-mark) {
  filter: brightness(0) invert(1);
}

/* 导航链接铺满整个菜单项：点击热区与菜单项一致，键盘焦点可见 */
.app-nav :deep(.ant-menu-title-content > a) {
  display: block;
}

.app-nav :deep(.ant-menu-title-content > a:focus-visible) {
  outline: 2px solid var(--color-primary-border);
  outline-offset: 2px;
}

.app-nav__name {
  font: var(--font-heading-5);
}
</style>
