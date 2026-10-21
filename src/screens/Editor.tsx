import { motion } from "motion/react";
import { PhotoCanvas } from "../components/PhotoCanvas";
import { MiniKliko } from "../components/MiniKliko";
import { kliko, springs } from "../motion/tokens";
import {
  DEFAULT_EDIT_STATE,
  analyzePhoto,
  buildSkyMaskForCanvas,
  exportCanvasAsPng,
  type EditState,
} from "../engine/photoEngine";
import type { PhotoAnalysis } from "../engine/photoAnalysis";
import { createHistory, undo, redo, canUndo, canRedo, resetHistory, confirmDraft, cancelDraft, setDraft, type HistoryState } from "../engine/editHistory";
import { useEffect, useMemo, useRef, useState } from "react";

interface EditorProps {
  photoId: string;
  image: ImageBitmap | null;
  onClose: () => void;
}

/**
 * Tela "Editor": catálogo #41 (crossfade antes/depois, botão "Ver original"),
 * #44 (ajuste em tempo real) e #48 (fechar em zoom-through via layoutId
 * compartilhado com a miniatura na Galeria).
 *
 * Fase 2: além dos 4 sliders globais, carrega a análise real da foto
 * (histograma/regiões/céu) uma vez por imagem e mantém um histórico
 * não destrutivo (`editHistory.ts`) com desfazer/refazer de verdade.
 */
export function Editor({ photoId, image, onClose }: EditorProps) {
  const [history, setHistory] = useState<HistoryState<EditState>>(() => createHistory(DEFAULT_EDIT_STATE));
  const [showOriginal, setShowOriginal] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const canvasHolderRef = useRef<HTMLDivElement>(null);

  // Análise roda uma vez por foto (não a cada slider) — é o histograma
  // real da imagem original, usado pelas sugestões por regras.
  useEffect(() => {
    setHistory(createHistory(DEFAULT_EDIT_STATE));
    setAnalysis(null);
    setAnalysisError(null);
    if (!image) return;
    try {
      const result = analyzePhoto(image);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Não foi possível analisar esta foto.");
    }
  }, [image]);

  const skyMaskForCanvas = useMemo(() => {
    if (!image || !analysis) return null;
    return buildSkyMaskForCanvas(analysis, image.width, image.height);
  }, [image, analysis]);

  const visibleState = history.draft ?? history.present;

  function handleExport() {
    const canvas = canvasHolderRef.current?.querySelector("canvas");
    if (canvas) exportCanvasAsPng(canvas as HTMLCanvasElement);
  }

  return (
    <div style={{ minHeight: "100vh", background: kliko.bgDeep, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 10px", gap: 6 }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={iconBtnStyle} aria-label="Fechar">
          ‹
        </motion.button>
        <span style={{ fontSize: 14, fontWeight: 600, color: kliko.text }}>Editor</span>
        <div style={{ display: "flex", gap: 6 }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setHistory((h) => undo(h))}
            disabled={!canUndo(history)}
            style={{ ...iconBtnStyle, opacity: canUndo(history) ? 1 : 0.35 }}
            aria-label="Desfazer"
          >
            ↺
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setHistory((h) => redo(h))}
            disabled={!canRedo(history)}
            style={{ ...iconBtnStyle, opacity: canRedo(history) ? 1 : 0.35 }}
            aria-label="Refazer"
          >
            ↻
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleExport} style={iconBtnStyle} aria-label="Exportar">
            ↓
          </motion.button>
        </div>
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
          <PhotoCanvas image={image} state={showOriginal ? DEFAULT_EDIT_STATE : visibleState} skyMask={skyMaskForCanvas} />
        ) : (
          <span style={{ color: "#fff", fontSize: 13 }}>Carregando…</span>
        )}
      </motion.div>

      <p style={{ textAlign: "center", fontSize: 12, color: kliko.textMuted, marginBottom: analysisError ? 2 : 14 }}>
        Segure a foto para ver o original · fotografia preservada, edição não destrutiva
      </p>
      {analysisError && (
        <p style={{ textAlign: "center", fontSize: 11.5, color: kliko.danger, marginBottom: 14 }}>{analysisError}</p>
      )}

      <MiniKliko
        editState={visibleState}
        analysis={analysis}
        onProposeDraft={(next) => setHistory((h) => setDraft(h, next))}
        onConfirm={() => setHistory((h) => confirmDraft(h))}
        onCancel={() => setHistory((h) => cancelDraft(h))}
        onReset={() => setHistory((h) => resetHistory(h, DEFAULT_EDIT_STATE))}
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
