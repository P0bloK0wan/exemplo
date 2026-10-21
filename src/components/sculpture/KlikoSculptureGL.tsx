import { useEffect, useRef, useState } from "react";
import { computeSculptureFrame, type SculptureState, type ReactiveInput } from "../../engine/sculptureEngine";
import { createSculptureGLRenderer, type SculptureGLRenderer } from "../../engine/sculptureGL";
import { prefersReducedMotion } from "../../motion/tokens";
import { KlikoSculptureSVG } from "./KlikoSculptureSVG";

interface KlikoSculptureGLProps {
  state: SculptureState;
  size?: number;
  reactive?: ReactiveInput;
  /**
   * Quando `false`, o laço de renderização é PARADO de verdade (o
   * `requestAnimationFrame` deixa de ser reagendado) em vez de só ficar
   * invisível — usado pela Variante híbrida para não gastar GPU com a
   * camada WebGL enquanto ela está escondida atrás da SVG, fora de uma
   * transição. Default `true` para uso isolado (ex.: Laboratório).
   */
  active?: boolean;
  /** Instrumentação opcional para o Laboratório — tempo de CPU gasto emitindo os comandos de desenho, NÃO é medida de desempenho real da GPU (a GPU executa de forma assíncrona). */
  onFrameStats?: (stats: { renderMs: number }) => void;
}

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 0.6;
// Orçamento de quadro — acima disso por tempo sustentado, a resolução interna cai um degrau.
const FRAME_BUDGET_MS = 24;
const ADAPT_WINDOW = 40;

/**
 * Variante B (Fase 4 experimental) — mesma escultura, renderizada em
 * WebGL via um campo implícito de metaballs (ver `sculptureGL.ts`).
 * Consome o MESMO `computeSculptureFrame` que a Variante A (SVG), para
 * que ambas sejam duas representações do mesmo objeto, nunca duas
 * criações visuais independentes.
 *
 * Robustez exigida para esta variante:
 * - Contexto único por instância; se o navegador não suportar WebGL
 *   ou os shaders não compilarem, cai automaticamente para a
 *   Variante A (SVG) — nunca uma tela em branco. O `<canvas>` em si
 *   fica SEMPRE montado (só escondido via CSS), para que o fallback
 *   nunca force a recriação do elemento — um `webglcontextrestored`
 *   posterior precisa encontrar o MESMO canvas que perdeu o contexto.
 * - `webglcontextlost`/`webglcontextrestored`: ao perder o contexto,
 *   para o laço e cai para o fallback SVG; se o navegador restaurar,
 *   recria o renderer no mesmo canvas E REINICIA o laço de
 *   `requestAnimationFrame` — perder o contexto não deixa a escultura
 *   congelada para sempre.
 * - Resolução adaptativa: mede a duração real dos últimos quadros e
 *   reduz o `pixelRatio` interno em degraus se o orçamento de tempo
 *   for excedido de forma sustentada (nunca presume que WebGL já vem
 *   "rápido" — mede).
 * - Pausa fora de tela via IntersectionObserver, e pausa sob demanda
 *   via a prop `active` (nunca deixa de RENDERIZAR mas continua
 *   AGENDANDO quadros à toa — o laço para de se reagendar de verdade).
 * - `prefers-reduced-motion`: um único quadro estático, sem laço.
 * - Limpeza completa de GL/listeners/observer ao desmontar.
 */
