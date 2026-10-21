import { motion } from "motion/react";
import { PhotoCanvas } from "../components/PhotoCanvas";
import { MiniKliko } from "../components/MiniKliko";
import { kliko, springs } from "../motion/tokens";
import { DEFAULT_ADJUSTMENTS, exportCanvasAsPng, type AdjustmentValues } from "../engine/photoEngine";
import { useRef, useState } from "react";

interface EditorProps {
  photoId: string;
  image: ImageBitmap | null;
  onClose: () => void;
}

/**
 * Tela "Editor": catalogo #41 (crossfade antes/depois, botao "Ver original"),
 * #44 (ajuste em tempo real) e #48 (fechar em zoom-through via layoutId
 * compartilhado com a miniatura na Galeria).
 */
export function Editor({ photoId, image, onClose }: EditorProps) {
  const [adjustments, setAdjustments] = useState<AdjustmentValues>(DEFAULT_ADJUSTMENTS);
  const [showOriginal, setShowOriginal] = useState(false);
  const canvasHolderRef = useRef<HTMLDivElement>(null);

  function handleExport() {
    const canvas = canvasHolderRef.current?.querySelector("canvas");
    if (canvas) exportCanvasAsPng(canvas as HTMLCanvasElement);
  }

  return (
    <div style={{ minHeight: "100vh", background: kliko.bgDeep, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 10px" }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={iconBtnStyle} aria-label="Fechar">
          ‹
        </motion.button>
        <span style={{ fontSize: 14, fontWeight: 600, color: kliko.text }}>Editor</span>
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleExport} style={iconBtnStyle} aria-label="Exportar">
          ↓
        </motion.button>
      </div>

      <motion.div
        layoutId={`photo-${photoId}`}
        transition={springs.gentle}
        ref={canvasHolderRef}
        onPointerDown={() => setShowOriginal(true)}
        onPointerUp={() => setShowOriginal(false)}
        onPointerLeave={() => setShowOriginal(false)}
        style={{
          flex: 1,
          margin: "0 16px 16px",
          borderRadius: 20,
          overflow: "hidden",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        }}
      >
        {image ? (
          <PhotoCanvas image={image} adjustments={showOriginal ? DEFAULT_ADJUSTMENTS : adjustments} />
        ) : (
          <span style={{ color: "#fff", fontSize: 13 }}>Carregando…</span>
        )}
      </motion.div>

      <p style={{ textAlign: "center", fontSize: 12, color: kliko.textMuted, marginBottom: 14 }}>
        Segure a foto para ver o original · fotografia preservada, edição não destrutiva
      </p>

      <MiniKliko
        adjustments={adjustments}
        onChange={setAdjustments}
        onConfirm={() => {
          /* Fase 1: "Concluir" apenas fecha o painel — os ajustes continuam
             aplicados de forma não destrutiva sobre o original. */
        }}
        onUndo={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
        hasPhoto={!!image}
      />
    </div>
  );
}

const iconBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "none",
  background: kliko.surfaceStrong,
  color: kliko.text,
  fontSize: 18,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
} as const;
