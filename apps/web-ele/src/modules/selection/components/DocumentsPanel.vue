<script lang="ts" setup>
import { ElTable, ElTableColumn, ElTag } from 'element-plus';
import { FileLock2 } from 'lucide-vue-next';

defineProps<{
  files: Array<{ name: string; note: string; size: string }>;
}>();
</script>

<template>
  <section class="documents-section">
    <div class="data-section__toolbar">
      <span>受控文档索引 · {{ files.length }} 份</span>
    </div>
    <ElTable :data="files" row-key="name">
      <ElTableColumn label="文件名称" min-width="320">
        <template #default="scope">
          <div class="document-name">
            <FileLock2 :size="18" aria-hidden="true" />
            <span>{{ scope.row.name }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="大小" prop="size" width="120" />
      <ElTableColumn label="访问权限" min-width="200">
        <template #default="scope">
          <ElTag type="info">受控文档 · {{ scope.row.note }}</ElTag>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>
