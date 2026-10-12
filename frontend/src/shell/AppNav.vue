<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import BrandMark from '@/shell/BrandMark.vue';
import { activeNavKey, navGroupsFor } from '@/shell/nav';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const groups = computed(() => navGroupsFor(auth.permissions));
const selectedKeys = computed(() => {
  const key = activeNavKey(groups.value, route.path);
  return key ? [key] : [];
});
</script>

<template>
  <nav class="app-nav" aria-label="主导航">
    <RouterLink class="app-nav__brand" to="/selection/customer">
      <BrandMark />
      <span class="app-nav__name">感应器选型</span>
    </RouterLink>
    <a-menu
      theme="dark"
      mode="inline"
      :class="{ 'app-nav__menu--grouped': groups.length > 1 }"
      :selected-keys="selectedKeys"
    >
      <!-- 只有一个分组（未登录/无系统权限）时不显示分组标题，免得和品牌名重复 -->
      <template v-if="groups.length === 1">
        <a-menu-item v-for="item in groups[0].items" :key="item.to">
          <RouterLink :to="item.to">{{ item.label }}</RouterLink>
        </a-menu-item>
      </template>
      <template v-else>
        <a-menu-item-group
          v-for="group in groups"
          :key="group.id"
          :title="group.label"
        >
          <a-menu-item v-for="item in group.items" :key="item.to">
            <RouterLink :to="item.to">{{ item.label }}</RouterLink>
          </a-menu-item>
        </a-menu-item-group>
      </template>
    </a-menu>
  </nav>
</template>

<style scoped>
/* 品牌与分组标题共用一条左边缘（菜单项外边距 4px + 内边距 24px）；
   分组内的菜单项再缩进 16px，看得出从属关系 */
.app-nav {
  --nav-inset: calc(var(--space-2) + var(--space-7));
  --nav-indent: var(--space-5);
}

.app-nav__brand {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  height: var(--header-height);
  padding: 0 var(--nav-inset);
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

.app-nav :deep(.ant-menu) {
  padding-top: var(--space-2);
}

/* 分组标题与菜单项同字号，加粗并用与品牌名相同的实色，和普通菜单项拉开层级；
   后续分组上方留出间隔 */
.app-nav :deep(.ant-menu-item-group-title) {
  padding: var(--space-3) var(--nav-inset);
  font: var(--font-body-strong);
  color: var(--layout-sider-text-active);
}

.app-nav :deep(.ant-menu-item-group + .ant-menu-item-group) {
  margin-top: var(--space-5);
}

/* 菜单项缩进由这里统一控制（覆盖 antd 按层级写的行内缩进）：
   只有一个分组时不显示分组标题，菜单项与品牌对齐；有分组时比分组标题多缩进一级 */
.app-nav :deep(.ant-menu-item) {
  padding-inline-start: var(--space-7) !important;
}

.app-nav :deep(.app-nav__menu--grouped .ant-menu-item) {
  padding-inline-start: calc(var(--space-7) + var(--nav-indent)) !important;
}
</style>
