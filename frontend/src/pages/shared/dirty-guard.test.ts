import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import { alert } from '@/ui/alert';
import { useDirtyGuard } from './dirty-guard';

describe('useDirtyGuard', () => {
  it('resolves true without prompting when the form has not changed', async () => {
    const confirmSpy = vi.spyOn(alert, 'confirm');
    const form = reactive({ name: 'A' });
    const guard = useDirtyGuard(form);

    await expect(guard.confirmClose()).resolves.toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('prompts and respects the answer once the form has changed', async () => {
    const form = reactive({ name: 'A' });
    const guard = useDirtyGuard(form);
    form.name = 'B';
    expect(guard.isDirty()).toBe(true);

    const confirmSpy = vi.spyOn(alert, 'confirm').mockResolvedValueOnce(false);
    await expect(guard.confirmClose()).resolves.toBe(false);

    confirmSpy.mockResolvedValueOnce(true);
    await expect(guard.confirmClose()).resolves.toBe(true);

    confirmSpy.mockRestore();
  });

  it('treats markClean as the new baseline', () => {
    const form = reactive({ name: 'A' });
    const guard = useDirtyGuard(form);
    form.name = 'B';
    expect(guard.isDirty()).toBe(true);

    guard.markClean();
    expect(guard.isDirty()).toBe(false);

    form.name = 'C';
    expect(guard.isDirty()).toBe(true);
  });
});
