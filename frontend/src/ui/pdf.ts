import {
  getDocument as pdfGetDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// 本模块有顶层副作用且会拉入整个 pdf.js，只允许 APdfViewer 在需要预览时
// 动态 import('./pdf')；不要从 ui/index.ts 或其他组件静态引入，否则 vendor-pdf
// 会被打进入口并在首屏 modulepreload。
GlobalWorkerOptions.workerSrc = pdfWorker;

export type PdfLoadingTask = ReturnType<typeof pdfGetDocument>;
export type PdfDocument = Awaited<PdfLoadingTask['promise']>;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) {
    throw new Error('invalid data url');
  }

  const header = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  if (!payload) {
    throw new Error('empty pdf payload');
  }

  if (!/;base64/i.test(header)) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function getDocument(src: string): PdfLoadingTask {
  if (src.startsWith('data:')) {
    return pdfGetDocument({
      data: dataUrlToBytes(src),
      useSystemFonts: true,
    });
  }

  return pdfGetDocument({ url: src, useSystemFonts: true });
}

export async function destroyPdf(doc: PdfDocument | null) {
  if (!doc) {
    return;
  }

  const destroyable = doc as PdfDocument & {
    destroy?: () => Promise<unknown>;
    cleanup?: () => void;
  };

  if (typeof destroyable.destroy === 'function') {
    try {
      await destroyable.destroy();
      return;
    } catch {
      destroyable.cleanup?.();
      return;
    }
  }

  destroyable.cleanup?.();
}
