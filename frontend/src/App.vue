<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppShell from '@/shell/AppShell.vue';

const route = useRoute();
const useShell = computed(() => route.meta.layout !== 'none');
const antdTheme = {
  token: {
    borderRadius: 6,
    colorPrimary: '#1677ff',
  },
};
</script>

<template>
  <a-config-provider
    :auto-insert-space-in-button="false"
    :locale="zhCN"
    :theme="antdTheme"
  >
    <AppShell v-if="useShell">
      <RouterView />
    </AppShell>
    <RouterView v-else />
  </a-config-provider>
</template>
