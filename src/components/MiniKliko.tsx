import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { kliko, springs } from "../motion/tokens";
import { SmartSlider } from "./SmartSlider";
import { VoicePicker } from "./VoicePicker";
import type { AdjustmentValues } from "../engine/photoEngine";
import { speak, stopSpeaking } from "../engine/voiceEngine";

type KlikoState = "idle" | "listening" | "panel";

interface MiniKlikoProps {
  adjustments: AdjustmentValues;
  onChange: (next: AdjustmentValues) => void;
  onConfirm: () => void;
  onUndo: () => void;
  /** se false, a Mini Kliko ainda aparece mas sem controles de foto (ex: na Galeria) */
  hasPhoto: boolean;
}

/**
 * A peca central do Kliko: a nuvem azul flutuante que se TRANSFORMA em
 * painel de edicao, sem nunca sumir e reaparecer como outro elemento.
 *
 * Tecnica: os dois estados (orb fechado / painel aberto) compartilham o
 * mesmo layoutId ("kliko-shell"). O Motion anima automaticamente
 * posicao, tamanho e border-radius entre os dois — e o equivalente
 * web ao matchedGeometryEffect do SwiftUI (catalogo #5 e #6).
 *
 * Reconhecimento de voz: tenta a Web Speech API real (webkitSpeechRecognition).
 * Quando indisponivel (a maioria dos navegadores fora do Safari/Chrome
 * desktop, ou sem permissao), cai para comandos simulados — e a
 * interface deixa isso visivelmente marcado como "Demonstracao simulada",
 * como exigido.
 */
