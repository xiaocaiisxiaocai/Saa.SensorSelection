import { describe, expect, it } from 'vitest';

import {
  describeFileRule,
  formatBytes,
  validateFile,
} from './file-drop';

function makeFile(name: string, type: string, size: number) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const imageRule = {
  accept: '.jpg,.png,.webp,image/jpeg,image/png,image/webp',
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

describe('file-drop helpers', () => {
  it('formats byte limits and a human hint', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB');
    expect(describeFileRule(imageRule)).toBe('支持 JPG / JPEG / PNG / WEBP，最大 2 MB');
  });

  it('rejects unsupported types and oversized files', () => {
    expect(
      validateFile(makeFile('notes.pdf', 'application/pdf', 100), imageRule),
    ).toBe('type');
    expect(
      validateFile(
        makeFile('photo.png', 'image/png', 3 * 1024 * 1024),
        imageRule,
      ),
    ).toBe('size');
    expect(
      validateFile(makeFile('photo.png', 'image/png', 100), imageRule),
    ).toBeNull();
  });
});
