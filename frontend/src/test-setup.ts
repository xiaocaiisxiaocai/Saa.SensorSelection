import Antd from 'ant-design-vue';
import {
  configProviderKey,
  defaultConfigProvider,
} from 'ant-design-vue/es/config-provider/context';
import { config } from '@vue/test-utils';
import { beforeEach, vi } from 'vitest';
import { computed } from 'vue';

config.global.plugins = [...(config.global.plugins ?? []), Antd];
config.global.provide = {
  ...config.global.provide,
  [configProviderKey]: {
    ...defaultConfigProvider,
    autoInsertSpaceInButton: computed(() => false),
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
