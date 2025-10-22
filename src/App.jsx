import { useEffect, useState } from "react";
import "./App.css";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Collections from "./pages/Collections";
import { usePageState } from "./lib/usePageState";
import GlobalToast from "./shared/ui/GlobalToast";
import { postSearch } from "@services/api.js";

function App() {
  const { active, setActive } = usePageState();
  const [analyticsItem, setAnalyticsItem] = useState(null);

  // Hash/localStorage sync handled by usePageState

  // restore last analytics item if landing directly on analytics
  useEffect(() => {
    if (active === "analytics" && !analyticsItem) {
      try {
        const saved = JSON.parse(
          localStorage.getItem("dr_last_analytics_item") || "null"
        );
        if (saved) setAnalyticsItem(saved);
      } catch (e) {}
    }
  }, [active]);

  const handleNavigateToAnalytics = async (it) => {
    // Derive a query and try to hydrate a full search result before navigating
    let hydrated = it;
    try {
      const q = (it && (it.query || it.title || it.upc)) || null;
      if (q) {
        const res = await postSearch({ query: q, opts: { suppressCachedBadge: true } });
        if (res) hydrated = res;
      }
    } catch (e) { /* fallback to provided item */ }
    setAnalyticsItem(hydrated);
    try {
      localStorage.setItem("dr_last_analytics_item", JSON.stringify(hydrated));
      window.dispatchEvent(new CustomEvent('dr_last_analytics_item_changed'));
    } catch {}
    setActive("analytics");
  };
  return (
    <div className="App">
      <GlobalToast />
      <Header />
      {/* Render pages conditionally so header + nav stay persistent */}
      {active === "home" && (
        <Home
          onSearchComplete={() => setActive("home")}
          onNavigateToAnalytics={handleNavigateToAnalytics}
        />
      )}
      {active === "history" && (
        <History onNavigateToAnalytics={handleNavigateToAnalytics} />
      )}
      {active === "analytics" && (
        <Analytics item={analyticsItem} onBack={() => setActive("history")} />
      )}
  {active === "collections" && <Collections onNavigateToAnalytics={handleNavigateToAnalytics} />}
      <BottomNav active={active} onNavigate={(id) => setActive(id)} />
    </div>
  );
}

export default App;
