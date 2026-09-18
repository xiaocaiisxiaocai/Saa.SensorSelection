import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { defineComponent, markRaw } from 'vue';
import { describe, expect, it } from 'vitest';

import AIconButton from './AIconButton.vue';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'AIconButton.vue'),
  'utf8',
);

const IconStub = markRaw(
  defineComponent({
    name: 'IconStub',
    template: '<svg class="icon-stub" />',
  }),
);

describe('AIconButton', () => {
  it('requires a label as the accessible name', () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '编辑' },
    });

    expect(wrapper.get('button').attributes('aria-label')).toBe('编辑');
    expect(wrapper.find('.icon-stub').exists()).toBe(true);
  });

  it('throws in development when the label is empty', () => {
    expect(() =>
      mount(AIconButton, {
        props: { icon: IconStub, label: '' },
      }),
    ).toThrow(/label/);
  });

  it('explains a disabled action while staying focusable and inert', async () => {
    const wrapper = mount(AIconButton, {
      props: {
        icon: IconStub,
        label: '删除',
        disabled: true,
        disabledReason: '系统内置角色，不可删除',
      },
    });
    const button = wrapper.get('button');

    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('aria-label')).toBe('删除（系统内置角色，不可删除）');
    await button.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('keeps native disabled when no reason is given', () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '上一页', disabled: true },
    });

    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button').attributes('aria-disabled')).toBeUndefined();
  });

  it('keeps a disabled destructive icon as visible as other disabled icons', () => {
    expect(source).toMatch(
      /\.a-icon-button--destructive\[aria-disabled='true'\]\s*\{[^}]*color:\s*var\(--label-2\);/,
    );
  });

  it('keeps the small hit area inside the button box so it cannot grow scrollbars', () => {
    const wrapper = mount(AIconButton, {
      props: { icon: IconStub, label: '删除', size: 'small' },
    });

    expect(wrapper.get('button').classes()).toContain('a-icon-button--small');
    // 热区就是按钮本体（--control-height-sm = 26px ≥ 24px 下限）。
    expect(source).toMatch(
      /\.a-icon-button--small\s*\{[^}]*height:\s*var\(--control-height-sm\)/,
    );
    // 不允许再出现比按钮更大的绝对定位热区伪元素：它会计入祖先的可滚动溢出，
    // 让 overflow:auto 的容器（如 .selection-page）凭空长出滚动条。
    expect(source).not.toMatch(/\.a-icon-button[^{]*::before\s*\{/);
  });
});
