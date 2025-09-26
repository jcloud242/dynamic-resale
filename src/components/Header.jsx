import React from "react";
import "./header.css";
import { VscAccount } from "react-icons/vsc";
import ThemeToggle from "./ThemeToggle.jsx";

export const RIGHT_COL_WIDTH = 48; // keeps header-right alignment consistent with the design

export default function Header() {
  return (
    <header
      className="dr-header"
      style={{
        // expose shared CSS var so other rows can align the right-most column
        // @ts-ignore
        "--right-col-w": `${RIGHT_COL_WIDTH}px`,
      }}
    >
      <div className="dr-header-inner">
        <div className="dr-header-left">
          <div className="dr-logo">DR</div>
          <div className="dr-title">
            <div className="dr-name">Dynamic Resale</div>
            <div className="dr-tag-row">
              <button className="dr-tag-toggle">
                <span className="dr-tag-pill">Find, Price, Collect</span>
                <ThemeToggle />
              </button>
            </div>
          </div>
        </div>
        <div
          className="dr-header-right"
          style={{ width: "var(--right-col-w)" }}
        >
          <div className="dr-header-right-inner">
            <button className="dr-account" aria-label="Account">
              <span className="dr-account-icon">
                <VscAccount />
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
