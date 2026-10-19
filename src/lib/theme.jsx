/* ============================================================================
   Tema — palet, huruf, kelas berulang, dan pembungkus akar
   ----------------------------------------------------------------------------
   WARNA DASAR: #72003B  (--brand-700), anggur.

   Warna dipakai dengan satu aturan: setiap warna punya ARTI.
   · Anggur          → navigasi, tombol utama, pilihan aktif
   · Hijau-teal      → naik, tumbuh, kembangkan
   · Biru            → baru, pertahankan, informasi
   · Kuning tua      → perlu diperbaiki, peringatan
   · Merah           → turun, kandidat dicabut
   · Ungu            → perbandingan dan eksplorasi
   · Abu keunguan    → netral, pantau
   Halaman jadi berwarna karena isinya punya arti, bukan karena hiasan.
   Setiap warna selalu disertai teks, jadi tetap terbaca oleh pembaca yang
   sulit membedakan warna.

   Huruf: IBM Plex Sans untuk teks, IBM Plex Sans Condensed untuk judul dan
   angka besar — satu keluarga, tegas dan rapi seperti lembar spesifikasi.
   Keduanya dimuat otomatis dari Google Fonts oleh Frame.

   Palet disimpan sebagai custom property di kelas `.dt`, bukan di
   konfigurasi Tailwind, supaya berkas-berkas ini bisa dipindah ke proyek
   mana pun. Utility Tailwind memanggilnya lewat arbitrary value, mis.
   text-[var(--brand-700)].
   ========================================================================== */

import React, { useEffect } from "react";

