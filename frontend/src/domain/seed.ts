import type {
  CrudDefaults,
  CrudRecord,
  CustomerProcItem,
  CustomerReqItem,
  DictionaryDefinition,
  DictionaryItem,
  EntityDetail,
  EntityGroup,
  EntityKind,
  EntityKindDefinition,
  MachineSectionItem,
  MachineSectionRow,
  ProcessStepItem,
  SensorTypeDefinition,
  TimelineItem,
} from './types';

export const CUSTOMER_GROUPS: EntityGroup[] = [
  { name: '华东', items: ['庆鼎', '健鼎', '沪士', '胜宏', '景旺'] },
  { name: '华南', items: ['宏恒胜', '崇达', '深南', '兴森', '博敏'] },
  { name: 'SAT', items: ['维信', '依顿', '奥士康', '华通', '定颖'] },
];

export const PROCESS_GROUPS: EntityGroup[] = [
  { name: '制程介绍', items: ['制程报告'] },
  {
    name: '内层制程',
    items: ['DES显影', 'AOI检测', '棕化', '压合', '钻孔', 'PTH沉铜', '板电'],
  },
  { name: '外层制程', items: ['外层前处理', '图形电镀', '防焊', '成型'] },
];

export const MACHINE_GROUPS: EntityGroup[] = [
  {
    name: '输送机构',
    items: [],
    configurations: [
      {
        name: '标准输送段配置',
        items: [
          '01 单段输送段（搭配）',
          '02 多段输送段（搭配）',
          '03 单段输送机（PLC）',
          '04 多段输送机（PLC）',
        ],
      },
      {
        name: '收板机配置',
        items: [
          '01 入料输送（L-RACK）',
          '02 入料输送（平板/BOX）',
          '03 入料输送（上顶平板）',
          '04 入料输送（ESG拍板区）',
          '05 入料输送（ESG组合区）',
          '06 入料输送（三点寻边）',
          '07 入料输送（五点寻边）',
          '08 入料输送（小板件）',
        ],
      },
      {
        name: '放板机配置',
        items: [
          '01 出料输送（L-RACK）',
          '02 出料输送（平板/BOX）',
          '03 出料输送（上顶平板）',
          '04 出料输送（ESG拍板区）',
          '05 出料输送（ESG组合区）',
          '06 出料输送（反转NG）',
          '07 出料输送（读码触发）',
          '08 出料输送（小板件）',
        ],
      },
      {
        name: '标准中间段配置',
        items: [
          '01 可掀式（CSC5）',
          '02 太阳式翻板机（SB-100）',
          '03 翻板机（SB-309G）',
          '04 转向机（ST-103）',
          '05 转角机（ST-201）',
        ],
      },
      { name: '特殊制程配置', items: ['01 电镀区配置要求', '02 近接安装规范'] },
      { name: '客户特殊配置', items: ['01 宏恒胜', '02 庆鼎HC厂'] },
    ],
  },
  {
    name: '拍板机构',
    items: [],
    configurations: [
      {
        name: '无刷拍板',
        items: ['01 中心拍板', '02 靠边拍板', '03 序列拍板'],
      },
      {
        name: '伺服拍板',
        items: ['01 中心拍板', '02 靠边拍板', '03 序列拍板'],
      },
      {
        name: '寻边定位',
        items: ['01 单点寻边', '02 三点寻边', '03 五点寻边'],
      },
      { name: '特殊定位', items: ['01 气浮平台'] },
    ],
  },
  {
    name: '吸盘机构',
    items: [],
    configurations: [
      {
        name: '标准收板机',
        items: [
          '01 取板手臂（常规）',
          '02 取板手臂（电镀）',
          '03 取板手臂（集成式）',
          '04 取纸手臂（收）',
          '05 取板吸tray手臂（收）',
          '06 勾tray手臂（ESG）',
        ],
      },
      {
        name: '标准放板机',
        items: [
          '01 取板手臂（常规）',
          '02 取板手臂（电镀）',
          '03 取板手臂（集成式）',
          '04 取板手臂（隔纸）',
          '05 取纸手臂（放）',
          '06 取板吸tray手臂（放）',
          '07 取板吸纸手臂（放）',
          '08 勾tray手臂（ESG）',
        ],
      },
      { name: '特殊客户', items: ['01 宏恒胜', '02 庆鼎HC'] },
    ],
  },
  {
    name: '完板方式',
    items: [],
    configurations: [
      {
        name: 'L-RACK',
        items: [
          '01 板架有孔，无法安装镜片',
          '02 板架有孔，可安装镜片',
          '03 板架无孔',
        ],
      },
      {
        name: '平板',
        items: [
          '01 平板有孔，无法安装镜片',
          '02 平板有孔，可安装镜片',
          '03 平板无孔，金属材质',
          '04 平板无孔，电木材质',
        ],
      },
      { name: 'BOX', items: ['01 BOX'] },
    ],
  },
  {
    name: '伺服模组机构',
    items: [],
    configurations: [
      { name: '横移机构', items: ['01 手臂横移'] },
      {
        name: '升降机构',
        items: [
          '01 手臂升降（标准模组）',
          '02 手臂升降（自制模组）',
          '03 牙叉升降',
          '04 暂存牙叉升降',
          '05 勾tray升降模组（ESG）',
          '06 龙门升降模组（台达版）',
          '07 龙门升降模组（汇川版）',
        ],
      },
      {
        name: '调宽机构',
        items: [
          '01 伺服调宽（标准）',
          '02 伺服调宽（特殊）',
          '03 电缸调宽（标准）',
        ],
      },
      {
        name: '移栽机构',
        items: ['01 平台移栽（标准）', '02 平台移栽（多定点）'],
      },
    ],
  },
  {
    name: '工位升降机构',
    items: [],
    configurations: [
      {
        name: '伺服升降',
        items: ['01 牙叉升降', '02 牙叉暂存升降', '03 滚筒输送升降'],
      },
      {
        name: '马达升降',
        items: [
          '01 台车升降（三相马达）',
          '02 纸/板台升降（单相马达）',
          '03 纸/板台升降（三相马达）',
        ],
      },
    ],
  },
  {
    name: '台车工位机构',
    items: [],
    configurations: [
      {
        name: '台车确认',
        items: [
          '01 固定台车（外部对接）',
          '02 固定台车（内部对接）',
          '03 AGV对接',
        ],
      },
    ],
  },
  {
    name: '板架工位机构',
    items: [],
    configurations: [
      {
        name: '板架确认',
        items: [
          '01 L-RACK（扣锁）',
          '02 L-RACK（PIN定位）',
          '03 平板',
          '04 BOX',
          '05 TRAY',
          '06 L插架',
        ],
      },
      {
        name: '载具共用',
        items: [
          '01 L插架&L-Rack 判别',
          '02 tray/BOX判别',
          '03 多种tray（ESG）',
        ],
      },
    ],
  },
  {
    name: '暂存机构',
    items: [],
    configurations: [
      {
        name: 'NG暂存机构',
        items: [
          '01 NG板架（斜立式）',
          '02 NG板架（平板）',
          '03 NG板架（拉门）',
        ],
      },
      {
        name: 'DM机构',
        items: ['01 DM板架（斜立式）', '02 DM板架（平板）', '03 DM滑台'],
      },
      { name: '多层架', items: ['01 多层暂存架'] },
    ],
  },
  {
    name: '专案机型',
    items: [
      'CSL(U)R-802（插框机）',
      'CSZR-102（ESG设备）',
      'CSL(U)R-605（L-RACK）',
      'CSL(U)R-625（tray式）',
      'CSL(U)R-638（L插架）',
      'CSC-371（LDI移栽）',
      'CSL(U)R-247（四轴）',
      'CSL(U)-713（U型架）',
    ],
  },
];

