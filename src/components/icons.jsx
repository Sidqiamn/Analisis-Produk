/* ============================================================================
   Ikon antarmuka
   ----------------------------------------------------------------------------
   Kisi 20×20, garis 1,5, ujung membulat — satu keluarga dengan ikon menu di
   Sidebar. Warna mengikuti currentColor, jadi ikon selalu mengikuti teks
   atau tinta bagian tempatnya berada.
   ========================================================================== */

import React from "react";

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Svg({ className = "h-4 w-4", children }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Siklus hidup: kurva naik-puncak-turun. */
export const IconCycle = (p) => (
  <Svg {...p}>
    <path d="M2.5 16.5h15" {...S} />
    <path d="M3.5 15c2.2-.3 3.2-8.8 6.5-8.8s4.3 8.5 6.5 8.8" {...S} />
    <circle cx="10" cy="6.2" r="1.3" fill="currentColor" />
  </Svg>
);

/** Rekomendasi: bendera. */
export const IconFlag = (p) => (
  <Svg {...p}>
    <path d="M5 17.5V3M5 3.8h9.2l-1.8 3.4 1.8 3.4H5" {...S} />
  </Svg>
);

/** Peta produk: titik-titik di sumbu. */
export const IconScatter = (p) => (
  <Svg {...p}>
    <path d="M3 3v14h14" {...S} />
    <circle cx="7.5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="11.5" cy="7.5" r="2" {...S} />
    <circle cx="15" cy="11" r="1.2" fill="currentColor" />
  </Svg>
);

/** Daftar periksa. */
export const IconChecklist = (p) => (
  <Svg {...p}>
    <path d="M3 5.5l1.4 1.4L7 4.3M3 11.5l1.4 1.4L7 10.3M9.5 5.7H17M9.5 11.7H17M9.5 16.2H17M3.6 16.2h2.6" {...S} />
  </Svg>
);

/** Tabel. */
export const IconTable = (p) => (
  <Svg {...p}>
    <rect x="2.8" y="3.5" width="14.4" height="13" rx="1.6" {...S} />
    <path d="M2.8 7.8h14.4M2.8 12.1h14.4M8 7.8v8.7" {...S} />
  </Svg>
);

/** Info / keterangan. */
export const IconInfo = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.2" {...S} />
    <path d="M10 9v4.6" {...S} />
    <circle cx="10" cy="6.3" r="1" fill="currentColor" />
  </Svg>
);

/** Kriteria / pengaturan. */
export const IconSliders = (p) => (
  <Svg {...p}>
    <path d="M3 5.5h8M15 5.5h2M3 14.5h2M9 14.5h8M13 3.5v4M7 12.5v4" {...S} />
  </Svg>
);

/** Sumber data. */
export const IconDatabase = (p) => (
  <Svg {...p}>
    <ellipse cx="10" cy="4.8" rx="6" ry="2.3" {...S} />
    <path d="M4 4.8v10.4c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V4.8M4 10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3" {...S} />
  </Svg>
);

/** Muat ulang. */
export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M16 9.2A6 6 0 0 0 5.2 6.1M4 10.8a6 6 0 0 0 10.8 3.1" {...S} />
    <path d="M5 2.8v3.6h3.6M15 17.2v-3.6h-3.6" {...S} />
  </Svg>
);

/** Kembalikan / reset: panah melingkar berlawanan arah jarum jam. */
export const IconReset = (p) => (
  <Svg {...p}>
    <path d="M4.6 7.4A6 6 0 1 1 4 10" {...S} />
    <path d="M4.2 3.6v3.9h3.9" {...S} />
  </Svg>
);

/** Unggah. */
export const IconUpload = (p) => (
  <Svg {...p}>
    <path d="M10 13V3.5M6.3 7.2 10 3.5l3.7 3.7M3.5 13.5v1.6c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6v-1.6" {...S} />
  </Svg>
);

/** Unduh. */
export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M10 3.5V13M6.3 9.3 10 13l3.7-3.7M3.5 13.5v1.6c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6v-1.6" {...S} />
  </Svg>
);

/** Tutup. */
export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5L5 15" {...S} />
  </Svg>
);

/** Perbandingan: dua garis. */
export const IconCompare = (p) => (
  <Svg {...p}>
    <path d="M3 15.5l4.5-5 3 2.5L17 5" {...S} />
    <path d="M3 11.5l4.5-1.8 3 .8L17 9" {...S} strokeDasharray="1.6 2" />
  </Svg>
);

/** Lokasi / di mana. */
export const IconPin = (p) => (
  <Svg {...p}>
    <path d="M10 17.5s5.2-4.8 5.2-9A5.2 5.2 0 0 0 4.8 8.5c0 4.2 5.2 9 5.2 9Z" {...S} />
    <circle cx="10" cy="8.4" r="1.8" {...S} />
  </Svg>
);

/** Kenapa: jembatan / air terjun. */
export const IconWaterfall = (p) => (
  <Svg {...p}>
    <path d="M3 16.5h14" {...S} />
    <rect x="3.5" y="5" width="2.6" height="11.5" rx=".6" {...S} />
    <rect x="8.7" y="5" width="2.6" height="4.5" rx=".6" {...S} />
    <rect x="13.9" y="9.5" width="2.6" height="7" rx=".6" {...S} />
  </Svg>
);

