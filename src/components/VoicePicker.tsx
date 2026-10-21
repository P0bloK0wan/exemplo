import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { kliko } from "../motion/tokens";
import { listVoices, speak, type KlikoVoice } from "../engine/voiceEngine";

interface VoicePickerProps {
  selectedURI: string | null;
  onSelect: (uri: string) => void;
}

/**
 * Seletor de voz do protótipo gratuito (item 5 do pedido): lista as
 * vozes do sistema disponíveis no aparelho, com as de português
 * (pt-BR primeiro, depois outras pt-*) no topo, e deixa testar cada
 * uma antes de escolher.
 */
export function VoicePicker({ selectedURI, onSelect }: VoicePickerProps) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<KlikoVoice[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listVoices().then((v) => {
      setVoices(v);
      setLoaded(true);
      if (!selectedURI && v.length > 0) onSelect(v[0].voice.voiceURI);
    });
    // intencional: so roda uma vez ao montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = voices.find((v) => v.voice.voiceURI === selectedURI);

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: 12,
          border: "none",
          background: "rgba(79,142,247,0.08)",
          color: kliko.text,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        <span>
          🔊 Voz: <strong>{selected ? shortName(selected) : loaded ? "nenhuma encontrada" : "carregando…"}</strong>
        </span>
        <span style={{ color: kliko.textMuted }}>{open ? "▲" : "▾"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {voices.length === 0 && loaded && (
                <p style={{ fontSize: 11.5, color: kliko.textMuted, padding: "4px 8px" }}>
                  Nenhuma voz do sistema encontrada neste navegador.
                </p>
              )}
              {voices.map((v) => (
                <div
                  key={v.voice.voiceURI}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: 10,
                    background: v.voice.voiceURI === selectedURI ? kliko.blueSoft : "transparent",
                  }}
                >
                  <button
                    onClick={() => onSelect(v.voice.voiceURI)}
                    style={{
                      background: "none",
                      border: "none",
                      textAlign: "left",
                      fontSize: 12.5,
                      color: v.voice.voiceURI === selectedURI ? kliko.blue : kliko.text,
                      fontWeight: v.voice.voiceURI === selectedURI ? 600 : 400,
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    {shortName(v)} {v.isPtBr && <span style={{ color: kliko.textMuted }}>· pt-BR</span>}
                  </button>
                  <button
                    onClick={() => speak("Olá, eu sou a Kliko.", v.voice.voiceURI)}
                    aria-label={`Testar voz ${v.voice.name}`}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "2px 6px",
                    }}
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function shortName(v: KlikoVoice): string {
  return v.voice.name.replace(/\(.*?\)/g, "").trim();
}
