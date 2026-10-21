import { useRef } from "react";
import { motion } from "motion/react";
import { kliko, springs } from "../motion/tokens";

interface GalleryProps {
  thumbnails: { id: string; url: string }[];
  onImportFiles: (files: FileList) => void;
  onSelect: (id: string) => void;
}

/**
 * Tela "Galeria": importa fotografias REAIS do iPhone via
 * <input type=file accept=image/* capture>, que no Safari do iOS abre
 * o seletor nativo de Fotos/Câmera — nao ha fotos de exemplo fixas.
 */
export function Gallery({ thumbnails, onImportFiles, onSelect }: GalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ padding: "24px 18px 100px", minHeight: "100vh", background: kliko.bg }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: kliko.text, marginBottom: 4 }}>Galeria</h1>
      <p style={{ fontSize: 14, color: kliko.textMuted, marginBottom: 20 }}>
        Importe uma fotografia real do seu iPhone para editar com a Mini Kliko.
      </p>

      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={springs.snappy}
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%",
          padding: "16px 0",
          borderRadius: 18,
          border: `1.5px dashed ${kliko.blue}`,
          background: kliko.blueSoft,
          color: kliko.blue,
          fontWeight: 600,
          fontSize: 15,
          marginBottom: 24,
          cursor: "pointer",
        }}
      >
        + Importar fotografia
      </motion.button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => e.target.files && onImportFiles(e.target.files)}
      />

      {thumbnails.length === 0 ? (
        <p style={{ fontSize: 13, color: kliko.textMuted, textAlign: "center", marginTop: 40 }}>
          Nenhuma fotografia importada ainda.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {thumbnails.map((t) => (
            <motion.button
              key={t.id}
              layoutId={`photo-${t.id}`}
              onClick={() => onSelect(t.id)}
              whileTap={{ scale: 0.95 }}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 14,
                overflow: "hidden",
                border: "none",
                padding: 0,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              <img src={t.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
