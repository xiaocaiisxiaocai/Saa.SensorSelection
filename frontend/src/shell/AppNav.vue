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

<style scoped src="./AppNav.css"></style>
