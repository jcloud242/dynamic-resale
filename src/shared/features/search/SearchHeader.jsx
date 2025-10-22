import { useState } from 'react';
import SearchBar from '@features/search/SearchBar.jsx';
import CameraModal from '@features/camera/CameraModal.jsx';

export default function SearchHeader({
  onSearch,
  onDetected, // optional: page-provided handler for camera/image detection
  showScans = true,
  placeholder = 'Search title, UPC, ISBN...',
  augmentSuggestions = null,
}) {
  const [camera, setCamera] = useState({ open: false, mode: 'barcode' });

  return (
    <>
      <SearchBar
        onSearch={onSearch}
        onOpenCamera={() => setCamera({ open: true, mode: 'barcode' })}
        onOpenImage={() => setCamera({ open: true, mode: 'image' })}
        showScans={showScans}
        placeholder={placeholder}
        augmentSuggestions={augmentSuggestions}
      />
      {camera.open && (
        <CameraModal
          mode={camera.mode}
          onClose={() => setCamera({ open: false, mode: camera.mode })}
          onDetected={(payload) => {
            try {
              if (onDetected) onDetected(payload);
            } catch (e) {}
          }}
        />
      )}
    </>
  );
}
