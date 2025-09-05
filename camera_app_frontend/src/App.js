import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

/**
 * CameraApp provides:
 * - Live camera preview using getUserMedia
 * - Capture photos from the video stream to a canvas
 * - Recent gallery bar for captured images
 * - Download/save captured images
 * The UI is modern, minimalistic, and light-themed using the specified colors.
 */

// PUBLIC_INTERFACE
function App() {
  /** State for media stream and UI */
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back) where supported
  const [isCapturing, setIsCapturing] = useState(false);

  // Camera resolution settings
  const [resolution, setResolution] = useState('1280x720'); // default
  const resolutions = [
    '640x480',
    '1280x720',
    '1920x1080'
  ];

  // Filters state
  const [filterPreset, setFilterPreset] = useState('none'); // none, grayscale, sepia, invert, custom
  const [brightness, setBrightness] = useState(100); // percent
  const [contrast, setContrast] = useState(100); // percent

  // Build CSS filter string for preview/capture
  const buildFilter = useCallback(() => {
    let base = '';
    switch (filterPreset) {
      case 'grayscale':
        base = 'grayscale(1)';
        break;
      case 'sepia':
        base = 'sepia(1)';
        break;
      case 'invert':
        base = 'invert(1)';
        break;
      case 'none':
      default:
        base = '';
    }
    const b = `brightness(${brightness}%)`;
    const c = `contrast(${contrast}%)`;
    const parts = [base, b, c].filter(Boolean);
    return parts.join(' ').trim() || 'none';
  }, [filterPreset, brightness, contrast]);

  const [previewFilter, setPreviewFilter] = useState('none');
  useEffect(() => {
    setPreviewFilter(buildFilter());
  }, [buildFilter]);

  // PUBLIC_INTERFACE
  const requestCamera = useCallback(async (mode = facingMode, res = resolution) => {
    /**
     * Request camera with constraints; gracefully handle unsupported environments.
     */
    setError('');
    try {
      // Stop any existing tracks before requesting a new one
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }

      // Parse resolution like "1280x720"
      let widthIdeal = 1280, heightIdeal = 720;
      if (typeof res === 'string' && res.includes('x')) {
        const [w, h] = res.split('x').map(n => parseInt(n, 10));
        if (!Number.isNaN(w) && !Number.isNaN(h)) {
          widthIdeal = w;
          heightIdeal = h;
        }
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: widthIdeal },
          height: { ideal: heightIdeal }
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setIsReady(true);
    } catch (e) {
      console.error('Camera access error:', e);
      setError(
        'Unable to access the camera. Please grant permission and ensure a camera device is available.'
      );
      setIsReady(false);
    }
  }, [stream, facingMode, resolution]);

  useEffect(() => {
    // Request camera on mount
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      requestCamera();
    } else {
      setError('Camera API not supported in this browser.');
    }

    // Cleanup on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // PUBLIC_INTERFACE
  const switchCamera = async () => {
    /**
     * Switch between front and back cameras where supported.
     */
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await requestCamera(next, resolution);
  };

  // PUBLIC_INTERFACE
  const capturePhoto = () => {
    /**
     * Captures a frame from the video to a canvas and stores it as a dataURL.
     */
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    try {
      setIsCapturing(true);
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width === 0 || height === 0) {
        // Video not ready yet
        setIsCapturing(false);
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      // Apply the same filter to the canvas when drawing
      ctx.filter = buildFilter();
      ctx.drawImage(video, 0, 0, width, height);
      const dataURL = canvas.toDataURL('image/png', 1.0);

      setPhotos(prev => [dataURL, ...prev].slice(0, 12)); // keep recent up to 12
    } finally {
      setIsCapturing(false);
    }
  };

  // PUBLIC_INTERFACE
  const downloadPhoto = (dataURL, index = 0) => {
    /**
     * Triggers a download of the provided dataURL.
     */
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `photo_${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasBackCameraSupport = 'mediaDevices' in navigator;

  // Apply filters to a given image dataURL and trigger download
  // PUBLIC_INTERFACE
  const downloadWithFilter = (dataURL, index = 0) => {
    const img = new Image();
    img.onload = () => {
      const cnv = document.createElement('canvas');
      cnv.width = img.width;
      cnv.height = img.height;
      const ctx = cnv.getContext('2d');
      ctx.filter = buildFilter();
      ctx.drawImage(img, 0, 0);
      const out = cnv.toDataURL('image/png', 1.0);
      downloadPhoto(out, index);
    };
    img.crossOrigin = 'anonymous';
    img.src = dataURL;
  };

  return (
    <div className="camera-app">
      <nav className="topbar">
        <div className="brand">Camera</div>
        <div className="actions">
          {hasBackCameraSupport && (
            <button
              className="btn btn-secondary"
              onClick={switchCamera}
              title="Switch camera"
              aria-label="Switch camera"
            >
              ↺ Switch
            </button>
          )}
        </div>
      </nav>

      <main className="content">
        <section className="preview-card">
          {/* Settings Bar */}
          <div className="settings-bar" role="region" aria-label="Camera settings">
            <div className="settings-row">
              <label htmlFor="resolution-select">Resolution</label>
              <div className="select">
                <select
                  id="resolution-select"
                  value={resolution}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setResolution(val);
                    await requestCamera(facingMode, val);
                  }}
                  aria-label="Select camera resolution"
                >
                  {resolutions.map((r) => (
                    <option value={r} key={r}>{r}</option>
                  ))}
                </select>
              </div>

              <label style={{ marginLeft: 8 }}>Facing</label>
              <button
                className="btn btn-secondary btn-small"
                onClick={switchCamera}
                aria-label="Toggle camera facing mode"
                title="Toggle camera facing mode"
              >
                {facingMode === 'user' ? 'Front' : 'Back'}
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="filters-bar" role="region" aria-label="Filters">
            <div className="filters-row">
              <label>Preset</label>
              <div className="chips" role="listbox" aria-label="Filter presets">
                {['none','grayscale','sepia','invert'].map(p => (
                  <button
                    key={p}
                    className={`chip ${filterPreset === p ? 'active' : ''}`}
                    onClick={() => setFilterPreset(p)}
                    aria-label={`Set filter ${p}`}
                    role="option"
                    aria-selected={filterPreset === p}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="filters-row">
              <label htmlFor="brightness-range">Brightness</label>
              <div className="range">
                <input
                  id="brightness-range"
                  type="range"
                  min="50"
                  max="150"
                  step="1"
                  value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                  aria-label="Brightness"
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{brightness}%</span>
              </div>

              <label htmlFor="contrast-range" style={{ marginLeft: 8 }}>Contrast</label>
              <div className="range">
                <input
                  id="contrast-range"
                  type="range"
                  min="50"
                  max="150"
                  step="1"
                  value={contrast}
                  onChange={(e) => setContrast(parseInt(e.target.value, 10))}
                  aria-label="Contrast"
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{contrast}%</span>
              </div>
            </div>
          </div>
          <div className="video-wrapper">
            {!error && (
              <video
                ref={videoRef}
                className="video"
                style={{ filter: previewFilter }}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => setIsReady(true)}
              />
            )}
            {/* Hidden canvas used for capturing frames */}
            <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
            {!isReady && !error && (
              <div className="placeholder">Initializing camera…</div>
            )}
            {error && <div className="error">{error}</div>}
          </div>

          <div className="controls">
            <button
              className="capture-button"
              onClick={capturePhoto}
              disabled={!isReady || !!error || isCapturing}
              aria-label="Capture photo"
              title={isReady ? 'Capture photo' : 'Camera not ready'}
            >
              <span className="capture-dot" />
            </button>
          </div>
        </section>

        {photos.length > 0 && (
          <section className="gallery">
            <div className="gallery-header">
              <h2 className="section-title">Recent</h2>
              <div className="gallery-actions">
                <button
                  className="btn btn-link"
                  onClick={() => setPhotos([])}
                  aria-label="Clear gallery"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="thumbs">
              {photos.map((src, idx) => (
                <figure key={idx} className="thumb">
                  <img src={src} alt={`Captured ${idx + 1}`} />
                  <figcaption className="thumb-actions">
                    <button
                      className="btn btn-small"
                      onClick={() => downloadPhoto(src, idx)}
                      aria-label={`Download original image ${idx + 1}`}
                      title="Download original"
                    >
                      Download
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => downloadWithFilter(src, idx)}
                      aria-label={`Download filtered image ${idx + 1}`}
                      title="Download with current filter"
                    >
                      Download (filtered)
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Made with ❤️</span>
      </footer>
    </div>
  );
}

export default App;
