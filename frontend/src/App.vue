<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppShell from '@/shell/AppShell.vue';
import { appTheme } from '@/styles/theme';

const route = useRoute();
const useShell = computed(() => route.meta.layout !== 'none');
</script>

<template>
  <a-config-provider
    :auto-insert-space-in-button="false"
    :locale="zhCN"
    :theme="appTheme"
  >
    <AppShell v-if="useShell">
      <RouterView />
    </AppShell>
    <RouterView v-else />
  </a-config-provider>
</template>
