import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import { generateAccessible } from '@vben/access';

import { BasicLayout } from '#/layouts';

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const layoutMap: ComponentRecordType = { BasicLayout };
  const pageMap: ComponentRecordType = import.meta.glob(
    '../modules/selection/views/**/*.vue',
  );

  return await generateAccessible('frontend', {
    ...options,
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
