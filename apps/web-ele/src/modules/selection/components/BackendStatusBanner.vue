<script lang="ts" setup>
import { computed } from 'vue';

import { ElAlert, ElButton } from 'element-plus';

import { useSelectionStore } from '../store';

const store = useSelectionStore();

const offline = computed(() => store.backendStatus === 'offline');
const message = computed(() => store.backendMessage);

function reconnect() {
  store.reconnect();
}
</script>

<template>
  <div class="backend-status-banner">
    <ElAlert
      v-if="offline"
      :closable="false"
      show-icon
      title="后端服务不可用，当前使用浏览器本地数据（仅本机可见）"
      type="warning"
    >
      <template #default>
        <ElButton plain size="small" type="primary" @click="reconnect">
          重新连接
        </ElButton>
      </template>
    </ElAlert>
    <ElAlert
      v-else-if="message"
      :closable="true"
      :title="message"
      show-icon
      type="info"
      @close="store.backendMessage = ''"
    />
  </div>
</template>

<style scoped>
.backend-status-banner {
  position: fixed;
  z-index: 2000;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: min(720px, calc(100vw - 32px));
}
</style>
