import { describe, expect, it } from 'vitest';

import {
  canPanImage,
  clampImageZoom,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  imageZoomPercent,
  stepImageZoom,
} from './image-viewer';

describe('image-viewer helpers', () => {
  it('clamps zoom to 0.25–5 in 0.25 steps', () => {
    expect(clampImageZoom(0)).toBe(IMAGE_ZOOM_MIN);
    expect(clampImageZoom(9)).toBe(IMAGE_ZOOM_MAX);
    expect(stepImageZoom(1, 1)).toBe(1.25);
    expect(stepImageZoom(0.25, -1)).toBe(0.25);
    expect(imageZoomPercent(1.25)).toBe('125%');
    expect(canPanImage(1)).toBe(false);
    expect(canPanImage(1.25)).toBe(true);
  });
});
