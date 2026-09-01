<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';

import AButton from './AButton.vue';
import AIconButton from './AIconButton.vue';
import ASelect from './ASelect.vue';
import { pageItems } from './page-items';
import type { SelectOption } from './types';

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
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.total / pageSize.value)),
);
const items = computed(() => pageItems(page.value, pageCount.value));
const sizeOptions = computed<SelectOption[]>(() =>
  props.pageSizes.map((size) => ({
    label: `${size} 条/页`,
    value: size,
  })),
);

function go(next: number) {
  const clamped = Math.min(Math.max(next, 1), pageCount.value);
  if (clamped !== page.value) {
    page.value = clamped;
  }
}

function onPageSizeChange(value: string | number | null) {
  if (typeof value !== 'number') {
    return;
  }

  pageSize.value = value;
  const last = Math.max(1, Math.ceil(props.total / value));
  if (page.value > last) {
    page.value = last;
  }
}
</script>

<template>
  <nav v-if="visible" class="a-pagination" aria-label="分页">
    <div class="a-pagination__meta">
      <span>共 {{ total }} 条</span>
      <div class="a-pagination__size">
        <ASelect
          :model-value="pageSize"
          size="small"
          :options="sizeOptions"
          aria-label="每页显示数量"
          @update:model-value="onPageSizeChange"
        />
      </div>
    </div>
    <div class="a-pagination__pages">
      <AIconButton
        :icon="ChevronLeft"
        label="上一页"
        size="small"
        :disabled="page <= 1"
        @click="go(page - 1)"
      />
      <template v-for="(item, index) in items" :key="`${item}-${index}`">
        <span v-if="item === 'ellipsis'" class="a-pagination__gap">…</span>
        <AButton
          v-else
          size="small"
          :variant="item === page ? 'filled' : 'borderless'"
          :aria-current="item === page ? 'page' : undefined"
          @click="go(item)"
        >
          {{ item }}
        </AButton>
      </template>
      <AIconButton
        :icon="ChevronRight"
        label="下一页"
        size="small"
        :disabled="page >= pageCount"
        @click="go(page + 1)"
      />
    </div>
  </nav>
</template>

<style scoped>
.a-pagination {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  font: var(--text-caption);
  color: var(--label-2);
  letter-spacing: var(--tracking-caption);
}

.a-pagination__meta,
.a-pagination__pages {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.a-pagination__size {
  width: calc(var(--space-9) * 3);
}

.a-pagination__gap {
  width: var(--control-height-sm);
  text-align: center;
}
</style>
