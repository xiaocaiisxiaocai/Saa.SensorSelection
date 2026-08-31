import type {
  MachineSectionRow,
  ProcessStepItem,
  SensorItem,
} from '@/domain';

export interface MachineTableRow extends MachineSectionRow {
  displayId: string;
  groupSize: number;
  groupStart: boolean;
  processStepName: string;
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
  processSteps: ProcessStepItem[] = [],
): MachineTableRow[] {
  return items.flatMap((item) => {
    const records = isStructure
      ? (item.sensorIds ?? [])
          .map((id) => sensors.find((sensor) => sensor.id === id))
          .filter((sensor): sensor is SensorItem => Boolean(sensor))
      : [];
    const displaySensors: Array<SensorItem | null> =
      records.length > 0 ? records : [null];

    const processStep = isStructure
      ? processSteps.find((candidate) => candidate.id === item.processStepId)
      : undefined;
    const processStepName = processStep
      ? `${processStep.layer} · ${processStep.name}`
      : '—';

    return displaySensors.map((sensor, index) => ({
      ...item,
      displayId: `${item.id}-${index}-${sensor?.id ?? 'legacy'}`,
      groupSize: displaySensors.length,
      groupStart: index === 0,
      processStepName,
      sensor,
      source: item,
      sensorType: sensor?.sensorType ?? item.sensorType,
      spec: sensor ? sensorSpec(sensor) : item.spec,
    }));
  });
}
