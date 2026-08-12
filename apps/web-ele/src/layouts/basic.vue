<script lang="ts" setup>
import { BasicLayout } from '@vben/layouts';

import AppToolbar from '#/modules/selection/components/AppToolbar.vue';
</script>

<template>
  <BasicLayout>
    <template #header-left-100>
      <AppToolbar />
    </template>
  </BasicLayout>
</template>
