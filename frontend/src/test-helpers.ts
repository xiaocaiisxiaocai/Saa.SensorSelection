/**
 * 页面测试里操作 ant-design-vue 组件的公共写法。
 * 只依赖 antd 的公开 DOM 结构（.ant-tabs-tab、.ant-tree-node-content-wrapper…）
 * 和组件 props，不依赖页面内部实现。
 */
import { flushPromises, type VueWrapper } from '@vue/test-utils';

// getComponent() 返回的是去掉 exists 的 VueWrapper，这里只用到查找方法
type AnyWrapper = Pick<
  VueWrapper,
  'find' | 'findAll' | 'findAllComponents' | 'get'
>;

/** 页面上的 a-select，排除分页条里的「每页条数」下拉。 */
export function formSelects(wrapper: AnyWrapper) {
  return wrapper
    .findAllComponents({ name: 'ASelect' })
    .filter((item) => !item.element.closest?.('.ant-pagination'));
}

/** 点击 a-tabs 里文字以 label 开头的标签。 */
export async function clickTab(wrapper: AnyWrapper, label: string) {
  const tab = wrapper
    .findAll('.ant-tabs-tab')
    .find((item) => item.text().trim().startsWith(label));
  if (!tab) throw new Error(`tab "${label}" not found`);
  await tab.get('.ant-tabs-tab-btn').trigger('click');
  await flushPromises();
}

/** 当前激活的 a-tabs 标签文字。 */
export function activeTabText(wrapper: AnyWrapper) {
  return wrapper.get('.ant-tabs-tab-active').text().trim();
}

/** 标签上 a-badge 显示的数字。 */
export function tabCount(wrapper: AnyWrapper, label: string) {
  const tab = wrapper
    .findAll('.ant-tabs-tab')
    .find((item) => item.text().trim().startsWith(label));
  return tab?.find('.ant-badge-count').attributes('title');
}

/** 按列标题找到所在的 a-table 和列定义。 */
export function findColumn(wrapper: AnyWrapper, title: string) {
  for (const table of wrapper.findAllComponents({ name: 'ATable' })) {
    const columns = (table.props('columns') ?? []) as Array<{
      title?: unknown;
      key?: unknown;
      dataIndex?: unknown;
      filteredValue?: unknown;
      filters?: unknown;
      filterSearch?: unknown;
      filterMultiple?: unknown;
      customFilterDropdown?: unknown;
      width?: unknown;
    }>;
    const column = columns.find((item) => String(item.title) === title);
    if (column) return { table, column, columns };
  }
  throw new Error(`column "${title}" not found`);
}

/**
 * 等价于在表头漏斗里勾选后点确定。
 * 其它已有筛选列保持原值，避免一次操作把旁边的条件清掉。
 */
export async function chooseColumnFilter(
  wrapper: AnyWrapper,
  title: string,
  value: readonly (string | number)[],
) {
  const { table, columns } = findColumn(wrapper, title);
  const filters: Record<string, Array<string | number> | null> = {};
  for (const column of columns) {
    if (!column.filters || column.key == null) continue;
    const key = String(column.key);
    const selected = column.filteredValue as Array<string | number> | null;
    filters[key] =
      String(column.title) === title
        ? value.length > 0
          ? [...value]
          : null
        : (selected ?? null);
  }
  table.vm.$emit('change', {}, filters, {}, { action: 'filter' });
  await flushPromises();
}

/** 第 index 个 a-table 的列宽：{ 列标题: width }。 */
export function columnWidths(wrapper: AnyWrapper, index = 0) {
  const table = wrapper.findAllComponents({ name: 'ATable' })[index];
  if (!table) throw new Error(`a-table #${index} not found`);
  const columns = table.props('columns') as Array<{
    title?: unknown;
    width?: number | string;
  }>;
  return Object.fromEntries(
    columns.map((column) => [String(column.title), column.width]),
  );
}

/** 点击左侧 a-tree 里标题为 text 的节点。 */
export async function clickTreeNode(wrapper: AnyWrapper, text: string) {
  const node = wrapper
    .findAll('.ant-tree-node-content-wrapper')
    .find((item) => item.text().trim().startsWith(text));
  if (!node) throw new Error(`tree node "${text}" not found`);
  await node.trigger('click');
  await flushPromises();
}

/** a-tag 的预设色（ant-tag-green → 'green'；无颜色时为 'default'）。 */
export function tagColor(element: Element) {
  const match = [...element.classList].find(
    (name) =>
      name.startsWith('ant-tag-') &&
      !/-(?:has|borderless|hidden|checkable)/.test(name),
  );
  return match ? match.slice('ant-tag-'.length) : 'default';
}

/** 按文字找按钮（antd 按钮文字可能包在 span 里）。 */
export function findButton(wrapper: AnyWrapper, text: string) {
  return wrapper
    .findAll('button')
    .find((button) => button.text().replace(/\s+/g, '') === text);
}

/** 左侧 a-tree 里标题为 text 的全部节点（同名机型可能出现在不同配置下）。 */
export function treeNodes(wrapper: AnyWrapper, text: string) {
  return wrapper.findAll('.ant-tree-treenode').filter((node) => {
    // antd 展开/收起动画时会插入没有标题的占位节点
    const title = node.find('.ant-tree-node-content-wrapper');
    return title.exists() && title.text().trim() === text;
  });
}

/** 树节点勾选状态。 */
export function treeChecks(wrapper: AnyWrapper, text: string) {
  return treeNodes(wrapper, text).map((node) =>
    node.find('.ant-tree-checkbox').classes('ant-tree-checkbox-checked'),
  );
}

/** 打开树节点的「更多」下拉菜单，点击其中文字为 action 的菜单项。 */
export async function runTreeAction(
  wrapper: AnyWrapper,
  text: string,
  action: string,
) {
  const node = treeNodes(wrapper, text)[0];
  if (!node) throw new Error(`tree node "${text}" not found`);
  await node.get('button[aria-label$="的更多操作"]').trigger('click');
  await flushPromises();
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((menuItem) => menuItem.textContent?.trim() === action);
  if (!item) throw new Error(`menu item "${action}" not found`);
  item.click();
  await flushPromises();
}

/** 选中 a-segmented 里文字为 label 的选项。 */
export async function chooseSegment(container: AnyWrapper, label: string) {
  const item = container
    .findAll('.ant-segmented-item')
    .find((segment) => segment.text().trim() === label);
  if (!item) throw new Error(`segment "${label}" not found`);
  await item.get('input').trigger('change');
  await flushPromises();
}
