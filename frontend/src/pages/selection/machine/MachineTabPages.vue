<script setup lang="ts">
import { Ellipsis, Plus } from 'lucide-vue-next';

import type { MachineTab, MachineTabPage } from '@/domain';

/**
 * 选中选单节点在当前一级 Tab 下的二级 Tab：直接在这里新建，每页有自己的
 * 选型表和示意图（在下方渲染）。可写时右侧有「新建二级 Tab」，每页的「…」菜单提供
 * 改名、左移、右移、删除。
 */
const props = defineProps<{
  tab: MachineTab;
  /** 选中节点在这个 Tab 下的二级 Tab */
  pages: readonly MachineTabPage[];
  /** 选中节点的显示名 */
  nodeName: string;
  activePageId: number | null;
  writable: boolean;
  /** 显示报告用的勾选框 */
  checkable: boolean;
  checked: ReadonlySet<number>;
}>();

type PageAction = 'delete' | 'left' | 'rename' | 'right';

const emit = defineEmits<{
  select: [pageId: number];
  check: [pageId: number, checked: boolean];
  add: [];
  action: [key: PageAction, page: MachineTabPage];
}>();

function menuFor(index: number) {
  return [
    { key: 'rename', label: '改名' },
    { key: 'left', label: '左移', disabled: index === 0 },
    {
      key: 'right',
      label: '右移',
      disabled: index === props.pages.length - 1,
    },
    { key: 'delete', label: '删除', danger: true },
  ];
}
</script>

<template>
  <!-- 一级 Tab（如「输送机构」）下面的二级 Tab -->
  <div
    class="machine-tab-pages"
    :aria-label="`${nodeName} 在 ${tab.name} 下的二级 Tab`"
  >
    <a-tabs
      v-if="pages.length"
      class="machine-sub-tabs"
      size="small"
      :active-key="activePageId === null ? undefined : String(activePageId)"
      @change="emit('select', Number($event))"
    >
      <a-tab-pane v-for="(page, index) in pages" :key="String(page.id)">
        <template #tab>
          <span class="machine-sub-tab">
            <a-checkbox
              v-if="checkable"
              :checked="checked.has(page.id)"
              :aria-label="`报告中包含 ${page.name}`"
              @click.stop
              @change="emit('check', page.id, $event.target.checked)"
            />
            <span class="machine-sub-tab__name">{{ page.name }}</span>
            <a-dropdown v-if="writable" :trigger="['click']">
              <a-button
                class="machine-sub-tab__more"
                type="text"
                size="small"
                :aria-label="`二级 Tab ${page.name} 的更多操作`"
                @click.stop
              >
                <template #icon><Ellipsis :size="14" /></template>
              </a-button>
              <template #overlay>
                <a-menu
                  @click="
                    ({ key }: { key: string | number }) =>
                      emit('action', key as PageAction, page)
                  "
                >
                  <a-menu-item
                    v-for="item in menuFor(index)"
                    :key="item.key"
                    :disabled="item.disabled"
                    :danger="item.danger"
                  >
                    {{ item.label }}
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </span>
        </template>
      </a-tab-pane>
      <template v-if="writable" #rightExtra>
        <a-button
          type="text"
          size="small"
          aria-label="新建二级 Tab"
          @click="emit('add')"
        >
          <template #icon><Plus :size="14" /></template>
          新建二级 Tab
        </a-button>
      </template>
    </a-tabs>
    <a-empty v-else class="machine-tab-pages__empty">
      <template #description>
        「{{ nodeName }}」在「{{ tab.name }}」下还没有二级 Tab
      </template>
      <template v-if="writable" #default>
        <a-button type="primary" @click="emit('add')">新建二级 Tab</a-button>
      </template>
    </a-empty>
  </div>
</template>

<style scoped src="./MachineTabPages.css"></style>
