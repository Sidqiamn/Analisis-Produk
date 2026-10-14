/* ============================================================================
   Sisi kiri — daftar menu yang bisa disembunyikan
   ----------------------------------------------------------------------------
   Di layar lebar, menu MENDORONG isi halaman supaya tidak ada yang tertutup.
   Di layar sempit, menu MENIMPA isi halaman dengan latar gelap di belakangnya,
   karena mendorong di lebar segitu hanya menyisakan ruang baca yang mustahil.

   Daftar menunya ada di MENU di bawah. Menambah halaman baru cukup menambah
   satu entri di sini dan satu cabang di App.jsx.
   ========================================================================== */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FOCUS, Mark, cx } from "../lib/theme.jsx";

/* --------------------------------------------------------------- ikon      */
/* Semua ikon digambar di kisi 20×20 dengan ketebalan garis yang sama, supaya
   deretannya terbaca sebagai satu keluarga, bukan kumpulan ikon pungut. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconTree({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M4 10h2.4c1.8 0 1.8-4 3.6-4H13M6.4 10c1.8 0 1.8 4 3.6 4H13" {...stroke} />
      <circle cx="3" cy="10" r="1.6" fill="currentColor" />
      <rect x="13" y="4" width="4.4" height="4.4" rx="1.2" {...stroke} />
      <rect x="13" y="11.6" width="4.4" height="4.4" rx="1.2" {...stroke} />
    </svg>
  );
}

function IconBell({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M5.2 13.7V9.3a4.8 4.8 0 0 1 9.6 0v4.4l1.6 1.9H3.6l1.6-1.9Z" {...stroke} />
      <path d="M8.1 17.3a2 2 0 0 0 3.8 0" {...stroke} />
    </svg>
  );
}

function IconPortfolio({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M3 3v14h14" {...stroke} />
      <circle cx="7.5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="11.5" cy="7" r="2.3" {...stroke} />
      <circle cx="15" cy="11" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconDiagnose({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.2" {...stroke} />
      <path d="M12.3 12.3L17 17M5.6 9h1.3l1-2 1.6 4 1-2h1.2" {...stroke} />
    </svg>
  );
}

function IconBridge({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M3.5 17V9.5h3V17M8.5 9.5V5.5h3v4M13.5 5.5V17h3V5.5M2.5 17h15" {...stroke} />
    </svg>
  );
}

function IconTreemap({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="1.5" {...stroke} />
      <path d="M10.5 3v14M10.5 9.5H17M3 11h7.5" {...stroke} />
    </svg>
  );
}

function IconFlow({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path d="M4.5 5.5c5 0 6 9 11 9M4.5 14.5c5 0 6-9 11-9M3 4v3M3 13v3M17 4v3M17 13v3" {...stroke} />
    </svg>
  );
}

function IconGrid({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {[3.5, 8.5, 13.5].flatMap((y) =>
        [3.5, 8.5, 13.5].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3.4" height="3.4" rx=".6" {...stroke} fill={x === 8.5 && y === 13.5 ? "currentColor" : "none"} />
        ))
      )}
    </svg>
  );
}

function IconKey({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="6" cy="10" r="3.3" {...stroke} />
      <path d="M9.3 10H17.2M14.3 10v3M16.8 10v2.2" {...stroke} />
    </svg>
  );
}

/* --------------------------------------------------------------- menu      */

/* Setiap grup punya satu warna: anggur muda untuk Produk, biru untuk
   Penjualan, teal untuk Eksplorasi. Warnanya muncul di ubin ikon menu aktif
   dan di bilah judul, jadi pengguna selalu tahu sedang di bagian mana.
   "Peringatan" ada paling atas karena ia halaman pembuka: titik awal sebelum
   menelusuri portofolio. "Penjelasan perubahan" masuk grup Produk karena
   paling sering dibuka dari Diagnosis produk ("Buka di Penjelasan perubahan").
   Grup Penjualan berisi halaman yang memakai Periode P1/P2 di bilah atas. */
export const GROUP_TONE = {
  Produk: { solid: "#c0457f", soft: "#f2b6d1" },
  Penjualan: { solid: "#2a78d6", soft: "#9cc3f0" },
  Eksplorasi: { solid: "#12876a", soft: "#8fd8bf" },
};

