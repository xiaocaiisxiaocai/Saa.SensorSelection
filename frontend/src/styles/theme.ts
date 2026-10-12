import { theme } from 'ant-design-vue';

type SeedToken = typeof theme.defaultSeed;
type MapToken = ReturnType<typeof theme.defaultAlgorithm>;

/** 字号/行高 token：紧凑模式不缩字，全部沿用默认主题 */
const TYPOGRAPHY_KEYS = Object.keys(
  theme.defaultAlgorithm(theme.defaultSeed),
).filter((key) => /^(fontSize|lineHeight)/.test(key)) as Array<keyof MapToken>;

/**
 * 紧凑主题：控件高度、内外边距用 antd 的 compactAlgorithm 收紧，
 * 但字号保持 14px（compact 会降到 12/10px，表格里的规格参数读不清）；
 * 小号控件保持 24px，满足 `test:ui` 的最小热区。
 */
export function compactAppAlgorithm(seed: SeedToken, map?: MapToken): MapToken {
  const base = map ?? theme.defaultAlgorithm(seed);
  const typography = Object.fromEntries(
    TYPOGRAPHY_KEYS.map((key) => [key, base[key]]),
  );
  return {
    ...theme.compactAlgorithm(seed, base),
    ...typography,
    controlHeightSM: 24,
    controlHeightLG: 36,
  };
}

/** App.vue 与静态 API（Modal.confirm 等）共用的主题配置 */
export const appTheme = { algorithm: compactAppAlgorithm };