export const PROCESS_DETAILS: Record<string, EntityDetail> = {
  制程报告: {
    desc: '刘龙江副理制程报告汇总，涵盖 PCB 制造全流程工艺规范。',
    files: [
      {
        name: 'PCB制造全流程工艺规范_v3.2.pdf',
        size: '12.4 MB',
        note: '仅可预览，无下载权限',
      },
      {
        name: '内层制程标准作业指导书_v2.8.pdf',
        size: '8.7 MB',
        note: '仅可预览，无下载权限',
      },
      {
        name: '外层制程标准作业指导书_v2.6.pdf',
        size: '9.2 MB',
        note: '仅可预览，无下载权限',
      },
    ],
  },
  DES显影: {
    desc: 'DES显影工艺是内层制程的关键环节，通过化学药水去除曝光后的干膜。',
  },
  AOI检测: { desc: 'AOI自动光学检测，用于内层线路缺陷检测。' },
  棕化: { desc: '内层棕化处理，增强铜面与树脂粘合力。' },
  压合: { desc: '多层板压合工艺，高温高压下将内层与半固化片粘合。' },
  钻孔: { desc: 'CNC钻孔工艺，精密钻孔连接各层线路。' },
  PTH沉铜: { desc: 'PTH化学沉铜工艺，在孔壁沉积铜层实现层间导通。' },
  板电: { desc: '板电电镀工艺，在孔壁和表面电镀铜层。' },
  外层前处理: { desc: '外层前处理工艺，清洁铜面并微粗化。' },
  图形电镀: { desc: '图形电镀工艺，在干膜开窗区域电镀铜层。' },
  防焊: { desc: '防焊油墨印刷与曝光固化工艺。' },
  成型: { desc: 'CNC成型工艺，按外形尺寸裁切板件。' },
};

