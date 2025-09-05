import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * PUBLIC_INTERFACE
 * ModeDial
 * DSLR-like mode dial where letters (AUTO/P/A/S/M) are fixed outside the dial.
 * Only the inner knob rotates; the top pointer aligns to the selected mode.
 * - Drag/keyboard interaction rotates the knob.
 * - Static, non-rotating label ring rendered outside the dial.
 * - Preserves leather texture/theme and accessibility.
 */
export default function ModeDial({
  modes = ['AUTO', 'P', 'A', 'S', 'M'],
  value = 'AUTO',
  onChange,
  size = 56,
  ariaLabel = 'Program/Mode Dial',
}) {
  // Geometry
  const radius = size / 2;
  const knobRadius = Math.max(20, radius * 0.58);
  // labels should sit just outside the physical knob boundary
  const labelRadius = radius * 1.1; // slightly outside to ensure separation visually
  const pointerOffsetDeg = 0; // pointer at the top

  // Precompute label positions around full circle (fixed)
  const modesWithAngles = useMemo(() => {
    const step = 360 / (modes.length || 1);
    return modes.map((m, i) => ({ mode: m, angle: i * step }));
  }, [modes]);

  // Rotation state for the knob (0..360)
  const [rotation, setRotation] = useState(0);

  // Initialize rotation to point at current value
  useEffect(() => {
    const idx = modes.findIndex((m) => m === value);
    const step = 360 / (modes.length || 1);
    const desired = (360 - (idx * step + pointerOffsetDeg)) % 360;
    setRotation(desired);
  }, [value, modes]);

  const rotorRef = useRef(null);
  const draggingRef = useRef(false);
  const baseRotationRef = useRef(0);
  const startAngleRef = useRef(0);

  const normalizeDeg = (deg) => {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  };

  // Helpers
  const degToRad = (d) => (d * Math.PI) / 180;
  const polar = (center, r, angleDeg) => {
    const a = degToRad(angleDeg - 90); // 0 deg at top
    return {
      x: center.x + r * Math.cos(a),
      y: center.y + r * Math.sin(a),
    };
  };

  // Map knob rotation to nearest mode at top
  const rotationToMode = (deg) => {
    const step = 360 / (modes.length || 1);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < modes.length; i++) {
      const target = (360 - (i * step + pointerOffsetDeg)) % 360;
      const dist = Math.min(Math.abs(target - deg), 360 - Math.abs(target - deg));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return modes[best];
  };

  const modeToRotation = (mode) => {
    const step = 360 / (modes.length || 1);
    const idx = Math.max(0, modes.findIndex((m) => m === mode));
    return (360 - (idx * step + pointerOffsetDeg)) % 360;
  };

  // Pointer interactions
  const onPointerDown = (e) => {
    if (!rotorRef.current) return;
    draggingRef.current = true;
    const rect = rotorRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const startAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    startAngleRef.current = startAngle;
    baseRotationRef.current = rotation;
    try {
      rotorRef.current.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current || !rotorRef.current) return;
    const rect = rotorRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = currentAngle - startAngleRef.current;
    setRotation(normalizeDeg(baseRotationRef.current + delta));
  };

  const finishDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const chosen = rotationToMode(rotation);
    const snap = modeToRotation(chosen);
    setRotation(snap);
    onChange && onChange(chosen);
  };

  const onPointerUp = () => {
    finishDrag();
    try {
      rotorRef.current?.releasePointerCapture?.();
    } catch {}
  };

  // Keyboard support
  const onKeyDown = (e) => {
    const currentIdx = modes.findIndex((m) => m === value);
    let nextIdx = currentIdx;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nextIdx = (currentIdx + 1) % modes.length;
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextIdx = (currentIdx - 1 + modes.length) % modes.length;
        e.preventDefault();
        break;
      case 'Home':
        nextIdx = 0;
        e.preventDefault();
        break;
      case 'End':
        nextIdx = modes.length - 1;
        e.preventDefault();
        break;
      default:
        break;
    }
    if (nextIdx !== currentIdx) {
      const nextMode = modes[nextIdx];
      setRotation(modeToRotation(nextMode));
      onChange && onChange(nextMode);
    }
  };

  // Click a letter to rotate knob under it
  const onLabelClick = (mode) => {
    const target = modeToRotation(mode);
    setRotation(target);
    onChange && onChange(mode);
  };

  // Center used for polar calc of labels
  const center = { x: radius, y: radius };

  return (
    <div
      className="dial-block"
      role="group"
      aria-label={ariaLabel}
      style={{ position: 'relative', minWidth: size * 2, minHeight: size * 2 }}
    >
      {/* Static, fixed letter ring outside the dial */}
      <div
        className="dial-segments"
        aria-hidden="false"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size * 2,
          height: size * 2,
          pointerEvents: 'none', // let clicks pass, we'll re-enable per-label
        }}
      >
        {modesWithAngles.map(({ mode, angle }) => {
          const pos = polar(center, labelRadius, angle);
          const isActive = mode === value;
          return (
            <button
              key={mode}
              type="button"
              className={`mode-segment ${isActive ? 'active' : ''}`}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto', // make label clickable
                background: 'var(--bg)',
              }}
              onClick={() => onLabelClick(mode)}
              aria-pressed={isActive}
              aria-label={`Set mode ${mode}`}
              title={mode}
              tabIndex={-1}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Rotating dial/knob centered within the static ring */}
      <div
        ref={rotorRef}
        className="dial-rotor leather-texture"
        style={{
          width: size,
          height: size,
          position: 'absolute',
          left: size / 2,
          top: size / 2,
          transform: 'translate(-50%, -50%)',
        }}
        title="Mode dial"
        role="application"
        tabIndex={0}
        aria-roledescription="rotating selector"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Stationary pointer at top of the rotor area */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            top: '6%',
            width: '10%',
            height: '10%',
            transform: 'translate(-50%, 0)',
            borderRadius: 2,
            background: 'var(--color-primary)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.5)',
            zIndex: 3,
          }}
        />

        {/* Outer ring ticks and subtle shading */}
        <div className="dial-ring" />

        {/* Physical knob that rotates */}
        <div
          className="dial-knob"
          style={{
            width: knobRadius * 2,
            height: knobRadius * 2,
            position: 'absolute',
            left: radius - knobRadius,
            top: radius - knobRadius,
            transform: `rotate(${rotation}deg)`,
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          <div className="dial-pip" />
          <div className="dial-highlight" />
        </div>
      </div>

      {/* Live readout */}
      <div className="dial-readout" aria-live="polite" style={{ marginTop: size + 8, textAlign: 'center' }}>
        {value}
      </div>
    </div>
  );
}
