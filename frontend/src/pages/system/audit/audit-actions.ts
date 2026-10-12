/** 后端审计操作码 → 中文标签。后端新增操作码时这里必须同步（有测试检查）。 */
export const ACTION_LABELS: Record<string, string> = {
  'auth.change-password': '修改密码',
  'auth.login': '登录',
  'org.create': '创建组织',
  'org.delete': '删除组织',
  'org.update': '更新组织',
  'role.create': '创建角色',
  'role.delete': '删除角色',
  'role.update': '更新角色',
  'store.delete': '删除数据',
  // 缺了这条时表格会直接显示原始操作码 store.entity-groups.reorder，
  // 又长又要折行，和其他行的中文标签也对不齐。
  'store.entity-groups.reorder': '调整分类顺序',
  'store.replace-all': '整体导入',
  'store.upsert': '写入数据',
  'user.create': '创建用户',
  'user.delete': '删除用户',
  'user.reset-password': '重置密码',
  'user.update': '更新用户',
};

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

export interface AuditDetailPair {
  label: string;
  value: string;
  /** 顿号分隔的列表（权限、角色…）拆开后的各项 */
  items?: string[];
}

/*
 * 业务详情是后端拼出来的「键：值；键：值」串，直接原样显示就是一大坨，
 * 和上面那些整齐的标签-值行格格不入。这里把它还原成结构化的行。
 *
 * 格式不是登录独有的：用户增改、组织、角色、数据写入都用同一套拼法，
 * 所以按通用规则解析；任何一条对不上格式的，整体退回纯文本显示（返回 null），
 * 避免把没见过的写法解析得七零八落。
 */
export function parseAuditDetail(
  detail: string | null | undefined,
): { summary: string; pairs: AuditDetailPair[] } | null {
  const raw = detail?.trim();
  if (!raw) return null;

  const summary: string[] = [];
  const pairs: AuditDetailPair[] = [];
  for (const segment of raw.split('；')) {
    const text = segment.trim();
    if (!text) continue;
    const at = text.indexOf('：');
    if (at <= 0) {
      // 没有「：」的段是「登录成功」这类独立短语，留作开头一句话
      if (pairs.length > 0) return null;
      summary.push(text);
      continue;
    }
    const label = text.slice(0, at).trim();
    const value = text.slice(at + 1).trim();
    if (!label) return null;
    const items = value.includes('、')
      ? value
          .split('、')
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    pairs.push({ label, value: value || '—', items });
  }

  // 一个键值对都没有说明这就是一句普通话，按原文显示即可
  if (pairs.length === 0) return null;
  return { summary: summary.join('；'), pairs };
}
