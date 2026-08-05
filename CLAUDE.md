# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 Next.js 16 的感应器选型软件系统，为 Symtek Automation China 开发。应用采用混合架构：Next.js 作为容器框架，核心应用界面通过 `public/index.html` 中的纯 HTML/CSS/JS 实现。

## 开发命令

```bash
# 安装依赖（使用 npm）
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint
```

注意：虽然 package.json 中有 pnpm 配置，但实际应使用 npm（存在 package-lock.json）。

## 架构设计

### 混合架构模式

- **Next.js 层**：仅作为应用容器和部署框架
  - `app/layout.tsx`：根布局，配置元数据、图标和 Vercel Analytics
  - `app/page.tsx`：主页面，通过 iframe 嵌入 `public/index.html`

- **核心应用层**：`public/index.html` 包含完整的单页应用
  - 使用原生 HTML/CSS/JavaScript 实现
  - 独立的设计系统（CSS 变量定义在 `:root` 中）
  - 四大功能模块：客户管理、制程管理、机型结构、Sensor 选型
  - 布局结构：顶栏（固定）+ 侧边栏 + 列表区 + 详情区

### 技术栈

- **框架**：Next.js 16.2.6 (App Router)
- **UI 组件**：
  - shadcn/ui (base-nova 风格)
  - @base-ui/react 1.5.0（无样式基础组件）
  - lucide-react（图标库）
- **样式**：Tailwind CSS 4.3.3 + class-variance-authority
- **类型**：TypeScript 5.7.3（严格模式）
- **分析**：Vercel Analytics（仅生产环境）

### 路径别名

```typescript
@/*        → 项目根目录
@/components → components/
@/lib      → lib/
@/hooks    → hooks/
@/ui       → components/ui/
```

## 关键约定

### 组件开发

- UI 组件位于 `components/ui/`，使用 shadcn/ui 的 base-nova 风格
- 所有组件使用 TypeScript 和 React 19
- 样式通过 `cn()` 工具函数合并（位于 `lib/utils.ts`）
- 组件变体使用 `class-variance-authority`

### 样式系统

- 主应用的设计令牌在 `public/index.html` 的 `:root` 中定义
- 品牌主色：`--brand: #1e40af`（深蓝）
- 四大模块色：
  - 客户：`--c-customer: #0d9488`（teal）
  - 制程：`--c-process: #7c3aed`（violet）
  - 机型：`--c-machine: #ea580c`（orange）
  - Sensor：`--c-sensor: #0284c7`（sky）

### 元数据配置

- 应用标题：感应器选型软件 · Symtek Automation China
- 语言：zh-CN
- 支持明暗主题切换（图标和主题色自适应）

## 修改指南

### 修改 Next.js 容器层

编辑 `app/layout.tsx` 或 `app/page.tsx`。这些文件仅负责应用框架，不包含业务逻辑。

### 修改核心应用

直接编辑 `public/index.html`。这是一个完整的单页应用，包含所有业务逻辑、样式和交互。

### 添加 UI 组件

使用 shadcn CLI 添加新组件：
```bash
npx shadcn@latest add <component-name>
```

组件将自动生成到 `components/ui/` 并遵循项目配置（base-nova 风格、lucide 图标）。

## 重要注意事项

- **不要删除** `public/index.html`，这是核心应用入口
- iframe 样式固定为全屏（position: fixed, 100% 宽高）
- 生产环境自动启用 Vercel Analytics
- 项目使用严格的 TypeScript 配置
- 所有静态资源（图标、占位图）位于 `public/` 目录
