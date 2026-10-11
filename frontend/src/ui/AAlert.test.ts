import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alert } from './alert';

interface ConfirmOptions {
  title: string;
  content: string;
  okText: string;
  cancelText: string;
  okType: string;
  onOk: () => void;
  onCancel: () => void;
}

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn<(options: ConfirmOptions) => void>(),
}));

vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: confirmMock,
  },
}));

describe('AAlert', () => {
  beforeEach(() => {
    confirmMock.mockReset();
  });

  it('resolves true and uses the default button labels', async () => {
    confirmMock.mockImplementation((options) => {
      options.onOk();
    });

    await expect(
      alert.confirm({
        title: '删除客户',
        message: '此操作不可撤销。',
      }),
    ).resolves.toBe(true);

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '删除客户',
        content: '此操作不可撤销。',
        okText: '确定',
        cancelText: '取消',
        okType: 'primary',
      }),
    );
  });

  it('honors confirmText and cancelText and resolves false on cancel', async () => {
    confirmMock.mockImplementation((options) => {
      options.onCancel();
    });

    await expect(
      alert.confirm({
        title: '删除客户',
        message: '此操作不可撤销。',
        confirmText: '仍要删除',
        cancelText: '返回',
      }),
    ).resolves.toBe(false);

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '删除客户',
        content: '此操作不可撤销。',
        okText: '仍要删除',
        cancelText: '返回',
        okType: 'primary',
      }),
    );
  });

  it('uses a danger confirm button when destructive', async () => {
    confirmMock.mockImplementation((options) => {
      options.onOk();
    });

    await expect(
      alert.confirm({
        title: '删除',
        message: '确定删除？',
        destructive: true,
      }),
    ).resolves.toBe(true);

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        okType: 'danger',
        okText: '确定',
        cancelText: '取消',
      }),
    );
  });

  it('resolves only once when both actions run', async () => {
    let options: ConfirmOptions | undefined;
    confirmMock.mockImplementation((next) => {
      options = next;
    });

    const pending = alert.confirm({
      title: '删除',
      message: '确定删除？',
    });
    options?.onOk();
    options?.onCancel();

    await expect(pending).resolves.toBe(true);
  });
});
