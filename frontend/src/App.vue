<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppShell from '@/shell/AppShell.vue';
import { AAlertHost, AToastHost } from '@/ui';

const route = useRoute();
const useShell = computed(() => route.meta.layout !== 'none');
</script>

<template>
  <AppShell v-if="useShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
  <AAlertHost />
  <AToastHost />
</template>
