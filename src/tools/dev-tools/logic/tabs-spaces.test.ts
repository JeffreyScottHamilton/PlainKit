import { describe, expect, it } from 'vitest';
import { spacesToTabs, tabsToSpaces } from './tabs-spaces';

describe('tabs and spaces', () => {
  it('expands leading tabs to the next stop at width 4', () => {
    const r = tabsToSpaces('\tx\ty\n', 4, true);
    expect(r.output).toBe('    x\ty\n');
    expect(r.tabs).toBe(2);
  });

  it('converts leading spaces to tabs and keeps the remainder as spaces', () => {
    const r = spacesToTabs('      code\n  two\n', 4, true);
    expect(r.output).toBe('\t  code\n  two\n');
    expect(r.changedLines).toBe(1);
  });

  it('leaves tabs in the middle of a line alone when leadingOnly is set', () => {
    expect(tabsToSpaces('a\tb', 8, true).output).toBe('a\tb');
    expect(spacesToTabs('a        b', 8, true).output).toBe('a        b');
  });
});
