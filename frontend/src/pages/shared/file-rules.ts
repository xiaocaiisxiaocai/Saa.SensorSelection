import { message } from 'ant-design-vue';

export interface FileDropRule {
  accept?: string;
  maxBytes?: number;
  mimeTypes?: readonly string[];
  extensions?: readonly string[];
}

export type FileDropReason = 'type' | 'size';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    const rounded = Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
    return `${rounded} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function describeFileRule(rule: FileDropRule): string {
  const types =
    rule.extensions
      ?.map((item) => item.replace(/^\./, '').toUpperCase())
      .join(' / ') ?? '文件';
  const size = rule.maxBytes ? `，最大 ${formatBytes(rule.maxBytes)}` : '';
  return `支持 ${types}${size}`;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function validateFile(
  file: File,
  rule: FileDropRule,
): FileDropReason | null {
  const extension = fileExtension(file.name);
  const hasTypeRule = Boolean(
    rule.mimeTypes?.length || rule.extensions?.length,
  );

  if (hasTypeRule) {
    const mimeOk = Boolean(file.type && rule.mimeTypes?.includes(file.type));
    const extensionOk = Boolean(rule.extensions?.includes(extension));
    if (!mimeOk && !extensionOk) {
      return 'type';
    }
  }

  if (rule.maxBytes != null && file.size > rule.maxBytes) {
    return 'size';
  }

  return null;
}

export interface FilePickOptions extends FileDropRule {
  sizeMessage?: string;
  typeMessage?: string;
}

/**
 * 生成 a-upload-dragger 的 `before-upload` / `@reject` 处理器：逐个校验文件，
 * 不合规的给出提示，合规的攒成一批后交给 `onFiles`。始终返回 false，
 * 阻止 antd 自己发请求（上传由 `uploadFile` 统一走 /api/files）。
 *
 * antd 对一次选择/拖入的多个文件是在同一轮同步调用 beforeUpload 的，
 * 用 setTimeout 合批，`onFiles` 才能拿到完整的一批（配合上传锁避免并发）。
 */
export function createFilePicker(
  options: FilePickOptions,
  onFiles: (files: File[]) => unknown,
) {
  const sizeMessage = options.sizeMessage ?? '文件大小超出限制';
  const typeMessage = options.typeMessage ?? '文件类型不受支持';
  let pending: File[] = [];
  let scheduled = false;

  function flush() {
    const batch = pending;
    pending = [];
    scheduled = false;
    if (batch.length > 0) void onFiles(batch);
  }

  function beforeUpload(file: File): false {
    const reason = validateFile(file, options);
    if (reason === 'size') {
      message.error(sizeMessage);
      return false;
    }
    if (reason === 'type') {
      message.error(typeMessage);
      return false;
    }
    pending.push(file);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 0);
    }
    return false;
  }

  /** 拖入的文件被 `accept` 过滤掉时 antd 触发 @reject。 */
  function onReject() {
    message.error(typeMessage);
  }

  return { beforeUpload, onReject, hint: describeFileRule(options) };
}

/** 合并多类文件规则（如 PDF + Word），大小上限取最大值。 */
export function combineFileRules(...rules: FileDropRule[]): FileDropRule {
  return {
    accept: rules
      .map((rule) => rule.accept)
      .filter(Boolean)
      .join(','),
    extensions: rules.flatMap((rule) => rule.extensions ?? []),
    mimeTypes: rules.flatMap((rule) => rule.mimeTypes ?? []),
    maxBytes: Math.max(...rules.map((rule) => rule.maxBytes ?? 0)),
  };
}
