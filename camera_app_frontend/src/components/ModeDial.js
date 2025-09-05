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
 * Correction:
 * Ensure clockwise/right rotation advances modes in natural order and the pointer aligns with the selected label.
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

  // Map mode index to knob rotation:
  // For natural behavior: when the knob rotates clockwise by +step, the next mode (index + 1) is selected.
  // Because our label angles increase clockwise and pointer is visually fixed at top,
  // the knob must rotate by the same positive angle to align the top with the next label.
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
    // atan2 returns angle from +x axis, counter-clockwise, but with screen y downwards; convert:
    const angleFromRight = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 at right
    // Convert to 0..360 clockwise from top:
    // angleFromTopCCW = angleFromRight + 90
    // to make it ClockwiseFromTop: cw = (360 - angleFromTopCCW) % 360 = (270 - angleFromRight) % 360
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