/** Pelanggan. */
export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="7.5" cy="7" r="2.6" {...S} />
    <path d="M2.8 16.5c.4-2.7 2.3-4.3 4.7-4.3s4.3 1.6 4.7 4.3" {...S} />
    <path d="M13 4.8a2.5 2.5 0 0 1 0 4.6M14.5 12.4c1.5.5 2.5 1.9 2.7 4.1" {...S} />
  </Svg>
);

/** Peringatan. */
export const IconAlert = (p) => (
  <Svg {...p}>
    <path d="M10 3.2 17.4 16H2.6L10 3.2Z" {...S} />
    <path d="M10 8.3v3.6" {...S} />
    <circle cx="10" cy="13.9" r=".95" fill="currentColor" />
  </Svg>
);

/** Kalender. */
export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3" y="4.3" width="14" height="12.7" rx="1.8" {...S} />
    <path d="M3 8.2h14M6.8 2.8v3M13.2 2.8v3" {...S} />
  </Svg>
);

/** Hierarki / kotak bertingkat. */
export const IconLayers = (p) => (
  <Svg {...p}>
    <path d="M10 3 17 6.6 10 10.2 3 6.6 10 3Z" {...S} />
    <path d="M3 10.2l7 3.6 7-3.6M3 13.8l7 3.6 7-3.6" {...S} />
  </Svg>
);

/** Kunci pendorong. */
export const IconKey = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="10" r="3.3" {...S} />
    <path d="M9.3 10H17.2M14.3 10v3M16.8 10v2.2" {...S} />
  </Svg>
);

/** Segmen: dua lingkaran beririsan. */
export const IconSegments = (p) => (
  <Svg {...p}>
    <circle cx="7.6" cy="10" r="4.4" {...S} />
    <circle cx="12.4" cy="10" r="4.4" {...S} />
  </Svg>
);

/** Kotak periksa (tercentang). */
export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.4 3.3L15.5 6" {...S} />
  </Svg>
);

/** Aliran: dua pita bersilang. */
export const IconFlow = (p) => (
  <Svg {...p}>
    <path d="M4.5 5.5c5 0 6 9 11 9M4.5 14.5c5 0 6-9 11-9M3 4v3M3 13v3M17 4v3M17 13v3" {...S} />
  </Svg>
);

/** Matriks: kisi 3×3. */
export const IconGrid = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="14" height="14" rx="1.6" {...S} />
    <path d="M7.7 3v14M12.3 3v14M3 7.7h14M3 12.3h14" {...S} />
  </Svg>
);

/** Pendapatan: lembar uang. */
export const IconCash = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="15" height="10" rx="1.6" {...S} />
    <circle cx="10" cy="10" r="2.2" {...S} />
    <path d="M5.3 7.7v.01M14.7 12.3v.01" {...S} />
  </Svg>
);

/** Transaksi: struk. */
export const IconReceipt = (p) => (
  <Svg {...p}>
    <path d="M5 2.8h10v14.4l-1.7-1.2-1.6 1.2-1.7-1.2-1.7 1.2-1.6-1.2L5 17.2V2.8Z" {...S} />
    <path d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3" {...S} />
  </Svg>
);

/** Rata-rata: batang dengan garis rata-rata putus-putus. */
export const IconAverage = (p) => (
  <Svg {...p}>
    <path d="M3 16.5h14M5.5 16.5v-5M10 16.5V5.5M14.5 16.5v-7" {...S} />
    <path d="M3 10.2h14" {...S} strokeDasharray="1.6 2" />
  </Svg>
);

/** Cabang: toko. */
export const IconStore = (p) => (
  <Svg {...p}>
    <path d="M3.2 7.4 4.6 3.5h10.8l1.4 3.9" {...S} />
    <path d="M3.2 7.4c0 1.2.9 2 2.1 2s2.2-.8 2.2-2c0 1.2 1 2 2.5 2s2.5-.8 2.5-2c0 1.2.9 2 2.2 2s2.1-.8 2.1-2" {...S} />
    <path d="M4.5 9.4v7.1h11V9.4M8.3 16.5v-4h3.4v4" {...S} />
  </Svg>
);

/** Naik. */
export const IconTrendUp = (p) => (
  <Svg {...p}>
    <path d="M3 14.5l4.5-4.5 3 3L17 6.5M12.5 6.5H17V11" {...S} />
  </Svg>
);

/** Turun. */
export const IconTrendDown = (p) => (
  <Svg {...p}>
    <path d="M3 5.5l4.5 4.5 3-3L17 13.5M12.5 13.5H17V9" {...S} />
  </Svg>
);

/** Lonceng: menu Peringatan. */
export const IconBell = (p) => (
  <Svg {...p}>
    <path d="M5.2 13.7V9.3a4.8 4.8 0 0 1 9.6 0v4.4l1.6 1.9H3.6l1.6-1.9Z" {...S} />
    <path d="M8.1 17.3a2 2 0 0 0 3.8 0" {...S} />
  </Svg>
);

/** Kaca pembesar: perlu dicek. */
export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="8.7" cy="8.7" r="5" {...S} />
    <path d="M12.5 12.5 17 17" {...S} />
  </Svg>
);

/** Kembali: panah ke kiri. */
export const IconBack = (p) => (
  <Svg {...p}>
    <path d="M16.5 10H4M9 5 4 10l5 5" {...S} />
  </Svg>
);
