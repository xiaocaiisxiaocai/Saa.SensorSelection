<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTag,
  ElTree,
} from 'element-plus';

import { api, type OrgUnitNode } from '#/modules/selection/api';

import { buildOrgTree, type OrgTreeNode } from '../org-tree';

const LEVEL_OPTIONS = ['事业部', '部门', '课别'];

const loading = ref(false);
const nodes = ref<OrgUnitNode[]>([]);
const treeData = computed(() => buildOrgTree(nodes.value));
const selected = ref<null | OrgUnitNode>(null);

async function loadData() {
  loading.value = true;
  try {
    nodes.value = await api.listOrgUnits();
    if (selected.value) {
      selected.value =
        nodes.value.find((node) => node.id === selected.value?.id) ?? null;
    }
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : '加载组织架构失败',
    );
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

function selectNode(node: OrgTreeNode) {
  selected.value = node;
}

function parentPath(id: null | number): string {
  if (id === null) return '—（顶级）';
  const node = nodes.value.find((item) => item.id === id);
  if (!node) return `#${id}`;
  const parent =
    node.parentId === null ? '' : `${parentPath(node.parentId)} / `;
  return `${parent}${node.name}`;
}

// ---- 新增 / 重命名 ----
const dialogVisible = ref(false);
/** 新增时父节点 id；null = 顶级。 */
const dialogParent = ref<null | number>(null);
const editingNode = ref<null | OrgUnitNode>(null);
const saving = ref(false);
const form = reactive({
  name: '',
  level: '' as string,
  sortOrder: 0,
});

function openCreate(parentId: null | number) {
  dialogParent.value = parentId;
  editingNode.value = null;
  Object.assign(form, { name: '', level: '', sortOrder: 0 });
  dialogVisible.value = true;
}

function openRename(node: OrgUnitNode) {
  dialogParent.value = node.parentId;
  editingNode.value = node;
  Object.assign(form, {
    name: node.name,
    level: node.level ?? '',
    sortOrder: node.sortOrder,
  });
  dialogVisible.value = true;
}

async function submit() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入组织名称');
    return;
  }
  saving.value = true;
  try {
    if (editingNode.value === null) {
      await api.createOrgUnit({
        name: form.name.trim(),
        parentId: dialogParent.value,
        level: form.level || null,
        sortOrder: form.sortOrder,
      });
      ElMessage.success('组织已创建');
    } else {
      await api.updateOrgUnit(editingNode.value.id, {
        name: form.name.trim(),
        parentId: dialogParent.value,
        level: form.level || null,
        sortOrder: form.sortOrder,
      });
      ElMessage.success('组织已更新');
    }
    dialogVisible.value = false;
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function removeNode(node: OrgUnitNode) {
  try {
    await ElMessageBox.confirm(`确定删除组织「${node.name}」？`, '删除组织', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await api.deleteOrgUnit(node.id);
    ElMessage.success('组织已删除');
    selected.value = null;
    await loadData();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}
</script>

<template>
  <div class="rbac-page">
    <div class="rbac-page__toolbar">
      <h2 class="rbac-page__title">组织架构</h2>
      <ElButton type="primary" @click="openCreate(null)">新增顶级组织</ElButton>
    </div>

    <div class="rbac-org">
      <div class="rbac-org__tree">
        <ElTree
          :data="treeData"
          :expand-on-click-node="false"
          :props="{ label: 'name', children: 'children' }"
          default-expand-all
          highlight-current
          node-key="id"
          v-loading="loading"
          @node-click="selectNode"
        >
          <template #default="{ data }">
            <span class="rbac-org__node">
              <span>{{ data.name }}</span>
              <ElTag v-if="data.level" size="small" type="info">{{
                data.level
              }}</ElTag>
              <ElTag v-if="data.userCount > 0" size="small" type="success">
                {{ data.userCount }} 人
              </ElTag>
            </span>
          </template>
        </ElTree>
        <p
          v-if="!loading && treeData.length === 0"
          class="rbac-hint rbac-org__empty"
        >
          暂无组织，点击「新增顶级组织」开始创建（可逐级或跳级挂接）。
        </p>
      </div>

      <div v-if="selected" class="rbac-org__detail">
        <h3 class="rbac-org__detail-title">{{ selected.name }}</h3>
        <dl class="rbac-org__detail-list">
          <dt>层级</dt>
          <dd>{{ selected.level || '未设置' }}</dd>
          <dt>上级路径</dt>
          <dd>{{ parentPath(selected.parentId) }}</dd>
          <dt>同级排序</dt>
          <dd>{{ selected.sortOrder }}</dd>
          <dt>子级组织</dt>
          <dd>{{ selected.childCount }} 个</dd>
          <dt>挂载用户</dt>
          <dd>{{ selected.userCount }} 人</dd>
        </dl>
        <div class="rbac-org__actions">
          <ElButton plain type="primary" @click="openCreate(selected.id)">
            新增子级
          </ElButton>
          <ElButton @click="openRename(selected)">重命名 / 调整</ElButton>
          <ElButton plain type="danger" @click="removeNode(selected)">
            删除
          </ElButton>
        </div>
        <p class="rbac-hint">
          层级支持任意深度与跳级：子级可选择任意节点（如「课别」直接挂在「事业部」下）。
        </p>
      </div>
      <div v-else class="rbac-org__detail rbac-org__detail--empty">
        <span class="rbac-muted">选择左侧组织节点查看详情</span>
      </div>
    </div>

    <!-- 新增 / 重命名 -->
    <ElDialog
      v-model="dialogVisible"
      :close-on-click-modal="false"
      :title="editingNode === null ? '新增组织' : `重命名：${editingNode.name}`"
      width="440px"
    >
      <ElForm label-position="top">
        <ElFormItem label="组织名称" required>
          <ElInput
            v-model="form.name"
            maxlength="64"
            placeholder="如：电控事业部"
          />
        </ElFormItem>
        <ElFormItem label="层级">
          <ElSelect
            v-model="form.level"
            allow-create
            clearable
            filterable
            placeholder="选择或输入层级（如：事业部/部门/课别）"
            style="width: 100%"
          >
            <ElOption
              v-for="level in LEVEL_OPTIONS"
              :key="level"
              :label="level"
              :value="level"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="同级排序">
          <ElInputNumber v-model="form.sortOrder" :min="0" :step="1" />
          <span class="rbac-hint">数值小者排在前面</span>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton :loading="saving" type="primary" @click="submit">
          保存
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style src="../rbac.css"></style>
