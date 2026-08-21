import type { ComputedRef, InjectionKey } from 'vue';

export interface FormRowContext {
  describedBy: ComputedRef<string | undefined>;
  id: string;
  invalid: ComputedRef<boolean>;
  required: ComputedRef<boolean>;
}

export const formRowKey: InjectionKey<FormRowContext> = Symbol('a-form-row');
