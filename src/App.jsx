import React, { useState } from 'react'
import './App.css'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'

function App() {
  const [active, setActive] = useState('home');
  return (
    <div className="App">
      <Header />
      <Home onSearchComplete={() => setActive('home')} />
      <BottomNav active={active} onNavigate={(id) => setActive(id)} />
    </div>
  )
}

export default App
