import { useEffect, useRef, useState } from "react";
import { kliko } from "../../motion/tokens";
import type { SculptureState } from "../../engine/sculptureEngine";
import { MicAmplitudeSession, type MicAmplitudeStatus } from "../../engine/micAmplitude";
import { SpeechPulseSession } from "../../engine/speechPulse";
import { KlikoSculptureSVG } from "./KlikoSculptureSVG";
import { KlikoSculptureGL } from "./KlikoSculptureGL";
import { KlikoSculptureHybrid } from "./KlikoSculptureHybrid";

type Variant = "svg" | "gl" | "hybrid";

const STATES: { id: SculptureState; label: string }[] = [
  { id: "aguardando", label: "Aguardando" },
  { id: "ouvindo", label: "Ouvindo" },
  { id: "pensando", label: "Pensando" },
  { id: "falando", label: "Falando" },
  { id: "editando", label: "Editando" },
  { id: "concluindo", label: "Concluindo" },
];

const VARIANTS: { id: Variant; label: string; note: string }[] = [
  { id: "svg", label: "A — SVG + Motion", note: "Filtro \"goo\" + Motion. Leve, roda em qualquer navegador." },
  { id: "gl", label: "B — WebGL + shaders", note: "Campo implícito de metaballs com normal falsa. Cai para A automaticamente se o contexto falhar." },
  { id: "hybrid", label: "C — Híbrida", note: "Compacta = SVG, expandida = WebGL, crossfade contínuo com a mesma mola do painel." },
];

/**
 * Painel de comparação das três variantes da nova Mini Kliko, no
 * Laboratório — exatamente o que foi pedido: "Quero visualizar as
 * três opções e comparar sua qualidade visual, fluidez e consumo de
 * recursos." Não substitui `MiniKliko.tsx`/`Editor.tsx` — é uma área
 * isolada, só para esta comparação.
 *
 * Mede fps real por amostragem de `requestAnimationFrame` (não
 * presume que WebGL é mais rápido — mostra o número). Para a reação
 * de voz: o microfone só é pedido com um clique explícito aqui
 * (nunca automaticamente), e uma única `MicAmplitudeSession` existe
 * por vez — trocar de variante ou desligar libera o microfone antes
 * de qualquer nova captura.
 */
export function SculptureLabPanel() {
  const [variant, setVariant] = useState<Variant>("hybrid");
  const [sculptureState, setSculptureState] = useState<SculptureState>("aguardando");
  const [expanded, setExpanded] = useState(false);
  const [fps, setFps] = useState<number | null>(null);

  const [micStatus, setMicStatus] = useState<MicAmplitudeStatus>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const micSessionRef = useRef<MicAmplitudeSession | null>(null);

  const [speechLevel, setSpeechLevel] = useState(0);
  const speechSessionRef = useRef<SpeechPulseSession | null>(null);

  // --- medição de fps real, amostrada a cada 500ms, sem presumir nada ---
  useEffect(() => {
    let raf: number;
    let frames = 0;
    let windowStart = performance.now();
    function tick() {
      frames++;
      const now = performance.now();
      if (now - windowStart >= 500) {
        setFps(Math.round((frames * 1000) / (now - windowStart)));
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [variant]);

  // --- microfone: sessão única, liberada ao trocar de variante/desmontar ---
  useEffect(() => {
    return () => {
      micSessionRef.current?.stop();
      micSessionRef.current = null;
      speechSessionRef.current?.stop();
      speechSessionRef.current = null;
    };
  }, []);

  function toggleMic(): void {
    if (micStatus === "active" || micStatus === "requesting") {
      micSessionRef.current?.stop();
      micSessionRef.current = null;
      setMicLevel(0);
      setMicStatus("idle");
      return;
    }
    const session = new MicAmplitudeSession({
      onLevel: setMicLevel,
      onStatusChange: setMicStatus,
    });
    micSessionRef.current = session;
    void session.start();
  }

  function testSpeech(): void {
    if (!speechSessionRef.current) {
      speechSessionRef.current = new SpeechPulseSession(setSpeechLevel);
    }
    speechSessionRef.current.speak(
      "Prontinho, encontrei um bom ajuste de luz e contraste para essa foto.",
    );
  }

  const reactive = {
    micLevel: sculptureState === "ouvindo" ? micLevel : undefined,
    speechPulse: sculptureState === "falando" ? speechLevel : undefined,
    panelProgress: sculptureState === "editando" || sculptureState === "concluindo" ? (expanded ? 1 : 0) : undefined,
  };

  return (
    <div style={{ borderRadius: 20, background: kliko.surfaceStrong, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", padding: 20, marginBottom: 22 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: kliko.text, marginBottom: 2 }}>
        Nova Mini Kliko — protótipo visual (Fase 4 experimental)
      </div>
      <p style={{ fontSize: 12, color: kliko.textMuted, marginBottom: 16 }}>
        Comparação lado a lado das três propostas. Não substitui a Mini Kliko do Editor — só depois de testar aqui no iPhone é que uma direção é escolhida.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            onClick={() => setVariant(v.id)}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: "none",
              background: variant === v.id ? kliko.blueSoft : kliko.surface,
              color: variant === v.id ? kliko.blue : kliko.text,
              fontWeight: variant === v.id ? 700 : 500,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: kliko.textMuted, marginBottom: 16 }}>
        {VARIANTS.find((v) => v.id === variant)?.note}
      </p>

      <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        {variant === "svg" && <KlikoSculptureSVG state={sculptureState} size={expanded ? 220 : 110} reactive={reactive} />}
        {variant === "gl" && <KlikoSculptureGL state={sculptureState} size={expanded ? 220 : 110} reactive={reactive} />}
        {variant === "hybrid" && (
          <KlikoSculptureHybrid state={sculptureState} reactive={reactive} expanded={expanded} compactSize={110} expandedSize={220} />
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: kliko.textMuted, marginBottom: 14 }}>
        <span>~{fps ?? "…"} fps nesta variante</span>
        <span>Resolução interna adaptativa ativa só na variante B/C quando necessário</span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: kliko.textMuted, marginBottom: 6 }}>Estado</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {STATES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSculptureState(s.id)}
            style={{
              padding: "7px 10px",
              borderRadius: 10,
              border: "none",
              background: sculptureState === s.id ? kliko.blue : kliko.surface,
              color: sculptureState === s.id ? "#fff" : kliko.text,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setExpanded((e) => !e)} style={actionBtnStyle}>
          {expanded ? "Recolher (compacta)" : "Expandir (painel)"}
        </button>
        <button onClick={toggleMic} style={actionBtnStyle}>
          {micStatus === "active" ? "Parar microfone" : micStatus === "requesting" ? "Pedindo permissão…" : "Testar com microfone real"}
        </button>
        <button onClick={testSpeech} style={actionBtnStyle}>
          Testar fala (pulso por evento)
        </button>
      </div>

      {micStatus === "error" && (
        <p style={{ fontSize: 11, color: kliko.danger, marginBottom: 8 }}>
          Não consegui acessar o microfone (permissão negada ou API indisponível neste navegador).
        </p>
      )}
      <p style={{ fontSize: 11, color: kliko.textMuted }}>
        Microfone: {micStatus} · nível {Math.round(micLevel * 100)}% — Fala: pulso por evento de palavra, nunca forma de onda real.
      </p>
    </div>
  );
}

const actionBtnStyle = {
  padding: "9px 14px",
  borderRadius: 12,
  border: "none",
  background: kliko.surface,
  color: kliko.text,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
} as const;
