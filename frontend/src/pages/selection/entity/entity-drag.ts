/**
 * 目录树和机型 Tab 之间的拖放（浏览器原生 DnD）。
 * 两个方向用不同的数据类型区分：树里拖出来的是 TREE_ITEM，Tab 里拖出来的是
 * TAB_MACHINE。这样树内同级排序（antd 自己处理）不会被当成「从 Tab 拖回」。
 * dragover 阶段读不到数据内容，只能看类型，所以类型就是判断依据。
 */
export const TREE_ITEM_DRAG = 'application/x-saa-tree-item';
export const TAB_MACHINE_DRAG = 'application/x-saa-tab-machine';

type DragKind = typeof TAB_MACHINE_DRAG | typeof TREE_ITEM_DRAG;

export function startDrag(event: DragEvent, kind: DragKind, name: string) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(kind, name);
  event.dataTransfer.effectAllowed = 'move';
}

export function dragCarries(event: DragEvent, kind: DragKind): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(kind);
}

/** 放下时取出被拖的名字；不是这种拖放时返回空串 */
export function dropped(event: DragEvent, kind: DragKind): string {
  return event.dataTransfer?.getData(kind) ?? '';
}
