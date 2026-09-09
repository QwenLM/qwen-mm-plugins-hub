import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { normalizeTheme, isDarkTheme, themeScript } from '../lib/theme.ts';

test('theme follows the system unless explicitly selected', () => {
  for (const value of [null, '', 'invalid', 'system', 'light', 'dark']) {
    for (const systemDark of [false, true]) {
      const expected = value === 'dark' || (value !== 'light' && systemDark);
      assert.equal(isDarkTheme(normalizeTheme(value), systemDark), expected);
      let actual;
      runInNewContext(themeScript, {
        localStorage: { getItem: () => value },
        matchMedia: () => ({ matches: systemDark }),
        document: {
          documentElement: {
            classList: {
              toggle: (name, dark) => {
                assert.equal(name, 'dark');
                actual = dark;
              },
            },
          },
        },
      });
      assert.equal(actual, expected, 'pre-paint theme must match hydration');
    }
  }
});

test('blocked local storage cannot prevent rendering', () => {
  let dark;
  runInNewContext(themeScript, {
    localStorage: {
      getItem() {
        throw new Error('Storage denied');
      },
    },
    matchMedia: () => ({ matches: true }),
    document: {
      documentElement: {
        classList: {
          toggle: (_name, value) => {
            dark = value;
          },
        },
      },
    },
  });
  assert.equal(dark, true);
});
