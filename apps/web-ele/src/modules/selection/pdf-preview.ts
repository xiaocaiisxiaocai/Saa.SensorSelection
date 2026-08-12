import {
  getDocument,
  GlobalWorkerOptions,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

import './pdf-map-polyfill.js';

GlobalWorkerOptions.workerSrc = pdfWorker;

export { getDocument };

export function dataUrlToPdfBytes(dataUrl: string) {
  const separator = dataUrl.indexOf(',');
  if (separator === -1) throw new Error('invalid data url');

  const header = dataUrl.slice(0, Math.max(separator, 0));
  const payload = dataUrl.slice(separator + 1);
  if (!payload) throw new Error('empty pdf payload');

  const isBase64 = /;base64/i.test(header);
  if (!isBase64) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      // atob returns a binary string of byte values 0-255
      bytes[index] = binary.codePointAt(index) ?? 0;
    }
    return bytes;
  } catch {
    throw new Error('invalid base64 pdf data');
  }
}

export function drawPdfWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
) {
  const [primary = '', secondary = ''] = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  context.save();
  context.fillStyle = '#64748b';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const stepX = 280;
  const stepY = 200;
  for (let y = -height; y < height * 2; y += stepY) {
    for (let x = -width; x < width * 2; x += stepX) {
      context.save();
      context.translate(x, y);
      context.rotate(-Math.PI / 6);

      context.globalAlpha = 0.18;
      context.font = '600 20px "Segoe UI", "Microsoft YaHei", sans-serif';
      context.fillText(primary, 0, secondary ? -10 : 0);

      if (secondary) {
        context.globalAlpha = 0.2;
        context.font = '500 14px "Segoe UI", "Microsoft YaHei", sans-serif';
        context.fillText(secondary, 0, 12);
      }

      context.restore();
    }
  }
  context.restore();
}
