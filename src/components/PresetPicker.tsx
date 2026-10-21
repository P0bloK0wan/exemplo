import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { kliko } from "../motion/tokens";
import { ANALOG_PRESETS, resolveAdjustmentsForPreset, resolveEffectsForPreset } from "../engine/analogPresets";
import { renderPresetThumbnail, DEFAULT_ADJUSTMENTS } from "../engine/photoEngine";
import { NO_ANALOG_EFFECTS } from "../engine/pixelOps";

interface PresetPickerProps {
  image: ImageBitmap | null;
  activePresetId: string | null;
  onSelect: (presetId: string | null) => void;
}

/**
 * Grade de presets analógicos com prévia REAL: cada card renderiza um
 * recorte pequeno da própria fotografia do usuário com o preset
 * aplicado (via `renderPresetThumbnail`), não um gradiente decorativo
 * como nos protótipos de referência. "Original" sempre aparece
 * primeiro para comparação.
 */
export function PresetPicker({ image, activePresetId, onSelect }: PresetPickerProps) {
  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 4, WebkitOverflowScrolling: "touch" }}>
      <PresetCard
        label="Original"
        image={image}
        adjustments={DEFAULT_ADJUSTMENTS}
        effects={NO_ANALOG_EFFECTS}
        active={activePresetId === null}
        onClick={() => onSelect(null)}
      />
      {ANALOG_PRESETS.map((preset) => (
        <PresetCard
          key={preset.id}
          label={preset.label}
          image={image}
          adjustments={resolveAdjustmentsForPreset(preset, 100)}
          effects={resolveEffectsForPreset(preset, 100)}
          active={activePresetId === preset.id}
          onClick={() => onSelect(preset.id)}
        />
      ))}
    </div>
  );
}

function PresetCard({
  label,
  image,
  adjustments,
  effects,
  active,
  onClick,
}: {
  label: string;
  image: ImageBitmap | null;
  adjustments: Parameters<typeof renderPresetThumbnail>[2];
  effects: Parameters<typeof renderPresetThumbnail>[3];
  active: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    renderPresetThumbnail(canvasRef.current, image, adjustments, effects, 72);
    // adjustments/effects são objetos novos a cada render do catálogo (não mudam de conteúdo,
    // mas são recriados) — comparar por JSON evita re-renderizar a miniatura sem necessidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, JSON.stringify(adjustments), JSON.stringify(effects)]);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: 4,
        borderRadius: 16,
        border: active ? `2px solid ${kliko.blue}` : "2px solid transparent",
        background: active ? kliko.blueSoft : "transparent",
        cursor: "pointer",
      }}
      aria-label={`Preset ${label}`}
      aria-pressed={active}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          overflow: "hidden",
          background: "#111",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        }}
      >
        <canvas ref={canvasRef} width={64} height={64} style={{ width: 64, height: 64, display: "block" }} />
      </div>
      <span style={{ fontSize: 10.5, color: active ? kliko.blue : kliko.textMuted, fontWeight: active ? 700 : 500 }}>
        {label}
      </span>
    </motion.button>
  );
}
