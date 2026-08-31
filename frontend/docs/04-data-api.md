# 04 · 数据层与后端接口契约

后端**不做任何改动**。这份文档是新前端必须遵守的契约。

---

## 1. 领域层：TypeScript 从零重写

后端**不做任何改动**。领域层**行为必须与现有实现等价**，但禁止拷贝 `domain.js` / `data.js` / `backend-storage.js` 进新目录。对照规格见 `07-domain-spec.md`。

| 旧文件 | 新文件（拟定） |
| --- | --- |
| `data.js` + `data.d.ts` | `src/domain/seed.ts` + `types.ts` |
| `domain.js` + `domain.d.ts` | `src/domain/repository.ts` + `normalize.ts` + `keys.ts` + `search.ts` |
| `backend-storage.js` | `src/domain/storage.ts` |
| `schematic-report.ts` | `src/domain/schematic-report.ts` |

合同测试 `scripts/selection-contract-test.cjs` 改路径后继续跑。规格没写满之前不写领域层代码。

领域层对外入口：

```ts
createSelectionRepository({ crudDefaults, sensorData, storage })
```

`storage` 是 `StorageLike`（`getItem` / `setItem`）。在线时传 `BackendStorage` 实例，离线时传 `window.localStorage`。

### 关键语义（重写时不能破坏）

1. **写入失败必须回滚。** `persist()` 里 `setItem()` 返回 `false` 视为拒绝（未登录 / 离线写失败），内存快照回滚，返回 `{ ok: false, reason: 'storage' }`。UI 必须把这个失败提示给用户。
2. **在线数据要快照到本地。** `BackendStorage.snapshotLocal()` 每次成功写入后把完整 store 写进 `localStorage`，后端挂掉后刷新页面仍可只读。
3. **机型结构行以 `sensorIds` 为准。** `sensorType` / `spec` 是旧数据兼容字段，读取时容忍，新增/编辑时不作为数据源。
4. **种子版本化回填。** `SEED_VERSION`（当前 `10`）落后时按迁移规则补种缺失数据，不覆盖用户业务记录。版本 8 移除历史全局机型 Tab 定义；版本 9 将机型目录拆分为结构与专案机型；版本 10 以 `01–04` 编号状态为厂外反馈唯一标准，并迁移历史同义状态。改动默认数据时必须递增它。

---

## 2. 存储键约定

单一 `localStorage` 主键：**`symtek_crud_store`**（常量 `STORAGE_KEY`，不可改，旧数据依赖它）。

其内容是 `{ [业务key]: 数组 }`。后端 `/api/store` 存的是同一套业务 key。

| 业务 key 模式 | 内容 |
| --- | --- |
| `entity-groups:customer` / `entity-groups:machine` | 分组与条目顺序；machine 可含有序 `configurations: [{ name, items }]` |
| `customer-req:{客户名}` | 客户通用要求 |
| `customer-proc:{客户名}` | 制程注意事项 |
| `customer-feedback:{客户名}` | 厂外反馈问题项 |
| `controlled-docs:{客户名}` | 受控文档（PDF/Word；上传时为 data URL，保存后替换为独立文件 URL） |
| `dict:{字典code}` | 8 类数据字典 |
| `process-steps:all` | 工艺制程 |
| `sensor-catalog:all` | Sensor 型号目录 |
| `sensor-sop-file:all` | Sensor SOP 文件库（PDF，不参与型号关联） |
| `sensor-sop:all` | Sensor 资料文件（历史兼容键，当前为 PDF 资料） |
| `sensor-3d:all` | Sensor 3D 文件（暂为 PDF） |
| `machine-extra-sections:{机型名}` | 当前机型的用户自定义 tab（结构或机型注意事项） |
| `machine-section-rows:{sectionId}:{机型名}` | 结构/注意事项行 |
| `machine-section-images:{sectionId}:{机型名}` | 结构示意图（最多 2 张） |

文件字段沿用 `dataUrl` 名称以兼容既有领域模型，但持久化后的值是 `/api/files/{id}/content`。页面初始化只下载轻量 Store JSON；PDF、图片和 3D 文件仅在预览或下载时按需请求，避免登录阶段传输文件正文。
| `meta:seed-version` | 种子版本号 |

