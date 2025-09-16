import React from 'react';
import './header.css';

export default function Header() {
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
        <button className="dr-account">U</button>
      </div>
    </header>
  );
}
