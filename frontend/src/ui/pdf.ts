import {
  getDocument as pdfGetDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

export type PdfDocument = Awaited<
  ReturnType<typeof pdfGetDocument>['promise']
>;

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

export function getDocument(src: string) {
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