export function MiniKliko({ adjustments, onChange, onConfirm, onUndo, hasPhoto }: MiniKlikoProps) {
  const [state, setState] = useState<KlikoState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSimulated, setIsSimulated] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Espelha `transcript` de forma sincrona. `onresult`/`onend` sao
  // callbacks do SpeechRecognition, nao re-renders do React: se eles
  // lessem o `transcript` do state (via closure), pegariam o valor de
  // quando foram CRIADOS, nao o mais recente. Essa era exatamente a
  // dessincronizacao entre transcricao recebida e interpretacao — o
  // onend rodava interpretCommand() fechado sobre a string vazia que
  // existia antes do onresult atualizar o state, entao o comando quase
  // sempre caia em "nada reconhecido". O ref resolve isso por ser
  // mutavel e lido com o valor atual, nunca uma copia antiga.
  const transcriptRef = useRef("");
  // Guarda o estado de ajustes de ANTES do ultimo comando de voz, para
  // que "Cancelar" possa reverter so esse comando — diferente de
  // "Redefinir tudo", que zera todos os sliders.
  const previousAdjustmentsRef = useRef<AdjustmentValues>(adjustments);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function startListening() {
    if (!hasPhoto) return;
    stopSpeaking(); // nao deixa a Kliko falando por cima de um novo pedido
    // Evita duas instancias de reconhecimento rodando ao mesmo tempo
    // se o usuario tocar o orb de novo enquanto ja esta ouvindo.
    if (state === "listening") {
      recognitionRef.current?.stop?.();
      return;
    }

    setSummary(null);
    setTranscript("");
    transcriptRef.current = "";
    setState("listening");

    if (speechSupported) {
      setIsSimulated(false);
      const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
      const recog = new SR();
      recog.lang = "pt-BR";
      recog.interimResults = true;
      recog.onresult = (ev: SpeechRecognitionEventLike) => {
        const text = Array.from(ev.results).map((r) => r[0].transcript).join(" ");
        transcriptRef.current = text;
        setTranscript(text);
      };
      recog.onerror = () => {
        // Se o erro chegar, o onend pode disparar logo em seguida (varia
        // por navegador) — desarmamos para nao interpretar duas vezes.
        recog.onend = null;
        fallbackToSimulated();
      };
      recog.onend = () => {
        // Le sempre o valor mais atual, nunca uma copia antiga.
        if (transcriptRef.current) applyVoiceCommand(transcriptRef.current);
      };
      recognitionRef.current = recog;
      try {
        recog.start();
      } catch {
        fallbackToSimulated();
      }
    } else {
      fallbackToSimulated();
    }
  }

  function fallbackToSimulated() {
    setIsSimulated(true);
    // Demonstracao simulada e explicita: nao finge reconhecimento real.
    const demoPhrase = "deixa essa foto mais iluminada";
    let i = 0;
    const timer = setInterval(() => {
      i++;
      const partial = demoPhrase.split(" ").slice(0, i).join(" ");
      transcriptRef.current = partial;
      setTranscript(partial);
      if (i >= demoPhrase.split(" ").length) {
        clearInterval(timer);
        setTimeout(() => applyVoiceCommand(demoPhrase), 200);
      }
    }, 140);
  }

  /**
   * O fluxo completo pedido: reconhece -> interpreta -> previa real na
   * foto (via onChange, que ja redesenha o canvas) -> responde por voz
   * -> pede confirmacao. O usuario confirma (Concluir), ajusta a mao
   * nos sliders (o painel ja fica aberto com eles), ou cancela
   * (reverte so este comando, sem mexer no que ja estava antes).
   */
  function applyVoiceCommand(text: string) {
    const lower = text.toLowerCase();
    const before = adjustments;
    const next = { ...adjustments };
    let what: string | null = null;
    let spoken = "";

    if (lower.includes("ilumin") || lower.includes("clar") || lower.includes("expos")) {
      next.exposicao = Math.min(100, adjustments.exposicao + 25);
      what = "aumentar a exposição";
      spoken = "Aumentei a exposição. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("escur")) {
      next.exposicao = Math.max(-100, adjustments.exposicao - 25);
      what = "reduzir a exposição";
      spoken = "Reduzi a exposição. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("contraste")) {
      next.contraste = Math.min(100, adjustments.contraste + 20);
      what = "aumentar o contraste";
      spoken = "Aumentei o contraste. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("satura") || lower.includes("cor")) {
      next.saturacao = Math.min(100, adjustments.saturacao + 20);
      what = "aumentar a saturação";
      spoken = "Aumentei a saturação. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("quente")) {
      next.temperatura = Math.min(100, adjustments.temperatura + 25);
      what = "esquentar a temperatura";
      spoken = "Esquentei a temperatura da foto. Quer confirmar, ajustar ou cancelar?";
    } else if (lower.includes("fri")) {
      next.temperatura = Math.max(-100, adjustments.temperatura - 25);
      what = "esfriar a temperatura";
      spoken = "Esfriei a temperatura da foto. Quer confirmar, ajustar ou cancelar?";
    }

    if (!what) {
      // Nada reconhecido: nao mexe na foto, nao abre o painel, so avisa
      // e volta a ouvir — evita um painel confuso com "nada aplicado".
      setState("idle");
      speak("Desculpa, não entendi o pedido. Pode repetir?");
      return;
    }

    previousAdjustmentsRef.current = before;
    onChange(next);
    setSummary(`Entendi: ${what}. Veja o resultado e confirme abaixo.`);
    setState("panel");
    speak(spoken, voiceURI);
  }

  function handleCancel() {
    stopSpeaking();
    onChange(previousAdjustmentsRef.current);
    setSummary(null);
    setState("idle");
  }

  function handleConfirm() {
    stopSpeaking();
    onConfirm();
    setState("idle");
    setSummary(null);
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  const collapsed = state === "idle" || state === "listening";

  return (
    <div style={{ position: "fixed", right: 20, bottom: 28, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <AnimatePresence>
        {state === "panel" && (
          <motion.div
            key="kliko-panel"
            layoutId="kliko-shell"
            layout
            transition={springs.gentle}
            style={{
              width: "min(86vw, 340px)",
              marginBottom: 14,
              borderRadius: 26,
              background: kliko.surfaceStrong,
              backdropFilter: "blur(22px) saturate(1.4)",
              WebkitBackdropFilter: "blur(22px) saturate(1.4)",
              boxShadow: `0 18px 40px ${kliko.blueGlow}, 0 2px 8px rgba(0,0,0,0.08)`,
              border: "1px solid rgba(255,255,255,0.6)",
              padding: "20px 20px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: kliko.text }}>Mini Kliko</span>
              <button aria-label="Fechar" onClick={() => { stopSpeaking(); setState("idle"); }} style={closeBtnStyle}>×</button>
            </div>

            <VoicePicker selectedURI={voiceURI} onSelect={setVoiceURI} />

            {summary && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 13, color: kliko.textMuted, marginBottom: 14, lineHeight: 1.4 }}
              >
                {summary}
              </motion.p>
            )}

            <SmartSlider label="Exposição" value={adjustments.exposicao} onChange={(v) => onChange({ ...adjustments, exposicao: v })} />
            <SmartSlider label="Contraste" value={adjustments.contraste} onChange={(v) => onChange({ ...adjustments, contraste: v })} />
            <SmartSlider label="Saturação" value={adjustments.saturacao} onChange={(v) => onChange({ ...adjustments, saturacao: v })} />
            <SmartSlider label="Temperatura" value={adjustments.temperatura} onChange={(v) => onChange({ ...adjustments, temperatura: v })} />

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={handleCancel} style={secondaryBtnStyle}>
                Cancelar
              </button>
              <button onClick={handleConfirm} style={primaryBtnStyle}>
                Confirmar
              </button>
            </div>

            <button
              onClick={() => {
                onUndo();
                setSummary(null);
              }}
              style={resetLinkStyle}
            >
              Redefinir todos os ajustes
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {collapsed && (
        <motion.button
          key="kliko-orb"
          layoutId="kliko-shell"
          layout
          transition={springs.gentle}
          onClick={() => (hasPhoto ? startListening() : undefined)}
          drag
          dragMomentum={false}
          dragElastic={0.12}
          whileTap={{ scale: 0.92 }}
          aria-label="Falar com a Mini Kliko"
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            border: "none",
            cursor: hasPhoto ? "pointer" : "default",
            background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${kliko.blueSoft} 55%, ${kliko.blue} 130%)`,
            boxShadow: `0 10px 28px ${kliko.blueGlow}, inset 0 0 14px rgba(255,255,255,0.8)`,
            position: "relative",
          }}
        >
          <motion.span
            animate={
              state === "listening"
                ? { scale: [1, 1.18, 1], opacity: [0.9, 1, 0.9] }
                : { scale: [1, 1.05, 1] }
            }
            transition={{ duration: state === "listening" ? 0.9 : 2.6, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 6,
              borderRadius: 999,
              background: "rgba(255,255,255,0.35)",
            }}
          />
        </motion.button>
      )}

      <AnimatePresence>
        {state === "listening" && (
          <motion.div
            key="listening-label"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            style={{
              marginTop: 10,
              background: kliko.surfaceStrong,
              borderRadius: 14,
              padding: "8px 14px",
              fontSize: 13,
              color: kliko.text,
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              maxWidth: 240,
              textAlign: "right",
            }}
          >
            <div style={{ color: kliko.blue, fontWeight: 600, marginBottom: 2 }}>
              Kliko está ouvindo{isSimulated ? " · demonstração simulada" : ""}
            </div>
            <div style={{ color: kliko.textMuted, minHeight: 16 }}>{transcript || "…"}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const closeBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "rgba(0,0,0,0.06)",
  color: kliko.text,
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "none",
  background: kliko.blue,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "transparent",
  color: kliko.textMuted,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const resetLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "center",
  marginTop: 10,
  padding: "4px 0",
  border: "none",
  background: "none",
  color: kliko.textMuted,
  fontSize: 11.5,
  textDecoration: "underline",
  cursor: "pointer",
};

/** Tipos minimos para a Web Speech API (nao padronizada no TS DOM lib). */
interface SpeechRecognitionEventLike {
  results: { [i: number]: { [j: number]: { transcript: string } }; length: number };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop?: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