export function KlikoSculptureGL({ state, size = 140, reactive, active = true, onFrameStats }: KlikoSculptureGLProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SculptureGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());
  const stateRef = useRef<SculptureState>(state);
  const reactiveRef = useRef<ReactiveInput>(reactive ?? {});
  const onFrameStatsRef = useRef(onFrameStats);
  const visibleRef = useRef<boolean>(true);
  const activeRef = useRef<boolean>(active);
  const pixelRatioRef = useRef<number>(Math.min(MAX_PIXEL_RATIO, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  const frameTimesRef = useRef<number[]>([]);
  const startLoopRef = useRef<(() => void) | null>(null);
  const [glUnavailable, setGlUnavailable] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    reactiveRef.current = reactive ?? {};
  }, [reactive]);

  useEffect(() => {
    onFrameStatsRef.current = onFrameStats;
  }, [onFrameStats]);

  // Liga/desliga o laço quando `active` muda, sem recriar o contexto WebGL.
  useEffect(() => {
    activeRef.current = active;
    if (active) startLoopRef.current?.();
  }, [active]);

  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (!maybeCanvas) return;
    // Binding não-nulo: closures definidas abaixo (handleContextRestored
    // etc.) não herdam o estreitamento de tipo do `if` acima.
    const canvas: HTMLCanvasElement = maybeCanvas;

    const renderer = createSculptureGLRenderer(canvas);
    if (!renderer) {
      setGlUnavailable(true);
      return;
    }
    rendererRef.current = renderer;
    renderer.resize(size, size, pixelRatioRef.current);

    function adaptResolution(frameMs: number): void {
      const samples = frameTimesRef.current;
      samples.push(frameMs);
      if (samples.length > ADAPT_WINDOW) samples.shift();
      if (samples.length < ADAPT_WINDOW) return;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      if (avg > FRAME_BUDGET_MS && pixelRatioRef.current > MIN_PIXEL_RATIO) {
        pixelRatioRef.current = Math.max(MIN_PIXEL_RATIO, pixelRatioRef.current - 0.2);
        rendererRef.current?.resize(size, size, pixelRatioRef.current);
        samples.length = 0;
      }
    }

    function renderOnce(t: number): void {
      const renderStart = performance.now();
      const frame = computeSculptureFrame(stateRef.current, t, reactiveRef.current);
      rendererRef.current?.render(frame.lobes, frame.glow);
      onFrameStatsRef.current?.({ renderMs: performance.now() - renderStart });
    }

    function tick(): void {
      if (!activeRef.current) {
        // Pausa de verdade: não reagenda o próximo quadro. `startLoop()`
        // é quem volta a chamar `requestAnimationFrame` quando precisar.
        rafRef.current = null;
        return;
      }
      const frameStart = performance.now();
      if (visibleRef.current) {
        const t = (frameStart - startRef.current) / 1000;
        renderOnce(t);
      }
      const frameMs = performance.now() - frameStart;
      adaptResolution(frameMs);
      rafRef.current = requestAnimationFrame(tick);
    }

    function startLoop(): void {
      if (rafRef.current !== null) return; // já rodando
      if (prefersReducedMotion()) {
        renderOnce(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function stopLoop(): void {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    startLoopRef.current = startLoop;

    function handleContextLost(e: Event): void {
      e.preventDefault();
      stopLoop();
      setGlUnavailable(true);
    }

    function handleContextRestored(): void {
      // Safari raramente dispara este evento sozinho — quando dispara,
      // recriamos o renderer no MESMO <canvas> (ele nunca foi
      // desmontado — ver o JSX abaixo) e REINICIAMOS o laço, senão a
      // escultura fica congelada mesmo com o contexto de volta.
      const fresh = createSculptureGLRenderer(canvas);
      if (fresh) {
        rendererRef.current = fresh;
        fresh.resize(size, size, pixelRatioRef.current);
        setGlUnavailable(false);
        if (activeRef.current) startLoop();
      }
    }

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    const observer = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.01 },
    );
    observer.observe(canvas);

    if (activeRef.current) startLoop();

    return () => {
      stopLoop();
      startLoopRef.current = null;
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
      observer.disconnect();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // O <canvas> fica SEMPRE montado — o fallback SVG é desenhado por
  // cima/ao lado via CSS, nunca substitui o elemento no DOM. Isso é o
  // que garante que `webglcontextrestored` encontre o mesmo canvas.
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: glUnavailable ? "none" : "block" }}
        role="img"
        aria-label={`Mini Kliko — escultura (WebGL), estado ${state}`}
      />
      {glUnavailable && (
        <div style={{ position: "absolute", inset: 0 }}>
          <KlikoSculptureSVG state={state} size={size} reactive={reactive} />
        </div>
      )}
    </div>
  );
}
