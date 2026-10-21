import { motion } from "motion/react";
import { springs } from "../../motion/tokens";
import type { SculptureState, ReactiveInput } from "../../engine/sculptureEngine";
import { KlikoSculptureSVG } from "./KlikoSculptureSVG";
import { KlikoSculptureGL } from "./KlikoSculptureGL";

interface KlikoSculptureHybridProps {
  state: SculptureState;
  reactive?: ReactiveInput;
  /** Compacta (SVG) quando false, expandida (WebGL) quando true. */
  expanded: boolean;
  compactSize?: number;
  expandedSize?: number;
}

/**
 * Variante C (Fase 4 experimental) — alternância híbrida: SVG quando
 * compacta, WebGL quando expandida, mas NUNCA um corte seco entre as
 * duas. É a prioridade nº 1 do pedido: "não quero que uma esfera
 * simplesmente desapareça e um painel apareça em seu lugar".
 *
 * Como isso é alcançado aqui, sem recursos de mais:
 * - As DUAS variantes ficam montadas o tempo todo, uma sobre a outra
 *   (absolutamente posicionadas, mesmo tamanho interno), e o que
 *   alterna é só a OPACIDADE de cada uma — nunca um swap condicional
 *   de componentes (`{expanded ? <A/> : <B/>}` desmontaria uma e
 *   montaria a outra no meio da transição, perdendo a continuidade).
 * - As duas consomem o MESMO `computeSculptureFrame`, então no meio
 *   do crossfade elas estão desenhando a mesma geometria de lóbulos
 *   no mesmo instante — o dissolve lê como uma única superfície
 *   mudando de material, não como duas criações diferentes se
 *   substituindo.
 * - O tamanho NÃO é re-renderizado em cada quadro — as duas variantes
 *   sempre recebem `expandedSize` como tamanho interno fixo (a
 *   resolução do canvas WebGL não é redimensionada a cada frame da
 *   transição, o que seria caro); o que anima é um `scale` de CSS no
 *   invólucro externo, com a MESMA mola (`springs.gentle`, já usada
 *   no App para a transição orb → painel) coordenando geometria e
 *   opacidade como um só gesto.
 */
export function KlikoSculptureHybrid({
  state,
  reactive,
  expanded,
  compactSize = 72,
  expandedSize = 220,
}: KlikoSculptureHybridProps) {
  const compactScale = compactSize / expandedSize;

  return (
    <motion.div
      layout
      animate={{ scale: expanded ? 1 : compactScale }}
      transition={springs.gentle}
      style={{
        width: expandedSize,
        height: expandedSize,
        position: "relative",
        transformOrigin: "center center",
      }}
    >
      <motion.div
        animate={{ opacity: expanded ? 0 : 1 }}
        transition={springs.gentle}
        style={{ position: "absolute", inset: 0 }}
      >
        <KlikoSculptureSVG state={state} size={expandedSize} reactive={reactive} />
      </motion.div>
      <motion.div
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={springs.gentle}
        style={{ position: "absolute", inset: 0 }}
      >
        <KlikoSculptureGL state={state} size={expandedSize} reactive={reactive} />
      </motion.div>
    </motion.div>
  );
}
