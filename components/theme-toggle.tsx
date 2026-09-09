'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  isDarkTheme,
  normalizeTheme,
  themeStorageKey,
  type Theme,
} from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    function sync() {
      let preference: Theme = 'system';
      try {
        preference = normalizeTheme(localStorage.getItem(themeStorageKey));
      } catch {
        /* System preference still works. */
      }
      setTheme(preference);
      document.documentElement.classList.toggle(
        'dark',
        isDarkTheme(preference, system.matches),
      );
    }
    const frame = requestAnimationFrame(sync);
    system.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    return () => {
      cancelAnimationFrame(frame);
      system.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  function select(value: string) {
    const preference = normalizeTheme(value);
    setTheme(preference);
    try {
      localStorage.setItem(themeStorageKey, preference);
    } catch {
      /* Apply for this page even when persistence is unavailable. */
    }
    document.documentElement.classList.toggle(
      'dark',
      isDarkTheme(
        preference,
        matchMedia('(prefers-color-scheme: dark)').matches,
      ),
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="theme-toggle"
        aria-label="Color theme"
        title="Color theme"
      >
        <Sun className="theme-light-icon" size={18} />
        <Moon className="theme-dark-icon" size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="theme-menu">
        <DropdownMenuRadioGroup value={theme} onValueChange={select}>
          <DropdownMenuRadioItem value="light" closeOnClick>
            <Sun size={16} />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick>
            <Moon size={16} />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick>
            <Monitor size={16} />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
