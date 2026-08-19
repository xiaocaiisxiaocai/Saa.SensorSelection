import { describe, expect, it } from 'vitest';

import { CRUD_DEFAULTS, SENSOR_DATA } from './data.js';
import { createSelectionRepository } from './domain.js';

function createRepo() {
  let value: null | string = null;
  return createSelectionRepository({
    crudDefaults: CRUD_DEFAULTS,
    sensorData: SENSOR_DATA,
    storage: {
      getItem: () => value,
      setItem: (_key, nextValue) => {
        value = nextValue;
      },
    },
  });
}

describe('机型结构传感器关联', () => {
  it('一个功能作用可以关联多个 Sensor 目录记录，并保留目录 ID', () => {
    const repo = createRepo();
    const sensors = repo.getSensors();
    const selected = sensors.slice(0, 2);

    const result = repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '进板检测',
      sensorIds: selected.map((item) => item.id),
      purpose: '一组功能由多个传感器共同确认',
      note: '',
    });

    if (!result.ok) throw new Error(result.reason);
    expect(
      repo
        .getMachineSectionRows(1, '中间翻板机')
        .find((item) => item.id === result.item?.id),
    ).toMatchObject({
      sensorIds: selected.map((item) => item.id),
    });
  });

  it('替换 Sensor 型号后，机型结构关联自动迁移到新型号', () => {
    const repo = createRepo();
    const sensors = repo.getSensors();
    const current = sensors.find((item) => item.status === '现用');
    const alternate = sensors.find(
      (item) =>
        item.status === '备选' && item.sensorType === current?.sensorType,
    );
    if (!current || !alternate) throw new Error('缺少可替换 Sensor');

    repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '进板检测',
      sensorIds: [current.id],
      purpose: '',
      note: '',
    });

    const result = repo.replaceSensorCurrent(
      alternate.id,
      current.id,
      '规格升级',
    );

    if (!result.ok) throw new Error(result.reason);
    expect(repo.getMachineSectionRows(1, '中间翻板机')[0]?.sensorIds).toEqual([
      alternate.id,
    ]);
  });

  it('直接修改 Sensor 规格后，机型结构的展示快照同步更新', () => {
    const repo = createRepo();
    const sensor = repo.getSensors()[0];
    if (!sensor) throw new Error('缺少测试 Sensor');
    repo.saveMachineSectionRow(1, '中间翻板机', {
      role: '进板检测',
      sensorIds: [sensor.id],
      purpose: '',
      note: '',
    });

    const result = repo.saveSensor(
      { ...sensor, spec: '新规格 24V DC' },
      sensor.id,
    );
    if (!result.ok) throw new Error(result.reason);

    const row = repo
      .getMachineSectionRows(1, '中间翻板机')
      .find((item) => item.role === '进板检测');
    expect(row?.sensorIds).toEqual([sensor.id]);
    expect(row?.spec).toContain('新规格 24V DC');
  });

  it('结构示意图按机型和结构 Tab 独立持久化，最多保留两张', () => {
    const repo = createRepo();
    const image = {
      dataUrl: 'data:image/png;base64,AAAA',
      fileName: '结构.png',
      mimeType: 'image/png',
      size: 4,
    };
    const result = repo.saveMachineSectionImages(1, '中间翻板机', [image]);
    if (!result.ok) throw new Error(result.reason);
    expect(repo.getMachineSectionImages(1, '中间翻板机')).toEqual([image]);
    expect(repo.snapshotStore()['machine-section-images:1:中间翻板机']).toEqual(
      [image],
    );
  });
});
