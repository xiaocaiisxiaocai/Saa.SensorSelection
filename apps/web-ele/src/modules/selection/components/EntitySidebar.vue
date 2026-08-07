<script lang="ts" setup>
import type { EntityGroup } from '../data.js';

import { computed, ref, watch } from 'vue';

import { ChevronDown, Search } from 'lucide-vue-next';

const props = defineProps<{
  groups: EntityGroup[];
  label: string;
  selected: string;
}>();

const emit = defineEmits<{
  select: [payload: { category: string; item: string }];
}>();

const query = ref('');
const expanded = ref(
  new Set(props.groups.slice(0, 1).map((group) => group.name)),
);

const visibleGroups = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return props.groups;
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.toLocaleLowerCase('zh-CN').includes(value),
      ),
    }))
    .filter((group) => group.items.length > 0);
});

watch(query, (value) => {
  if (value.trim()) {
    expanded.value = new Set(visibleGroups.value.map((group) => group.name));
  }
});

function toggle(groupName: string) {
  const next = new Set(expanded.value);
  if (next.has(groupName)) next.delete(groupName);
  else next.add(groupName);
  expanded.value = next;
}
</script>

<template>
  <aside :aria-label="`${props.label}列表`" class="entity-sidebar">
    <label class="entity-filter">
      <Search :size="16" aria-hidden="true" />
      <input
        v-model="query"
        :aria-label="`搜索${props.label}`"
        :placeholder="`搜索${props.label}...`"
        type="search"
      />
    </label>

    <div v-if="visibleGroups.length > 0" class="entity-groups">
      <section
        v-for="group in visibleGroups"
        :key="group.name"
        class="entity-group"
      >
        <button
          :aria-expanded="expanded.has(group.name)"
          class="entity-group__toggle"
          type="button"
          @click="toggle(group.name)"
        >
          <ChevronDown
            :class="{ 'is-collapsed': !expanded.has(group.name) }"
            :size="15"
            aria-hidden="true"
          />
          <span>{{ group.name }}</span>
          <span class="entity-group__count">{{ group.items.length }}</span>
        </button>
        <div v-show="expanded.has(group.name)" class="entity-group__items">
          <button
            v-for="item in group.items"
            :key="item"
            :aria-current="selected === item ? 'page' : undefined"
            :class="{ active: selected === item }"
            type="button"
            @click="emit('select', { category: group.name, item })"
          >
            {{ item }}
          </button>
        </div>
      </section>
    </div>
    <div v-else class="entity-empty">没有匹配“{{ query.trim() }}”的结果</div>
  </aside>
</template>
