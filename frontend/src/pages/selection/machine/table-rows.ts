import type { MachineSectionRow, SensorItem } from '@/domain';

export interface MachineTableRow extends MachineSectionRow {
  displayId: string;
  groupSize: number;
  groupStart: boolean;
  sensor: SensorItem | null;
  source: MachineSectionRow;
}

function sensorSpec(sensor: SensorItem): string {
  return `${sensor.brand} ${sensor.model} · ${sensor.spec || '未填写规格'}`.trim();
}

export function buildMachineTableRows(
  items: MachineSectionRow[],
  sensors: SensorItem[],
  isStructure: boolean,
): MachineTableRow[] {
  return items.flatMap((item) => {
    const records = isStructure
      ? (item.sensorIds ?? [])
          .map((id) => sensors.find((sensor) => sensor.id === id))
          .filter((sensor): sensor is SensorItem => Boolean(sensor))
      : [];
    const displaySensors: Array<SensorItem | null> =
      records.length > 0 ? records : [null];

    return displaySensors.map((sensor, index) => ({
      ...item,
      displayId: `${item.id}-${index}-${sensor?.id ?? 'legacy'}`,
      groupSize: displaySensors.length,
      groupStart: index === 0,
      sensor,
      source: item,
      sensorType: sensor?.sensorType ?? item.sensorType,
      spec: sensor ? sensorSpec(sensor) : item.spec,
    }));
  });
}
