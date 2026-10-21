import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ANIMATION_REGISTRY, type AnimationCategory } from "../motion/registry";
import { kliko } from "../motion/tokens";
import { LiveKitTestPanel } from "../components/LiveKitTestPanel";
import { SculptureLabPanel } from "../components/sculpture/SculptureLabPanel";

const CATEGORY_LABEL: Record<AnimationCategory, string> = {
  orb: "Mini Kliko (orb)",
  painel: "Painéis & Sheets",
  slider: "Sliders",
  foto: "Fotografia",
  voz: "Voz & IA",
};

/**
 * "Laboratório de animações" pedido no item 2 da ultima mensagem:
 * lista as 20 animações essenciais (lidas do registry, sem duplicar
 * definição nenhuma) e deixa ajustar stiffness/damping ao vivo numa
 * caixinha de demonstração.
 */
export function Lab() {
  const [selectedId, setSelectedId] = useState(ANIMATION_REGISTRY[2].id); // orb-to-panel
  const [stiffness, setStiffness] = useState(210);
  const [damping, setDamping] = useState(26);
  const [play, setPlay] = useState(false);

  const selected = useMemo(() => ANIMATION_REGISTRY.find((a) => a.id === selectedId)!, [selectedId]);

  const grouped = useMemo(() => {
    const byCat: Record<string, typeof ANIMATION_REGISTRY> = {};
    for (const a of ANIMATION_REGISTRY) {
      (byCat[a.categoria] ??= []).push(a);
    }
    return byCat;
  }, []);

  return (
    <div style={{ padding: "24px 18px 110px", minHeight: "100vh", background: kliko.bg }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: kliko.text, marginBottom: 4 }}>Laboratório</h1>
      <p style={{ fontSize: 14, color: kliko.textMuted, marginBottom: 20 }}>
        As 20 animações essenciais da Fase 1. Ajuste a mola e teste ao vivo.
      </p>

      {/* Palco de demonstração */}
      <div
        style={{
          borderRadius: 20,
          background: kliko.surfaceStrong,
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          padding: 20,
          marginBottom: 22,
        }}
      >
        <div style={{ fontSize: 13, color: kliko.textMuted, marginBottom: 14 }}>{selected.descricao}</div>

        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <motion.div
            key={play ? "on" : "off"}
            animate={{
              scale: play ? [1, 1.5, 1] : 1,
              borderRadius: play ? ["50%", "22%", "50%"] : "50%",
            }}
            transition={{ type: "spring", stiffness, damping, mass: 0.8 }}
            style={{
              width: 64,
              height: 64,
              background: `radial-gradient(circle at 30% 30%, #fff, ${kliko.blue})`,
              boxShadow: `0 10px 24px ${kliko.blueGlow}`,
            }}
          />
        </div>

        <button onClick={() => setPlay((p) => !p)} style={playBtnStyle}>
          {play ? "Reiniciar" : "▶ Testar animação"}
        </button>

        <div style={{ marginTop: 18, display: "flex", gap: 16 }}>
          <label style={labelStyle}>
            Rigidez (stiffness): {stiffness}
            <input type="range" min={50} max={500} value={stiffness} onChange={(e) => setStiffness(Number(e.target.value))} className="kliko-range" />
          </label>
          <label style={labelStyle}>
            Amortecimento (damping): {damping}
            <input type="range" min={5} max={60} value={damping} onChange={(e) => setDamping(Number(e.target.value))} className="kliko-range" />
          </label>
        </div>

        <pre style={{ marginTop: 14, fontSize: 11, background: "rgba(0,0,0,0.04)", padding: 10, borderRadius: 10, overflowX: "auto" }}>
{`{ type: "spring", stiffness: ${stiffness}, damping: ${damping}, mass: 0.8 }`}
        </pre>
      </div>

      <SculptureLabPanel />

      <LiveKitTestPanel />

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: kliko.textMuted, marginBottom: 8 }}>
            {CATEGORY_LABEL[cat as AnimationCategory]}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setSelectedId(a.id);
                  setPlay(false);
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "none",
                  background: a.id === selectedId ? kliko.blueSoft : kliko.surface,
                  color: a.id === selectedId ? kliko.blue : kliko.text,
                  fontWeight: a.id === selectedId ? 600 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {a.nome}
                <span style={{ float: "right", fontSize: 11, color: kliko.textMuted }}>{a.tela}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const playBtnStyle = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 14,
  border: "none",
  background: kliko.blue,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
} as const;

const labelStyle = {
  flex: 1,
  fontSize: 11,
  color: kliko.textMuted,
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
};
