/*
 * 操作日志的「一次操作」：用户在界面上点一下保存 / 删除，领域层可能连着写好几个 key
 * （删一个机型会清掉它在各个分区下的表格、页签，再改分类顺序）。这些写入共用一个
 * 操作编号和名称，后端据此在操作日志里归成一行。
 *
 * runAsOperation 在同步执行期间设置当前操作；BackendStorage 在写入入队时取走它
 * （写入本身是排队异步发出的），api 再把它放进请求头。
 */

export interface AuditOperation {
  id: string;
  label?: string;
}

export const OPERATION_ID_HEADER = 'X-Operation-Id';
export const OPERATION_LABEL_HEADER = 'X-Operation-Label';

let active: AuditOperation | null = null;

function newOperationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

/** 在一次操作里执行 run；嵌套调用沿用外层的操作 */
export function runAsOperation<T>(label: string | undefined, run: () => T): T {
  if (active) return run();
  active = { id: newOperationId(), label };
  try {
    return run();
  } finally {
    active = null;
  }
}

export function currentOperation(): AuditOperation | null {
  return active;
}

/** 请求头只能放 ASCII：名称按 URL 编码，后端解码 */
export function operationHeaders(
  operation: AuditOperation | null | undefined,
): Record<string, string> {
  if (!operation) return {};
  return {
    [OPERATION_ID_HEADER]: operation.id,
    ...(operation.label
      ? { [OPERATION_LABEL_HEADER]: encodeURIComponent(operation.label) }
      : {}),
  };
}
