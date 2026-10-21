import { useEffect, useRef } from "react";
import { renderEditState, type EditState } from "../engine/photoEngine";

interface PhotoCanvasProps {
  image: ImageBitmap | null;
  state: EditState;
  /** máscara de céu já no tamanho da foto (ver buildSkyMaskForCanvas) — recalculada só quando a foto muda, não a cada slider */
  skyMask?: Float32Array | null;
}

/**
 * Catálogo #44 "Ajuste aplicado em tempo real": o canvas é
 * redesenhado a partir do bitmap ORIGINAL a cada mudança de estado.
 * Não há acúmulo de filtro sobre filtro — por isso a foto original
 * fica sempre preservada e o resultado é sempre reproduzível.
 */
export function PhotoCanvas({ image, state, skyMask }: PhotoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    renderEditState(canvasRef.current, image, state, skyMask);
  }, [image, state, skyMask]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        borderRadius: 18,
      }}
    />
  );
}