历史遗留 key（只在读取或种子迁移时处理，不再作为活动配置写入）：`machine-conveyor:*` → `machine-section-rows:1:*`、`machine-arm:*` → `:2:`、`machine-platform:*` → `:3:`、`machine-notes:*` → `:4:`、`dict-feedback-type:all` → `dict:customer-feedback`。版本 8 删除 `dict:machine-section`、`machine-global-sections:all`、`general-structure-labels:all` 定义键，但保留旧 `machine-section-rows/images:*` 内容。版本 10 保留编号反馈状态的既有 id，删除四个无编号同义项，并将 `customer-feedback:*` 历史状态映射为编号名称；无关自定义状态保持不变。

Token 键：**`symtek_token`**（不可改）。

新增的前端本地键（不进 store）：`apple-frontend:theme`、`selection:sidebar-width:{customer|machine}`。

---

## 3. HTTP 客户端契约

`API_BASE` = `import.meta.env.VITE_API_BASE || '/api'`。开发环境 Vite 代理 `/api` → `http://localhost:5080`（可用 `VITE_API_TARGET` 覆盖）。超时默认 30s（`VITE_API_TIMEOUT`）。

请求统一带 `Authorization: Bearer {token}`（有 token 时）和 `Content-Type: application/json`。

### 错误分类（必须保留四分法）

```ts
type ApiErrorKind = 'unauthorized' | 'forbidden' | 'offline' | 'error'
```

| 情况 | kind | 处理 |
| --- | --- | --- |
| 网络失败 / 超时 | `offline` | 降级本地只读，横幅提示，提供「重连」 |
| 401 | `unauthorized` | 登录接口优先透出后端消息（如「用户名或密码错误」），其他接口视为会话失效 |
| 403 | `forbidden` | 「无权限执行此操作」，**不能**当成登录失效弹登录框 |
| 其他非 2xx | `error` | 透出后端 `{ message }` |

后端错误体统一是 `{ "message": "..." }`（部分写接口还带 `{ ok: false, reason: 'validation' }`）。

### 接口清单

前缀均为 `/api`。

**认证**

| 方法 | 路径 | 鉴权 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | 匿名 | `{ username, password }` | `{ token, username, displayName, expiresAt, roles[], permissions[], orgUnit }` |
| GET | `/auth/me` | 需登录 | — | `{ username, displayName, roles[], permissions[], orgUnit }` |

登录额外状态码：`429`（限流，消息含重试分钟数）、`403`（账号已停用）。

**数据仓库**

| 方法 | 路径 | 鉴权 |
| --- | --- | --- |
| GET | `/store` | **匿名可读** |
| GET | `/store/by-key?key={key}` | 匿名可读（代理安全的单 key 契约） |
| PUT | `/store` | `selection:write`（全量替换，迁移用） |
| PUT | `/store/by-key?key={key}` | `selection:write`（前端增量同步使用） |
| PUT | `/store/entity-groups/{customer\|machine}` | `selection:write`（分组顺序专用契约） |
| DELETE | `/store/by-key?key={key}` | `selection:write`（前端增量同步使用） |

写入成功返回 `{ ok: true }`；校验失败 `400` + `{ ok: false, reason: 'validation', message }`。

**报告**

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| POST | `/reports/machine-schematic` | `{ machineNames: string[], sections: [...] }` | HTML Blob（浏览器内可打印为 PDF） |

