export const CUSTOMER_GROUPS = [
  { name: '华东', items: ['庆鼎', '健鼎', '沪士', '胜宏', '景旺'] },
  { name: '华南', items: ['宏恒胜', '崇达', '深南', '兴森', '博敏'] },
  { name: 'SAT', items: ['维信', '依顿', '奥士康', '华通', '定颖'] },
];

export const PROCESS_GROUPS = [
  { name: '制程介绍', items: ['制程报告'] },
  {
    name: '内层制程',
    items: ['DES显影', 'AOI检测', '棕化', '压合', '钻孔', 'PTH沉铜', '板电'],
  },
  { name: '外层制程', items: ['外层前处理', '图形电镀', '防焊', '成型'] },
];

export const MACHINE_GROUPS = [
  {
    name: '中间段',
    items: ['中间六轴机', '中间翻板机', '中间输送机', '龙门式传送机'],
  },
  {
    name: '常规投收板机',
    items: [
      '单边投板机',
      '单边收板机',
      '双边投板机',
      '双边收板机',
      '盒装投板机',
    ],
  },
  { name: '特殊机型', items: ['AOI专用机', '压合专用机'] },
  { name: '通用结构', items: ['标准输送段', '六轴机械手', '台车系统'] },
];

export const PROCESS_DETAILS = {
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

export const MACHINE_DETAILS = {
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

export const SENSOR_DATA = {
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

export const CRUD_DEFAULTS = {
  'customer-req': () => [
    {
      id: 1,
      type: '输送段',
      name: '漫反射传感器',
      desc: '板件有无检测，检测距离不大于 300mm',
      note: 'OMRON E3Z-D61 或同等级',
    },
    {
      id: 2,
      type: '掉板检测',
      name: '对照式传感器',
      desc: '传送路径中段与末端双重设置',
      note: '零容忍掉板要求',
    },
    {
      id: 3,
      type: '真空吸附',
      name: '真空表头压力传感器',
      desc: '真空度大于 -60kPa，响应时间不大于 0.3s',
      note: 'PISCO ZSE10',
    },
    {
      id: 4,
      type: '位置确认',
      name: '近接式传感器',
      desc: '台车对接定位精度在正负 0.5mm 以内',
      note: 'OMRON E2E 系列',
    },
  ],
  'customer-proc': () => [
    {
      id: 1,
      type: 'DES 制程',
      name: '板件传送检测',
      desc: '进出口设置漫反射传感器',
      note: '防止空喷损耗',
    },
    {
      id: 2,
      type: 'AOI 制程',
      name: '板件定位传感器',
      desc: '定位精度不大于 0.1mm',
      note: 'Keyence FS 系列',
    },
    {
      id: 3,
      type: '压合制程',
      name: '台车工位传感器',
      desc: '每工位确认台车锁紧',
      note: '重要安全要求',
    },
    {
      id: 4,
      type: '防焊制程',
      name: '板件到位传感器',
      desc: '曝光前确认板件落位',
      note: '避免空曝光',
    },
  ],
  'customer-feedback': () => [
    {
      id: 1,
      type: '选型配置异常',
      machine: '六轴上板机',
      problem: '快速运行时吸板失败率偏高，影响产能。',
      measure: '更换快速响应型真空表头后恢复稳定。',
      date: '2024-10-15',
      status: '已解决',
    },
    {
      id: 2,
      type: '感应器异常',
      machine: 'AOI 段',
      problem: '光纤传感器镜头积灰导致定位偏移。',
      measure: '清洁镜头并增加每周清洁提醒。',
      date: '2024-09-22',
      status: '已解决',
    },
  ],
  'machine-conveyor': () => [
    {
      id: 1,
      type: '进板检测',
      name: '漫反射传感器',
      desc: 'OMRON E3Z-D61，安装于进板口',
      note: '板件前缘到位信号',
    },
    {
      id: 2,
      type: '掉板检测',
      name: '对照式传感器',
      desc: 'SICK WL12-2B530',
      note: '零容忍掉板要求',
    },
    {
      id: 3,
      type: '出板检测',
      name: '漫反射传感器',
      desc: '确认板件完全离开',
      note: '触发下一动作',
    },
  ],
  'machine-arm': () => [
    {
      id: 1,
      type: '吸盘真空',
      name: '真空表头压力传感器',
      desc: 'PISCO ZSE10F，响应时间不大于 0.3s',
      note: '吸附成功才移动',
    },
    {
      id: 2,
      type: '手臂位置',
      name: '近接式传感器',
      desc: 'OMRON E2E-X5ME1，感应距离 5mm',
      note: '检测手臂原点位',
    },
  ],
  'machine-platform': () => [
    {
      id: 1,
      type: '台车到位',
      name: '近接式传感器',
      desc: '检测台车对接到位',
      note: '定位精度正负 0.5mm',
    },
    {
      id: 2,
      type: '升降位置',
      name: '光电式传感器',
      desc: '检测升降机构上下限位',
      note: '防止碰撞',
    },
  ],
  'machine-notes': () => [
    {
      id: 1,
      type: '安装注意',
      name: '传感器安装角度',
      desc: '垂直被测面正负 15 度以内',
      note: '避免镜面反射误检',
    },
    {
      id: 2,
      type: '环境注意',
      name: '防水防尘等级',
      desc: '湿制程区域使用 IP67 以上',
      note: '定期清洁',
    },
    {
      id: 3,
      type: '调试注意',
      name: '灵敏度调节',
      desc: '就位后现场调整至稳定检测',
      note: '记录调节量',
    },
  ],
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

export const PROCESS_LAYER_OPTIONS = ['内层', '外层'];

export function createProcessStepDefaults() {
  let id = 1;
  const steps = [];
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

export const SENSOR_STATUS_OPTIONS = ['现用', '备选', '停用'];

export const SENSOR_TYPE_OPTIONS = Object.keys(SENSOR_DATA);

export const FEEDBACK_TYPE_DEFAULTS = [
  { id: 1, name: '感应器异常', sort: 1 },
  { id: 2, name: '测板厚异常', sort: 2 },
  { id: 3, name: '智能化异常', sort: 3 },
  { id: 4, name: '选型配置异常', sort: 4 },
  { id: 5, name: '客户要求', sort: 5 },
  { id: 6, name: '料件损坏', sort: 6 },
  { id: 7, name: '厂外改善', sort: 7 },
  { id: 8, name: '其他', sort: 8 },
];

export const FEEDBACK_TYPE_OPTIONS = FEEDBACK_TYPE_DEFAULTS.map(
  (item) => item.name,
);

export const FEEDBACK_STATUS_OPTIONS = ['待处理', '处理中', '已解决'];

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
  'machine-conveyor': ['进板检测', '掉板检测', '出板检测', '定位检测', '其他'],
  'machine-arm': ['吸盘真空', '手臂位置', '抓取检测', '其他'],
  'machine-platform': ['台车到位', '升降位置', '锁紧检测', '其他'],
  'machine-notes': ['安装注意', '环境注意', '调试注意', '维保注意', '安全注意'],
  'process-feat': ['特性', '要求', '限制', '其他'],
  'process-sensor': ['输送段', '掉板段', '完板段', '真空段', '其他'],
};

export const MACHINE_SECTION_SEED = [
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

/**
 * 仅「通用结构」分类：侧栏机型名 ↔ 全局结构 Tab（按稳定 id）显示名对齐。
 * 其它分类仍直接使用数据字典里的全局 Tab 名称。
 */
export const GENERAL_STRUCTURE_CATEGORY = '通用结构';

/** 通用结构初始三项 ↔ 全局结构 Tab 稳定 id（其它机型仍显示字典原名） */
export const GENERAL_STRUCTURE_SECTION_LABELS = {
  1: '标准输送段',
  2: '六轴机械手',
  3: '台车系统',
};

export const MACHINE_SECTION_LEGACY_MAP = {
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

export function machineSectionTypeOptions(sectionId) {
  const map = {
    1: CRUD_TYPE_OPTIONS['machine-conveyor'],
    2: CRUD_TYPE_OPTIONS['machine-arm'],
    3: CRUD_TYPE_OPTIONS['machine-platform'],
    4: CRUD_TYPE_OPTIONS['machine-notes'],
  };
  return map[sectionId] || ['其他'];
}

export const DICTIONARY_DEFINITIONS = [
  {
    code: 'customer-req',
    title: '要求分类',
    description: '客户通用要求中的分类，全局共用',
    field: 'type',
    listIds: ['customer-req'],
    defaults: CRUD_TYPE_OPTIONS['customer-req'],
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
    description: 'Sensor 型号字典中的状态，全局共用',
    field: 'status',
    listIds: [],
    catalog: 'sensor',
    defaults: SENSOR_STATUS_OPTIONS,
  },
  {
    code: 'sensor-type',
    title: '感应器类型',
    description: 'Sensor 型号字典中的感应器类型，全局共用',
    field: 'sensorType',
    listIds: [],
    catalog: 'sensor',
    defaults: SENSOR_TYPE_OPTIONS,
  },
  {
    code: 'machine-section',
    title: '机型结构 Tab',
    description: '机型详情全局 Tab；注意事项锁定且无附加图片',
    field: 'type',
    listIds: [],
    catalog: 'machine-section',
    defaults: MACHINE_SECTION_SEED.map((item) => item.name),
  },
];

export const ENTITY_KIND_DEFINITIONS = [
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

export function createEntityGroupDefaults(kind) {
  const definition = ENTITY_KIND_DEFINITIONS.find((item) => item.kind === kind);
  if (!definition) return [];
  return definition.seedGroups.map((group) => ({
    name: group.name,
    items: [...group.items],
  }));
}

export const CRUD_COLUMN_LABELS = {
  'customer-req': ['要求分类', '要求名称', '要求说明', '备注'],
  'customer-proc': ['制程分类', '注意事项', '说明', '备注'],
  'process-sensor': ['检测位置', '推荐型号', '选用说明', '备注'],
  'machine-conveyor': ['检测位置', '配置名称', '配置说明', '备注'],
  'machine-arm': ['机构位置', '配置名称', '配置说明', '备注'],
  'machine-platform': ['工位位置', '配置名称', '配置说明', '备注'],
  'machine-notes': ['注意分类', '事项名称', '说明', '备注'],
};
