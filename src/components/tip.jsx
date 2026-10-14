/* ============================================================================
   Keterangan melayang (tooltip) untuk angka dan istilah
   ----------------------------------------------------------------------------
   Muncul saat kursor berhenti di atas pemicunya, atau saat pemicunya mendapat
   fokus papan ketik. Hilang saat kursor pergi, fokus pindah, atau Esc. Saat
   halaman digulir ia ikut bergeser bersama pemicunya (fokus lewat Tab sering
   menggulir halaman), dan hilang kalau pemicunya keluar layar. Dirender ke
   <body> lewat portal supaya tidak terpotong wadah yang bisa digulir, dan
   dibalik ke bawah kalau mepet tepi atas.

   Pemicu yang berada DI DALAM tombol (mis. baris daftar yang bisa diklik)
   dipasang dengan focusable={false}: tombol di dalam tombol tidak sah, jadi
   penjelasan untuk pembaca layar dipasang di tombolnya sendiri.
   ========================================================================== */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROOT_CLASS, ROOT_FONT, cx } from "../lib/theme.jsx";

/** Garis titik-titik di bawah pemicu: tanda "arahkan kursor ke sini untuk artinya". */
export const TIP_CUE = "cursor-help underline decoration-dotted decoration-[var(--ink-400)] decoration-1 underline-offset-[3px]";
/** Versi samar untuk angka kecil yang berderet (mis. di baris daftar), supaya tidak ramai. */
export const TIP_CUE_FAINT = "cursor-help underline decoration-dotted decoration-[var(--ink-300)] decoration-1 underline-offset-[3px]";

export function Tip({ tip, children, focusable = true, cue = true, className, delay = 140, width = 300 }) {
  // cue: true = garis titik-titik biasa, "faint" = samar, false = tanpa garis (pemicunya sudah jelas).
  const id = useId();
  const ref = useRef(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);

  const show = useCallback(
    (now) => {
      clearTimeout(timer.current);
      if (now) setOpen(true);
      else timer.current = setTimeout(() => setOpen(true), delay);
    },
    [delay]
  );
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && hide();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hide]);

  if (!tip) return children;
  return (
    <span
      ref={ref}
      className={cx(cue === "faint" ? TIP_CUE_FAINT : cue && TIP_CUE, focusable && "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)]", className)}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={focusable ? () => show(true) : undefined}
      onBlur={focusable ? hide : undefined}
    >
      {children}
      {focusable && (
        <span id={id} hidden>
          {tip}
        </span>
      )}
      {open && (
        <TipBox anchor={ref.current} width={width}>
          {tip}
        </TipBox>
      )}
    </span>
  );
}

/** Kotak keterangannya. Diukur dulu (tak terlihat), lalu ditempatkan. */
function TipBox({ anchor, width, children }) {
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!anchor) return undefined;
    const place = () => {
      if (!box.current) return;
      const a = anchor.getBoundingClientRect();
      const b = box.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Pemicunya sudah keluar layar: sembunyikan sampai kembali terlihat.
      if (a.bottom < 0 || a.top > vh || (!a.width && !a.height)) {
        setPos(null);
        return;
      }
      let top = a.top - b.height - 8;
      let below = false;
      if (top < 8) {
        top = Math.min(a.bottom + 8, vh - b.height - 8);
        below = true;
      }
      const mid = a.left + a.width / 2;
      const left = Math.min(Math.max(8, mid - b.width / 2), Math.max(8, vw - b.width - 8));
      setPos({ top, left, arrow: Math.min(Math.max(12, mid - left), b.width - 12), below });
    };
    place();
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", later, true);
      window.removeEventListener("resize", later);
    };
  }, [anchor]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div
        ref={box}
        role="tooltip"
        className="dt-shadow-pop pointer-events-none fixed z-[90] rounded-lg border border-[var(--ink-200)] bg-[var(--paper)] px-3 py-2 text-left text-[12px] font-normal leading-snug text-[var(--ink-800)] no-underline"
        style={{
          top: pos ? pos.top : -9999,
          left: pos ? pos.left : -9999,
          width: "max-content",
          maxWidth: `min(${width}px, calc(100vw - 16px))`,
          opacity: pos ? 1 : 0,
          transition: "opacity .12s ease",
        }}
      >
        {children}
        {pos && (
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 rotate-45 border-[var(--ink-200)] bg-[var(--paper)]"
            style={{
              left: pos.arrow - 4,
              ...(pos.below ? { top: -5, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -5, borderRightWidth: 1, borderBottomWidth: 1 }),
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