/* Grup hanya untuk membantu memindai; urutan di sini = urutan di layar. */
export const MENU = [
  {
    key: "peringatan",
    group: "Produk",
    label: "Peringatan",
    hint: "Produk & cabang yang perlu dilihat sekarang",
    Icon: IconBell,
  },
  {
    key: "portofolio",
    group: "Produk",
    label: "Portofolio produk",
    hint: "Siklus hidup dan rekomendasi tiap produk",
    Icon: IconPortfolio,
  },
  {
    key: "diagnosis",
    group: "Produk",
    label: "Diagnosis produk",
    hint: "Kenapa naik atau turun, layak dicabut atau tidak",
    Icon: IconDiagnose,
  },
  {
    key: "perubahan",
    group: "Produk",
    label: "Penjelasan perubahan",
    hint: "Dari mana selisih P1 dan P2 berasal",
    Icon: IconBridge,
  },
  {
    key: "pohon",
    group: "Penjualan",
    label: "Pohon dekomposisi",
    hint: "Urai satu angka ke dimensi penyusunnya",
    Icon: IconTree,
  },
  {
    key: "hierarki",
    group: "Eksplorasi",
    label: "Peta hierarki",
    hint: "Icicle, treemap, sunburst yang bisa di-zoom",
    Icon: IconTreemap,
  },
  {
    key: "aliran",
    group: "Eksplorasi",
    label: "Aliran",
    hint: "Jalur pendapatan melewati beberapa dimensi",
    Icon: IconFlow,
  },
  {
    key: "matriks",
    group: "Eksplorasi",
    label: "Matriks silang",
    hint: "Dua dimensi sekaligus, temukan sel yang janggal",
    Icon: IconGrid,
  },
  {
    key: "pendorong",
    group: "Eksplorasi",
    label: "Pendorong",
    hint: "Faktor yang paling memengaruhi sebuah hasil",
    Icon: IconKey,
  },
];

/** Label dan keterangan menu (titik tunggal kalau suatu saat perlu disesuaikan dengan kolom data). */
export function menuText(m) {
  return { label: m.label, hint: m.hint };
}

/* ------------------------------------------------------------- Hamburger   */

/** Tiga garis yang berubah jadi silang saat menu terbuka. */
export function MenuButton({ open, onClick }) {
  return (
    <button
      className={cx(
        "grid h-8 w-8 flex-none place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/15 hover:text-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      )}
      type="button"
      onClick={onClick}
      aria-label={open ? "Sembunyikan menu" : "Tampilkan menu"}
      aria-expanded={open}
    >
      <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden="true">
        {/* Garis atas dan bawah berputar jadi silang; garis tengah memudar. */}
        <line
          x1="2"
          y1={open ? 9 : 4.5}
          x2="16"
          y2={open ? 9 : 4.5}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{
            transform: open ? "rotate(45deg)" : "none",
            transformOrigin: "center",
            transition: "transform .22s cubic-bezier(.22,1,.36,1), y1 .22s, y2 .22s",
          }}
        />
        <line
          x1="2"
          y1="9"
          x2="16"
          y2="9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{ opacity: open ? 0 : 1, transition: "opacity .14s" }}
        />
        <line
          x1="2"
          y1={open ? 9 : 13.5}
          x2="16"
          y2={open ? 9 : 13.5}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{
            transform: open ? "rotate(-45deg)" : "none",
            transformOrigin: "center",
            transition: "transform .22s cubic-bezier(.22,1,.36,1), y1 .22s, y2 .22s",
          }}
        />
      </svg>
    </button>
  );
}

/* --------------------------------------------------------------- Sidebar   */

