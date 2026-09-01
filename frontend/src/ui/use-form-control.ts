import { computed, inject, useId } from 'vue';

import { formRowKey } from './form-context';

export function useFormControl(props: {
  describedBy?: string;
  id?: string;
  invalid?: boolean;
}) {
  const row = inject(formRowKey, null);
  const fallbackId = useId();

  return {
    describedBy: computed(() => props.describedBy ?? row?.describedBy.value),
    hasFormLabel: computed(() => Boolean(row)),
    id: computed(() => props.id ?? row?.id ?? fallbackId),
    invalid: computed(() => Boolean(props.invalid || row?.invalid.value)),
    required: computed(() => Boolean(row?.required.value)),
  };
}
