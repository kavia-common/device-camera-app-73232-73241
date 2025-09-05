import React, { useMemo } from 'react';

/**
 * PUBLIC_INTERFACE
 * ModeDial
 * A DSLR-like program/mode dial that always shows all modes around the dial,
 * highlights the active mode, and allows clicking any segment to select it.
 * - Preserves leather texture (expects parent to apply leather-texture class to container if desired).
 * - Respects theme via CSS variables.
 * - Accessible: group role, each segment is a button with aria-pressed, keyboard focusable.
 */
export default function ModeDial({
  modes = ['AUTO', 'P', 'A', 'S', 'M'],
  value = 'AUTO',
  onChange,
  size = 56,
  ariaLabel = 'Program/Mode Dial',
}) {
  const radius = size / 2;
  const innerRadius = radius * 0.58; // inner circle (knob) radius
  const labelRadius = radius * 0.85; // where labels are placed
  const sweep = 300; // degrees of total arc used by labels (leave a gap)
  const startAngle = -sweep / 2; // centered at top
  const modesWithAngles = useMemo(() => {
    const stepDeg = modes.length > 1 ? sweep / (modes.length - 1) : 0;
    return modes.map((m, i) => {
      const angle = startAngle + i * stepDeg;
      return { mode: m, angle };
    });
  }, [modes]);

  // Selected mode rotation: align selected segment to top indicator
  const selected = modesWithAngles.find(m => m.mode === value) || modesWithAngles[0];
  const knobRotation = selected ? selected.angle : 0;

  // Utilities to compute positions for labels
  const degToRad = (d) => (d * Math.PI) / 180;
  const polar = (r, angleDeg) => {
    const a = degToRad(angleDeg - 90); // -90 so angle 0 sits at top visually
    return {
      x: radius + r * Math.cos(a),
      y: radius + r * Math.sin(a),
    };
  };

  return (
    <div
      className="dial-block"
      role="group"
      aria-label={ariaLabel}
      style={{ minWidth: size, minHeight: size }}
    >
      <div
        className="dial-rotor leather-texture"
        style={{ width: size, height: size, position: 'relative' }}
        aria-hidden="false"
        title="Mode dial"
      >
        {/* Outer ring */}
        <div className="dial-ring" />

        {/* Clickable segments and labels */}
        <div
          className="dial-segments"
          aria-hidden="false"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
          }}
        >
          {/* Render each mode as a positioned label button around the dial */}
          {modesWithAngles.map(({ mode, angle }) => {
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
                  transform: 'translate(-50%, -50%) rotate(0deg)',
                  // keep labels readable with small font-size and weight already defined in CSS
                  // add a bit of background to improve contrast
                  background: 'var(--bg)',
                }}
                aria-pressed={isActive}
                aria-label={`Set mode ${mode}`}
                onClick={() => onChange && onChange(mode)}
                title={mode}
              >
                {mode}
              </button>
            );
          })}
        </div>

        {/* Knob that visually rotates to the selected position */}
        <div
          className="dial-knob"
          style={{
            width: innerRadius * 2,
            height: innerRadius * 2,
            position: 'absolute',
            left: radius - innerRadius,
            top: radius - innerRadius,
            transform: `rotate(${knobRotation}deg)`,
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
