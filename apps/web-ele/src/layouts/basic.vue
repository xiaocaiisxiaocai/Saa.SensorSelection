<script lang="ts" setup>
import { onMounted } from 'vue';

import { BasicLayout } from '@vben/layouts';

import AppToolbar from '#/modules/selection/components/AppToolbar.vue';
import BackendLoginDialog from '#/modules/selection/components/BackendLoginDialog.vue';
import BackendStatusBanner from '#/modules/selection/components/BackendStatusBanner.vue';
import { useSelectionStore } from '#/modules/selection/store';

const store = useSelectionStore();

onMounted(() => {
  store.ensureBackendInit();
});
</script>

<template>
  <BasicLayout>
    <template #header-left-100>
      <AppToolbar />
    </template>
  </BasicLayout>
  <BackendStatusBanner />
  <BackendLoginDialog />
</template>
