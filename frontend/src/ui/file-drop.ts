export interface FileDropRule {
  accept?: string;
  maxBytes?: number;
  mimeTypes?: string[];
  extensions?: string[];
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
    rule.extensions?.map((item) => item.replace(/^\./, '').toUpperCase()).join(' / ') ??
    '文件';
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
  const hasTypeRule = Boolean(rule.mimeTypes?.length || rule.extensions?.length);

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
