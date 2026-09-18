import { describe, expect, it } from 'vitest';

import { nextSortState, sortRows } from './table-sort';

describe('table-sort', () => {
  it('sorts the whole dataset so paginated tables can slice after sorting', () => {
    const rows = [{ n: 'C' }, { n: 'A' }, { n: 'B' }, { n: 'D' }];

    // 页面必须先排完整数据再切片：先切后排会把 D 留在第一页。
    const firstPage = sortRows(rows, { key: 'n', direction: 'ascending' }).slice(
      0,
      2,
    );

    expect(firstPage.map((row) => row.n)).toEqual(['A', 'B']);
  });

  it('orders numbers numerically rather than as text', () => {
    const rows = [{ sort: 10 }, { sort: 2 }, { sort: 1 }];

    expect(
      sortRows(rows, { key: 'sort', direction: 'ascending' }).map(
        (row) => row.sort,
      ),
    ).toEqual([1, 2, 10]);
  });

  it('orders numeric prefixes inside Chinese labels naturally', () => {
    const rows = [{ name: '10 入料' }, { name: '2 曝光' }, { name: '1 上板' }];

    expect(
      sortRows(rows, { key: 'name', direction: 'ascending' }).map(
        (row) => row.name,
      ),
    ).toEqual(['1 上板', '2 曝光', '10 入料']);
  });

  it('leaves the original array untouched', () => {
    const rows = [{ n: 'B' }, { n: 'A' }];

    sortRows(rows, { key: 'n', direction: 'ascending' });

    expect(rows.map((row) => row.n)).toEqual(['B', 'A']);
  });

  it('cycles a header through ascending, descending, then back to unsorted', () => {
    const ascending = nextSortState(null, 'name');
    expect(ascending).toEqual({ key: 'name', direction: 'ascending' });

    const descending = nextSortState(ascending, 'name');
    expect(descending).toEqual({ key: 'name', direction: 'descending' });

    expect(nextSortState(descending, 'name')).toBeNull();
  });

  it('restarts at ascending when a different column is clicked', () => {
    expect(
      nextSortState({ key: 'name', direction: 'descending' }, 'code'),
    ).toEqual({ key: 'code', direction: 'ascending' });
  });
});
