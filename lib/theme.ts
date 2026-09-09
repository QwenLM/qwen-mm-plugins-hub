export const themeStorageKey = 'qwen-hub-theme';
export type Theme = 'system' | 'light' | 'dark';

export function normalizeTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function isDarkTheme(theme: Theme, systemDark: boolean) {
  return theme === 'dark' || (theme === 'system' && systemDark);
}

// Run before the first paint; storage may be blocked in privacy mode.
export const themeScript = `(()=>{let theme='system';try{theme=localStorage.getItem('${themeStorageKey}')||theme}catch{}const dark=theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark)})()`;
