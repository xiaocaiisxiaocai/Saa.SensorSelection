import { afterEach, describe, expect, it } from 'vitest';

import {
  clampSourceWidth,
  readSourceWidth,
  SOURCE_WIDTH_MAX,
  SOURCE_WIDTH_MIN,
  writeSourceWidth,
} from './source-pane-width';

const KEY = 'symtek:source-width:test';

describe('source pane width', () => {
  afterEach(() => localStorage.removeItem(KEY));

  it('clamps to the allowed range and to the container limit', () => {
    expect(clampSourceWidth(10)).toBe(SOURCE_WIDTH_MIN);
    expect(clampSourceWidth(9999)).toBe(SOURCE_WIDTH_MAX);
    expect(clampSourceWidth(300.6)).toBe(301);
    expect(clampSourceWidth(350, 300)).toBe(300);
    // 容器再窄也不低于最小宽度
    expect(clampSourceWidth(500, 100)).toBe(SOURCE_WIDTH_MIN);
  });

  it('remembers the width and falls back on missing or bad data', () => {
    expect(readSourceWidth(KEY, 240)).toBe(240);
    writeSourceWidth(KEY, 320);
    expect(readSourceWidth(KEY, 240)).toBe(320);
    localStorage.setItem(KEY, 'abc');
    expect(readSourceWidth(KEY, 240)).toBe(240);
    localStorage.setItem(KEY, '9999');
    expect(readSourceWidth(KEY, 240)).toBe(SOURCE_WIDTH_MAX);
    writeSourceWidth(KEY, null);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
