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
    processStepId: 21,
    processStepName: '内层 · DES 显影',
    rowId: 102,
    searchableText: '出料确认 SICK WL12',
    sectionId: 1001,
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
    processStepId: 22,
    processStepName: '外层 · AOI 检查',
    rowId: 202,
    searchableText: '板件定位 Keyence',
    sectionId: 2002,
    sectionName: '拍板机构',
  },
];

describe('machine structure global search', () => {
  it('merges hits on the same machine tab into one result', () => {
    const results = searchMachineStructures(documents, {
      boardCharacteristicIds: [31],
      machineModelIds: [11],
      processStepIds: [21],
      query: '',
    });

    expect(results).toEqual([
      expect.objectContaining({
        machineName: '01 单段输送段（搭配）',
        matchCount: 2,
        rowIds: [101, 102],
        sectionId: 1001,
      }),
    ]);
  });

  it('uses AND between dimensions and OR inside one dimension', () => {
    const results = searchMachineStructures(documents, {
      boardCharacteristicIds: [31, 32],
      machineModelIds: [11, 12],
      processStepIds: [22],
      query: 'Keyence',
    });

    expect(results).toEqual([
      expect.objectContaining({
        category: '拍板机构',
        configuration: '放板机配置',
        machineName: '02 出料输送（平板/BOX）',
        rowIds: [202],
      }),
    ]);
  });
});
