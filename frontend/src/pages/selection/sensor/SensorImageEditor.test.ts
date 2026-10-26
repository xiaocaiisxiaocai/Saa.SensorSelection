import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SENSOR_IMAGE_LIMIT, type MachineRowImage } from '@/domain';

import SensorImageEditor from './SensorImageEditor.vue';

const uploadFileMock = vi.hoisted(() => vi.fn());
vi.mock('@/pages/shared/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/shared/files')>()),
  uploadFile: uploadFileMock,
}));

function image(name: string): MachineRowImage {
  return {
    dataUrl: `/api/files/${name}/content`,
    fileName: `${name}.png`,
    mimeType: 'image/png',
    size: 8,
  };
}

function dragger(wrapper: VueWrapper) {
  return wrapper.getComponent({ name: 'AUploadDragger' });
}

/** 走拖放区的 beforeUpload，和用户拖入 / 点选文件是同一条路径 */
async function drop(wrapper: VueWrapper, names: string[]) {
  const beforeUpload = dragger(wrapper).props('beforeUpload') as (
    file: File,
  ) => boolean;
  for (const name of names) {
    beforeUpload(new File(['png'], `${name}.png`, { type: 'image/png' }));
  }
  // createFilePicker 用 setTimeout 把同一次拖入的文件合成一批
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

describe('SensorImageEditor', () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
    uploadFileMock.mockImplementation(
      async (file: File) => `/api/files/${file.name}/content`,
    );
  });
  afterEach(() => {
    message.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    ['dialog', false],
    ['table cell', true],
  ])(
    'accepts dropped images in the %s and keeps at most three',
    async (_place, compact) => {
      const warning = vi.spyOn(message, 'warning');
      const wrapper = mount(SensorImageEditor, {
        props: { images: [image('front')], writable: true, compact },
      });
      expect(SENSOR_IMAGE_LIMIT).toBe(3);
      expect(wrapper.find('.ant-upload-drag').exists()).toBe(true);

      await drop(wrapper, ['side', 'top', 'back']);

      expect(uploadFileMock).toHaveBeenCalledTimes(2);
      expect(warning).toHaveBeenCalledWith('最多 3 张图片，已忽略多出的 1 张');
      const emitted = wrapper.emitted('update:images')?.[0]?.[0] as
        | MachineRowImage[]
        | undefined;
      expect(emitted?.map((item) => item.fileName)).toEqual([
        'front.png',
        'side.png',
        'top.png',
      ]);
      wrapper.unmount();
    },
  );

  it('disables the drop zone once three images are attached', () => {
    const wrapper = mount(SensorImageEditor, {
      props: {
        images: [image('a'), image('b'), image('c')],
        writable: true,
      },
    });
    expect(dragger(wrapper).props('disabled')).toBe(true);
    expect(wrapper.find('.ant-upload-text').text()).toBe('最多 3 张图片');
    expect(wrapper.findAll('.sensor-images__item')).toHaveLength(3);
    wrapper.unmount();
  });

  it('shows thumbnails without a drop zone for read-only users', () => {
    const wrapper = mount(SensorImageEditor, {
      props: { images: [image('a')], writable: false, compact: true },
    });
    expect(wrapper.find('.ant-upload-drag').exists()).toBe(false);
    expect(wrapper.findAll('.sensor-images__item')).toHaveLength(1);
    wrapper.unmount();
  });
});
