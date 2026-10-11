<script setup lang="ts">
import { Pagination as AntPagination } from 'ant-design-vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    total: number;
    pageSizes?: number[];
  }>(),
  {
    pageSizes: () => [20, 50, 100],
  },
);

const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
const visible = computed(() => props.total > pageSize.value);

function onPageSizeChange(_page: number, size: number) {
  pageSize.value = size;
  const last = Math.max(1, Math.ceil(props.total / size));
  if (page.value > last) page.value = last;
}
</script>

<template>
  <nav v-if="visible" class="a-pagination" aria-label="分页">
    <AntPagination
      v-model:current="page"
      :page-size="pageSize"
      :page-size-options="pageSizes.map(String)"
      :show-size-changer="true"
      :show-total="(count: number) => `共 ${count} 条`"
      :total="total"
      @show-size-change="onPageSizeChange"
    />
  </nav>
</template>

<style scoped>
.a-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
