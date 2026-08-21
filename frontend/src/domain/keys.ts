export const STORAGE_KEY = 'symtek_crud_store';

export function keyFor(listId: string, entityName: string): string {
  return `${listId}:${entityName}`;
}

export function machineSectionRowsKey(
  sectionId: number,
  machineName: string,
): string {
  return `machine-section-rows:${sectionId}:${machineName}`;
}

export function machineSectionImagesKey(
  sectionId: number,
  machineName: string,
): string {
  return `machine-section-images:${sectionId}:${machineName}`;
}
