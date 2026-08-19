<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { UserDropdown } from '@vben/layouts';

import { ElButton } from 'element-plus';

import { useSelectionStore } from '../store';

const store = useSelectionStore();
const router = useRouter();

/** 当前登录用户显示名（未登录/游客为空）。 */
const displayName = computed(() => store.backendUser);

/** 角色名（如：系统管理员 / 业务维护员）。 */
const roleNames = computed(
  () =>
    (store.profile?.roles ?? []).map((role) => role.name).join('、') ||
    '未分配角色',
);
/** 所属组织路径（如：事业部 / 部门 / 课别）。 */
const orgPath = computed(() => store.profile?.orgUnit?.path ?? '');

/** 下拉菜单里的描述：角色 · 组织。 */
const description = computed(() => {
  const parts = [roleNames.value];
  if (orgPath.value) parts.push(`组织：${orgPath.value}`);
  return parts.join(' · ');
});

/** 无头像图片时生成文字头像（取显示名首字符）。 */
const avatar = computed(() => {
  const name = displayName.value;
  if (!name) return '';
  const initial = [...name][0] ?? '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" rx="32" fill="#3b82f6"/>` +
    `<text x="32" y="41" font-size="28" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initial}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
</script>

<template>
  <UserDropdown
    v-if="displayName"
    :avatar="avatar"
    :description="description"
    :text="displayName"
    @logout="store.logout()"
  />
  <!-- 未登录/游客：右上角提供登录入口（业务数据仍可匿名只读预览） -->
  <ElButton
    v-else
    class="app-header-login"
    plain
    size="small"
    type="primary"
    @click="router.push('/login')"
  >
    登录
  </ElButton>
</template>

<style scoped>
.app-header-login {
  margin-right: 12px;
}
</style>
