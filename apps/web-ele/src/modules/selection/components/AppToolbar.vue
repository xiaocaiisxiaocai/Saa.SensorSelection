<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Search, X } from 'lucide-vue-next';

const props = defineProps<{
  subtitle?: string;
  title: string;
}>();

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
    inputRef.value?.focus();
    return;
  }
  router.push({ name: 'SelectionSearch', query: { q: value } });
}

function clearSearch() {
  query.value = '';
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
  <header class="selection-toolbar">
    <div class="selection-toolbar__heading">
      <h1>{{ props.title }}</h1>
      <p v-if="props.subtitle">{{ props.subtitle }}</p>
    </div>
    <form class="selection-search" role="search" @submit.prevent="submitSearch">
      <Search :size="17" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="query"
        aria-label="全局搜索"
        autocomplete="off"
        placeholder="搜索型号、品牌、机型、客户或制程"
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
      <button class="search-submit" type="submit">搜索</button>
    </form>
  </header>
</template>
