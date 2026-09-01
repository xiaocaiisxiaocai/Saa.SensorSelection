export interface MachineStructureSearchDocument {
  boardCharacteristicId: number | null;
  boardCharacteristicName: string;
  category: string;
  configuration: string;
  machineModelId: number | null;
  machineModelName: string;
  machineName: string;
  processId: number;
  processName: string;
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
  processIds: number[];
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
  processId: number;
  processName: string;
  processStepNames: string[];
  rowIds: number[];
  sectionId: number;
  sectionName: string;
}

export interface MachineStructureSearchGroup {
  processId: number;
  processName: string;
  results: MachineStructureSearchResult[];
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
 * 交叉拼接成一个并不存在的组合；命中后再按制程、结构路径和 Tab 聚合。
 */
export function searchMachineStructures(
  documents: MachineStructureSearchDocument[],
  filters: MachineStructureSearchFilters,
): MachineStructureSearchGroup[] {
  const keyword = normalize(filters.query);
  const matched = documents.filter((document) => {
    if (
      filters.processIds.length > 0 &&
      !filters.processIds.includes(document.processId)
    ) {
      return false;
    }
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
        document.processName,
        document.category,
        document.configuration,
        document.machineName,
        document.sectionName,
        document.machineModelName,
        document.processStepName,
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
      document.processId,
      document.category,
      document.configuration,
      document.machineName,
      document.sectionId,
    ]);
    const entry = resultMap.get(key);
    if (entry) entry.documents.push(document);
    else resultMap.set(key, { documents: [document] });
  }

  const groups = new Map<number, MachineStructureSearchGroup>();
  for (const { documents: hits } of resultMap.values()) {
    const first = hits[0];
    if (!first) continue;
    const result: MachineStructureSearchResult = {
      boardCharacteristicNames: unique(
        hits.map((item) => item.boardCharacteristicName),
      ),
      category: first.category,
      configuration: first.configuration,
      machineModelNames: unique(hits.map((item) => item.machineModelName)),
      machineName: first.machineName,
      matchCount: hits.length,
      processId: first.processId,
      processName: first.processName,
      processStepNames: unique(hits.map((item) => item.processStepName)),
      rowIds: unique(hits.map((item) => String(item.rowId))).map(Number),
      sectionId: first.sectionId,
      sectionName: first.sectionName,
    };
    const group = groups.get(first.processId);
    if (group) group.results.push(result);
    else {
      groups.set(first.processId, {
        processId: first.processId,
        processName: first.processName,
        results: [result],
      });
    }
  }
  return [...groups.values()];
}
