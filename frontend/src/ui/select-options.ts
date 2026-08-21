import type { SelectOption } from './types';

export function findOption(
  options: SelectOption[],
  value: string | number | null | undefined,
) {
  return options.find((option) => option.value === value);
}

export function filterOptions(options: SelectOption[], query: string) {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return options;
  }

  return options.filter((option) =>
    [option.label, String(option.value), option.hint ?? ''].some((part) =>
      part.toLowerCase().includes(needle),
    ),
  );
}
