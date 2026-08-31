import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import AFileDrop from './AFileDrop.vue';
import { toast } from './toast';

function makeFile(name: string, type: string, size: number) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('AFileDrop', () => {
  it('shows allowed types and size', () => {
    const wrapper = mount(AFileDrop, {
      props: {
        extensions: ['.pdf'],
        mimeTypes: ['application/pdf'],
        maxBytes: 8 * 1024 * 1024,
      },
    });

    expect(wrapper.text()).toContain('PDF');
    expect(wrapper.text()).toContain('8 MB');
  });

  it('emits valid files and toasts invalid ones', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined);
    const wrapper = mount(AFileDrop, {
      props: {
        extensions: ['.pdf'],
        mimeTypes: ['application/pdf'],
        maxBytes: 1024,
        typeMessage: '文件类型不受支持',
      },
    });

    const input = wrapper.get('input[type="file"]');
    const good = makeFile('a.pdf', 'application/pdf', 10);
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [good],
    });
    await input.trigger('change');
    expect(wrapper.emitted('files')?.[0]).toEqual([[good]]);

    const bad = makeFile('photo.png', 'image/png', 10);
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [bad],
    });
    await input.trigger('change');
    expect(error).toHaveBeenCalledWith('文件类型不受支持');
    error.mockRestore();
  });

  it('copies the live FileList before resetting the native input', async () => {
    const wrapper = mount(AFileDrop, {
      props: {
        extensions: ['.pdf'],
        mimeTypes: ['application/pdf'],
      },
    });
    const input = wrapper.get('input[type="file"]');
    const pdf = makeFile('现场资料.pdf', 'application/pdf', 10);
    let cleared = false;
    const liveFiles = {
      get length() {
        return cleared ? 0 : 1;
      },
      item(index: number) {
        return !cleared && index === 0 ? pdf : null;
      },
      [Symbol.iterator]() {
        return (cleared ? [] : [pdf])[Symbol.iterator]();
      },
    } as FileList;
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      get: () => liveFiles,
    });
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      get: () => '',
      set: (value: string) => {
        if (value === '') cleared = true;
      },
    });

    await input.trigger('change');

    expect(wrapper.emitted('files')?.[0]).toEqual([[pdf]]);
    expect(cleared).toBe(true);
  });

  it('opens the native file picker exactly once when the drop area is clicked', async () => {
    const wrapper = mount(AFileDrop);
    const input = wrapper.get('input[type="file"]');
    const clicks = vi.fn();
    input.element.addEventListener('click', clicks);

    await wrapper.get('.a-file-drop').trigger('click');

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('supports a short title and hides an empty hint', () => {
    const wrapper = mount(AFileDrop, {
      props: {
        title: '添加图片',
        hint: '',
      },
    });

    expect(wrapper.get('.a-file-drop__title').text()).toBe('添加图片');
    expect(wrapper.find('.a-file-drop__hint').exists()).toBe(false);
  });
});
