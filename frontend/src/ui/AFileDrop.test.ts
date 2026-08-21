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
});
