import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

/**
 * CameraApp provides:
 * - Live camera preview using getUserMedia
 * - Capture photos from the video stream to a canvas
 * - Recent gallery bar for captured images
 * - Download/save captured images
 * - Professional controls UI (manual focus, white balance, ISO, exposure, zoom)
 *
 * Notes on browser/hardware limitations:
 * - Browser APIs expose some capabilities via MediaTrackConstraints and applyConstraints.
 * - Most desktop browsers and many devices do NOT allow true manual control of
 *   focusDistance, whiteBalanceMode, iso, or exposureCompensation via getUserMedia.
 * - Where unsupported, this app simulates the UI/UX and documents any limitation.
 * - Zoom is more widely supported as a constraint/property on video tracks; we
 *   attempt to use it and gracefully fallback to CSS zoom simulation on the video element.
 */

// PUBLIC_INTERFACE
function App() {
  /** State for media stream and UI */
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [videoTrack, setVideoTrack] = useState(null); // current video track
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

  // Professional controls state (with capability-driven application)
  // Even if these aren't supported natively, we present the UI for consistency.
  const [zoom, setZoom] = useState(1.0);
  const [zoomSupported, setZoomSupported] = useState(false);

  const [focusMode, setFocusMode] = useState('auto'); // auto, manual
  const [focusDistance, setFocusDistance] = useState(0); // 0..1 (normalized target)
  const [focusSupported, setFocusSupported] = useState(false);

  const [wbMode, setWbMode] = useState('auto'); // auto / incandescent / fluorescent / daylight / cloudy / warm
  const [wbSupported, setWbSupported] = useState(false);

  const [iso, setIso] = useState(100); // simulated value if unsupported
  const [isoSupported, setIsoSupported] = useState(false);

  const [exposureComp, setExposureComp] = useState(0); // EV steps (simulated with CSS brightness/contrast if unsupported)
  const [exposureSupported, setExposureSupported] = useState(false);

  // Derived styling for exposure compensation when not natively supported:
  // Each EV step ~ +/- 10% brightness, with slight contrast adjustment.
  const exposureFilter = useCallback(() => {
    const ev = exposureComp;
    const b = 100 + ev * 10; // +/- per EV
    const c = 100 + ev * 4;  // small contrast tweak
    return { brightness: b, contrast: c };
  }, [exposureComp]);

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
    const exposure = exposureFilter();
    const b = `brightness(${Math.round((brightness * exposure.brightness) / 100)}%)`;
    const c = `contrast(${Math.round((contrast * exposure.contrast) / 100)}%)`;
    const parts = [base, b, c].filter(Boolean);
    return parts.join(' ').trim() || 'none';
  }, [filterPreset, brightness, contrast, exposureFilter]);

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
      const vt = newStream.getVideoTracks()[0];
      setVideoTrack(vt);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Query capabilities and set supported flags
      try {
        const caps = vt.getCapabilities ? vt.getCapabilities() : {};
        setZoomSupported(typeof caps.zoom !== 'undefined');
        setFocusSupported(typeof caps.focusMode !== 'undefined' || typeof caps.focusDistance !== 'undefined');
        setWbSupported(typeof caps.whiteBalanceMode !== 'undefined');
        setIsoSupported(typeof caps.iso !== 'undefined');
        setExposureSupported(typeof caps.exposureCompensation !== 'undefined');

        // Initialize zoom if supported
        if (typeof caps.zoom !== 'undefined') {
          const settings = vt.getSettings ? vt.getSettings() : {};
          const currentZoom = settings.zoom || 1.0;
          setZoom(currentZoom);
        } else {
          setZoom(1.0);
        }
      } catch (capErr) {
        // Capabilities not supported; keep defaults and simulate
        setZoomSupported(false);
        setFocusSupported(false);
        setWbSupported(false);
        setIsoSupported(false);
        setExposureSupported(false);
      }

      setIsReady(true);
    } catch (e) {
      console.error('Camera access error:', e);
      setError(
        'Unable to access the camera. Please grant permission and ensure a camera device is available.'
      );
      setIsReady(false);
      setVideoTrack(null);
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
  const applyZoom = async (z) => {
    /**
     * Attempts to apply native zoom. If unsupported, falls back to CSS transform.
     */
    setZoom(z);
    if (!videoTrack) return;

    // Native zoom if supported
    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (typeof caps.zoom !== 'undefined') {
        const clamped = Math.min(Math.max(z, caps.zoom.min ?? 1), caps.zoom.max ?? 5);
        await videoTrack.applyConstraints({ advanced: [{ zoom: clamped }] });
        return;
      }
    } catch (e) {
      // Fall back to CSS below
    }

    // CSS zoom simulation as fallback (not a true optical/digital sensor zoom)
    // We simulate by scaling and cropping the video using transform.
    if (videoRef.current) {
      const v = videoRef.current;
      const scale = Math.max(1, z);
      v.style.transform = `scale(${scale})`;
      v.style.transformOrigin = 'center center';
    }
  };

  // PUBLIC_INTERFACE
  const applyFocus = async (mode, distance) => {
    /**
     * Attempts to apply focus settings where supported.
     * Limitations: Most browsers don't expose manual focus controls to web apps.
     * We update UI state and try applyConstraints; if not supported, UI is simulated only.
     */
    setFocusMode(mode);
    setFocusDistance(distance);

    if (!videoTrack) return;
    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      const advanced = [];

      if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes(mode)) {
        advanced.push({ focusMode: mode });
      }
      if (typeof caps.focusDistance !== 'undefined' && mode === 'manual') {
        const min = caps.focusDistance.min ?? 0;
        const max = caps.focusDistance.max ?? 1;
        const val = Math.min(Math.max(distance, min), max);
        advanced.push({ focusDistance: val });
      }

      if (advanced.length > 0) {
        await videoTrack.applyConstraints({ advanced });
      }
    } catch (e) {
      // Unsupported, UI simulation only
    }
  };

  // PUBLIC_INTERFACE
  const applyWhiteBalance = async (mode) => {
    /**
     * Attempts to apply white balance preset where supported.
     * Common modes include: 'auto', 'incandescent', 'fluorescent', 'daylight', 'cloudy'
     * Most browsers will not expose this; we keep for spec alignment and UI simulation.
     */
    setWbMode(mode);
    if (!videoTrack) return;

    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (caps.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes(mode)) {
        await videoTrack.applyConstraints({ advanced: [{ whiteBalanceMode: mode }] });
      }
    } catch (e) {
      // Unsupported; simulated via UI only
    }
  };

  // PUBLIC_INTERFACE
  const applyISO = async (value) => {
    /**
     * Attempts to set ISO where supported. In practice, not supported in most browsers.
     * We keep this to present a professional control UI and future-proofing.
     */
    setIso(value);
    if (!videoTrack) return;

    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (typeof caps.iso !== 'undefined') {
        const min = caps.iso.min ?? 50;
        const max = caps.iso.max ?? 800;
        const clamped = Math.min(Math.max(value, min), max);
        await videoTrack.applyConstraints({ advanced: [{ iso: clamped }] });
      }
    } catch (e) {
      // Unsupported; simulated via UI only
    }
  };

  // PUBLIC_INTERFACE
  const applyExposureComp = async (value) => {
    /**
     * Attempts to set exposure compensation where supported.
     * If unsupported, we adjust preview via CSS (handled in buildFilter).
     */
    setExposureComp(value);
    if (!videoTrack) return;

    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (typeof caps.exposureCompensation !== 'undefined') {
        const min = caps.exposureCompensation.min ?? -2;
        const max = caps.exposureCompensation.max ?? 2;
        const clamped = Math.min(Math.max(value, min), max);
        await videoTrack.applyConstraints({ advanced: [{ exposureCompensation: clamped }] });
      }
    } catch (e) {
      // Unsupported; CSS-based simulation only
    }
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
      // If CSS zoom simulation was applied, it affects preview only.
      // Captured image uses full frame from stream (as expected).
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

  // Helpers for rendering supported hint
  const SupportTag = ({ ok }) => (
    <span style={{ fontSize: 11, color: ok ? 'var(--color-primary)' : 'var(--muted)' }}>
      {ok ? 'native' : 'simulated'}
    </span>
  );

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

          {/* Professional Controls */}
          <div className="settings-bar" role="region" aria-label="Pro controls">
            {/* Zoom */}
            <div className="settings-row">
              <label htmlFor="zoom-range">Zoom <SupportTag ok={zoomSupported} /></label>
              <div className="range">
                <input
                  id="zoom-range"
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => applyZoom(parseFloat(e.target.value))}
                  aria-label="Zoom"
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{zoom.toFixed(1)}x</span>
              </div>
            </div>

            {/* Focus */}
            <div className="settings-row">
              <label htmlFor="focus-mode">Focus <SupportTag ok={focusSupported} /></label>
              <div className="select">
                <select
                  id="focus-mode"
                  value={focusMode}
                  onChange={(e) => applyFocus(e.target.value, focusDistance)}
                  aria-label="Focus mode"
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              {focusMode === 'manual' && (
                <div className="range">
                  <input
                    id="focus-distance"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={focusDistance}
                    onChange={(e) => applyFocus('manual', parseFloat(e.target.value))}
                    aria-label="Manual focus distance"
                  />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{focusDistance.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* White Balance */}
            <div className="settings-row">
              <label htmlFor="wb-mode">White Balance <SupportTag ok={wbSupported} /></label>
              <div className="chips" role="listbox" aria-label="White balance presets">
                {['auto','daylight','cloudy','incandescent','fluorescent','warm'].map(m => (
                  <button
                    key={m}
                    className={`chip ${wbMode === m ? 'active' : ''}`}
                    onClick={() => applyWhiteBalance(m)}
                    role="option"
                    aria-selected={wbMode === m}
                    aria-label={`White balance ${m}`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* ISO */}
            <div className="settings-row">
              <label htmlFor="iso-range">ISO <SupportTag ok={isoSupported} /></label>
              <div className="range">
                <input
                  id="iso-range"
                  type="range"
                  min="50"
                  max="800"
                  step="10"
                  value={iso}
                  onChange={(e) => applyISO(parseInt(e.target.value, 10))}
                  aria-label="ISO"
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{iso}</span>
              </div>
            </div>

            {/* Exposure Compensation */}
            <div className="settings-row">
              <label htmlFor="exp-range">Exposure EV <SupportTag ok={exposureSupported} /></label>
              <div className="range">
                <input
                  id="exp-range"
                  type="range"
                  min="-3"
                  max="3"
                  step="0.5"
                  value={exposureComp}
                  onChange={(e) => applyExposureComp(parseFloat(e.target.value))}
                  aria-label="Exposure compensation"
                />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {exposureComp > 0 ? `+${exposureComp}` : exposureComp}
                </span>
              </div>
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
