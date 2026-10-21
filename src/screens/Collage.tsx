import { useRef, useState } from "react";
import { motion } from "motion/react";
import { kliko, springs } from "../motion/tokens";
import { LayoutPicker } from "../components/LayoutPicker";
import { CollageCanvas } from "../components/CollageCanvas";
import {
  COLLAGE_LAYOUTS,
  createEmptySlots,
  remapSlotsToLayout,
  assignPhotoToSlot,
  isCollageComplete,
  exportCollage,
  type CollageLayout,
  type CollageSlot,
} from "../engine/collageEngine";
import { exportCanvasAsPng, KlikoImageLoadError } from "../engine/photoEngine";

interface CollageProps {
  onClose: () => void;
}

/**
 * Estúdio de Colagem (Fase 3). Importação real de fotografias,
 * seleção de layout com molduras reais, reposicionamento/zoom por
 * gesto (CollageCanvas) e exportação real em PNG — nunca modifica os
 * `ImageBitmap` originais importados (cada um pode ser reaproveitado
 * em outra moldura/layout a qualquer momento).
 */
export function Collage({ onClose }: CollageProps) {
  const [layout, setLayout] = useState<CollageLayout>(COLLAGE_LAYOUTS[3]); // grade 2x2 como ponto de partida
  const [slots, setSlots] = useState<CollageSlot[]>(() => createEmptySlots(COLLAGE_LAYOUTS[3]));
  const [photos, setPhotos] = useState<Map<string, ImageBitmap>>(new Map());
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFrameIndexRef = useRef<number | null>(null);
  const idCounterRef = useRef(0);

  function handleSelectLayout(next: CollageLayout) {
    setLayout(next);
    setSlots((prev) => remapSlotsToLayout(prev, next));
  }

  function requestPhotoForFrame(frameIndex: number) {
    pendingFrameIndexRef.current = frameIndex;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(file: File | undefined) {
    const frameIndex = pendingFrameIndexRef.current;
    pendingFrameIndexRef.current = null;
    if (!file || frameIndex === null) return;
    setImportError(null);
    try {
      if (file.size === 0) throw new KlikoImageLoadError("O arquivo selecionado está vazio ou não pôde ser lido.");
      const bitmap = await createImageBitmap(file);
      const id = `cf${idCounterRef.current++}`;
      setPhotos((prev) => new Map(prev).set(id, bitmap));
      setSlots((prev) => assignPhotoToSlot(prev, frameIndex, id));
    } catch (err) {
      setImportError(
        err instanceof KlikoImageLoadError
          ? err.message
          : "Não consegui abrir essa imagem — o formato pode não ser suportado ou o arquivo pode estar corrompido.",
      );
    }
  }

  function handleExport() {
    setExporting(true);
    try {
      const canvas = exportCollage(layout, slots, photos, 1600);
      exportCanvasAsPng(canvas, "kliko-colagem.png");
    } finally {
      setExporting(false);
    }
  }

  const complete = isCollageComplete(slots);

  return (
    <div style={{ minHeight: "100vh", background: kliko.bgDeep, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 10px" }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={iconBtnStyle} aria-label="Fechar">
          ‹
        </motion.button>
        <span style={{ fontSize: 14, fontWeight: 600, color: kliko.text }}>Estúdio de Colagem</span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleExport}
          disabled={!complete || exporting}
          style={{ ...iconBtnStyle, opacity: complete && !exporting ? 1 : 0.35 }}
          aria-label="Exportar colagem"
        >
          ↓
        </motion.button>
      </div>

      <div style={{ padding: "0 18px 10px" }}>
        <LayoutPicker activeId={layout.id} onSelect={handleSelectLayout} />
      </div>

      <motion.div
        layout
        transition={springs.gentle}
        style={{ margin: "4px 18px 14px" }}
      >
        <CollageCanvas
          layout={layout}
          slots={slots}
          photos={photos}
          onSlotsChange={setSlots}
          onRequestPhoto={requestPhotoForFrame}
        />
      </motion.div>

      <p style={{ textAlign: "center", fontSize: 12, color: kliko.textMuted, padding: "0 24px" }}>
        {complete
          ? "Arraste para reposicionar, pinça (ou Ctrl + roda) para ampliar dentro de cada moldura."
          : "Toque em uma moldura vazia para adicionar uma fotografia — os originais são preservados."}
      </p>

      {importError && <p style={{ textAlign: "center", fontSize: 11.5, color: kliko.danger, padding: "4px 24px" }}>{importError}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFileChosen(e.target.files?.[0]);
          e.target.value = "";
        }}
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