export const MACHINE_DETAILS: Record<string, EntityDetail> = {
  中间六轴机: { desc: '六轴机械手，用于板件翻转、搬运等复杂动作。' },
  中间翻板机: { desc: '翻板机械手，180°翻转板件。' },
  中间输送机: { desc: '标准传送段，连接制程设备。' },
  龙门式传送机: { desc: '龙门结构传送机，用于大型设备间传送。' },
  单边投板机: { desc: '单边投板机，自动上板至生产线。' },
  单边收板机: { desc: '单边收板机，自动下板至料盒。' },
  双边投板机: { desc: '双边投板机，双侧同时投板提高产能。' },
  双边收板机: { desc: '双边收板机，双侧同时收板。' },
  盒装投板机: { desc: '盒装板件投板机，处理盒装料。' },
  AOI专用机: { desc: 'AOI检测专用上下板机，高精度定位。' },
  压合专用机: { desc: '压合工艺专用台车系统。' },
  标准输送段: { desc: '通用标准传送段结构。' },
  六轴机械手: { desc: '通用六轴机械手结构。' },
  台车系统: { desc: '通用台车传送系统。' },
};

export const SENSOR_DATA: Record<string, SensorTypeDefinition> = {
  漫反射: {
    desc: '检测物体漫反射光量，适用于不透明物体的有无检测',
    scenes: ['PCB板检测', '输送线板件有无', '掉板检测', '完板确认'],
    notes: '需注意被测物表面颜色与光泽对检测距离的影响',
    models: [
      {
        brand: 'OMRON',
        model: 'E3Z-D61',
        spec: '检测距离 0~300mm；12~24V DC；PNP/NPN；IP67',
      },
      {
        brand: 'SICK',
        model: 'WL12-2B530',
        spec: '检测距离 0~500mm；10~30V DC；PNP/NPN；IP67',
      },
      {
        brand: 'Keyence',
        model: 'PZ-G61CP',
        spec: '检测距离 0~200mm；12~24V DC；PNP；IP67',
      },
    ],
  },
  对照式: {
    desc: '发射器与接收器相对安装，检测光束遮断，适合透明或半透明物体',
    scenes: ['投板口检测', '宽度检测', '透明板检测'],
    notes: '安装时注意发射器与接收器轴线对准',
    models: [
      {
        brand: 'OMRON',
        model: 'E3Z-T61',
        spec: '检测距离 0~10m；12~24V DC；PNP/NPN；IP67',
      },
      {
        brand: 'SICK',
        model: 'WS12-3D2430',
        spec: '检测距离 0~7m；10~30V DC；PNP；IP67',
      },
    ],
  },
  近接式: {
    desc: '感应金属体接近，无接触检测，响应速度快',
    scenes: ['气缸行程确认', '机械手臂位置', '台车定位'],
    notes: '检测距离受被测金属材质影响，需按实际情况校正',
    models: [
      {
        brand: 'OMRON',
        model: 'E2E-X5MF1',
        spec: '感应距离 5mm；12~24V DC；NPN-NO；IP67',
      },
      {
        brand: 'Autonics',
        model: 'PR12-4DN',
        spec: '感应距离 4mm；10~30V DC；NPN；IP67',
      },
    ],
  },
  静电容式: {
    desc: '可检测金属和非金属物体，对液体及粉粒体有效',
    scenes: ['盒装板件检测', '料位检测', '非金属部件有无'],
    notes: '灵敏度需现场调整，注意周围环境湿度变化影响',
    models: [
      {
        brand: 'OMRON',
        model: 'E2K-X4ME1',
        spec: '感应距离 4mm；12~24V DC；NPN-NO；IP67',
      },
    ],
  },
  光纤式: {
    desc: '通过光纤传导光信号，可在狭窄空间安装',
    scenes: ['狭小空间检测', '高精度定位', '小物体检测'],
    notes: '光纤头需定期清洁，弯曲半径不得小于规格要求',
    models: [
      {
        brand: 'OMRON',
        model: 'E3X-DA11-S',
        spec: '检测距离依光纤；12~24V DC；NPN/PNP；IP67',
      },
      {
        brand: 'Keyence',
        model: 'FS-V21R',
        spec: '检测距离依光纤；12~24V DC；NPN/PNP；IP67',
      },
    ],
  },
  激光式: {
    desc: '激光束检测，精度高，检测距离远',
    scenes: ['精密定位', '小目标检测', '高速检测'],
    notes: '激光为2类激光产品，避免直视光束',
    models: [
      {
        brand: 'Keyence',
        model: 'LV-H62',
        spec: '检测距离 20~300mm；12~24V DC；NPN/PNP；IP67',
      },
    ],
  },
  超声波式: {
    desc: '超声波检测，不受颜色影响，适合透明物体',
    scenes: ['透明物体检测', '液位检测', '料位检测'],
    notes: '温度变化会影响检测精度，需补偿',
    models: [
      {
        brand: 'SICK',
        model: 'UM30-213113',
        spec: '检测距离 30~300mm；10~30V DC；PNP；IP67',
      },
    ],
  },
  压力传感器: {
    desc: '检测气压或液压，用于真空吸附确认',
    scenes: ['真空吸盘确认', '气缸压力监控', '泄漏检测'],
    notes: '定期校验压力值，清理压力接口',
    models: [
      {
        brand: 'PISCO',
        model: 'ZSE10',
        spec: '检测范围 -101~101kPa；12~24V DC；NPN/PNP；IP40',
      },
    ],
  },
};

