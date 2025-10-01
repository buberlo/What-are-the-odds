import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Mask = { x: number; y: number; w: number; h: number };

type ProofBlurEditorProps = {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onApply: (masks: Mask[]) => void;
  saving: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ProofBlurEditor = ({ open, imageUrl, onClose, onApply, saving }: ProofBlurEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [drawing, setDrawing] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const loadImage = useCallback(() => {
    if (!open) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      draw();
    };
  }, [imageUrl, open]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(15,23,42,0.45)";
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = Math.max(2, canvas.width / 320);
    for (const mask of masks) {
      ctx.fillRect(mask.x, mask.y, mask.w, mask.h);
      ctx.strokeRect(mask.x, mask.y, mask.w, mask.h);
    }
    if (drawing) {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const w = Math.abs(drawing.currentX - drawing.startX);
      const h = Math.abs(drawing.currentY - drawing.startY);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }, [drawing, masks]);

  useEffect(() => {
    if (open) loadImage();
    else setMasks([]);
  }, [open, loadImage]);

  useEffect(() => {
    draw();
  }, [draw]);

  const translatePoint = useCallback((event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    return { x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height) };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    const point = translatePoint(event.nativeEvent);
    setDrawing({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const point = translatePoint(event.nativeEvent);
    setDrawing((prev) => (prev ? { ...prev, currentX: point.x, currentY: point.y } : prev));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const { startX, startY, currentX, currentY } = drawing;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);
    setDrawing(null);
    if (w < 8 || h < 8) return;
    setMasks((prev) => [...prev, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }]);
  };

  const undo = () => {
    setMasks((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    setMasks([]);
  };

  const apply = () => {
    if (!masks.length) {
      onClose();
      return;
    }
    onApply(masks);
  };

  if (!open) return null;

  return (
    <div className="blur-modal" role="dialog" aria-modal="true">
      <div className="blur-modal__backdrop" />
      <div className="blur-modal__panel">
        <header className="blur-modal__header">
          <h2>Redact poster</h2>
          <button type="button" onClick={onClose} disabled={saving}>
            Close
          </button>
        </header>
        <div className="blur-modal__body">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div className="blur-modal__controls">
            <p>Draw rectangles over areas to blur before sharing.</p>
            <div className="blur-modal__buttons">
              <button type="button" onClick={undo} disabled={saving || !masks.length}>
                Undo
              </button>
              <button type="button" onClick={clearAll} disabled={saving || !masks.length}>
                Clear
              </button>
            </div>
          </div>
        </div>
        <footer className="blur-modal__footer">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={saving} className="blur-modal__primary">
            {saving ? "Saving…" : "Apply"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export type { Mask };
export default ProofBlurEditor;
