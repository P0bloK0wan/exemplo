import { useEffect, useRef } from "react";
import { computeSculptureFrame, type SculptureState, type ReactiveInput, type Lobe } from "../../engine/sculptureEngine";
import { prefersReducedMotion } from "../../motion/tokens";

interface KlikoSculptureSVGProps {
  state: SculptureState;
  size?: number;
  reactive?: ReactiveInput;
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
 */
export function KlikoSculptureSVG({ state, size = 140, reactive }: KlikoSculptureSVGProps) {
  const siloCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const seamCircleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const rimRef = useRef<SVGCircleElement>(null);
  const reactiveRef = useRef<ReactiveInput>(reactive ?? {});
  const stateRef = useRef<SculptureState>(state);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    reactiveRef.current = reactive ?? {};
  }, [reactive]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
          seam.setAttribute("r", String(lobe.r * 0.9));
        }
      });
      if (rimRef.current) {
        rimRef.current.setAttribute("opacity", String(0.25 + glow * 0.4));
      }
    }

    if (prefersReducedMotion()) {
      // Movimento reduzido: um único quadro estático, nunca animação contínua.
      const frame = computeSculptureFrame(stateRef.current, 0, reactiveRef.current);
      applyFrame(frame.lobes, frame.glow);
      return;
    }

    function tick() {
      const t = (performance.now() - startRef.current) / 1000;
      const frame = computeSculptureFrame(stateRef.current, t, reactiveRef.current);
      applyFrame(frame.lobes, frame.glow);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indices = [0, 1, 2, 3];

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
        <filter id="kliko-goo-soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.09" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
            result="goo"
          />
        </filter>
        <radialGradient id="kliko-body-grad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#eaf1fc" />
          <stop offset="100%" stopColor="#bcd3f2" />
        </radialGradient>
        <radialGradient id="kliko-rim-grad" cx="30%" cy="26%" r="36%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <mask id="kliko-mask-soft" maskUnits="userSpaceOnUse" x="-1" y="-1" width="2" height="2">
          <g filter="url(#kliko-goo-soft)">
            {indices.map((i) => (
              <circle key={i} ref={(el) => { siloCircleRefs.current[i] = el; }} cx={0} cy={0} r={0.3} fill="#fff" />
            ))}
          </g>
        </mask>
      </defs>

      <rect x={-1} y={-1} width={2} height={2} fill="url(#kliko-body-grad)" mask="url(#kliko-mask-soft)" />

      <g mask="url(#kliko-mask-soft)">
        <g style={{ mixBlendMode: "multiply" }} opacity={0.3}>
          {indices.map((i) => (
            <circle key={i} ref={(el) => { seamCircleRefs.current[i] = el; }} cx={0} cy={0} r={0.27} fill="#4f6a93" />
          ))}
        </g>
        <circle ref={rimRef} cx={-0.25} cy={-0.28} r={0.5} fill="url(#kliko-rim-grad)" opacity={0.3} />
        {/* reflexo azul muito suave, fixo, discreto — identidade Kliko */}
        <circle cx={0.3} cy={0.4} r={0.55} fill="#4f8ef7" opacity={0.06} />
      </g>
    </svg>
  );
}
