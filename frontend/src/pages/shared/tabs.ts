/**
 * a-tabs 标签上的数量徽标：计数是信息不是告警，不用 a-badge 默认的红底，
 * 换成中性的浅灰底。
 */
export const TAB_COUNT_STYLE = {
  backgroundColor: 'var(--color-fill-secondary)',
  color: 'var(--color-text-secondary)',
  boxShadow: 'none',
} as const;