function cloneMachineRows(
  rows: Array<
    Pick<
      MachineSectionRow,
      | 'id'
      | 'role'
      | 'sensorType'
      | 'spec'
      | 'purpose'
      | 'name'
      | 'desc'
      | 'note'
    >
  >,
): MachineSectionRow[] {
  return rows.map((row) => ({ ...row, processStepId: null, sensorIds: [] }));
}

export const LEGACY_DEMO_CRUD_DEFAULTS: CrudDefaults = {
  'customer-req': (): CustomerReqItem[] => [
    {
      id: 1,
      type: '输送段',
      machine: 'ALL',
      process: '',
      content: '板件有无检测，检测距离不大于 300mm',
      source: '验收规范',
      note: 'OMRON E3Z-D61 或同等级',
    },
    {
      id: 2,
      type: '掉板检测',
      machine: 'ALL',
      process: '',
      content: '传送路径中段与末端双重设置',
      source: '客户要求',
      note: '零容忍掉板要求',
    },
  ],
  'customer-proc': (): CustomerProcItem[] => [
    {
      id: 1,
      type: 'DES 制程',
      role: '板件传送检测',
      feature: '进出口设置漫反射传感器',
      sensorNote: '',
      note: '防止空喷损耗',
    },
    {
      id: 2,
      type: 'AOI 制程',
      role: '板件定位',
      feature: '定位精度不大于 0.1mm',
      sensorNote: '镜头保持清洁',
      note: 'Keyence FS 系列',
    },
  ],
  'customer-feedback': (): TimelineItem[] => [
    {
      id: 1,
      type: '选型配置异常',
      machine: '六轴上板机',
      problem: '快速运行时吸板失败率偏高，影响产能。',
      measure: '更换快速响应型真空表头后恢复稳定。',
      date: '2024-10-15',
      status: '已解决',
      measureHistory: [],
    },
    {
      id: 2,
      type: '感应器异常',
      machine: 'AOI 段',
      problem: '光纤传感器镜头积灰导致定位偏移。',
      measure: '清洁镜头并增加每周清洁提醒。',
      date: '2024-09-22',
      status: '已解决',
      measureHistory: [],
    },
  ],
  'machine-conveyor': () =>
    cloneMachineRows([
      {
        id: 1,
        role: '进板检测',
        sensorType: '漫反射传感器',
        spec: 'OMRON E3Z-D61',
        purpose: '安装于进板口',
        name: '',
        desc: '',
        note: '板件前缘到位信号',
      },
      {
        id: 2,
        role: '掉板检测',
        sensorType: '对照式传感器',
        spec: 'SICK WL12-2B530',
        purpose: '',
        name: '',
        desc: '',
        note: '零容忍掉板要求',
      },
      {
        id: 3,
        role: '出板检测',
        sensorType: '漫反射传感器',
        spec: '',
        purpose: '确认板件完全离开',
        name: '',
        desc: '',
        note: '触发下一动作',
      },
    ]),
  'machine-arm': () =>
    cloneMachineRows([
      {
        id: 1,
        role: '吸盘真空',
        sensorType: '真空表头压力传感器',
        spec: 'PISCO ZSE10F',
        purpose: '响应时间不大于 0.3s',
        name: '',
        desc: '',
        note: '吸附成功才移动',
      },
      {
        id: 2,
        role: '手臂位置',
        sensorType: '近接式传感器',
        spec: 'OMRON E2E-X5ME1',
        purpose: '感应距离 5mm',
        name: '',
        desc: '',
        note: '检测手臂原点位',
      },
    ]),
  'machine-platform': () =>
    cloneMachineRows([
      {
        id: 1,
        role: '台车到位',
        sensorType: '近接式传感器',
        spec: '',
        purpose: '检测台车对接到位',
        name: '',
        desc: '',
        note: '定位精度正负 0.5mm',
      },
      {
        id: 2,
        role: '升降位置',
        sensorType: '光电式传感器',
        spec: '',
        purpose: '检测升降机构上下限位',
        name: '',
        desc: '',
        note: '防止碰撞',
      },
    ]),
  'machine-notes': () =>
    cloneMachineRows([
      {
        id: 1,
        role: '安装注意',
        sensorType: '',
        spec: '',
        purpose: '',
        name: '传感器安装角度',
        desc: '垂直被测面正负 15 度以内',
        note: '避免镜面反射误检',
      },
      {
        id: 2,
        role: '环境注意',
        sensorType: '',
        spec: '',
        purpose: '',
        name: '防水防尘等级',
        desc: '湿制程区域使用 IP67 以上',
        note: '定期清洁',
      },
      {
        id: 3,
        role: '调试注意',
        sensorType: '',
        spec: '',
        purpose: '',
        name: '灵敏度调节',
        desc: '就位后现场调整至稳定检测',
        note: '记录调节量',
      },
    ]),
  'process-feat': () => [
    {
      id: 1,
      type: '特性',
      name: '高温高湿环境',
      desc: '需选用耐高温传感器',
      note: '',
    },
  ],
  'process-sensor': () => [
    {
      id: 1,
      type: '输送段',
      name: '漫反射型传感器',
      desc: 'OMRON E3Z-D61 或同等级',
      note: '板件有无检测',
    },
    {
      id: 2,
      type: '掉板段',
      name: '对照式传感器',
      desc: 'SICK WL12 系列',
      note: '中段与末端',
    },
    {
      id: 3,
      type: '完板段',
      name: '光纤式传感器',
      desc: 'Keyence FS 系列',
      note: 'AOI 段定位',
    },
    {
      id: 4,
      type: '真空段',
      name: '真空表头压力传感器',
      desc: 'PISCO ZSE10',
      note: '六轴机吸板',
    },
  ],
};

