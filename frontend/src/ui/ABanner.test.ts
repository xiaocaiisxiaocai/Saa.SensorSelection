import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ABanner from './ABanner.vue';

describe('ABanner', () => {
  it('renders a status message with an action', async () => {
    const wrapper = mount(ABanner, {
      props: {
        tone: 'warning',
        message: '后端服务不可用，当前使用浏览器本地数据（仅本机可见）',
        actionLabel: '重新连接',
      },
    });

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.text()).toContain('后端服务不可用');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('emits close when closable', async () => {
    const wrapper = mount(ABanner, {
      props: {
        message: '登录已失效，请重新登录',
        closable: true,
      },
    });

    await wrapper.get('[aria-label="关闭"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