/** Panah kecil untuk tombol gulir menu. */
function Chevron({ up, className }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
      <path d={up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar({ open, route, onGo, onClose, overlay, footer }) {
  // Esc menutup menu saat ia menimpa isi halaman.
  useEffect(() => {
    if (!overlay || !open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay, open, onClose]);

  /* Daftar menu bisa digulir. Kalau masih ada menu di bawah (mis. layar
     pendek atau zoom 100% di laptop), muncul tombol "Menu lainnya"; kalau
     sudah digulir, muncul tombol kembali ke atas. */
  const listRef = useRef(null);
  const [more, setMore] = useState({ up: false, down: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const up = el.scrollTop > 4;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);
  // Menu yang aktif selalu terlihat, walau letaknya di bagian bawah daftar.
  // Digulir di dalam daftar saja (bukan scrollIntoView, yang bisa ikut
  // menggeser wadah lain). 48px disisakan untuk tombol "Menu lainnya".
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector('[aria-current="page"]');
    if (list && el) {
      const lr = list.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > lr.bottom - 48) list.scrollTop += er.bottom - lr.bottom + 56;
      else if (er.top < lr.top) list.scrollTop -= lr.top - er.top + 8;
    }
    measure();
  }, [route, open, measure]);
  const scrollBy = (dir) => {
    const el = listRef.current;
    if (el) el.scrollBy({ top: dir * Math.max(120, el.clientHeight * 0.7), behavior: "smooth" });
  };

  return (
    <>
      {overlay && open && (
        <div className="dt-fade fixed inset-0 z-30 bg-[rgba(36,26,31,.45)]" onClick={onClose} aria-hidden="true" />
      )}

      <nav
        className={cx(
          "dt-rail dt-shadow-rail flex shrink-0 flex-col overflow-hidden text-white",
          overlay ? "fixed inset-y-0 left-0 z-40" : "relative",
          // Lebarnya yang dianimasikan, bukan transform, supaya isi halaman
          // ikut melebar mulus alih-alih tersentak saat menu selesai menutup.
          "transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)]"
        )}
        style={{ width: open ? 256 : 0 }}
        aria-label="Menu utama"
        aria-hidden={!open}
      >
        {/* min-h-0 di sini dan di daftar menu: tanpa itu kolom flex tidak mau
            menyusut, sehingga menu terpotong di bawah dan tidak bisa digulir. */}
        <div className="flex min-h-0 w-[256px] flex-1 flex-col">
          <div className="flex items-center gap-2.5 px-4 pb-4 pt-4">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-white/14 ring-1 ring-white/20">
              <Mark className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="dt-display truncate text-[16px] font-semibold leading-tight tracking-[.005em]">Analitik Penjualan</div>
              <div className="truncate text-[11px] text-white/55">Pelengkap Metabase</div>
            </div>
          </div>

          <div className="mx-4 h-px bg-white/12" />

          <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={listRef} onScroll={measure} className="dt-rail-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
            {MENU.map((m, i) => {
              const { key, Icon, group } = m;
              const { label, hint } = menuText(m);
              const on = route === key;
              const head = group && group !== MENU[i - 1]?.group;
              const tone = GROUP_TONE[group] || GROUP_TONE.Produk;
              return (
                <React.Fragment key={key}>
                  {head && (
                    <div className={cx("flex items-center gap-2 px-2.5 pb-1.5 text-[11px] font-medium text-white/60", i === 0 ? "pt-1" : "pt-3.5")}>
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: tone.soft }} aria-hidden="true" />
                      {group}
                    </div>
                  )}
                  <button
                    className={cx(
                      "group mb-0.5 flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                      FOCUS,
                      "focus-visible:ring-white/60 focus-visible:ring-offset-transparent",
                      on ? "bg-white/[.13]" : "hover:bg-white/[.07]"
                    )}
                    type="button"
                    onClick={() => {
                      onGo(key);
                      if (overlay) onClose();
                    }}
                    aria-current={on ? "page" : undefined}
                  >
                    <span
                      className={cx(
                        "mt-px grid h-7 w-7 flex-none place-items-center rounded-md transition-colors",
                        on ? "text-white" : "bg-white/[.07] text-white/70 group-hover:text-white"
                      )}
                      style={on ? { background: tone.solid, boxShadow: "0 1px 3px rgba(0,0,0,.25)" } : undefined}
                    >
                      <Icon className="h-[17px] w-[17px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate text-[12.5px] transition-colors", on ? "font-semibold text-white" : "text-white/85 group-hover:text-white")}>
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/50">{hint}</span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {more.up && (
            <div className="pointer-events-none absolute inset-x-0 top-0 flex h-9 justify-center" style={{ background: "linear-gradient(180deg, rgba(64,0,30,.95), rgba(64,0,30,0))" }}>
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className={cx("pointer-events-auto mt-1 grid h-6 w-10 place-items-center rounded-full bg-white/12 text-white/85 transition-colors hover:bg-white/22 hover:text-white", FOCUS, "focus-visible:ring-white/60")}
                aria-label="Gulir ke menu sebelumnya"
                title="Gulir ke atas"
              >
                <Chevron up className="h-3 w-3" />
              </button>
            </div>
          )}
          {more.down && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center pb-2" style={{ background: "linear-gradient(0deg, rgba(48,0,23,.98) 30%, rgba(48,0,23,0))" }}>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className={cx("pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white/14 px-3 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/15 transition-colors hover:bg-white/24 hover:text-white", FOCUS, "focus-visible:ring-white/60")}
                aria-label="Gulir ke menu berikutnya"
              >
                Menu lainnya
                <Chevron className="h-3 w-3" />
              </button>
            </div>
          )}
          </div>

          {footer && <div className="flex-none border-t border-white/12 px-3 py-3">{footer}</div>}
        </div>
      </nav>
    </>
  );
}