// 只保留少量可直接使用的首装业务资料，帮助新环境快速确认页面结构。
// 数据严格按客户键写入，其他客户和未配置的客户仍然保持为空。
export const INITIAL_CRUD_DATA: Record<string, CrudRecord[]> = {
  'customer-req:庆鼎': [
    {
      id: 1,
      type: '输送段',
      machine: 'ALL',
      process: 'DES显影',
      content: '进板前确认板件到位后再启动输送',
      source: '客户要求',
      note: '首件验证时确认传感器响应',
    },
    {
      id: 2,
      type: '出板检测',
      machine: 'ALL',
      process: 'DES显影',
      content: '出板信号确认后再进入下一工序',
      source: '客户要求',
      note: '与下游设备联锁',
    },
  ],
  'customer-req:景旺': [
    {
      id: 1,
      type: '掉板检测',
      machine: 'ALL',
      process: '压合',
      content: '中段与末端均需设置掉板检测',
      source: '验收规范',
      note: '联动停机并记录报警',
    },
    {
      id: 2,
      type: '进板检测',
      machine: 'ALL',
      process: 'AOI检测',
      content: '进入 AOI 前需确认板件边缘无遮挡',
      source: '客户要求',
      note: '避免误触发检测',
    },
  ],
  'customer-proc:庆鼎': [
    {
      id: 1,
      type: 'DES 制程',
      role: '板件传送检测',
      feature: '进出口设置漫反射传感器',
      sensorNote: '镜头保持清洁',
      note: '首件确认检测距离',
    },
  ],
  'customer-proc:景旺': [
    {
      id: 1,
      type: 'AOI 制程',
      role: '板件定位',
      feature: '定位精度不大于 0.1mm',
      sensorNote: '保持镜头清洁',
      note: '每班点检一次',
    },
  ],
  'customer-feedback:庆鼎': [
    {
      id: 1,
      type: '选型配置异常',
      machine: '中间六轴机',
      problem: '快速运行时吸板失败率偏高，影响产能。',
      measure: '更换快速响应型真空表头后恢复稳定。',
      date: '2024-10-15',
      status: '已解决',
      measureHistory: [],
    },
  ],
};

