import React, { useState, useEffect } from "react";
import "./bottomnav.css";
import { FaHistory, FaHome } from "react-icons/fa";
import { FaChartSimple, FaListUl } from "react-icons/fa6";
import {
  MdHomeFilled,
  MdHistory,
  MdCollectionsBookmark,
  MdAnalytics,
} from "react-icons/md";

export default function BottomNav({ initial = 'home', active: activeProp, onNavigate }) {
  // active can be controlled by parent via `active` prop, or fall back to internal state
  const [active, setActive] = useState(activeProp || initial || 'home');
  useEffect(() => {
    if (activeProp) setActive(activeProp);
  }, [activeProp]);

  function handleClick(id) {
    setActive(id);
    try { if (onNavigate) onNavigate(id); } catch (e) {}
  }

  return (
    <nav className="dr-bottomnav" role="navigation" aria-label="Bottom navigation">
      <button aria-label="Home" className={active === 'home' ? 'active' : ''} aria-current={active === 'home'} onClick={() => handleClick('home')}>
        <MdHomeFilled size={24} />
      </button>
      <button aria-label="History" className={active === 'history' ? 'active' : ''} aria-current={active === 'history'} onClick={() => handleClick('history')}>
        <MdHistory size={24} />
      </button>
      <button aria-label="Collections" className={active === 'collections' ? 'active' : ''} aria-current={active === 'collections'} onClick={() => handleClick('collections')}>
        <MdCollectionsBookmark size={24} />
      </button>
      <button aria-label="Analytics" className={active === 'analytics' ? 'active' : ''} aria-current={active === 'analytics'} onClick={() => handleClick('analytics')}>
        <MdAnalytics size={24} />
      </button>
    </nav>
  );
}
