import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AFilterResetButton from './AFilterResetButton.vue';

describe('AFilterResetButton', () => {
  it('stays visible but disabled when no filter is active', () => {
    const wrapper = mount(AFilterResetButton);

    const button = wrapper.get('button[aria-label="重置筛选"]');
    expect(button.text()).toBe('重置');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('emits one reset action when an active filter is reset', async () => {
    const wrapper = mount(AFilterResetButton, {
      props: { active: true },
    });

    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');

    expect(wrapper.emitted('reset')).toHaveLength(1);
  });
});
