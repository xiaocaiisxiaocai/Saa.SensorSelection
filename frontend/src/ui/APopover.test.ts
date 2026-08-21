import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import APopover from './APopover.vue';

describe('APopover', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens from the trigger and closes when the trigger is toggled', async () => {
    const wrapper = mount(APopover, {
      attachTo: document.body,
      slots: {
        trigger: '<button type="button">打开</button>',
        default: '<p>弹出内容</p>',
      },
    });

    const trigger = wrapper.get('button');
    expect(document.body.textContent).not.toContain('弹出内容');

    await trigger.trigger('click');
    await nextTick();

    expect(document.body.textContent).toContain('弹出内容');
    expect(document.querySelector('.a-popover')).not.toBeNull();
    expect(trigger.attributes('data-state')).toBe('open');
    expect(trigger.attributes('aria-expanded')).toBe('true');

    await trigger.trigger('click');
    await nextTick();
    await nextTick();

    expect(trigger.attributes('data-state')).toBe('closed');
    expect(document.body.textContent).not.toContain('弹出内容');

    wrapper.unmount();
  });

  it('supports a controlled open model', async () => {
    const wrapper = mount(APopover, {
      attachTo: document.body,
      props: { open: true },
      slots: {
        trigger: '<button type="button">打开</button>',
        default: '<p>受控内容</p>',
      },
    });

    await nextTick();
    expect(document.body.textContent).toContain('受控内容');

    await wrapper.setProps({ open: false });
    await nextTick();
    await nextTick();

    expect(document.body.textContent).not.toContain('受控内容');

    wrapper.unmount();
  });

  it('keeps the arrow outside the scroll body', async () => {
    const wrapper = mount(APopover, {
      attachTo: document.body,
      props: { arrow: true, open: true },
      slots: {
        trigger: '<button type="button">打开</button>',
        default: '<p>带箭头</p>',
      },
    });

    await nextTick();

    const body = document.querySelector('.a-popover__body');
    const arrow = document.querySelector('.a-popover__arrow');

    expect(body).not.toBeNull();
    expect(arrow).not.toBeNull();
    expect(body?.contains(arrow)).toBe(false);

    wrapper.unmount();
  });

  it('matches the trigger width when requested', async () => {
    const wrapper = mount(APopover, {
      attachTo: document.body,
      props: { matchTriggerWidth: true, open: true },
      slots: {
        trigger: '<button type="button">打开</button>',
        default: '<p>等宽</p>',
      },
    });

    await nextTick();
    expect(document.querySelector('.a-popover--match-trigger')).not.toBeNull();

    wrapper.unmount();
  });
});
