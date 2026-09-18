import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AFilterResetButton from './AFilterResetButton.vue';

describe('AFilterResetButton', () => {
  it('stays visible but disabled when no filter is active, explaining why', () => {
    const wrapper = mount(AFilterResetButton);

    const button = wrapper.get('button');
    expect(button.text()).toBe('重置');
    expect(button.attributes('disabled')).toBeDefined();
    // 禁用态要把原因说清楚，不能只留一个通用的「重置筛选」标签。
    expect(button.attributes('aria-label')).toBe('当前没有已应用的筛选条件');
    expect(button.attributes('title')).toBe('当前没有已应用的筛选条件');
  });

  it('emits one reset action when an active filter is reset', async () => {
    const wrapper = mount(AFilterResetButton, {
      props: { active: true },
    });

    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');

    expect(wrapper.emitted('reset')).toHaveLength(1);
  });
});
