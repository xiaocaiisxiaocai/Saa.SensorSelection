<script setup lang="ts">
import RouteTabs, { type RouteTab } from '@/shell/RouteTabs.vue';

/*
 * 「客户/制程」：一个菜单，两张 Tab。客户、制程仍是各自的子路由
 * （/selection/customer、/selection/process），切换、记住位置和外观都在 RouteTabs 里。
 */
const TABS: RouteTab[] = [
  { label: '客户', path: '/selection/customer' },
  { label: '制程', path: '/selection/process' },
];
</script>

<template>
  <RouteTabs :tabs="TABS" />
</template>
