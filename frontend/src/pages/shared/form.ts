/**
 * 业务校验在领域层完成，页面只需把错误文案挂到 a-form-item 上：
 * `<a-form-item label="名称" v-bind="fieldError(nameError)">`。
 * 没有错误时返回空对象，a-form-item 保持默认状态。
 */
export function fieldError(message?: false | null | string) {
  return message ? { validateStatus: 'error' as const, help: message } : {};
}