function initialCrudRows(listId: string, entityName: string): CrudRecord[] {
  return (INITIAL_CRUD_DATA[`${listId}:${entityName}`] || []).map((item) => ({
    ...item,
  }));
}

// 正式业务数据按客户独立初始化；运行时缺失键仍然保持为空，不会回退到其他客户。
export const CRUD_DEFAULTS: CrudDefaults = {
  'customer-req': (entityName) => initialCrudRows('customer-req', entityName),
  'customer-proc': (entityName) => initialCrudRows('customer-proc', entityName),
  'customer-feedback': (entityName) =>
    initialCrudRows('customer-feedback', entityName),
};

export const PROCESS_LAYER_OPTIONS = ['内层', '外层'];

export function createProcessStepDefaults(): ProcessStepItem[] {
  let id = 1;
  const steps: ProcessStepItem[] = [];
  for (const group of PROCESS_GROUPS) {
    if (group.name === '制程介绍') continue;
    const layer = group.name.includes('外层') ? '外层' : '内层';
    for (const name of group.items) {
      steps.push({
        id: id++,
        layer,
        name,
        role: PROCESS_DETAILS[name]?.desc || '',
        feature: '',
        note: '',
      });
    }
  }
  return steps;
}

export const SEED_VERSION = 10;

export const SENSOR_STATUS_OPTIONS = ['现用', '备选', '停用'];

export const SENSOR_TYPE_OPTIONS = Object.keys(SENSOR_DATA);

export const FEEDBACK_TYPE_OPTIONS = [
  '感应器异常',
  '测板厚异常',
  '智能化异常',
  '选型配置异常',
  '客户要求',
  '料件损坏',
  '厂外改善',
  '其他',
];

export const FEEDBACK_STATUS_OPTIONS = [
  '01 待处理',
  '02 处理中',
  '03 测试中',
  '04 已解决',
];

export const CUSTOMER_REQ_SOURCE_OPTIONS = [
  '验收规范',
  '厂外改善',
  '客户要求',
  '产品更新迭代',
  '其他',
];

export const CRUD_TYPE_OPTIONS = {
  'customer-req': [
    '输送段',
    '掉板检测',
    '真空吸附',
    '位置确认',
    'AOI段',
    '特殊要求',
  ],
  'customer-proc': ['DES 制程', 'AOI 制程', '压合制程', '防焊制程', '通用'],
  'process-feat': ['特性', '要求', '限制', '其他'],
  'process-sensor': ['输送段', '掉板段', '完板段', '真空段', '其他'],
};

export const MACHINE_SECTION_SEED: MachineSectionItem[] = [
  { id: 1, name: '输送机构', sort: 1, kind: 'structure', scope: 'global' },
  { id: 2, name: '手臂机构', sort: 2, kind: 'structure', scope: 'global' },
  { id: 3, name: '台车工位结构', sort: 3, kind: 'structure', scope: 'global' },
  {
    id: 4,
    name: '机型注意事项',
    sort: 4,
    kind: 'notes',
    locked: true,
    scope: 'global',
  },
];

