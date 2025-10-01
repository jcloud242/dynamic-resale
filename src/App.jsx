import React, { useState } from 'react'
import './App.css'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import History from './pages/History'
import Analytics from './pages/Analytics'


function App() {
  const [active, setActive] = useState('home');
  const [analyticsItem, setAnalyticsItem] = useState(null);
  return (
    <div className="App">
      <Header />
      {/* Render pages conditionally so header + nav stay persistent */}
      {active === 'home' && <Home onSearchComplete={() => setActive('home')} />}
      {active === 'history' && <History onNavigateToAnalytics={(it) => { setAnalyticsItem(it); setActive('analytics'); }} />}
      {active === 'analytics' && <Analytics item={analyticsItem} onBack={() => setActive('history')} />}
      <BottomNav active={active} onNavigate={(id) => setActive(id)} />
    </div>
  )
}

export default App
