export type ButtonVariant =
  | 'filled'
  | 'tinted'
  | 'plain'
  | 'borderless'
  | 'destructive';

export type ButtonSize = 'small' | 'medium' | 'large' | 'xlarge';

export type IconButtonVariant = 'plain' | 'borderless' | 'destructive';

export type IconButtonSize = 'small' | 'medium' | 'large';

export type BadgeTone =
  | 'neutral'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'indigo';

export type SpinnerSize = 12 | 16 | 24 | 32;

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left';

export type PopoverAlign = 'start' | 'center' | 'end';

export type SwitchSize = 'medium' | 'large';

export type SearchFieldSize = 'small' | 'medium';

export type FormGridColumns = 1 | 2 | 3;

export type ControlSize = 'small' | 'medium' | 'large';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  hint?: string;
}

export interface MenuItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: import('vue').Component;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuSeparator {
  type: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

export type TableAlign = 'start' | 'center' | 'end';

export type TableRowHeight = 'compact' | 'loose';

export interface TableColumn<T = unknown> {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  align?: TableAlign;
  ellipsis?: boolean;
  mono?: boolean;
  fixed?: 'end';
  rowSpan?: (row: T, rowIndex: number) => number;
}

export type SegmentedSize = 'medium' | 'large';

export interface SegmentOption {
  label: string;
  value: string;
  badge?: number;
}

export interface TabItem {
  label: string;
  value: string;
  closable?: boolean;
  renamable?: boolean;
}

export type BannerTone = 'info' | 'warning' | 'error';
