import React, { useState, useEffect } from 'react';
import './header.css';
import { VscAccount } from "react-icons/vsc";
import { MdLightMode, MdDarkMode } from "react-icons/md";

export default function Header() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    // default dark mode per spec
    const saved = localStorage.getItem('dr_theme');
    const t = saved || 'dark';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  function toggleTheme() {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('dr_theme', t); } catch (e) {}
  }

  return (
    <header className="dr-header">
      <div className="dr-header-left">
        <div className="dr-logo">DR</div>
        <div className="dr-title">
          <div className="dr-name">Dynamic Resale</div>
          <div className="dr-tag">Find, price, collect</div>
        </div>
      </div>
      <div className="dr-header-right">
        <button className="dr-account" aria-label="Account">
          <span className="dr-account-icon"><VscAccount size={20} /></span>
        </button>
        <button className="dr-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <MdDarkMode size={18} /> : <MdLightMode size={18} />}</button>
      </div>
    </header>
  );
}
