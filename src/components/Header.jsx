// React import not required for JSX with Vite + React 17+ JSX runtime
import "./header.css";
import { LuScanBarcode } from "react-icons/lu";
import { MdAccountCircle } from "react-icons/md";
import ThemeToggle from "./ThemeToggle.jsx";

export const RIGHT_COL_WIDTH = 48; // keeps header-right alignment consistent with the design

export default function Header() {
  return (
    <header
      className="w-full border-b"
      style={{
        // expose shared CSS var so other rows can align the right-most column
        // @ts-ignore
        "--right-col-w": `${RIGHT_COL_WIDTH}px`,
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 grid grid-cols-[1fr_var(--right-col-w)] items-center">
        {/* Left brand */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LuScanBarcode className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                Dynamic Resale
              </h1>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-dynamic">
              <span>Find, Price, Collect</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
        {/* Right account icon, fixed width for alignment */}
        <div
          className="flex items-center justify-end"
          style={{ width: `var(--right-col-w)` }}
        >
          <button
            type="button"
            aria-label="Account"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
          >
            <span>
              <MdAccountCircle
                className="h-6 w-6"
                style={{ color: "#ED254E" }}
              />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
