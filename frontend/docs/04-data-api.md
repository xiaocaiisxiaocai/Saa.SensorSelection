# 04 · 数据层与后端接口契约

这份文档描述当前前端、后端共同遵守的数据与接口契约。

---

## 1. 领域层

领域规则位于 TypeScript 领域层；后端负责并发前置条件、原子批次、目录结构和文件引用完整性等信任边界校验。对照规格见 `07-domain-spec.md`。

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

`storage` 是 `StorageLike`（`getItem` / `setItem`）。运行中的应用只传 `BackendStorage`；`window.localStorage` 和前端种子只用于旧数据兼容及可控测试夹具，不作为在线业务数据源。

### 关键语义（重写时不能破坏）

1. **写入失败必须回滚。** 领域修改先形成乐观内存状态；服务端原子批次失败时，`BackendStorage` 恢复最后确认快照并提示冲突或错误。页面必须等待 `waitForPendingWrites()` 确认服务端实际成功后再提示保存完成或关闭编辑界面。
2. **SQLite 是唯一在线数据源。** 浏览器不缓存业务数据；后端不可达时保留当前页面已加载内容但禁止继续写入，刷新后必须重新从后端读取。
3. **机型结构行以 `sensorIds` 为准。** `sensorType` / `spec` 是旧数据兼容字段，读取时容忍，新增/编辑时不作为数据源。
4. **前端种子只用于测试与显式迁移工具。** 生产页面不在空库时自动灌入本地快照或前端种子；账号、角色和可选演示 Store 的首次初始化由后端 `DbSeeder` 负责。

---

## 2. 存储键约定

历史浏览器主键为 **`symtek_crud_store`**（常量 `STORAGE_KEY`，不可改，旧数据兼容和测试夹具仍依赖它）；当前在线应用不再读写该键作为业务缓存。后端 `/api/store` 保存 `{ [业务key]: 数组 }`。

| 业务 key 模式 | 内容 |
| --- | --- |
| `entity-groups:customer` / `entity-groups:machine` | 分组与条目顺序；machine 可含有序 `configurations: [{ name, items }]` |
| `customer-req:{客户}/{厂区}` | 客户通用要求（客户目录是「客户 → 厂区」，资料挂在厂区上；厂区的区域在 `entity-groups:customer` 的 `regions` 里） |
| `customer-proc:{客户}/{厂区}` | 制程注意事项 |
| `customer-feedback:{客户}/{厂区}` | 厂外反馈问题项 |
| `customer-sop:{客户}/{厂区}` | 受控文档（PDF/Word；上传时为 data URL，保存后替换为独立文件 URL） |
| `dict:{字典code}` | 8 类数据字典 |
| `process-steps:all` | 工艺制程 |
| `sensor-catalog:all` | Sensor 型号目录 |
| `sensor-sop-file:all` | Sensor SOP 文件库（PDF，不参与型号关联） |
| `sensor-sop:all` | Sensor 资料文件（历史兼容键，当前为 PDF 资料） |
| `sensor-3d:all` | Sensor 3D 文件（暂为 PDF） |
| `machine-tabs:all` | 机型一级 Tab：`{ id, catalog: mechanism\|project, name, sort, kind: structure\|notes, pages: { id, name, node: { category, configuration, item } }[] }`；`pages` 是二级 Tab，`node` 是它所属的选单节点（只有 category 为分类，带 configuration 为配置，带 item 为机型），名称在同一 Tab、同一节点内不重复，id 在所有 Tab 间唯一。有子选单的节点不能有二级 Tab，有二级 Tab 的节点不能再加子选单。旧格式的 `machines: 机型名[]` 读出时转成同名二级 Tab，挂在同名机型节点下 |
| `machine-section-rows:{二级 Tab id}:@tab-page` / `machine-section-images:{二级 Tab id}:@tab-page` | 二级 Tab 的内容（所有者位固定为 `MACHINE_TAB_PAGE_OWNER`，机型名不能取这个值）；删除二级 Tab / Tab 时一起删除 |
| `machine-section-rows:1000:{机型名}` / `machine-section-images:1000:{机型名}` | 旧模型里机型自己的内容（`MACHINE_CONTENT_SECTION_ID`），读旧格式 Tab 时搬到二级 Tab 下；页面不再直接显示 |
| `machine-extra-sections:{机型名}` | 旧模型里机型自建的 Tab（页面不再显示，数据保留） |
| `machine-section-rows:{sectionId}:{机型名}` | 旧模型的结构/注意事项行（`sectionId` 为上一行旧 Tab 的 id） |
| `machine-section-images:{sectionId}:{机型名}` | 旧的分区示意图（最多 2 张，已不再写入）：读到时挂到该分区的记录上并清空。示意图现在是记录的 `image` 字段（`machine-section-rows` 里每行一张，相邻同图在表格里合并） |

文件字段沿用 `dataUrl` 名称以兼容既有领域模型，但持久化后的值是 `/api/files/{id}/content`。页面初始化只下载轻量 Store JSON；PDF 与图片可匿名内联预览，Word、PPT 等其他附件的 `/content` 和 `/download` 都要求 `file:download` 并记录下载审计。正文仅在预览或下载时按需请求。
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
| POST | `/store/batch` | `selection:write`（跨 key 原子 CAS，前端常规写入） |
| PUT | `/store` | `selection:write`（全量替换，必须带全库 `If-Match`） |
| PUT | `/store/by-key?key={key}` | `selection:write`（兼容单 key 写，必须带 `If-Match`） |
| PUT | `/store/entity-groups/{customer\|machine}` | `selection:write`（目录专用校验，必须带 `If-Match`） |
| DELETE | `/store/by-key?key={key}` | `selection:write`（兼容单 key删除，必须带 `If-Match`） |

