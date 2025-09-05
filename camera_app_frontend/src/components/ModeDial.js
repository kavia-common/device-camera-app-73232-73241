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
 * Visual spacing improvements:
 * - Compute custom angular spacing that compensates for the wider AUTO label to prevent S and A clustering.
 * - Keep a stable, intuitive clockwise order and keep knob indexing consistent with visual positions.
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

  // Labels sit outside the knob; push a bit further out for clarity
  const labelRadius = radius * 1.32;

  // Helpers
  const degToRad = (d) => (d * Math.PI) / 180;
  const polar = (center, r, angleDegClockwiseFromTop) => {
    const a = degToRad(angleDegClockwiseFromTop - 90);
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  };

  /**
   * Compute visually balanced label angles in degrees (clockwise from top = 0°).
   * We detect if we have the typical 5-mode set that includes 'AUTO'.
   * If so, apply hand-tuned spacing to keep distribution even, compensating the width of 'AUTO'
   * and preventing S and A from clustering.
   *
   * Default fallback: equal spacing around 360°.
   */
  const modesWithAngles = useMemo(() => {
    const N = modes.length || 1;

    // Try a known mapping when we have the standard 5 items including AUTO.
    const canonical = ['AUTO', 'P', 'A', 'S', 'M'];
    const isCanonicalSet =
      N === 5 &&
      canonical.every((m) => modes.includes(m));

    if (isCanonicalSet) {
      // Custom angles tuned for visually even spacing.
      // Rationale:
      // - AUTO is wide; keep it centered at 0° (top).
      // - Distribute P, A, S, M so their chip centers maintain near-even visual gaps,
      //   with a slightly larger gap near AUTO to avoid crowding.
      // Order clockwise from top (0°):
      // AUTO (0°), P (68°), A (152°), S (208°), M (296°)
      // This widens the A–S gap slightly, reducing perceived crowding between S and A.
      const angleMap = {
        AUTO: 0,
        P: 68,
        A: 152,
        S: 208,
        M: 296,
      };
      return modes.map((m) => ({ mode: m, angle: angleMap[m] ?? 0 }));
    }

    // Otherwise distribute evenly
    const step = 360 / N;
    return modes.map((m, i) => ({ mode: m, angle: i * step }));
  }, [modes]);

  // Rotation state for the knob (0..360), where 0° visually means pointer at top.
  const [rotation, setRotation] = useState(0);

  // Map mode to knob rotation by aligning to the label's target angle.
  const modeToRotation = (mode) => {
    const entry = modesWithAngles.find((e) => e.mode === mode);
    return entry ? (entry.angle % 360) : 0;
  };

  // Initialize rotation to point at current value
  useEffect(() => {
    setRotation(modeToRotation(value));
  }, [value, modesWithAngles]);

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

  // Map knob rotation to nearest mode at top using the custom label angles
  const rotationToMode = (deg) => {
    let bestMode = modes[0];
    let bestDist = Infinity;
    for (const { mode, angle } of modesWithAngles) {
      const diff = Math.abs(angle - deg);
      const dist = Math.min(diff, 360 - diff);
      if (dist < bestDist) {
        bestDist = dist;
        bestMode = mode;
      }
    }
    return bestMode;
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

  // Outer layout square for centering
  const outerSize = Math.round(size * 2.2);
  const center = { x: outerSize / 2, y: outerSize / 2 };

  return (
    <div
      className="mode-dial-wrapper"
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: outerSize,
        height: outerSize + 24,
        position: 'relative',
      }}
    >
      {/* Static label ring */}
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

      {/* Rotor */}
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
        {/* Pointer at top of rotor */}
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

        <div className="dial-ring" />

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

      <div className="dial-readout" aria-live="polite" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>
        {value}
      </div>
    </div>
  );
}
