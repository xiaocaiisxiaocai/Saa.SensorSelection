# HANDOFF

## 目录（entity-groups）加字段要同步后端 payload

- 现象：前端给 `entity-groups:customer|machine` 的分组加了新字段，写入成功但刷新后字段消失。
- 根因：`StoreService` 写目录时先校验，再把结果按 `EntityGroupPayload` 重新序列化后落库，payload 里没有声明的字段会被静默丢掉。
- 规避：新增分组字段时同时改 `EntityGroupPayload` 和 `StoreService` 的校验，并在 `StoreTests` 里断言字段能原样读回；直接 PUT 目录的脚本（如 `scripts/e2e/ui-e2e-test.mjs` 的清理）删厂区时要一起删掉 `regions` 里对应的键，否则后端返回 400。
- 日期：2026-10-25
