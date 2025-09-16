import React, { useState, useEffect } from 'react';
import SearchBar from '../shared/SearchBar.jsx';
import CameraModal from '../shared/CameraModal.jsx';
import ResultList from '../shared/ResultList.jsx';
import { postSearch } from '../services/api.js';
import './home.css';

export default function Home() {
  const [recent, setRecent] = useState([]);
  const [active, setActive] = useState(null);
  const [camera, setCamera] = useState({ open: false, mode: 'barcode' });

  useEffect(() => {
    // load last 3 recent from localStorage (mock)
    const r = JSON.parse(localStorage.getItem('dr_recent') || '[]');
    setRecent(r.slice(0, 3));
  }, []);

  async function handleSearch(query) {
    const res = await postSearch({ query });
    setActive(res);
    // save to recent
    const r = JSON.parse(localStorage.getItem('dr_recent') || '[]');
    r.unshift(res);
    localStorage.setItem('dr_recent', JSON.stringify(r.slice(0, 10)));
    setRecent(r.slice(0, 3));
  }

  function handleDetected(payload) {
    // Convert payload to a query and run search
    if (payload.type === 'barcode') {
      handleSearch(payload.value);
    } else if (payload.type === 'image') {
      handleSearch(payload.value);
    }
  }

  return (
    <main className="dr-home">
      <div className="dr-actions">
        <div className="dr-scan-buttons">
          <button className="dr-scan" onClick={() => setCamera({ open: true, mode: 'barcode' })}>📷 Barcode</button>
          <button className="dr-photo" onClick={() => setCamera({ open: true, mode: 'image' })}>📸 Image</button>
        </div>
        <SearchBar onSearch={handleSearch} />
      </div>

      <section className="dr-results">
        {active ? (
          <ResultList items={[active]} active />
        ) : (
          <div>
            <h3>Recent</h3>
            <ResultList items={recent} />
          </div>
        )}
      </section>
      {camera.open && (
        <CameraModal
          mode={camera.mode}
          onClose={() => setCamera({ open: false, mode: camera.mode })}
          onDetected={handleDetected}
        />
      )}
    </main>
  );
}
