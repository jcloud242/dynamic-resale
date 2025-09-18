import React from "react";
import "./bottomnav.css";
import { FaHistory, FaHome } from "react-icons/fa";
import { FaChartSimple, FaListUl } from "react-icons/fa6";

export default function BottomNav() {
  return (
    <nav className="dr-bottomnav">
      <button aria-label="Home">
        <FaHome size={20} />
      </button>
      <button aria-label="History">
        <FaHistory size={20} />
      </button>
      <button aria-label="Collections">
        <FaListUl size={20} />
      </button>
      <button aria-label="Analytics">
        <FaChartSimple size={20} />
      </button>
    </nav>
  );
}
