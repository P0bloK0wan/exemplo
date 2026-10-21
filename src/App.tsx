import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Gallery } from "./screens/Gallery";
import { Editor } from "./screens/Editor";
import { Collage } from "./screens/Collage";
import { Lab } from "./screens/Lab";
import { kliko, springs } from "./motion/tokens";

type Tab = "galeria" | "editor" | "colagem" | "lab";

interface PhotoEntry {
  id: string;
  url: string;
  bitmap: ImageBitmap;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("galeria");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const idCounter = useRef(0);

  async function handleImportFiles(files: FileList) {
    const entries: PhotoEntry[] = [];
    for (const file of Array.from(files)) {
      const bitmap = await createImageBitmap(file);
      const url = URL.createObjectURL(file);
      entries.push({ id: `p${idCounter.current++}`, url, bitmap });
    }
    setPhotos((prev) => [...entries, ...prev]);
  }

  function openPhoto(id: string) {
    setActivePhotoId(id);
    setTab("editor");
  }

  const activePhoto = photos.find((p) => p.id === activePhotoId) ?? null;

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif", background: kliko.bg }}>
      {tab === "galeria" && (
        <Gallery
          thumbnails={photos.map((p) => ({ id: p.id, url: p.url }))}
          onImportFiles={handleImportFiles}
          onSelect={openPhoto}
        />
      )}

      {tab === "editor" &&
        (activePhoto ? (
          <Editor photoId={activePhoto.id} image={activePhoto.bitmap} onClose={() => setTab("galeria")} />
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: kliko.textMuted }}>
            Escolha uma fotografia na Galeria primeiro.
          </div>
        ))}

      {tab === "colagem" && <Collage onClose={() => setTab("galeria")} />}

      {tab === "lab" && <Lab />}

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "space-around",
          padding: "10px 0 20px",
          background: kliko.surfaceStrong,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(0,0,0,0.06)",
          zIndex: 40,
        }}
      >
        {(["galeria", "editor", "colagem", "lab"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", padding: 6 }}>
            <motion.div
              animate={{ color: tab === t ? kliko.blue : kliko.textMuted, scale: tab === t ? 1.05 : 1 }}
              transition={springs.snappy}
              style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}
            >
              {t === "lab" ? "Laboratório" : t}
            </motion.div>
          </button>
        ))}
      </nav>
    </div>
  );
}
