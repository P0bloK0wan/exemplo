import { useEffect, useId, useRef } from "react";
import { computeSculptureFrame, type SculptureState, type ReactiveInput, type Lobe } from "../../engine/sculptureEngine";
import { prefersReducedMotion } from "../../motion/tokens";

interface KlikoSculptureSVGProps {
  state: SculptureState;
  size?: number;
  reactive?: ReactiveInput;
  /** Instrumentação opcional para o Laboratório — tempo de CPU gasto aplicando um quadro (mutação de atributos), não é medida de GPU. */
  onFrameStats?: (stats: { renderMs: number }) => void;
}

/**
 * Variante A (Fase 4 experimental) — escultura em SVG puro + atributos
 * animados diretamente via ref (não via re-render do React a cada
 * quadro, para não sobrecarregar o reconciliador 60x/s).
 *
 * Técnica: os 4 lóbulos de `sculptureEngine.ts` são desenhados como
 * círculos dentro de um filtro "goo" (feGaussianBlur + feColorMatrix
 * com threshold) usado como MÁSCARA sobre um retângulo com gradiente
 * — é isso que funde as bordas numa silhueta orgânica contínua, igual
 * à referência, em vez de 4 círculos sobrepostos "crus". Uma segunda
 * camada, com os MESMOS lóbulos mas SEM desfoque e em modo de mesclagem
 * "multiply", cria o sombreamento escuro exatamente onde os lóbulos se
 * encontram (a sobreposição de alfa "crua" escurece só ali) — é a
 * "profundidade nas interseções" pedida, sem matemática extra.
 *
 * IDs de `<filter>`/`<mask>`/gradiente são sufixados com `useId()`:
 * sem isso, duas instâncias montadas ao mesmo tempo (Laboratório +
 * Híbrida, ou futuramente Galeria+Editor) compartilhariam o mesmo
 * `url(#id)` e uma roubaria a máscara/filtro da outra.
 */
export function KlikoSculptureSVG({ state, size = 140, reactive, onFrameStats }: KlikoSculptureSVGProps) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "-");
  const siloCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const seamCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const rimRef = useRef<SVGCircleElement>(null);
  const reactiveRef = useRef<ReactiveInput>(reactive ?? {});
  const stateRef = useRef<SculptureState>(state);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());
  const onFrameStatsRef = useRef(onFrameStats);

  useEffect(() => {
    reactiveRef.current = reactive ?? {};
  }, [reactive]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onFrameStatsRef.current = onFrameStats;
  }, [onFrameStats]);

  useEffect(() => {
    function applyFrame(lobes: Lobe[], glow: number) {
      lobes.forEach((lobe, i) => {
        const silo = siloCircleRefs.current[i];
        const seam = seamCircleRefs.current[i];
        if (silo) {
          silo.setAttribute("cx", String(lobe.cx));
          silo.setAttribute("cy", String(lobe.cy));
          silo.setAttribute("r", String(lobe.r));
        }
        if (seam) {
          seam.setAttribute("cx", String(lobe.cx));
          seam.setAttribute("cy", String(lobe.cy));
          // Quase do tamanho real do lóbulo — a sombra vem da
          // SOBREPOSIÇÃO geométrica real entre lóbulos vizinhos
          // (ver comentário no JSX sobre por que cada um tem sua
          // própria camada multiply), não de encolher o círculo.
          seam.setAttribute("r", String(lobe.r * 0.96));
        }
      });
      if (rimRef.current) {
        rimRef.current.setAttribute("opacity", String(0.3 + glow * 0.45));
      }
    }

    if (prefersReducedMotion()) {
      // Movimento reduzido: um único quadro estático, nunca animação contínua.
      const frame = computeSculptureFrame(stateRef.current, 0, reactiveRef.current);
      applyFrame(frame.lobes, frame.glow);
      return;
    }

    function tick() {
      const frameStart = performance.now();
      const t = (frameStart - startRef.current) / 1000;
      const frame = computeSculptureFrame(stateRef.current, t, reactiveRef.current);
      applyFrame(frame.lobes, frame.glow);
      onFrameStatsRef.current?.({ renderMs: performance.now() - frameStart });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indices = [0, 1, 2, 3];
  const gooId = `kliko-goo-soft-${uid}`;
  const bodyGradId = `kliko-body-grad-${uid}`;
  const rimGradId = `kliko-rim-grad-${uid}`;
  const maskId = `kliko-mask-soft-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 2 2"
      role="img"
      aria-label={`Mini Kliko — escultura, estado ${state}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <filter id={gooId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.085" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11"
            result="goo"
          />
        </filter>
        {/* leitosa: branco quase puro na maior parte do corpo, azul muito suave só bem na borda — nunca cinza neutro */}
        <radialGradient id={bodyGradId} cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#fbfdff" />
          <stop offset="85%" stopColor="#eef5fd" />
          <stop offset="100%" stopColor="#d6e6fa" />
        </radialGradient>
        <radialGradient id={rimGradId} cx="30%" cy="25%" r="34%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-1" y="-1" width="2" height="2">
          <g filter={`url(#${gooId})`}>
            {indices.map((i) => (
              <circle key={i} ref={(el) => { siloCircleRefs.current[i] = el; }} cx={0} cy={0} r={0.3} fill="#fff" />
            ))}
          </g>
        </mask>
      </defs>

      <rect x={-1} y={-1} width={2} height={2} fill={`url(#${bodyGradId})`} mask={`url(#${maskId})`} />

      <g mask={`url(#${maskId})`}>
        {/*
          Sombra de interseção: cada lóbulo tem SUA PRÓPRIA camada
          multiply independente (não uma só camada com a união de
          todos) — é isso que faz a escurecida se acumular (composição
          sequencial do `mix-blend-mode`) só onde DOIS OU MAIS lóbulos
          realmente se sobrepõem, e ficar quase imperceptível na área
          de um lóbulo sozinho. Uma única camada com a união de todos
          os círculos escurecia o corpo inteiro por igual, perdendo a
          leitura de "sombra só na junção" da referência.
        */}
        {indices.map((i) => (
          <circle
            key={i}
            ref={(el) => { seamCircleRefs.current[i] = el; }}
            cx={0}
            cy={0}
            r={0.3}
            fill="#141b2b"
            opacity={0.32}
            style={{ mixBlendMode: "multiply" }}
          />
        ))}
        <circle ref={rimRef} cx={-0.26} cy={-0.3} r={0.52} fill={`url(#${rimGradId})`} opacity={0.42} />
        {/* ponto de brilho estreito e intenso (vidro/porcelana) — sem isso a superfície fica só "clara", nunca com o brilho quase estourado da referência */}
        <circle cx={-0.22} cy={-0.26} r={0.16} fill="#ffffff" opacity={0.55} />
        {/* reflexo azul muito suave, fixo, discreto — identidade Kliko */}
        <circle cx={0.32} cy={0.4} r={0.55} fill="#4f8ef7" opacity={0.08} />
      </g>
    </svg>
  );
}