**RBAC**

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/rbac/users` | `rbac:view` |
| POST | `/rbac/users` | `rbac:user:write` |
| PUT | `/rbac/users/{id}` | `rbac:user:write` |
| PUT | `/rbac/users/{id}/password` | `rbac:user:write` |
| DELETE | `/rbac/users/{id}` | `rbac:user:write` |
| GET | `/rbac/roles` | `rbac:view` |
| GET | `/rbac/roles/permissions` | `rbac:view` |
| POST / PUT / DELETE | `/rbac/roles[/{id}]` | `rbac:role:write` |
| GET | `/rbac/org-units` | `rbac:view` |
| POST / PUT / DELETE | `/rbac/org-units[/{id}]` | `rbac:org:write` |

**审计日志**

| 方法 | 路径 | 权限 | 查询参数 |
| --- | --- | --- | --- |
| GET | `/audit-logs` | `audit:view` | `page`、`pageSize`、`action`、`username`、`target`、`result`、`from`、`to` |

返回 `{ items: [...], total }`。

**健康检查**：`GET /health`。

---

## 4. 权限与角色

权限码全集（后端 `RbacDefaults`，前端不得自造）：

| 权限码 | 名称 | 模块 |
| --- | --- | --- |
| `selection:read` | 查看业务数据 | 业务 |
| `selection:write` | 编辑业务数据 | 业务 |
| `rbac:view` | 查看系统管理 | 系统 |
| `rbac:user:write` | 管理用户 | 系统 |
| `rbac:role:write` | 管理角色 | 系统 |
| `rbac:org:write` | 管理组织架构 | 系统 |
| `audit:view` | 查看操作日志 | 系统 |

内置角色：

| code | 名称 | 权限 |
| --- | --- | --- |
| `admin` | 系统管理员 | 全部（系统角色，不可改删） |
| `editor` | 业务维护员 | `selection:read` + `selection:write` |
| `viewer` | 只读用户 | `selection:read` |

默认账号 `admin` / `admin123`（后端 `Seed:*` 配置可覆盖）。

JWT 里权限码在 `perm` 声明，后端授权策略按它校验。前端把 `permissions` 存进 auth store 供 `useAccess()` 使用。

---

## 5. 前端状态机

`BackendStorage` 的四个状态，UI 必须区分：

| 状态 | 含义 | UI 表现 |
| --- | --- | --- |
| `connecting` | 初始化中 | 内容区骨架/loading |
| `online` | 后端可达 | 正常读写 |
| `offline` | 启动时后端不可达 | 橙色横幅「后端服务不可用，当前为本地模式」+「重连」按钮；本地可读写 |
| `unauthorized` | token 缺失/失效 | 红色横幅；可读本地缓存，**禁止写入**；若持有 token 则自动跳登录页，匿名态不跳 |

初始化流程（`BackendStorage.init()`，已实现，UI 只需展示结果）：
1. 拉 `/store`。失败 → 降级 `offline` 或 `unauthorized`。
2. 远端为空 + 本地有数据 → 全量上传迁移，提示「已将本地数据导入后端（迁移完成）」。
3. 远端为空 + 本地也空 → 上传内置种子，提示「已将内置基础数据初始化到后端」。
4. 种子版本落后 → 补种缺失 key。
5. 成功 → `online` + 快照到本地。

---

## 6. 内置种子数据

来自 `data.js`，新前端原样沿用。

**客户分组**：华东（庆鼎、健鼎、沪士、胜宏、景旺）、华南（宏恒胜、崇达、深南、兴森、博敏）、SAT（维信、依顿、奥士康、华通、定颖）。

**制程分组**：制程介绍（制程报告）、内层制程（DES显影、AOI检测、棕化、压合、钻孔、PTH沉铜、板电）、外层制程（外层前处理、图形电镀、防焊、成型）。

**机型分组**：中间段（中间六轴机、中间翻板机、中间输送机、龙门式传送机）、常规投收板机（单边投板机、单边收板机、双边投板机、双边收板机、盒装投板机）、特殊机型（AOI专用机、压合专用机）、通用结构（标准输送段、六轴机械手、台车系统）。

**Sensor 类型（8 类，含默认型号与规格）**：漫反射、对照式、近接式、静电容式、光纤式、激光式、超声波式、压力传感器。品牌覆盖 OMRON、SICK、Keyence、Autonics、PISCO。

**全局结构 tab 种子**：输送机构(1)、手臂机构(2)、台车工位结构(3)、机型注意事项(4，`kind: notes` + `locked`)。

**通用结构映射**：`1 → 标准输送段`、`2 → 六轴机械手`、`3 → 台车系统`。

**选项清单**：

| 名称 | 值 |
| --- | --- |
| Sensor 状态 | 现用、备选、停用 |
| 制程分层 | 内层、外层 |
| 反馈状态 | 待处理、处理中、测试中、已解决 |
| 反馈问题分类 | 感应器异常、测板厚异常、智能化异常、选型配置异常、客户要求、料件损坏、厂外改善、其他 |
| 要求来源 | 验收规范、厂外改善、客户要求、产品更新迭代、其他 |
| 要求分类 | 输送段、掉板检测、真空吸附、位置确认、AOI段、特殊要求 |
| 制程分类 | DES 制程、AOI 制程、压合制程、防焊制程、通用 |

**图片上传限制**：`.jpg/.jpeg/.png/.webp`，2 MB，每个结构最多 2 张。

---

## 7. 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `/api` | 后端基地址 |
| `VITE_API_TARGET` | `http://localhost:5080` | 开发代理目标 |
| `VITE_API_TIMEOUT` | `30000` | 请求超时（毫秒） |
| `VITE_BASE` | `/` | 部署子路径 |
| `VITE_ROUTER_HISTORY` | 开发 `history`，生产 `hash` | 生产用 hash，IIS 无需 URL Rewrite |
| `VITE_PORT` | `5178` | 开发端口，**与旧前端 5777 错开**，方便新旧并行对照 |

实施计划见 `05-implementation-plan.md`。
