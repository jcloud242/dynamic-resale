import { useEffect, useState } from "react";
import "./App.css";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import Home from "./pages/Home";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Collections from "./pages/Collections";
import { usePageState } from "./lib/usePageState";

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

  const handleNavigateToAnalytics = (it) => {
    setAnalyticsItem(it);
    try {
      localStorage.setItem("dr_last_analytics_item", JSON.stringify(it));
  } catch {}
    setActive("analytics");
  };
  return (
    <div className="App">
      <Header />
      {/* Render pages conditionally so header + nav stay persistent */}
      {active === "home" && <Home onSearchComplete={() => setActive("home")} />}
      {active === "history" && (
        <History onNavigateToAnalytics={handleNavigateToAnalytics} />
      )}
      {active === "analytics" && (
        <Analytics item={analyticsItem} onBack={() => setActive("history")} />
      )}
      {active === "collections" && <Collections />}
      <BottomNav active={active} onNavigate={(id) => setActive(id)} />
    </div>
  );
}

export default App;