export const STYLES = `
.dt{
  --brand-50:#fcf3f8;
  --brand-100:#f8e3ee;
  --brand-200:#eec9dc;
  --brand-300:#db9ebe;
  --brand-400:#c66c9b;
  --brand-500:#b23475;
  --brand-600:#931556;
  --brand-700:#72003b;
  --brand-800:#57002d;
  --brand-900:#3d0020;

  --ink-900:#241a1f;
  --ink-800:#3a2c33;
  --ink-700:#4a3b42;
  --ink-600:#6b5a62;
  --ink-500:#7f6a73;
  --ink-400:#a8949c;
  --ink-300:#cfc2c8;
  --ink-200:#e5dbe0;
  --ink-100:#f1eaee;
  --ink-50:#f9f6f8;

  --paper:#ffffff;
  --canvas:#f3eef1;
  --band:#faf7f9;

  /* keluarga warna bermakna: tinta muda (50), garis (100), isi (500), teks (700) */
  --teal-50:#e7f4ef;  --teal-100:#c6e6d9;  --teal-500:#12876a; --teal-700:#0b5e4a;
  --blue-50:#eaf2fc;  --blue-100:#cddff6;  --blue-500:#2a78d6; --blue-700:#1b4f91;
  --amber-50:#fdf5e2; --amber-100:#f6e2ae; --amber-500:#eda100; --amber-700:#7d5200;
  --red-50:#fcedeb;   --red-100:#f5cdc8;   --red-500:#d14134;  --red-700:#9b2a20;
  --violet-50:#f0edf9; --violet-100:#d9d3f0; --violet-500:#4a3aa7; --violet-700:#352a7d;
  --mauve-50:#f4eff2; --mauve-100:#e4d9df; --mauve-500:#a8949c; --mauve-700:#5f4f57;

  --pos:#0e6e52;
  --pos-soft:#12876a;
  --pos-bg:#e7f4ef;
  --neg:#b42318;
  --neg-soft:#d14134;
  --neg-bg:#fcedeb;

  --note:#7d5200;
  --note-bg:#fdf5e2;
  --note-line:#f0dba5;

  /* periode analisis — satu sumber untuk grafik, lencana, dan garis waktu.
     Sudah diuji validator palet (kecerahan, kroma, buta warna): lolos. */
  --p1:#a32a62;     /* P1, periode yang dinilai */
  --p2:#2f7bd4;     /* P2, pembanding */
  --hist:#d98cb3;   /* bulan di luar P1 dan P2 */

  --font-display:"IBM Plex Sans Condensed","IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;

  color-scheme:light;
}

.dt ::selection{background:var(--brand-100);color:var(--brand-900)}

/* judul dan angka besar */
.dt-display{font-family:var(--font-display);letter-spacing:-.005em;font-feature-settings:"tnum" 1}

/* satu-satunya blok berwarna penuh: bilah judul dan menu samping */
.dt-topbar{background-image:linear-gradient(100deg,var(--brand-900) 0%,var(--brand-700) 52%,#8d1150 100%)}
.dt-rail{background-image:linear-gradient(172deg,#46001f 0%,var(--brand-800) 58%,#2a0016 100%)}

/* kanvas pohon dekomposisi: bertitik halus, seperti kertas milimeter */
.dt-canvas{
  background-color:var(--canvas);
  background-image:radial-gradient(rgba(114,0,59,.08) 1px,transparent 1px);
  background-size:24px 24px;
  background-position:-1px -1px;
}

.dt-fill{background-image:linear-gradient(90deg,var(--brand-500),var(--brand-700))}
.dt-fill-mute{background-image:linear-gradient(90deg,var(--brand-200),var(--brand-300))}
.dt-fill-pos{background-image:linear-gradient(90deg,var(--pos-soft),var(--pos))}
.dt-fill-neg{background-image:linear-gradient(90deg,var(--neg-soft),var(--neg))}

.dt-shadow{box-shadow:0 1px 2px rgba(36,26,31,.06),0 2px 8px -4px rgba(36,26,31,.08)}
.dt-shadow-lift:hover{box-shadow:0 10px 24px -12px rgba(114,0,59,.30),0 2px 6px rgba(36,26,31,.06)}
.dt-shadow-pop{box-shadow:0 18px 40px -16px rgba(36,26,31,.42),0 2px 8px rgba(36,26,31,.08)}
.dt-shadow-rail{box-shadow:1px 0 0 rgba(36,26,31,.08),6px 0 24px -12px rgba(36,26,31,.35)}
.dt-glow{filter:drop-shadow(0 1px 3px rgba(114,0,59,.35))}

/* arsir untuk bagian yang tidak tertutup data */
.dt-hatch{background-image:repeating-linear-gradient(135deg,rgba(209,65,52,.55) 0 3px,transparent 3px 7px)}
.dt-hatch-soft{background-image:repeating-linear-gradient(135deg,var(--ink-300) 0 3px,transparent 3px 7px)}

@keyframes dtRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes dtPop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@keyframes dtDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes dtSweep{from{background-position:-160% 0}to{background-position:260% 0}}
@keyframes dtFade{from{opacity:0}to{opacity:1}}
@keyframes dtSlide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}

.dt-rise{animation:dtRise .36s cubic-bezier(.22,1,.36,1) both}
.dt-pop{animation:dtPop .14s cubic-bezier(.22,1,.36,1) both}
.dt-draw{stroke-dasharray:1;animation:dtDraw .62s cubic-bezier(.22,1,.36,1) both}
.dt-fade{animation:dtFade .2s ease both}
.dt-slide{animation:dtSlide .26s cubic-bezier(.22,1,.36,1) both}

.dt-skeleton{
  background-image:linear-gradient(90deg,var(--ink-100) 0%,var(--brand-50) 45%,var(--ink-100) 90%);
  background-size:220% 100%;
  animation:dtSweep 1.5s ease-in-out infinite;
}

/* penanda memuat: logo dengan cincin berputar. Hanya transform dan opacity
   yang dianimasikan, jadi tetap bergerak walau halaman sedang sibuk menghitung.
   Tirainya baru muncul sesudah 140 ms, supaya perubahan cepat tidak berkedip. */
@keyframes dtSpin{to{transform:rotate(360deg)}}
.dt-spin{animation:dtSpin .9s linear infinite;will-change:transform}
.dt-busy{animation:dtFade .18s ease .14s both}

/* bilah yang bisa dilipat (lihat Collapse di productui.jsx): tinggi beranimasi
   lewat grid 1fr ↔ 0fr; saat terlipat isinya disembunyikan dari Tab & pembaca layar */
.dt-collapse{display:grid;grid-template-rows:1fr;opacity:1;transition:grid-template-rows .32s cubic-bezier(.22,1,.36,1),opacity .24s ease,visibility 0s linear 0s}
.dt-collapse>*{min-height:0}
.dt-collapse[data-clip="true"]>*{overflow:hidden}
.dt-collapse[data-open="false"]{grid-template-rows:0fr;opacity:0;visibility:hidden;transition:grid-template-rows .32s cubic-bezier(.22,1,.36,1),opacity .2s ease,visibility 0s linear .32s}
/* tombol bilah: pita penanda buku yang ikut "membalik" saat bilah disembunyikan */
.dt-ribbon-chev{transition:transform .32s cubic-bezier(.22,1,.36,1);transform-box:fill-box;transform-origin:center}
[aria-expanded="false"] .dt-ribbon-chev{transform:rotate(180deg)}

/* ruang kosong di ujung bawah halaman, supaya tombol "kembali ke atas" di
   pojok kanan bawah tidak menutupi baris terakhir */
[data-dt-page]>.dt-scroll,[data-dt-scrollroot]{padding-bottom:64px}

.dt-scroll::-webkit-scrollbar{width:11px;height:11px}
.dt-scroll::-webkit-scrollbar-track{background:transparent}
.dt-scroll::-webkit-scrollbar-thumb{background:var(--ink-200);background-clip:content-box;border:3px solid transparent;border-radius:999px}
.dt-scroll::-webkit-scrollbar-thumb:hover{background:var(--brand-300);background-clip:content-box;border:3px solid transparent}

/* penggulir tipis di atas menu samping yang gelap */
.dt-rail-scroll{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.28) transparent}
.dt-rail-scroll::-webkit-scrollbar{width:8px}
.dt-rail-scroll::-webkit-scrollbar-track{background:transparent}
.dt-rail-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border-radius:999px;border:2px solid transparent;background-clip:content-box}
.dt-rail-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.4);background-clip:content-box}

.dt input[type="date"]::-webkit-calendar-picker-indicator{opacity:.45;cursor:pointer}
.dt input[type="date"]:hover::-webkit-calendar-picker-indicator{opacity:.9}

@media (prefers-reduced-motion:reduce){
  .dt-rise,.dt-pop,.dt-draw,.dt-skeleton,.dt-fade,.dt-slide{animation:none}
  .dt *{transition-duration:1ms !important}
  /* penanda memuat tetap ada (ia memberi tahu sesuatu sedang berjalan), tapi pelan dan tanpa memudar */
  .dt-spin{animation-duration:2.6s}
  .dt-busy{animation:dtFade 1ms linear .14s both}
  .dt-collapse,.dt-collapse[data-open="false"],.dt-ribbon-chev{transition:none}
}
`;

