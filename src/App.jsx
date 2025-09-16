import React from 'react'
import './App.css'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'

function App() {
  return (
    <div className="App">
      <Header />
      <Home />
      <BottomNav />
    </div>
  )
}

export default App
