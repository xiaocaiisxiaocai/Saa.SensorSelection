export const IMAGE_ZOOM_MIN = 0.25;
export const IMAGE_ZOOM_MAX = 5;
export const IMAGE_ZOOM_STEP = 0.25;

export function clampImageZoom(value: number): number {
  return Math.min(
    IMAGE_ZOOM_MAX,
    Math.max(IMAGE_ZOOM_MIN, Number(value.toFixed(2))),
  );
}

export function stepImageZoom(current: number, direction: 1 | -1): number {
  return clampImageZoom(current + direction * IMAGE_ZOOM_STEP);
}

export function imageZoomPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function canPanImage(zoom: number): boolean {
  return zoom > 1;
}
