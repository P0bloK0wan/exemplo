import { useEffect, useRef, useState } from "react";
import { computeSculptureFrame, type SculptureState, type ReactiveInput } from "../../engine/sculptureEngine";
import { createSculptureGLRenderer, type SculptureGLRenderer } from "../../engine/sculptureGL";
import { prefersReducedMotion } from "../../motion/tokens";
import { KlikoSculptureSVG } from "./KlikoSculptureSVG";

interface KlikoSculptureGLProps {
  state: SculptureState;
  size?: number;
  reactive?: ReactiveInput;
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
 *   Variante A (SVG) — nunca uma tela em branco.
 * - `webglcontextlost`/`webglcontextrestored`: ao perder o contexto,
 *   para o laço e cai para o fallback SVG; se o navegador restaurar,
 *   tenta recriar o renderer sozinho.
 * - Resolução adaptativa: mede a duração real dos últimos quadros e
 *   reduz o `pixelRatio` interno em degraus se o orçamento de tempo
 *   for excedido de forma sustentada (nunca presume que WebGL já vem
 *   "rápido" — mede).
 * - Pausa fora de tela via IntersectionObserver.
 * - `prefers-reduced-motion`: um único quadro estático, sem laço.
 * - Limpeza completa de GL/listeners/observer ao desmontar.
 */
export function KlikoSculptureGL({ state, size = 140, reactive }: KlikoSculptureGLProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SculptureGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());
  const stateRef = useRef<SculptureState>(state);
  const reactiveRef = useRef<ReactiveInput>(reactive ?? {});
  const visibleRef = useRef<boolean>(true);
  const pixelRatioRef = useRef<number>(Math.min(MAX_PIXEL_RATIO, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
  const frameTimesRef = useRef<number[]>([]);
  const [glUnavailable, setGlUnavailable] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    reactiveRef.current = reactive ?? {};
  }, [reactive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createSculptureGLRenderer(canvas);
    if (!renderer) {
      setGlUnavailable(true);
      return;
    }
    rendererRef.current = renderer;
    renderer.resize(size, size, pixelRatioRef.current);

    function handleContextLost(e: Event): void {
      e.preventDefault();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setGlUnavailable(true);
    }

    function handleContextRestored(): void {
      // Safari raramente dispara este evento sozinho — quando dispara,
      // tentamos recriar o renderer do zero em vez de reusar o antigo.
      if (!canvas) return;
      const fresh = createSculptureGLRenderer(canvas);
      if (fresh) {
        rendererRef.current = fresh;
        fresh.resize(size, size, pixelRatioRef.current);
        setGlUnavailable(false);
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
      const frame = computeSculptureFrame(stateRef.current, t, reactiveRef.current);
      rendererRef.current?.render(frame.lobes, frame.glow);
    }

    if (prefersReducedMotion()) {
      renderOnce(0);
      return () => {
        canvas.removeEventListener("webglcontextlost", handleContextLost, false);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
        observer.disconnect();
        rendererRef.current?.dispose();
        rendererRef.current = null;
      };
    }

    function tick(): void {
      const frameStart = performance.now();
      if (visibleRef.current) {
        const t = (frameStart - startRef.current) / 1000;
        renderOnce(t);
      }
      const frameMs = performance.now() - frameStart;
      adaptResolution(frameMs);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
      observer.disconnect();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  if (glUnavailable) {
    return <KlikoSculptureSVG state={state} size={size} reactive={reactive} />;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
      role="img"
      aria-label={`Mini Kliko — escultura (WebGL), estado ${state}`}
    />
  );
}
