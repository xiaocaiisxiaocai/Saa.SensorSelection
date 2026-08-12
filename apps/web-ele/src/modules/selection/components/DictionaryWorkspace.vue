<script lang="ts" setup>
import type {
  DictionaryItem,
  MachineSectionItem,
  MachineSectionKind,
} from '../data.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import { DICTIONARY_DEFINITIONS } from '../data.js';
import { useSelectionStore } from '../store';

const MACHINE_SECTION_CODE = 'machine-section';

const KIND_LABELS: Record<MachineSectionKind, string> = {
  notes: '注意事项',
  structure: '结构',
};

const store = useSelectionStore();
const activeCode = ref(DICTIONARY_DEFINITIONS[0]?.code || '');
const editId = ref<number>();
const form = reactive({
  kind: 'structure' as MachineSectionKind,
  name: '',
  sort: 1,
});

const isMachineSection = computed(
  () => activeCode.value === MACHINE_SECTION_CODE,
);

const items = computed(() => {
  if (isMachineSection.value) return store.globalMachineSections;
  return activeCode.value ? store.dictionaryItems(activeCode.value) : [];
});

const editingSection = computed(() => {
  if (!isMachineSection.value || editId.value === undefined) return undefined;
  return store.globalMachineSections.find((item) => item.id === editId.value);
});

/** 新建仅结构；编辑 locked/notes 时禁止改类型 */
const kindSelectDisabled = computed(() => {
  if (!isMachineSection.value) return true;
  if (editId.value === undefined) return true;
  const section = editingSection.value;
  return Boolean(section?.locked || section?.kind === 'notes');
});

watch(activeCode, () => {
  resetForm();
});

function kindLabel(kind: MachineSectionKind) {
  return KIND_LABELS[kind] || kind;
}

function isSectionLocked(item: MachineSectionItem) {
  return Boolean(item.locked || item.kind === 'notes');
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    kind: 'structure' as MachineSectionKind,
    name: '',
    sort: items.value.length + 1,
  });
}

function editItem(item: DictionaryItem | MachineSectionItem) {
  editId.value = item.id;
  let kind: MachineSectionKind = 'structure';
  if (isMachineSection.value && 'kind' in item && item.kind === 'notes') {
    kind = 'notes';
  }
  Object.assign(form, {
    kind,
    name: item.name,
    sort: item.sort,
  });
}

function failureMessage(reason: string) {
  if (reason === 'duplicate') return '该分类名称已存在';
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  if (reason === 'stale') return '该分类已被删除';
  if (reason === 'validation') return '请填写有效的分类名称';
  if (reason === 'not-empty') return '请先清空各机型下该 Tab 的数据';
  return '保存失败，请重试';
}

