import { describe, expect, it } from 'vitest';

import {
  searchMachineStructures,
  type MachineStructureSearchDocument,
} from './machine-structure-search';

const documents: MachineStructureSearchDocument[] = [
  {
    boardCharacteristicId: 31,
    boardCharacteristicName: '薄板',
    category: '输送机构',
    configuration: '标准输送段配置',
    machineModelId: 11,
    machineModelName: '中间输送机',
    machineName: '01 单段输送段（搭配）',
    processId: 1,
    processName: '制程1',
    processStepId: 21,
    processStepName: '内层 · DES 显影',
    rowId: 101,
    searchableText: '入料确认 OMRON E3Z-D61',
    sectionId: 1001,
    sectionName: '输送机构',
  },
  {
    boardCharacteristicId: 31,
    boardCharacteristicName: '薄板',
    category: '输送机构',
    configuration: '标准输送段配置',
    machineModelId: 11,
    machineModelName: '中间输送机',
    machineName: '01 单段输送段（搭配）',
    processId: 2,
    processName: '制程2',
    processStepId: 21,
    processStepName: '内层 · DES 显影',
    rowId: 201,
    searchableText: '出料确认 SICK WL12',
    sectionId: 2001,
    sectionName: '输送机构',
  },
  {
    boardCharacteristicId: 32,
    boardCharacteristicName: '厚板',
    category: '拍板机构',
    configuration: '放板机配置',
    machineModelId: 12,
    machineModelName: '放板机',
    machineName: '02 出料输送（平板/BOX）',
    processId: 2,
    processName: '制程2',
    processStepId: 22,
    processStepName: '外层 · AOI 检查',
    rowId: 202,
    searchableText: '板件定位 Keyence',
    sectionId: 2002,
    sectionName: '拍板机构',
  },
];

describe('machine structure global search', () => {
  it('searches every upper process by default and never merges equal paths across processes', () => {
    const groups = searchMachineStructures(documents, {
      boardCharacteristicIds: [31],
      machineModelIds: [11],
      processIds: [],
      processStepIds: [21],
      query: '',
    });

    expect(groups.map((group) => group.processName)).toEqual([
      '制程1',
      '制程2',
    ]);
    expect(groups.map((group) => group.results.length)).toEqual([1, 1]);
    expect(groups[0]?.results[0]).toMatchObject({
      matchCount: 1,
      processId: 1,
      rowIds: [101],
    });
    expect(groups[1]?.results[0]).toMatchObject({
      matchCount: 1,
      processId: 2,
      rowIds: [201],
    });
  });

  it('uses AND between dimensions, OR inside one dimension, and filters upper processes only when selected', () => {
    const groups = searchMachineStructures(documents, {
      boardCharacteristicIds: [31, 32],
      machineModelIds: [11, 12],
      processIds: [2],
      processStepIds: [22],
      query: 'Keyence',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.processName).toBe('制程2');
    expect(groups[0]?.results).toEqual([
      expect.objectContaining({
        category: '拍板机构',
        configuration: '放板机配置',
        machineName: '02 出料输送（平板/BOX）',
        rowIds: [202],
      }),
    ]);
  });
});
