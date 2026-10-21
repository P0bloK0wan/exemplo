import { useEffect, useRef } from "react";
import { renderAdjustments, type AdjustmentValues } from "../engine/photoEngine";

interface PhotoCanvasProps {
  image: ImageBitmap | null;
  adjustments: AdjustmentValues;
}

/**
 * Catalogo #44 "Ajuste aplicado em tempo real": o canvas eh
 * redesenhado a partir do bitmap ORIGINAL a cada mudanca de slider.
 * Nao ha acumulo de filtro sobre filtro — por isso a foto original
 * fica sempre preservada e o resultado eh sempre reproduzivel.
 */
export function PhotoCanvas({ image, adjustments }: PhotoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    renderAdjustments(canvasRef.current, image, adjustments);
  }, [image, adjustments]);

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