function saveItem() {
  if (!activeCode.value) return;

  if (isMachineSection.value) {
    const result = store.saveGlobalMachineSection(
      {
        kind: editId.value === undefined ? 'structure' : form.kind,
        name: form.name.trim(),
        sort: form.sort,
      },
      editId.value,
    );
    if (!result.ok) {
      ElMessage.error(failureMessage(result.reason));
      return;
    }
    ElMessage.success(editId.value ? 'Tab 已更新' : 'Tab 已新增');
    resetForm();
    return;
  }

  const result = store.saveDictionaryItem(
    activeCode.value,
    {
      name: form.name.trim(),
      sort: form.sort,
    },
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success(editId.value ? '分类已更新' : '分类已新增');
  resetForm();
}

async function deleteItem(item: DictionaryItem | MachineSectionItem) {
  if (!activeCode.value) return;

  if (isMachineSection.value) {
    const section = item as MachineSectionItem;
    if (isSectionLocked(section)) {
      ElMessage.error('注意事项 Tab 不可删除');
      return;
    }
    try {
      await ElMessageBox.confirm(
        `确认删除“${section.name}”吗？删除前需清空各机型下该 Tab 的数据。`,
        '删除 Tab',
        {
          cancelButtonText: '取消',
          confirmButtonText: '删除',
          type: 'warning',
        },
      );
    } catch {
      return;
    }
    const result = store.deleteGlobalMachineSection(section.id);
    if (!result.ok) {
      let message = failureMessage(result.reason);
      if (result.reason === 'not-empty') {
        message = '请先清空各机型下该 Tab 的数据';
      } else if (result.reason === 'validation') {
        message = '注意事项 Tab 不可删除';
      }
      ElMessage.error(message);
      return;
    }
    ElMessage.success('Tab 已删除');
    if (editId.value === section.id) resetForm();
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认删除“${item.name}”吗？已使用该分类的数据会改归到其他分类。`,
      '删除分类',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  const result = store.deleteDictionaryItem(activeCode.value, item.id);
  if (!result.ok) {
    ElMessage.error(
      result.reason === 'validation'
        ? '至少保留一个分类'
        : failureMessage(result.reason),
    );
    return;
  }
  ElMessage.success('分类已删除');
  if (editId.value === item.id) resetForm();
}
</script>

<template>
  <main class="selection-page">
    <section class="dictionary-workspace">
      <aside class="dictionary-sidebar">
        <h3>字典清单</h3>
        <button
          v-for="definition in DICTIONARY_DEFINITIONS"
          :key="definition.code"
          :class="{ active: definition.code === activeCode }"
          type="button"
          @click="activeCode = definition.code"
        >
          {{ definition.title }}
        </button>
      </aside>

      <div class="dictionary-panel">
        <ElForm class="dictionary-form" label-position="top" @submit.prevent>
          <div class="form-grid">
            <ElFormItem
              :label="isMachineSection ? '名称' : '分类名称'"
              required
            >
              <ElInput v-model="form.name" maxlength="40" />
            </ElFormItem>
            <ElFormItem label="排序">
              <ElInputNumber
                v-model="form.sort"
                :min="1"
                :step="1"
                class="w-full"
                controls-position="right"
              />
            </ElFormItem>
            <ElFormItem v-if="isMachineSection" label="类型">
              <ElSelect
                v-model="form.kind"
                :disabled="kindSelectDisabled"
                class="w-full"
              >
                <ElOption :label="KIND_LABELS.structure" value="structure" />
                <ElOption
                  v-if="editId !== undefined && form.kind === 'notes'"
                  :label="KIND_LABELS.notes"
                  value="notes"
                />
              </ElSelect>
            </ElFormItem>
          </div>
          <div class="data-section__actions">
            <ElButton @click="resetForm">
              <Plus :size="15" aria-hidden="true" />
              新建
            </ElButton>
            <ElButton type="primary" @click="saveItem">
              <Save :size="15" aria-hidden="true" />
              <template v-if="isMachineSection">
                {{ editId ? '更新 Tab' : '新增 Tab' }}
              </template>
              <template v-else>
                {{ editId ? '更新分类' : '新增分类' }}
              </template>
            </ElButton>
          </div>
        </ElForm>

        <div class="table-scroll">
          <ElTable :data="items" row-key="id" stripe>
            <ElTableColumn label="排序" prop="sort" width="90" />
            <ElTableColumn
              :label="isMachineSection ? '名称' : '分类名称'"
              min-width="240"
              prop="name"
            />
            <ElTableColumn v-if="isMachineSection" label="类型" min-width="120">
              <template #default="{ row }: { row: MachineSectionItem }">
                {{ kindLabel(row.kind) }}
              </template>
            </ElTableColumn>
            <ElTableColumn fixed="right" label="操作" width="108">
              <template
                #default="{ row }: { row: DictionaryItem | MachineSectionItem }"
              >
                <div class="table-actions">
                  <ElTooltip content="编辑" placement="top">
                    <ElButton
                      :aria-label="isMachineSection ? '编辑 Tab' : '编辑分类'"
                      circle
                      @click="editItem(row)"
                    >
                      <Pencil :size="15" aria-hidden="true" />
                    </ElButton>
                  </ElTooltip>
                  <ElTooltip
                    v-if="
                      !(
                        isMachineSection &&
                        isSectionLocked(row as MachineSectionItem)
                      )
                    "
                    content="删除"
                    placement="top"
                  >
                    <ElButton
                      :aria-label="isMachineSection ? '删除 Tab' : '删除分类'"
                      circle
                      type="danger"
                      @click="deleteItem(row)"
                    >
                      <Trash2 :size="15" aria-hidden="true" />
                    </ElButton>
                  </ElTooltip>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
      </div>
    </section>
  </main>
</template>
