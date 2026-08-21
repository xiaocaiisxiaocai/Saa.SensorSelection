<script setup lang="ts">
import { computed, markRaw } from 'vue';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui';

import type { MenuEntry, MenuItem, PopoverAlign, PopoverSide } from './types';

const props = withDefaults(
  defineProps<{
    items: MenuEntry[];
    side?: PopoverSide;
    align?: PopoverAlign;
  }>(),
  {
    side: 'bottom',
    align: 'start',
  },
);

const emit = defineEmits<{
  select: [id: string];
}>();

const resolved = computed(() =>
  props.items.map((entry) => {
    if (isSeparator(entry)) {
      return entry;
    }

    return {
      ...entry,
      icon: entry.icon ? markRaw(entry.icon) : undefined,
    };
  }),
);

function isSeparator(entry: MenuEntry): entry is { type: 'separator' } {
  return entry.type === 'separator';
}

function onSelect(item: MenuItem) {
  emit('select', item.id);
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="a-menu"
        :side="side"
        :align="align"
        :side-offset="8"
        :collision-padding="8"
      >
        <template
          v-for="(entry, index) in resolved"
          :key="isSeparator(entry) ? `sep-${index}` : entry.id"
        >
          <DropdownMenuSeparator
            v-if="isSeparator(entry)"
            class="a-menu-separator"
          />
          <DropdownMenuItem
            v-else
            class="a-menu-item"
            :class="{ 'a-menu-item--destructive': entry.destructive }"
            :disabled="entry.disabled"
            @select="onSelect(entry)"
          >
            <component
              :is="entry.icon"
              v-if="entry.icon"
              class="a-menu-item__icon"
              :size="16"
              :stroke-width="1.5"
            />
            <span class="a-menu-item__label">{{ entry.label }}</span>
            <kbd v-if="entry.shortcut" class="a-menu-item__shortcut">
              {{ entry.shortcut }}
            </kbd>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style>
/* Teleported to document.body — do not scope. */
.a-menu {
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  min-width: calc(var(--space-9) * 4);
  max-width: min(20rem, calc(100vw - var(--space-8)));
  max-height: min(
    calc(var(--space-9) * 8),
    var(--reka-dropdown-menu-content-available-height, 100vh)
  );
  padding: var(--space-1);
  overflow: auto;
  color: var(--label);
  background: var(--material-menu-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-3), inset 0 0 0 0.5px var(--separator);
  backdrop-filter: var(--material-blur);
  -webkit-backdrop-filter: var(--material-blur);
  transform-origin: var(--reka-dropdown-menu-content-transform-origin);
}

.a-menu[data-state='open'] {
  animation: a-menu-in var(--dur-2) var(--ease-out);
}

@keyframes a-menu-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .a-menu[data-state='open'] {
    animation: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .a-menu {
    background: var(--bg-elevated);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
