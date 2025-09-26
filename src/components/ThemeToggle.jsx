import React, { useEffect, useState } from 'react';
import { MdLightMode, MdDarkMode } from 'react-icons/md';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('dr_theme') : null;
      return (saved === 'light' || saved === 'dark') ? saved : 'dark';
    } catch (e) { return 'dark'; }
  });

  useEffect(() => {
    const root = document.documentElement;
    // support both class-based and data-theme selector approaches
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
    try { localStorage.setItem('dr_theme', theme); } catch (e) {}
  }, [theme]);

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
      className={`dr-theme-toggle-compact ${className}`}
    >
      {theme === 'dark' ? <MdDarkMode className="h-4 w-4" /> : <MdLightMode className="h-4 w-4" />}
    </button>
  );
}
