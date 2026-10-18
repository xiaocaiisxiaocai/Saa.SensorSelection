export interface MachineStructureSearchDocument {
  boardCharacteristicId: number | null;
  boardCharacteristicName: string;
  category: string;
  configuration: string;
  machineModelId: number | null;
  machineModelName: string;
  machineName: string;
  processStepId: number | null;
  processStepName: string;
  rowId: number;
  searchableText: string;
  sectionId: number;
  sectionName: string;
}

export interface MachineStructureSearchFilters {
  boardCharacteristicIds: number[];
  machineModelIds: number[];
  processStepIds: number[];
  query: string;
}

export interface MachineStructureSearchResult {
  boardCharacteristicNames: string[];
  category: string;
  configuration: string;
  machineModelNames: string[];
  machineName: string;
  matchCount: number;
  processStepNames: string[];
  rowIds: number[];
  sectionId: number;
  sectionName: string;
}

function normalize(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
}

function includesSelected(selected: number[], value: number | null): boolean {
  return selected.length === 0 || (value !== null && selected.includes(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * 全局结构查找以单条结构记录为匹配边界，避免把不同记录上的条件
 * 交叉拼接成一个并不存在的组合；命中后再按结构路径和 Tab 聚合。
 */
export function searchMachineStructures(
  documents: MachineStructureSearchDocument[],
  filters: MachineStructureSearchFilters,
): MachineStructureSearchResult[] {
  const keyword = normalize(filters.query);
  const matched = documents.filter((document) => {
    if (!includesSelected(filters.machineModelIds, document.machineModelId)) {
      return false;
    }
    if (!includesSelected(filters.processStepIds, document.processStepId)) {
      return false;
    }
    if (
      !includesSelected(
        filters.boardCharacteristicIds,
        document.boardCharacteristicId,
      )
    ) {
      return false;
    }
    if (!keyword) return true;
    return normalize(
      [
        document.category,
        document.configuration,
        document.machineName,
        document.sectionName,
        document.boardCharacteristicName,
        document.searchableText,
      ].join(' '),
    ).includes(keyword);
  });

  const resultMap = new Map<
    string,
    { documents: MachineStructureSearchDocument[] }
  >();
  for (const document of matched) {
    const key = JSON.stringify([
      document.category,
      document.configuration,
      document.machineName,
      document.sectionId,
    ]);
    const entry = resultMap.get(key);
    if (entry) entry.documents.push(document);
    else resultMap.set(key, { documents: [document] });
  }

  const results: MachineStructureSearchResult[] = [];
  for (const { documents: hits } of resultMap.values()) {
    const first = hits[0];
    if (!first) continue;
    results.push({
      boardCharacteristicNames: unique(
        hits.map((item) => item.boardCharacteristicName),
      ),
      category: first.category,
      configuration: first.configuration,
      machineModelNames: unique(hits.map((item) => item.machineModelName)),
      machineName: first.machineName,
      matchCount: hits.length,
      processStepNames: unique(hits.map((item) => item.processStepName)),
      rowIds: unique(hits.map((item) => String(item.rowId))).map(Number),
      sectionId: first.sectionId,
      sectionName: first.sectionName,
    });
  }
  return results;
}