GET 响应带强 ETag，单 key 不存在时也返回固定 missing ETag。旧写接口缺少 `If-Match` 返回 428，ETag 陈旧返回 412。批次请求为 `{ changes: [{ key, expected, value }] }`：`expected` 必须显式为上次确认的数组或 `null`，`value` 为目标数组或删除用 `null`；任一 expected 冲突返回 409 且整个 SQLite 事务不写入。成功返回 `{ ok: true, values: { [key]: array | null } }`；校验失败为 400。

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
| GET | `/audit-logs/operations` | `audit:view` | `page`、`pageSize`、`keyword`、`action`（可重复，多选）、`kind`（可重复，多选操作类型）、`result`、`from`、`to`、`hideLogin` |
| GET | `/audit-logs/operations/kinds` | `audit:view` | 无；返回日志里出现过的操作类型（没有操作名称的是操作码），字符串数组 |

`/audit-logs` 返回 `{ items: [...], total }`，每条带 `changes`（变更明细 JSON 字符串，可能为 null）、`operationId`、`operationLabel`。

`/audit-logs/operations` 按操作分页：返回 `{ items: [{ operationId, label, timestamp, username, displayName, ip, result, entryCount, entries: [日志…] }], total }`，`total` 是操作数。筛选落在单条日志上，任一条命中，整组都返回；`result` 只有组内全部成功才为 true，筛选 `result=true` 也只返回全部成功的操作，`result=false` 返回有任一条失败的操作；`entries` 最多 200 条。

**操作编号**：业务写入（优先 `POST /store/batch`，兼容旧 `PUT/DELETE`）可带请求头 `X-Operation-Id`（8–64 位字母数字和 `-`）与 `X-Operation-Label`（URL 编码的操作名称，最长 120 字）。同一编号的日志归为一次操作；服务端存成「用户名:编号」，别的用户无法串组。不带时每条日志自成一次操作。前端由 `api/audit-operation.ts` 的 `runAsOperation` 设置，`BackendStorage` 在写入入队时用 `captureContext` 取走。

**操作类型**（`OperationKind`）：写入时由操作名称截到第一个「「」或「 · 」之前得到（「新增选型记录 · 机型A」→「新增选型记录」）；`kind` 筛选匹配 `OperationKind ?? Action`，所以没有名称的日志可以按操作码筛。

**变更明细**（`changes`）：`{ added, removed, modified, addedCount, removedCount, modifiedCount, reordered, truncated }`。数据写入按记录的 `id`（没有用 `name`，标量数组用值本身）比较写入前后；每条是 `{ label, fields: [{ name, before?, after? }] }`，`name` 是原始字段名（用户 / 角色 / 组织直接是中文字段名，不含密码）。每类最多 50 条、每个值最多 300 字，超出时 `truncated: true`，总数看 `*Count`。没有任何变化时为 null。

**健康检查**：`GET /health`。

---

## 4. 权限与角色

权限码全集（后端 `RbacDefaults`，前端不得自造）：

| 权限码 | 名称 | 模块 |
| --- | --- | --- |
| `selection:read` | 查看业务数据 | 业务 |
| `selection:write` | 编辑业务数据 | 业务 |
| `file:download` | 下载文件 | 业务 |
| `data:transfer` | 导入导出数据 | 业务 |
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

JWT 的 `sub` 是不可复用的用户 ID，权限码位于 `perm` 声明；额外 HMAC 会话指纹绑定用户 ID、密码哈希和当前角色/权限，JWT 不暴露密码哈希。改密、停用、删除、降权或角色权限变化后，旧 token 会在下一次请求校验时失效；同名账号重建不能复活旧 token。前端把 `permissions` 存进 auth store 供 `useAccess()` 使用。

---

## 5. 前端状态机

`BackendStorage` 的四个状态，UI 必须区分：

| 状态 | 含义 | UI 表现 |
| --- | --- | --- |
| `connecting` | 初始化中 | 内容区骨架/loading |
| `online` | 后端可达 | 正常读写 |
| `offline` | 后端不可达或写入冲突后等待重连 | 橙色横幅；保持当前已加载页面，只读并自动退避重连 |
| `unauthorized` | token 缺失/失效 | 红色横幅，清理失效身份并跳登录页；禁止写入 |

初始化流程（`BackendStorage.init()`，已实现，UI 只需展示结果）：
1. 拉 `/store`。失败 → 降级 `offline` 或 `unauthorized`。
2. 成功 → 以远端快照重建领域仓库并进入 `online`；远端为空就显示为空。
3. 后续保存计算相对最后确认快照的 change 集合，通过 `/store/batch` 原子提交；只有服务端返回成功才更新确认快照并反馈成功。
4. 401 进入 `unauthorized`；403 只回滚该次写入并提示无权限，不改变登录状态。

---

## 6. 测试与显式迁移种子

以下数据只供 Vitest/合同测试夹具和显式迁移工具使用，运行中的前端不会向空后端自动写入。后端账号、角色、默认组织及可选演示 Store 只在全新数据库首次初始化；后续启动不恢复已删除账号或管理员主动撤销的普通角色权限。

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
| `E2E_BASE_URL` | 无 | UI／文件 E2E 必须显式指定的隔离前端地址 |
| `API_BASE` | 无 | API／UI E2E 必须显式指定的隔离 API 地址 |

E2E 地址没有 localhost 默认值，必须指向独立、可丢弃的服务和数据库。Windows 浏览器自动化还必须遵守全局 CORE-19，不得在 SAC 身份下启动已知会触发认证失败与锁定的 Edge／Playwright Chromium 版本。

实施计划见 `05-implementation-plan.md`。
