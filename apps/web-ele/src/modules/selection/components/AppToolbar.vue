<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ElMessage } from 'element-plus';
import { Search, X } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const query = ref(
  route.name === 'SelectionSearch' ? String(route.query.q || '') : '',
);
const inputRef = ref<HTMLInputElement>();

watch(
  () => route.query.q,
  (value) => {
    if (route.name === 'SelectionSearch') query.value = String(value || '');
  },
);

function submitSearch() {
  const value = query.value.trim();
  if (!value) {
    ElMessage.warning('请输入搜索关键词');
    inputRef.value?.focus();
    return;
  }
  router.push({ name: 'SelectionSearch', query: { q: value } });
}

function clearSearch() {
  query.value = '';
  if (route.name === 'SelectionSearch') {
    router.push({ name: 'SelectionCustomer' });
    return;
  }
  inputRef.value?.focus();
}

function handleShortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k')
    return;
  event.preventDefault();
  inputRef.value?.focus();
  inputRef.value?.select();
}

onMounted(() => window.addEventListener('keydown', handleShortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut));
</script>

<template>
  <form
    class="selection-search selection-search--header"
    role="search"
    @submit.prevent="submitSearch"
  >
    <Search :size="16" aria-hidden="true" />
    <input
      ref="inputRef"
      v-model="query"
      aria-label="全局搜索"
      autocomplete="off"
      placeholder="搜索型号、品牌、机型、客户或制程"
      title="快捷键 Ctrl+K"
      type="search"
    />
    <button
      v-if="query"
      aria-label="清除搜索"
      class="icon-button"
      title="清除搜索"
      type="button"
      @click="clearSearch"
    >
      <X :size="15" aria-hidden="true" />
    </button>
    <button aria-label="执行搜索" class="search-submit" type="submit">
      搜索
    </button>
  </form>
</template>