export const ROOT_FONT = {
  fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};

/* Keluarga warna bermakna, dipakai ikon bagian, kartu, dan lencana.
   tint = latar muda, head = latar judul kartu (sedikit lebih pekat dari tint),
   line = garis, solid = isi, ink = teks/ikon di atas tint. */
export const TONES = {
  brand: { tint: "var(--brand-50)", head: "#f7e4ee", line: "var(--brand-200)", solid: "var(--brand-700)", ink: "var(--brand-700)" },
  teal: { tint: "var(--teal-50)", head: "#dcf0e8", line: "var(--teal-100)", solid: "var(--teal-500)", ink: "var(--teal-700)" },
  blue: { tint: "var(--blue-50)", head: "#e0ebfa", line: "var(--blue-100)", solid: "var(--blue-500)", ink: "var(--blue-700)" },
  amber: { tint: "var(--amber-50)", head: "#fcefcf", line: "var(--amber-100)", solid: "var(--amber-500)", ink: "var(--amber-700)" },
  red: { tint: "var(--red-50)", head: "#fae2df", line: "var(--red-100)", solid: "var(--red-500)", ink: "var(--red-700)" },
  violet: { tint: "var(--violet-50)", head: "#e8e4f7", line: "var(--violet-100)", solid: "var(--violet-500)", ink: "var(--violet-700)" },
  mauve: { tint: "var(--mauve-50)", head: "#efe7ec", line: "var(--mauve-100)", solid: "var(--mauve-500)", ink: "var(--mauve-700)" },
};

