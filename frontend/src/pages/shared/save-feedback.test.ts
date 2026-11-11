import { message } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const waitForPendingWrites = vi.hoisted(() => vi.fn());

vi.mock('@/stores/selection', () => ({
  useSelectionStore: () => ({ waitForPendingWrites }),
}));

import { notifyResult } from './save-feedback';

function messageHandle() {
  const settled = Promise.resolve(true);
  return Object.assign(() => undefined, {
    then: settled.then.bind(settled),
  });
}

describe('save feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    waitForPendingWrites.mockReset();
  });

  it('shows success only after pending writes are confirmed', async () => {
    let finish!: (saved: boolean) => void;
    waitForPendingWrites.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const success = vi
      .spyOn(message, 'success')
      .mockReturnValue(messageHandle());

    const result = notifyResult({ ok: true }, '已保存');
    expect(success).not.toHaveBeenCalled();

    finish(true);
    await expect(result).resolves.toBe(true);
    expect(success).toHaveBeenCalledWith('已保存');
  });

  it('does not report success when the pending write fails', async () => {
    waitForPendingWrites.mockResolvedValue(false);
    const success = vi
      .spyOn(message, 'success')
      .mockReturnValue(messageHandle());

    await expect(notifyResult({ ok: true }, '已保存')).resolves.toBe(false);
    expect(success).not.toHaveBeenCalled();
  });
});
