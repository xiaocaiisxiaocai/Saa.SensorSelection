<script lang="ts" setup>
import type { CrudItem } from '../data.js';

import { computed, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';
import { Pencil, Plus, Save, Trash2 } from 'lucide-vue-next';

import { CRUD_COLUMN_LABELS, CRUD_TYPE_OPTIONS } from '../data.js';
import { useSelectionStore } from '../store';

const props = defineProps<{
  entityName: string;
  listId: string;
}>();

const store = useSelectionStore();
const dialogOpen = ref(false);
const editId = ref<number>();
const form = reactive({ desc: '', name: '', note: '', type: '' });

const items = computed(() => {
  return store.crudItems(props.listId, props.entityName) as CrudItem[];
});
const labels = computed(
  () => CRUD_COLUMN_LABELS[props.listId] || ['类型', '名称', '描述', '备注'],
);
const typeOptions = computed(() => CRUD_TYPE_OPTIONS[props.listId] || ['其他']);
const dialogTitle = computed(() => (editId.value ? '编辑记录' : '新增记录'));

const page = ref(1);
const pageSize = ref(20);
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return items.value.slice(start, start + pageSize.value);
});

// 切换实体时回到第一页
watch(
  () => [props.listId, props.entityName],
  () => {
    page.value = 1;
  },
);

// 数据量或每页条数变化时，防止当前页码越界
watch(
  () => [items.value.length, pageSize.value],
  () => {
    const maxPage = Math.max(1, Math.ceil(items.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
);

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    desc: '',
    name: '',
    note: '',
    type: typeOptions.value[0] || '',
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: CrudItem) {
  editId.value = item.id;
  Object.assign(form, item);
  dialogOpen.value = true;
}

function failureMessage(reason: string) {
  if (reason === 'stale') return '该记录已被其他页面删除，请刷新后重试';
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  return '请填写名称';
}

function saveItem() {
  const result = store.saveCrud(
    props.listId,
    props.entityName,
    { ...form },
    editId.value,
  );
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  dialogOpen.value = false;
  ElMessage.success(editId.value ? '记录已更新' : '记录已新增');
}

async function deleteItem(item: CrudItem) {
  try {
    await ElMessageBox.confirm(`确认删除“${item.name}”吗？`, '删除记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  const result = store.deleteCrud(props.listId, props.entityName, item.id);
  if (!result.ok) {
    ElMessage.error(failureMessage(result.reason));
    return;
  }
  ElMessage.success('记录已删除');
}
</script>

<template>
  <section class="data-section">
    <div class="data-section__toolbar">
      <span>{{ items.length }} 条记录</span>
      <ElButton type="primary" @click="addItem">
        <Plus :size="15" aria-hidden="true" />
        新增
      </ElButton>
    </div>

    <ElTable :data="tableData" empty-text="暂无记录" row-key="id">
      <ElTableColumn :label="labels[0]" min-width="120" prop="type" />
      <ElTableColumn :label="labels[1]" min-width="180" prop="name" />
      <ElTableColumn :label="labels[2]" min-width="260" prop="desc" />
      <ElTableColumn :label="labels[3]" min-width="150" prop="note" />
      <ElTableColumn fixed="right" label="操作" width="104">
        <template #default="scope">
          <div class="table-actions">
            <ElTooltip content="编辑" placement="top">
              <ElButton aria-label="编辑" circle @click="editItem(scope.row)">
                <Pencil :size="15" aria-hidden="true" />
              </ElButton>
            </ElTooltip>
            <ElTooltip content="删除" placement="top">
              <ElButton
                aria-label="删除"
                circle
                type="danger"
                @click="deleteItem(scope.row)"
              >
                <Trash2 :size="15" aria-hidden="true" />
              </ElButton>
            </ElTooltip>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>

    <div v-if="items.length > pageSize" class="table-pagination">
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="items.length"
        background
        layout="total, sizes, prev, pager, next"
      />
    </div>

    <ElDialog
      v-model="dialogOpen"
      :title="dialogTitle"
      width="520px"
      @closed="resetForm"
    >
      <ElForm label-position="top" @submit.prevent="saveItem">
        <div class="form-grid">
          <ElFormItem :label="labels[0]" required>
            <ElSelect v-model="form.type" class="w-full">
              <ElOption
                v-for="option in typeOptions"
                :key="option"
                :label="option"
                :value="option"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem :label="labels[1]" required>
            <ElInput v-model="form.name" maxlength="80" />
          </ElFormItem>
        </div>
        <ElFormItem :label="labels[2]">
          <ElInput
            v-model="form.desc"
            :rows="3"
            maxlength="500"
            type="textarea"
          />
        </ElFormItem>
        <ElFormItem :label="labels[3]">
          <ElInput v-model="form.note" maxlength="200" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" @click="saveItem">
          <Save :size="15" aria-hidden="true" />
          保存
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>
