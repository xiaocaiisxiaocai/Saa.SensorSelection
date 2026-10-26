# HANDOFF

## 目录（entity-groups）加字段要同步后端 payload

- 现象：前端给 `entity-groups:customer|machine` 的分组加了新字段，写入成功但刷新后字段消失。
- 根因：`StoreService` 写目录时先校验，再把结果按 `EntityGroupPayload` 重新序列化后落库，payload 里没有声明的字段会被静默丢掉。
- 规避：新增分组字段时同时改 `EntityGroupPayload` 和 `StoreService` 的校验，并在 `StoreTests` 里断言字段能原样读回；直接 PUT 目录的脚本（如 `scripts/e2e/ui-e2e-test.mjs` 的清理）删厂区时要一起删掉 `regions` 里对应的键，否则后端返回 400。
- 日期：2026-10-25

## 列宽拖拽手柄会盖住表头的筛选漏斗

- 现象：表头带漏斗筛选的列点不开筛选（`test:ui` 里点击超时），实际点到的是列宽拖拽手柄。
- 根因：手柄在本列右边缘以内且 `z-index: 1`，antd 又用负外边距把漏斗推到表头右缘，两者重叠。
- 规避：`styles/global.css` 里手柄宽度等于表头右内边距（8px），并取消漏斗的负外边距；改手柄宽度或位置时，确认表头漏斗还能点开。
- 日期：2026-10-25

## E2E 里收起点击触发的 a-dropdown 要再点一次触发按钮

- 现象：`a-dropdown :trigger="['click']"` 打开后按 Escape 不收起，后面的检查被残留的下拉菜单挡住。
- 规避：在 `scripts/e2e` 里再点一次触发按钮收起，然后等 `.ant-dropdown:visible` 隐藏。
- 日期：2026-10-25
