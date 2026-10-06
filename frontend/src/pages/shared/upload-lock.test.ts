import { describe, expect, it } from 'vitest';

import { useUploadLock } from './upload-lock';

describe('useUploadLock', () => {
  it('locks while a task runs and rejects a concurrent second task', async () => {
    const { uploading, runUpload } = useUploadLock();
    let release!: () => void;
    const first = runUpload(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    expect(uploading.value).toBe(true);

    let secondRan = false;
    await expect(
      runUpload(async () => {
        secondRan = true;
      }),
    ).resolves.toBe(false);
    expect(secondRan).toBe(false);

    release();
    await expect(first).resolves.toBe(true);
    expect(uploading.value).toBe(false);
  });

  it('releases the lock even when the task throws', async () => {
    const { uploading, runUpload } = useUploadLock();
    await expect(
      runUpload(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(uploading.value).toBe(false);
  });
});
