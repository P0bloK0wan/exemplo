import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import kliLoProcessingData from "../assets/lottie/kliko-processing.json";
import { prefersReducedMotion } from "../motion/tokens";

interface ProcessingLottieProps {
  size?: number;
}

/**
 * Animação vetorial ORIGINAL (autoria própria, feita à mão em JSON
 * Bodymovin — `src/assets/lottie/kliko-processing.json`), não extraída
 * de nenhum aplicativo. Três pontos orbitam o centro enquanto o
 * núcleo pulsa — representa o estado "Kliko está analisando o
 * histograma" durante uma sugestão por regras.
 *
 * Usa `lottie-web` (MIT, open-source) só aqui, porque é exatamente o
 * tipo de animação (ilustração vetorial com várias formas e timing
 * complexo) que compensa um player dedicado — ver
 * docs/reavaliacao-tecnologias.md para o porquê de Motion continuar
 * sendo usado para tudo que é geometria/física de UI.
 *
 * Respeita `prefers-reduced-motion`: nesse caso não inicia o player
 * Lottie (que não para de girar) e mostra um ponto estático simples.
 */
export function ProcessingLottie({ size = 64 }: ProcessingLottieProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced || !containerRef.current) return;
    animRef.current = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: kliLoProcessingData,
    });
    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [reduced]);

  if (reduced) {
    return (
      <div
        aria-label="Kliko analisando"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: size * 0.3, height: size * 0.3, borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
      </div>
    );
  }

  return <div ref={containerRef} aria-label="Kliko analisando" style={{ width: size, height: size }} />;
}
