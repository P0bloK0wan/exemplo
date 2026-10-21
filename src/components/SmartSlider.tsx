import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { kliko } from "../motion/tokens";

interface SmartSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suggested?: number; // valor sugerido pela IA, para o "ima" visual
  onChange: (v: number) => void;
}

/**
 * Slider "C. Sliders e Controles Inteligentes" do catalogo:
 * - preenchimento do track em tempo real (#27)
 * - rotulo de valor flutuante durante o arrasto (#36)
 * - reset ao valor original via duplo toque (#35)
 * O thumb usa <input type=range> nativo (acessivel, confiavel no
 * Safari) com crescimento por CSS em :active — ver README para a nota
 * sobre a versao 100% Motion-driven planejada para a Fase 2.
 */
export function SmartSlider({ label, value, min = -100, max = 100, suggested, onChange }: SmartSliderProps) {
  const [dragging, setDragging] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: kliko.textMuted, marginBottom: 6 }}>
        <span>{label}</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={dragging ? "live" : "static"}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ fontVariantNumeric: "tabular-nums", color: kliko.blue, fontWeight: 600 }}
          >
            {value > 0 ? `+${value}` : value}
          </motion.span>
        </AnimatePresence>
      </div>

      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            height: 4,
            width: "100%",
            borderRadius: 2,
            background: "rgba(0,0,0,0.08)",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: kliko.blue,
              borderRadius: 2,
            }}
          />
          {suggested !== undefined && (
            <div
              title="Sugestao da IA"
              style={{
                position: "absolute",
                left: `${((suggested - min) / (max - min)) * 100}%`,
                top: -3,
                width: 2,
                height: 10,
                background: kliko.textMuted,
                opacity: 0.5,
              }}
            />
          )}
        </div>

        {/* Thumb cresce/retorna via CSS (:active) — ver index.css .kliko-range.
            Fisica de referencia: springs.snappy (stiffness 420, damping 34). */}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onDoubleClick={() => onChange(0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="kliko-range"
          style={{ position: "relative", width: "100%", margin: 0 }}
        />
      </div>
    </div>
  );
}
