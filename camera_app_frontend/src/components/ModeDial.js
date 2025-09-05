import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * PUBLIC_INTERFACE
 * ModeDial
 * DSLR-like mode dial where letters (AUTO/P/A/S/M) are fixed outside the dial.
 * Only the inner knob rotates; the top pointer aligns to the selected mode.
 * - Drag/keyboard interaction rotates the knob.
 * - Static, non-rotating label ring rendered outside the dial.
 * - Preserves leather texture/theme and accessibility.
 *
 * Centering improvements:
 * - Wrap everything in a .mode-dial-wrapper that uses grid centering.
 * - Ensure the knob and the letter ring share the same center by using a single sized square.
 * - Distribute labels evenly in a perfect circle using polar math and absolute positioning from the same center.
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

  // Labels should sit just outside the physical knob boundary
  // We space them relative to the rotor's bounding square so they form a ring around it.
  const labelRadius = radius * 1.15; // slightly further to clear the knob edge

  // We define 0 degrees at top (12 o'clock) and increase clockwise for label placement.
  const degToRad = (d) => (d * Math.PI) / 180;
  const polar = (center, r, angleDegClockwiseFromTop) => {
    const a = degToRad(angleDegClockwiseFromTop - 90); // convert to canvas math
    return {
      x: center.x + r * Math.cos(a),
      y: center.y + r * Math.sin(a),
    };
  };

  // Precompute label positions around full circle (fixed; clockwise from top)
  const modesWithAngles = useMemo(() => {
    const step = 360 / (modes.length || 1);
    return modes.map((m, i) => ({ mode: m, angle: i * step })); // 0deg=top, increase clockwise
  }, [modes]);

  // Rotation state for the knob (0..360), where 0deg visually means pointing to top (AUTO if it's first).
  const [rotation, setRotation] = useState(0);

  // Map mode index to knob rotation
  const modeToRotation = (mode) => {
    const step = 360 / (modes.length || 1);
    const idx = Math.max(0, modes.findIndex((m) => m === mode));
    return (idx * step) % 360; // 0deg for first mode, +step for next, etc.
  };

  // Initialize rotation to point at current value
  useEffect(() => {
    setRotation(modeToRotation(value));
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

  // Convert screen coords to angle where 0deg is top and increases clockwise
  const angleFromCenterClockwiseFromTop = (cx, cy, x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const angleFromRight = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 at right
    let cw = 270 - angleFromRight;
    cw = ((cw % 360) + 360) % 360;
    return cw;
  };

  // Map knob rotation to nearest mode at top
  const rotationToMode = (deg) => {
    const step = 360 / (modes.length || 1);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < modes.length; i++) {
      const target = (i * step) % 360;
      const diff = Math.abs(target - deg);
      const dist = Math.min(diff, 360 - diff);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return modes[best];
  };

  // Pointer interactions
  const onPointerDown = (e) => {
    if (!rotorRef.current) return;
    draggingRef.current = true;
    const rect = rotorRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngleClockwise = angleFromCenterClockwiseFromTop(cx, cy, e.clientX, e.clientY);
    startAngleRef.current = startAngleClockwise;
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
    const currentAngleClockwise = angleFromCenterClockwiseFromTop(cx, cy, e.clientX, e.clientY);
    const delta = currentAngleClockwise - startAngleRef.current; // positive delta = clockwise
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

  // Keyboard support (clockwise/right/up advances)
  const onKeyDown = (e) => {
    const currentIdx = modes.findIndex((m) => m === value);
    let nextIdx = currentIdx;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nextIdx = (currentIdx + 1) % modes.length; // advance clockwise
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextIdx = (currentIdx - 1 + modes.length) % modes.length; // go counter-clockwise
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

  // Single square that defines the center for both the ring and rotor
  const outerSize = size * 2; // container square for ring/knob
  const center = { x: outerSize / 2, y: outerSize / 2 };

  return (
    <div
      className="mode-dial-wrapper"
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        placeItems: 'center',
        // Allow this component to naturally size itself but remain centered
        // by its parent (.dial or others).
        width: outerSize,
        height: outerSize + 24, // extra space for readout below
        position: 'relative',
      }}
    >
      {/* Static letter ring positioned in the same square so it shares the same center */}
      <div
        className="dial-segments"
        aria-hidden="false"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: outerSize,
          height: outerSize,
          pointerEvents: 'none',
        }}
      >
        {modesWithAngles.map(({ mode, angle }) => {
          const pos = polar(center, labelRadius + radius - (size / 2), angle);
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
                pointerEvents: 'auto',
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

      {/* Rotor centered in the same square */}
      <div
        ref={rotorRef}
        className="dial-rotor leather-texture"
        style={{
          width: size,
          height: size,
          position: 'absolute',
          left: '50%',
          top: '50%',
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
            left: radius - knobRadius + 'px',
            top: radius - knobRadius + 'px',
            transform: `rotate(${rotation}deg)`,
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          <div className="dial-pip" />
          <div className="dial-highlight" />
        </div>
      </div>

      {/* Live readout centered under the square */}
      <div className="dial-readout" aria-live="polite" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>
        {value}
      </div>
    </div>
  );
}