/* kelas yang berulang, disimpan supaya tidak terserak di seluruh berkas */
export const LINE = "border-[var(--ink-200)]";
export const CARD = `rounded-xl border ${LINE} bg-[var(--paper)]`;
export const MUTED = "text-[var(--ink-500)]";
export const DISPLAY = "dt-display";
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--paper)]";

export const FIELD = `w-[122px] rounded-md border ${LINE} bg-[var(--paper)] px-2 py-1 text-[12px] text-[var(--ink-900)] transition-colors hover:border-[var(--brand-300)] focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]`;

export const BTN = `rounded-md border ${LINE} bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)] disabled:cursor-default disabled:opacity-45 disabled:hover:border-[var(--ink-200)] disabled:hover:bg-[var(--paper)] disabled:hover:text-[var(--ink-700)] ${FOCUS}`;

export const BTN_ON = `rounded-md border border-[var(--brand-700)] bg-[var(--brand-700)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--brand-600)] active:bg-[var(--brand-800)] disabled:cursor-default disabled:opacity-45 ${FOCUS}`;

export const BTN_QUIET = `rounded px-1.5 py-1 text-[11.5px] text-[var(--ink-600)] transition-colors hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-600)] ${FOCUS}`;

export const SELECT = `cursor-pointer rounded-md border ${LINE} bg-[var(--paper)] px-2 py-1.5 text-xs font-medium text-[var(--ink-900)] transition-colors hover:border-[var(--brand-300)] ${FOCUS}`;

export const MENU = `rounded-xl border ${LINE} bg-[var(--paper)] p-1 dt-shadow-pop`;

export const MENU_ITEM = `flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--ink-800)] transition-colors hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)] ${FOCUS}`;

export const NOTE_BAR = `flex flex-wrap items-center gap-2 border-b border-[var(--note-line)] bg-[var(--note-bg)] px-4 py-2 text-xs text-[var(--note)]`;

// Dipakai Frame dan juga pembungkus portal, supaya menu yang dirender di luar
// pohon komponen tetap mewarisi palet dan huruf yang sama.
export const ROOT_CLASS =
  "dt text-[13px] leading-[1.45] text-[var(--ink-900)] antialiased [font-variant-numeric:tabular-nums]";

/** Gabungkan className secara kondisional, mengabaikan nilai falsy. */
export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@500;600;700&display=swap";

/** Muat huruf sekali saja, apa pun isi index.html proyekmu. */
function useFonts() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("dt-fonts")) return;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    const link = document.createElement("link");
    link.id = "dt-fonts";
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.append(pre, link);
  }, []);
}

/**
 * Pembungkus akar: memasang palet, huruf, dan warna dasar halaman.
 *
 * Arahnya dipilih lewat prop `row`, bukan dengan menimpa kelas dari luar.
 * Menulis "flex-row" di className tidak akan menang melawan "flex-col" yang
 * ada di sini — kekhususan selektornya sama, jadi yang menentukan adalah
 * urutan kelas di dalam stylesheet Tailwind, bukan urutan kita menulisnya.
 */
export function Frame({ children, className, row = false }) {
  useFonts();
  return (
    <div
      className={cx(ROOT_CLASS, "flex h-full bg-[var(--canvas)]", row ? "flex-row" : "flex-col", className)}
      style={ROOT_FONT}
    >
      <style>{STYLES}</style>
      {children}
    </div>
  );
}

/** Potongan nama berkas atau konstanta di dalam kalimat. */
export function Code({ children }) {
  return (
    <code className="rounded border border-[var(--brand-100)] bg-[var(--brand-50)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--brand-700)]">
      {children}
    </code>
  );
}

/** Tanda merek: satu akar yang bercabang dua. */
export function Mark({ className }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.4 10h2.1c1.6 0 1.6-3.6 3.2-3.6h2.3M5.5 10c1.6 0 1.6 3.6 3.2 3.6h2.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="2.6" cy="10" r="1.7" fill="currentColor" />
      <circle cx="12.6" cy="6.4" r="1.7" fill="currentColor" />
      <circle cx="12.6" cy="13.6" r="1.7" fill="currentColor" />
      <circle cx="17.4" cy="6.4" r="1.1" fill="currentColor" opacity=".55" />
      <circle cx="17.4" cy="13.6" r="1.1" fill="currentColor" opacity=".55" />
    </svg>
  );
}
