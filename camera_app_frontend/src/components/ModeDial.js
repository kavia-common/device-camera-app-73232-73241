import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * PUBLIC_INTERFACE
 * ModeDial
 * A tactile, realistic DSLR program dial:
 * - All modes (AUTO/P/A/S/M) are distributed around the dial circumference.
 * - The dial can be rotated via drag, click, or keyboard so that the selected mode aligns to the top pointer.
 * - Leather texture and dual themes preserved via CSS variables and existing classes.
 * - Accessible: roving tab behavior for segments, group semantics, live readout.
 */
export default function ModeDial({
  modes = ['AUTO', 'P', 'A', 'S', 'M'],
  value = 'AUTO',
  onChange,
  size = 56,
  ariaLabel = 'Program/Mode Dial',
}) {
  const radius = size / 2;
  const innerRadius = Math.max(20, radius * 0.58); // inner knob radius for tactile look
  const labelRadius = radius * 0.84; // ring where text sits
  const pointerOffsetDeg = 0; // 0deg is top (aligned with dial-pip)

  // Create even angular distribution for all modes around 360 degrees
  const modesWithAngles = useMemo(() => {
    const step = 360 / (modes.length || 1);
    return modes.map((m, i) => ({ mode: m, angle: i * step }));
  }, [modes]);

  // Internal rotation state in degrees [0..360)
  const [rotation, setRotation] = useState(0);

  // Initialize rotation to align current value with pointer (top)
  useEffect(() => {
    const idx = modes.findIndex((m) => m === value);
    const step = 360 / (modes.length || 1);
    const desired = (360 - (idx * step + pointerOffsetDeg)) % 360;
    setRotation(desired);
  }, [value, modes, pointerOffsetDeg]);

  const rotorRef = useRef(null);
  const draggingRef = useRef(false);
  const baseRotationRef = useRef(0); // rotation at drag start
  const startAngleRef = useRef(0);

  const normalizeDeg = (deg) => {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  };

  // Position utilities
  const degToRad = (d) => (d * Math.PI) / 180;
  const polar = (r, angleDeg) => {
    const a = degToRad(angleDeg - 90); // set 0deg to top
    return {
      x: radius + r * Math.cos(a),
      y: radius + r * Math.sin(a),
    };
  };

  // Given a rotation, compute which mode is aligned to pointer at top
  const rotationToMode = (deg) => {
    const step = 360 / (modes.length || 1);
    // Effective label angle for mode i at this rotation is: (i*step + pointerOffset) rotated by -rotation
    // We want the one closest to pointer (which is at pointerOffsetDeg).
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < modes.length; i++) {
      const labelAngle = (i * step + pointerOffsetDeg - (360 - deg)) % 360;
      const dist = Math.min(Math.abs(labelAngle), 360 - Math.abs(labelAngle));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return modes[best];
  };

  // Snap rotation to center a given mode at the pointer
  const modeToRotation = (mode) => {
    const step = 360 / (modes.length || 1);
    const idx = Math.max(0, modes.findIndex((m) => m === mode));
    // Make the chosen mode land at pointerOffsetDeg
    const desired = (360 - (idx * step + pointerOffsetDeg)) % 360;
    return desired;
  };

  // Handle pointer interactions for dragging the dial
  const onPointerDown = (e) => {
    if (!rotorRef.current) return;
    draggingRef.current = true;
    const rect = rotorRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const startAngle = (Math.atan2(dy, dx) * 180) / Math.PI; // [-180..180]
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
    const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI; // [-180..180]
    const delta = currentAngle - startAngleRef.current;
    const next = normalizeDeg(baseRotationRef.current + delta);
    setRotation(next);
  };

  const endDragAndSnap = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const chosen = rotationToMode(rotation);
    const snap = modeToRotation(chosen);
    setRotation(snap);
    if (onChange) onChange(chosen);
  };

  const onPointerUp = () => {
    endDragAndSnap();
    try {
      rotorRef.current?.releasePointerCapture?.();
    } catch {}
  };

  const onKeyDown = (e) => {
    const step = 360 / (modes.length || 1);
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

  // Handle clicking a mode label: rotate the dial so it aligns to pointer
  const onLabelClick = (mode) => {
    const target = modeToRotation(mode);
    setRotation(target);
    onChange && onChange(mode);
  };

  // Compute positions for labels; rotate the label ring opposite to the dial so labels stay upright
  const labelRingRotation = -rotation;

  return (
    <div
      className="dial-block"
      role="group"
      aria-label={ariaLabel}
      style={{ minWidth: size, minHeight: size }}
    >
      <div
        ref={rotorRef}
        className="dial-rotor leather-texture"
        style={{ width: size, height: size, position: 'relative' }}
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
        {/* Outer ring with ticks and subtle shading */}
        <div className="dial-ring" />

        {/* Stationary pointer at the top (visual indicator) */}
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

        {/* Label ring: rotates opposite to keep text upright, shows all modes around circumference */}
        <div
          className="dial-segments"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            transform: `rotate(${labelRingRotation}deg)`,
            zIndex: 2,
          }}
        >
          {modesWithAngles.map(({ mode, angle }, i) => {
            const pos = polar(labelRadius, angle);
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

        {/* The physical knob that rotates with the dial */}
        <div
          className="dial-knob"
          style={{
            width: innerRadius * 2,
            height: innerRadius * 2,
            position: 'absolute',
            left: radius - innerRadius,
            top: radius - innerRadius,
            transform: `rotate(${rotation}deg)`,
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          <div className="dial-pip" />
          <div className="dial-highlight" />
        </div>
      </div>

      <div className="dial-readout" aria-live="polite">
        {value}
      </div>
    </div>
  );
}
