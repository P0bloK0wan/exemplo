import { kliko } from "../motion/tokens";
import { COLLAGE_LAYOUTS, type CollageLayout } from "../engine/collageEngine";

interface LayoutPickerProps {
  activeId: string;
  onSelect: (layout: CollageLayout) => void;
}

/**
 * Cada card desenha as molduras REAIS do layout (retângulos finos),
 * não um gradiente decorativo — o que se vê aqui é exatamente a
 * estrutura que vai para o canvas de montagem.
 */
export function LayoutPicker({ activeId, onSelect }: LayoutPickerProps) {
  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
      {COLLAGE_LAYOUTS.map((layout) => {
        const active = layout.id === activeId;
        return (
          <button
            key={layout.id}
            onClick={() => onSelect(layout)}
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: 6,
              borderRadius: 14,
              border: active ? `2px solid ${kliko.blue}` : "2px solid transparent",
              background: active ? kliko.blueSoft : "transparent",
              cursor: "pointer",
            }}
            aria-label={`Layout ${layout.label}`}
            aria-pressed={active}
          >
            <div style={{ position: "relative", width: 44, aspectRatio: `${layout.aspect}` }}>
              {layout.frames.map((f, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                    background: active ? kliko.blue : "#c7ccd4",
                    borderRadius: 3,
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10, color: active ? kliko.blue : kliko.textMuted, fontWeight: active ? 700 : 500 }}>
              {layout.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
