import React, { useEffect, useRef, useState } from 'react';

/**
 * PUBLIC_INTERFACE
 * Dial
 * A visually realistic, interactive rotating dial component.
 * - Supports keyboard accessibility (ArrowLeft/Right/Up/Down, Home/End, PageUp/PageDown).
 * - Mouse/touch drag rotation.
 * - Displays current value and an optional label.
 * - Works with light/dark themes and leather texture by inheriting CSS variables.
 * - onChange emits numeric values (between min and max).
 */
export default function Dial({
  label = '',
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  size = 64,
  formatValue = (v) => String(v),
  title,
  ariaLabel,
  disabled = false,
}) {
  const dialRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Normalize value within range
  const clamp = (v) => Math.max(min, Math.min(max, v));

  // Convert value to angle (approx. 270° sweep like DSLR dials)
  const sweep = 270; // degrees
  const startAngle = -135; // center bottom-left
  const valueToAngle = (v) => {
    const pct = (clamp(v) - min) / (max - min || 1);
    return startAngle + pct * sweep;
    };
  const angleToValue = (angle) => {
    // convert angle back to value
    let a = angle - startAngle;
    a = Math.max(0, Math.min(sweep, a));
    const pct = a / sweep;
    const raw = min + pct * (max - min);
    // snap to step
    const snapped = Math.round(raw / step) * step;
    return clamp(snapped);
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    setDragging(true);
    // capture pointer
    if (dialRef.current && dialRef.current.setPointerCapture && e.pointerId != null) {
      try { dialRef.current.setPointerCapture(e.pointerId); } catch {}
    }
  };
  const handlePointerUp = (e) => {
    setDragging(false);
    if (dialRef.current && dialRef.current.releasePointerCapture && e.pointerId != null) {
      try { dialRef.current.releasePointerCapture(e.pointerId); } catch {}
    }
  };
  const handlePointerMove = (e) => {
    if (!dragging || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    // Angle in degrees from center
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 at +x
    // Convert so 0 is to the right, increase clockwise
    angle = angle; // atan2 already clockwise mapping with dy positive down in screen coords
    // Convert to 0-360
    if (angle < -180) angle += 360;
    if (angle < 0) angle += 360;

    // We map to our sweep window [startAngle .. startAngle+sweep] normalized to [0..360]
    // Convert angles to 0..360
    const s = (startAngle + 360) % 360;
    const eang = (startAngle + sweep + 360) % 360;

    const withinSweep = (ang) => {
      if (s <= eang) return ang >= s && ang <= eang;
      // wrapped
      return ang >= s || ang <= eang;
    };

    // If outside sweep, snap to nearest edge to avoid jumps
    let targetAngle = angle;
    if (!withinSweep(angle)) {
      // distance to start and end
      const dist = (a, b) => {
        let d = Math.abs(a - b);
        if (d > 180) d = 360 - d;
        return d;
      };
      const ds = dist(angle, s);
      const de = dist(angle, eang);
      targetAngle = ds < de ? s : eang;
    }

    const newVal = angleToValue(targetAngle >= 180 ? targetAngle - 360 : targetAngle); // keep near [-180..180] for calc
    if (onChange) onChange(newVal);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    let next = value;
    const big = Math.max(step * 5, (max - min) / 10);
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = clamp(value + step);
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = clamp(value - step);
        e.preventDefault();
        break;
      case 'PageUp':
        next = clamp(value + big);
        e.preventDefault();
        break;
      case 'PageDown':
        next = clamp(value - big);
        e.preventDefault();
        break;
      case 'Home':
        next = min;
        e.preventDefault();
        break;
      case 'End':
        next = max;
        e.preventDefault();
        break;
      default:
        break;
    }
    if (next !== value && onChange) onChange(next);
  };

  useEffect(() => {
    const node = dialRef.current;
    if (!node) return;
    const onMouseUp = () => setDragging(false);
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  const angle = valueToAngle(value);
  const display = formatValue(clamp(value));

  return (
    <div className="dial-block">
      {label && (
        <div className="dial-label" aria-hidden="true">
          {label}
        </div>
      )}
      <div
        className={`dial-rotor leather-texture ${disabled ? 'is-disabled' : ''}`}
        ref={dialRef}
        style={{ width: size, height: size }}
        role="slider"
        aria-label={ariaLabel || label || title || 'Dial'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamp(value)}
        aria-valuetext={String(display)}
        tabIndex={disabled ? -1 : 0}
        title={title || label}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
      >
        {/* Notch ring */}
        <div className="dial-ring" />
        {/* Knob */}
        <div
          className="dial-knob"
          style={{
            transform: `rotate(${angle}deg)`,
          }}
        >
          {/* Indicator pip */}
          <div className="dial-pip" />
          {/* Texture highlights */}
          <div className="dial-highlight" />
        </div>
      </div>
      <div className="dial-readout" aria-live="polite">
        {display}
      </div>
    </div>
  );
}
