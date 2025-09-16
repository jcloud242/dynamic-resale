import React from 'react';
import './bottomnav.css';

export default function BottomNav() {
  return (
    <nav className="dr-bottomnav">
      <button>Home</button>
      <button>History</button>
      <button>Collections</button>
      <button>Analytics</button>
      <button>Settings</button>
    </nav>
  );
}