export const GENERAL_STRUCTURE_CATEGORY = '通用结构';

export const GENERAL_STRUCTURE_SECTION_LABELS: Record<number, string> = {
  1: '标准输送段',
  2: '六轴机械手',
  3: '台车系统',
};

export const MACHINE_SECTION_LEGACY_MAP: Record<string, number> = {
  'machine-conveyor': 1,
  'machine-arm': 2,
  'machine-platform': 3,
  'machine-notes': 4,
};

export const MACHINE_ROW_IMAGE_RULES = {
  accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export const DICTIONARY_DEFINITIONS: DictionaryDefinition[] = [
  {
    code: 'customer-req',
    title: '要求分类',
    description: '客户通用要求中的分类，全局共用',
    field: 'type',
    listIds: ['customer-req'],
    defaults: CRUD_TYPE_OPTIONS['customer-req'],
  },
  {
    code: 'customer-req-source',
    title: '要求来源',
    description: '客户通用要求项中的来源，全局共用',
    field: 'source',
    listIds: ['customer-req'],
    defaults: CUSTOMER_REQ_SOURCE_OPTIONS,
  },
  {
    code: 'customer-proc',
    title: '制程分类',
    description: '制程注意事项中的分类，全局共用',
    field: 'type',
    listIds: ['customer-proc'],
    defaults: CRUD_TYPE_OPTIONS['customer-proc'],
  },
  {
    code: 'customer-feedback',
    title: '厂外反馈问题分类',
    description: '厂外反馈问题项中的问题分类，全局共用',
    field: 'type',
    listIds: ['customer-feedback'],
    defaults: FEEDBACK_TYPE_OPTIONS,
  },
  {
    code: 'customer-feedback-status',
    title: '厂外反馈状态',
    description: '厂外反馈问题项中的处理状态，全局共用',
    field: 'status',
    listIds: ['customer-feedback'],
    defaults: FEEDBACK_STATUS_OPTIONS,
  },
  {
    code: 'process-layer',
    title: '制程分层',
    description: '工艺制程所属内层或外层，全局共用',
    field: 'layer',
    listIds: [],
    catalog: 'process-step',
    defaults: PROCESS_LAYER_OPTIONS,
  },
  {
    code: 'sensor-status',
    title: 'Sensor 状态',
    description: 'Sensor型号中的状态，全局共用',
    field: 'status',
    listIds: [],
    catalog: 'sensor',
    defaults: SENSOR_STATUS_OPTIONS,
  },
  {
    code: 'sensor-type',
    title: '感应器类型',
    description: 'Sensor型号中的感应器类型，全局共用',
    field: 'sensorType',
    listIds: [],
    catalog: 'sensor',
    defaults: SENSOR_TYPE_OPTIONS,
  },
];

export const ENTITY_KIND_DEFINITIONS: EntityKindDefinition[] = [
  {
    kind: 'customer',
    label: '客户',
    groupLabel: '区域',
    listIds: ['customer-req', 'customer-proc', 'customer-feedback'],
    hasControlledFiles: true,
    seedGroups: CUSTOMER_GROUPS,
  },
  {
    kind: 'machine',
    label: '机型',
    groupLabel: '分类',
    listIds: [],
    hasControlledFiles: false,
    seedGroups: MACHINE_GROUPS,
  },
];

export function createEntityGroupDefaults(kind: EntityKind): EntityGroup[] {
  const definition = ENTITY_KIND_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) return [];
  return definition.seedGroups.map((group) => ({
    name: group.name,
    items: [...group.items],
    ...(group.configurations
      ? {
          configurations: group.configurations.map((configuration) => ({
            name: configuration.name,
            items: [...configuration.items],
          })),
        }
      : {}),
  }));
}

export function createDictionaryDefaults(code: string): DictionaryItem[] {
  const definition = DICTIONARY_DEFINITIONS.find((item) => item.code === code);
  const names = definition?.defaults || [];
  return names.map((name, index) => ({
    id: index + 1,
    name,
    sort: index + 1,
  }));
}

export function createFeedbackTypeDefaults(): DictionaryItem[] {
  return createDictionaryDefaults('customer-feedback');
}
