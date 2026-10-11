import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ABanner from './ABanner.vue';

describe('ABanner', () => {
  it('renders an info alert by default', () => {
    const wrapper = mount(ABanner, {
      props: { message: '登录已失效，请重新登录' },
    });

    const alert = wrapper.get('.a-banner');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.classes()).toContain('ant-alert-info');
    expect(wrapper.text()).toContain('登录已失效，请重新登录');
    expect(wrapper.find('.ant-alert-icon').exists()).toBe(true);
    expect(wrapper.find('.ant-alert-close-icon').exists()).toBe(false);
  });

  it('renders a warning action and emits action', async () => {
    const wrapper = mount(ABanner, {
      props: {
        tone: 'warning',
        message: '后端服务不可用，当前使用浏览器本地数据（仅本机可见）',
        actionLabel: '重新连接',
      },
    });

    expect(wrapper.get('.a-banner').classes()).toContain('ant-alert-warning');
    expect(wrapper.text()).toContain('后端服务不可用');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
    expect(wrapper.emitted('close')).toBeUndefined();
  });

  it('uses the error tone', () => {
    const wrapper = mount(ABanner, {
      props: { tone: 'error', message: '写入失败' },
    });

    const alert = wrapper.get('.a-banner');
    expect(alert.classes()).toContain('ant-alert-error');
    expect(alert.attributes('role')).toBe('alert');
  });

  it('emits close when closable', async () => {
    const wrapper = mount(ABanner, {
      props: {
        message: '登录已失效，请重新登录',
        closable: true,
        actionLabel: '重新连接',
      },
    });

    await wrapper.get('.ant-alert-close-icon').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('action')).toBeUndefined();
  });
});
