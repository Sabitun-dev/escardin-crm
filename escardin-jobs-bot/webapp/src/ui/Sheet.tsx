// Bottom sheet: slides up, swipe down / tap outside / Back closes it.
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "./host";

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);
  useBack(close);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onStart = (e: React.TouchEvent) => {
    const el = ref.current;
    // Only start a swipe when the sheet is scrolled to the top
    start.current = el && el.scrollTop <= 0 ? e.touches[0]!.clientY : null;
  };
  const onMove = (e: React.TouchEvent) => {
    if (start.current === null) return;
    const d = e.touches[0]!.clientY - start.current;
    setDrag(d > 0 ? d : 0);
  };
  const onEnd = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > 90) close();
    setDrag(0);
  };

  return createPortal(
    <>
      <div className={`sheet-backdrop${closing ? " closing" : ""}`} onClick={close} />
      <div
        ref={ref}
        className={`sheet${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </>,
    document.body,
  );
}
