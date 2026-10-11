import Antd from 'ant-design-vue';
import {
  configProviderKey,
  defaultConfigProvider,
} from 'ant-design-vue/lib/config-provider/context';
import { DefaultRenderEmpty } from 'ant-design-vue/lib/config-provider/renderEmpty';
import { config } from '@vue/test-utils';
import { beforeEach, vi } from 'vitest';
import { computed, h } from 'vue';

// vitest 直接用 Node 加载 ant-design-vue，解析到的是 CJS 的 lib/ 构建；
// 注入键必须取自同一份构建，否则 Symbol 不同、按钮两字插空格的配置不生效。
config.global.plugins = [...(config.global.plugins ?? []), Antd];
config.global.provide = {
  ...config.global.provide,
  [configProviderKey]: {
    ...defaultConfigProvider,
    autoInsertSpaceInButton: computed(() => false),
    // 与 antd 未包 ConfigProvider 时的默认值一致（表格/列表的空状态）
    renderEmpty: (name?: string) =>
      h(DefaultRenderEmpty, { componentName: name }),
  },
};

function installMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  }));
}

installMatchMedia();
beforeEach(installMatchMedia);
