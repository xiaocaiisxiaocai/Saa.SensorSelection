import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import AImageViewer from './AImageViewer.vue';

const pixel =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

describe('AImageViewer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('zooms in steps and shows the percent', async () => {
    const wrapper = mount(AImageViewer, {
      attachTo: document.body,
      props: { open: true, src: pixel, alt: '示意图' },
    });
    await nextTick();

    expect(document.body.textContent).toContain('100%');
    document.querySelector<HTMLButtonElement>('[aria-label="放大"]')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('125%');

    document.querySelector<HTMLButtonElement>('[aria-label="重置"]')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('100%');
    wrapper.unmount();
  });

  it('maximizes and restores the viewer', async () => {
    const wrapper = mount(AImageViewer, {
      attachTo: document.body,
      props: { open: true, src: pixel, alt: '示意图' },
    });
    await nextTick();

    expect(document.querySelector('.a-image-viewer--max')).toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="最大化"]')?.click();
    await nextTick();
    expect(document.querySelector('.a-image-viewer--max')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="还原"]')?.click();
    await nextTick();
    expect(document.querySelector('.a-image-viewer--max')).toBeNull();
    wrapper.unmount();
  });
});
