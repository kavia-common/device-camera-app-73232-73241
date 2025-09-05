import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import Dial from './components/Dial';
import ModeDial from './components/ModeDial';

/**
 * CameraApp provides:
 * - Live camera preview using getUserMedia
 * - Capture photos from the video stream to a canvas
 * - Recent gallery bar for captured images
 * - Download/save captured images
 * - Professional controls UI (manual focus, white balance, ISO, exposure, zoom)
 *
 * DSLR UI restyle:
 * - Central viewfinder with frame markers and info overlay line
 * - Circular shutter button
 * - Mode dial (P/A/S/M/Auto)
 * - Cluster of DSLR-inspired buttons: Flash, ISO, WB, Menu, Info
 * - Tooltips/aria-labels for clarity
 */

// Simple inline SVG icons
const IconFlash = ({ on = false }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 2v11h3v9l7-14h-4l4-6z" fill={on ? 'var(--color-accent)' : 'currentColor'} />
  </svg>
);
const IconISO = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
    <text x="12" y="15" fontSize="8" textAnchor="middle" fill="currentColor" fontFamily="monospace">ISO</text>
  </svg>
);
const IconWB = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12h16" stroke="currentColor" strokeWidth="2" />
    <circle cx="8" cy="12" r="3" fill="currentColor" />
    <circle cx="16" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 10v6M12 7h.01" stroke="currentColor" strokeWidth="2" />
  </svg>
);

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
  const [zoom, setZoom] = useState(1.0);
  const [zoomSupported, setZoomSupported] = useState(false);

  const [focusMode, setFocusMode] = useState('auto');
  const [focusDistance, setFocusDistance] = useState(0);
  const [focusSupported, setFocusSupported] = useState(false);

  const [wbMode, setWbMode] = useState('auto');
  const [wbSupported, setWbSupported] = useState(false);

  const [iso, setIso] = useState(100);
  const [isoSupported, setIsoSupported] = useState(false);

  const [exposureComp, setExposureComp] = useState(0);
  const [exposureSupported, setExposureSupported] = useState(false);

  const [flashOn, setFlashOn] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  // Theme state: light (default) or dark
  const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = useState(prefersDark ? 'dark' : 'light');

  useEffect(() => {
    // Persist and apply theme class at top-level container
    try {
      const saved = localStorage.getItem('camera_theme');
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('camera_theme', theme);
    } catch {}
  }, [theme]);

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Mode dial: P/A/S/M/Auto
  const modes = ['AUTO', 'P', 'A', 'S', 'M'];
  const [mode, setMode] = useState('AUTO');

  // Derived styling for exposure compensation when not natively supported:
  const exposureFilter = useCallback(() => {
    const ev = exposureComp;
    const b = 100 + ev * 10;
    const c = 100 + ev * 4;
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
  const requestCamera = useCallback(async (modeArg = facingMode, res = resolution) => {
    setError('');
    try {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      let widthIdeal = 1280, heightIdeal = 720;
      if (typeof res === 'string' && res.includes('x')) {
        const [w, h] = res.split('x').map(n => parseInt(n, 10));
        if (!Number.isNaN(w) && !Number.isNaN(h)) {
          widthIdeal = w; heightIdeal = h;
        }
      }
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: modeArg },
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
      try {
        const caps = vt.getCapabilities ? vt.getCapabilities() : {};
        setZoomSupported(typeof caps.zoom !== 'undefined');
        setFocusSupported(typeof caps.focusMode !== 'undefined' || typeof caps.focusDistance !== 'undefined');
        setWbSupported(typeof caps.whiteBalanceMode !== 'undefined');
        setIsoSupported(typeof caps.iso !== 'undefined');
        setExposureSupported(typeof caps.exposureCompensation !== 'undefined');
        if (typeof caps.zoom !== 'undefined') {
          const settings = vt.getSettings ? vt.getSettings() : {};
          setZoom(settings.zoom || 1.0);
        } else {
          setZoom(1.0);
        }
      } catch {
        setZoomSupported(false);
        setFocusSupported(false);
        setWbSupported(false);
        setIsoSupported(false);
        setExposureSupported(false);
      }
      setIsReady(true);
    } catch (e) {
      console.error('Camera access error:', e);
      setError('Unable to access the camera. Please grant permission and ensure a camera device is available.');
      setIsReady(false);
      setVideoTrack(null);
    }
  }, [stream, facingMode, resolution]);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      requestCamera();
    } else {
      setError('Camera API not supported in this browser.');
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // PUBLIC_INTERFACE
  const switchCamera = async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await requestCamera(next, resolution);
  };

  // PUBLIC_INTERFACE
  const applyZoom = async (z) => {
    setZoom(z);
    if (!videoTrack) return;
    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (typeof caps.zoom !== 'undefined') {
        const clamped = Math.min(Math.max(z, caps.zoom.min ?? 1), caps.zoom.max ?? 5);
        await videoTrack.applyConstraints({ advanced: [{ zoom: clamped }] });
        return;
      }
    } catch {}
    if (videoRef.current) {
      const v = videoRef.current;
      const scale = Math.max(1, z);
      v.style.transform = `scale(${scale})`;
      v.style.transformOrigin = 'center center';
    }
  };

  // PUBLIC_INTERFACE
  const applyFocus = async (modeArg, distance) => {
    setFocusMode(modeArg);
    setFocusDistance(distance);
    if (!videoTrack) return;
    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      const advanced = [];
      if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes(modeArg)) {
        advanced.push({ focusMode: modeArg });
      }
      if (typeof caps.focusDistance !== 'undefined' && modeArg === 'manual') {
        const min = caps.focusDistance.min ?? 0;
        const max = caps.focusDistance.max ?? 1;
        const val = Math.min(Math.max(distance, min), max);
        advanced.push({ focusDistance: val });
      }
      if (advanced.length > 0) await videoTrack.applyConstraints({ advanced });
    } catch {}
  };

  // PUBLIC_INTERFACE
  const applyWhiteBalance = async (modeArg) => {
    setWbMode(modeArg);
    if (!videoTrack) return;
    try {
      const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
      if (caps.whiteBalanceMode && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes(modeArg)) {
        await videoTrack.applyConstraints({ advanced: [{ whiteBalanceMode: modeArg }] });
      }
    } catch {}
  };

  // PUBLIC_INTERFACE
  const applyISO = async (value) => {
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
    } catch {}
  };

  // PUBLIC_INTERFACE
  const applyExposureComp = async (value) => {
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
    } catch {}
  };

  // PUBLIC_INTERFACE
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    try {
      setIsCapturing(true);
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) {
        setIsCapturing(false);
        return;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.filter = buildFilter();
      ctx.drawImage(video, 0, 0, width, height);
      const dataURL = canvas.toDataURL('image/png', 1.0);
      setPhotos(prev => [dataURL, ...prev].slice(0, 12));
    } finally {
      setIsCapturing(false);
    }
  };

  // PUBLIC_INTERFACE
  const downloadPhoto = (dataURL, index = 0) => {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `photo_${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasBackCameraSupport = 'mediaDevices' in navigator;

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

  const SupportTag = ({ ok }) => (
    <span style={{ fontSize: 11, color: ok ? 'var(--color-primary)' : 'var(--muted)' }}>
      {ok ? 'native' : 'simulated'}
    </span>
  );

  // DSLR-inspired segmented UI
  return (
    <div className={`camera-app ${isDark ? 'theme-dark' : ''}`}>
      <nav className="topbar leather-texture">
        <div className="brand">DSLR Cam</div>
        <div className="actions">
          {/* Theme toggle */}
          <button
            className="btn btn-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Theme: ${isDark ? 'Dark' : 'Light'}`}
          >
            {isDark ? '🌙 Dark' : '☀️ Light'}
          </button>

          {/* Program/Mode Dial (always-visible segments) */}
          <div
            className="dial compact leather-texture"
            title="Mode dial"
            aria-label="Mode dial"
            style={{
              display: 'grid',
              placeItems: 'center',
              /* Ensure a square area to host the centered ring+knob */
              width: 120,
            }}
          >
            <ModeDial
              modes={modes}
              value={mode}
              onChange={(m) => setMode(m)}
              size={56}
              ariaLabel="Program/Mode Dial"
            />
          </div>
          {hasBackCameraSupport && (
            <button
              className="btn btn-secondary"
              onClick={switchCamera}
              title="Switch camera"
              aria-label="Switch camera"
            >
              ↺
            </button>
          )}
        </div>
      </nav>

      <main className="content">
        <section className="dslr-shell leather-texture vignette">
          {/* Left side button column */}
          <aside className="dslr-side left">
            <button
              className={`round-btn leather-texture ${flashOn ? 'active' : ''}`}
              onClick={() => setFlashOn((v) => !v)}
              aria-pressed={flashOn}
              aria-label="Toggle flash"
              title={`Flash ${flashOn ? 'On' : 'Off'}`}
            >
              <IconFlash on={flashOn} />
            </button>
            <button
              className="round-btn leather-texture"
              onClick={() => setShowInfo((v) => !v)}
              aria-pressed={showInfo}
              aria-label="Toggle info overlay"
              title="Info"
            >
              <IconInfo />
            </button>
          </aside>

          {/* Viewfinder center */}
          <div className="viewfinder">
            <div className="vf-frame" aria-hidden="true">
              <span className="vf-corner tl" />
              <span className="vf-corner tr" />
              <span className="vf-corner bl" />
              <span className="vf-corner br" />
              <span className="vf-center" />
            </div>
            <div className="video-wrapper viewfinder-video">
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
              <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
              {!isReady && !error && (
                <div className="placeholder">Initializing camera…</div>
              )}
              {error && <div className="error">{error}</div>}
            </div>
            {showInfo && (
              <div className="vf-info leather-texture" aria-live="polite">
                <span title="Mode" aria-label={`Mode ${mode}`}>{mode}</span>
                <span title="ISO" aria-label={`ISO ${iso}`}>ISO {iso}</span>
                <span title="WB" aria-label={`White balance ${wbMode}`}>WB {wbMode}</span>
                <span title="Zoom" aria-label={`Zoom ${zoom.toFixed(1)}x`}>{zoom.toFixed(1)}x</span>
                <span title="EV" aria-label={`Exposure compensation ${exposureComp}`}>
                  EV {exposureComp > 0 ? `+${exposureComp}` : exposureComp}
                </span>
                <span title="Resolution" aria-label={`Resolution ${resolution}`}>{resolution}</span>
              </div>
            )}
          </div>

          {/* Right side vertical control cluster */}
          <aside className="dslr-side right">
            <button
              className="round-btn leather-texture"
              onClick={() => setShowMenu((v) => !v)}
              aria-pressed={showMenu}
              aria-label="Menu"
              title="Menu"
            >
              <IconMenu />
            </button>
            <button
              className="round-btn leather-texture"
              onClick={() => applyWhiteBalance(wbMode === 'auto' ? 'daylight' : 'auto')}
              aria-label="Toggle white balance Auto/Daylight"
              title="WB"
            >
              <IconWB />
            </button>
            <button
              className="round-btn leather-texture"
              onClick={() => applyISO(Math.min(800, iso + 100))}
              aria-label="Increase ISO"
              title="ISO +"
            >
              <IconISO />
            </button>
          </aside>

          {/* Bottom control rail with pro controls & shutter */}
          <div className="bottom-rail">
            <div className="rail-section">
              {/* Quick settings condensed to match DSLR style */}
              <div className="dial leather-texture" title="Zoom" aria-label="Zoom dial">
                <label className="dial-label" title="Zoom">
                  Zoom <SupportTag ok={zoomSupported} />
                </label>
                <Dial
                  min={1}
                  max={5}
                  step={0.1}
                  value={zoom}
                  onChange={(v) => applyZoom(parseFloat(v))}
                  size={68}
                  formatValue={(v) => `${v.toFixed(1)}x`}
                  ariaLabel="Zoom"
                />
              </div>

              <div className="dial" title="Exposure Compensation" aria-label="Exposure compensation dial">
                <label className="dial-label" title="Exposure">
                  EV <SupportTag ok={exposureSupported} />
                </label>
                <Dial
                  min={-3}
                  max={3}
                  step={0.5}
                  value={exposureComp}
                  onChange={(v) => applyExposureComp(parseFloat(v))}
                  size={68}
                  formatValue={(v) => (v > 0 ? `+${v}` : `${v}`)}
                  ariaLabel="Exposure compensation"
                />
              </div>

              <div className="dial" title="ISO" aria-label="ISO dial">
                <label className="dial-label" title="ISO">
                  ISO <SupportTag ok={isoSupported} />
                </label>
                <Dial
                  min={50}
                  max={800}
                  step={10}
                  value={iso}
                  onChange={(v) => applyISO(parseInt(v, 10))}
                  size={68}
                  formatValue={(v) => `ISO ${v}`}
                  ariaLabel="ISO"
                />
              </div>

              <div className="dial" title="Focus" aria-label="Focus controls">
                <label className="dial-label" title="Focus">Focus <SupportTag ok={focusSupported} /></label>
                <div className="dial-inline">
                  <select
                    value={focusMode}
                    onChange={(e) => applyFocus(e.target.value, focusDistance)}
                    aria-label="Focus mode"
                    title="Focus mode"
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                  </select>
                  {focusMode === 'manual' && (
                    <Dial
                      min={0}
                      max={1}
                      step={0.01}
                      value={focusDistance}
                      onChange={(v) => applyFocus('manual', parseFloat(v))}
                      size={56}
                      formatValue={(v) => v.toFixed(2)}
                      ariaLabel="Manual focus distance"
                      title="Manual focus distance"
                    />
                  )}
                </div>
              </div>

              <div className="dial" title="White Balance" aria-label="White Balance presets">
                <label className="dial-label" title="WB">
                  WB <SupportTag ok={wbSupported} />
                </label>
                <div className="chips tight" role="listbox" aria-label="White balance presets">
                  {['auto','daylight','cloudy'].map(p => (
                    <button
                      key={p}
                      className={`chip ${wbMode === p ? 'active' : ''}`}
                      onClick={() => applyWhiteBalance(p)}
                      role="option"
                      aria-selected={wbMode === p}
                      title={`WB ${p}`}
                      aria-label={`White balance ${p}`}
                    >
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Shutter area */}
            <div className="shutter-area">
              <button
                className="capture-button dslr"
                onClick={capturePhoto}
                disabled={!isReady || !!error || isCapturing}
                aria-label="Shutter - capture photo"
                title={isReady ? 'Capture photo' : 'Camera not ready'}
              >
                <span className="capture-dot" />
              </button>
            </div>

            {/* Utility area: resolution + facing + filters */}
            <div className="rail-section right-compact">
              <div className="dial compact leather-texture">
                <label className="dial-label">Res</label>
                <select
                  value={resolution}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setResolution(val);
                    await requestCamera(facingMode, val);
                  }}
                  aria-label="Select camera resolution"
                  title="Resolution"
                >
                  {resolutions.map((r) => (
                    <option value={r} key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="dial compact">
                <label className="dial-label">Cam</label>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={switchCamera}
                  aria-label="Toggle camera facing mode"
                  title="Toggle camera"
                >
                  {facingMode === 'user' ? 'Front' : 'Back'}
                </button>
              </div>
              <div className="dial compact">
                <label className="dial-label">FX</label>
                <div className="chips tight" role="listbox" aria-label="Filter presets">
                  {['none','grayscale','sepia','invert'].map(p => (
                    <button
                      key={p}
                      className={`chip ${filterPreset === p ? 'active' : ''}`}
                      onClick={() => setFilterPreset(p)}
                      aria-label={`Set filter ${p}`}
                      role="option"
                      title={`Filter ${p}`}
                      aria-selected={filterPreset === p}
                    >
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dial compact">
                <label className="dial-label">Tone</label>
                <div className="dial-inline">
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="1"
                    value={brightness}
                    onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                    aria-label="Brightness"
                    title="Brightness"
                  />
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="1"
                    value={contrast}
                    onChange={(e) => setContrast(parseInt(e.target.value, 10))}
                    aria-label="Contrast"
                    title="Contrast"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {photos.length > 0 && (
          <section className="gallery leather-texture">
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

      {/* Simple inline menu panel */}
      {showMenu && (
        <div className="menu-panel" role="dialog" aria-label="Menu">
          <div className="menu-content leather-texture">
            <h3>Menu</h3>
            <ul>
              <li>Mode: {mode}</li>
              <li>Resolution: {resolution}</li>
              <li>ISO: {iso}</li>
              <li>WB: {wbMode}</li>
              <li>Zoom: {zoom.toFixed(1)}x</li>
            </ul>
            <button className="btn" onClick={() => setShowMenu(false)} aria-label="Close menu">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
