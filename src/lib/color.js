/* ============================================================================
   Warna data
   ----------------------------------------------------------------------------
   Setiap warna di grafik melakukan tepat satu tugas:

   identitas  → KATEGORI     urutan tetap, maks 7 + "Lainnya" abu
   besaran    → BERURUT      satu hue (anggur), terang ke gelap
   arah       → DIVERGEN     turun (merah) · netral abu · naik (teal)
   keadaan    → TAHAP / AKSI makna tetap, selalu disertai label

   Semua palet di bawah sudah diuji dengan validator buta warna (simulasi
   protanopia dan deuteranopia, Machado 2009). Catatan penting dari uji itu:
   anggur merek (#72003B) dan hijau-teal nyaris tak bisa dibedakan oleh
   penderita deuteranopia (ΔE 2,4; target ≥ 8). Karena itu tahap siklus
   hidup TIDAK memakai anggur — "Baru" memakai biru.
   ========================================================================== */

/* Palet kategori bawaan. Lolos uji pasangan bersebelahan (ΔE CVD terburuk 9,1).
   Kuning, aqua, dan magenta di bawah 3:1 terhadap putih, jadi grafik yang
   memakainya wajib punya label terlihat atau tampilan tabel. */
export const CATEGORICAL = [
  "#2a78d6", // biru
  "#eb6834", // oranye
  "#1baf7a", // aqua
  "#eda100", // kuning
  "#e87ba4", // magenta
  "#008300", // hijau
  "#4a3aa7", // ungu
];
export const OTHER_COLOR = "#cfc2c8";

/* Tahap siklus hidup. Lolos uji SEMUA pasangan (untuk scatter), ΔE CVD
   terburuk 9,6. "Tidak aktif" digambar sebagai cincin kosong — bentuk
   jadi penanda kedua, bukan warna saja. */
export const STAGES = [
  {
    key: "baru",
    label: "Baru",
    color: "#2a78d6",
    tone: "blue",
    hint: "Pertama terjual belum lama ini",
  },
  {
    key: "tumbuh",
    label: "Tumbuh",
    color: "#12876a",
    tone: "teal",
    hint: "Pendapatan naik melewati ambang",
  },
  {
    key: "matang",
    label: "Matang",
    color: "#a8949c",
    tone: "mauve",
    hint: "Pendapatan stabil di sekitar periode sebelumnya",
  },
  {
    key: "menurun",
    label: "Menurun",
    color: "#d14134",
    tone: "red",
    hint: "Pendapatan turun melewati ambang",
  },
  {
    key: "tidur",
    label: "Tidak aktif",
    color: "#cfc2c8",
    tone: "mauve",
    hollow: true,
    hint: "Sudah lama tidak terjual",
  },
];

/* Rekomendasi. Lolos uji semua pasangan (ΔE CVD terburuk 10,0). Kuning
   "Perbaiki" di bawah 3:1, maka selalu tampil dengan label teks. */
export const ACTIONS = [
  {
    key: "kembangkan",
    label: "Kembangkan",
    color: "#12876a",
    tone: "teal",
    hint: "Sedang naik atau baru diluncurkan dengan awal yang baik. Beri ruang tumbuh.",
  },
  {
    key: "pertahankan",
    label: "Pertahankan",
    color: "#2a78d6",
    tone: "blue",
    hint: "Penyumbang penting yang stabil. Jaga ketersediaannya.",
  },
  {
    key: "perbaiki",
    label: "Perbaiki",
    color: "#eda100",
    tone: "amber",
    hint: "Penyumbang penting yang sedang turun. Cari penyebabnya sebelum terlambat.",
  },
  {
    key: "pantau",
    label: "Pantau",
    color: "#a8949c",
    tone: "mauve",
    hint: "Belum cukup bukti untuk bertindak. Lihat lagi di periode berikutnya.",
  },
  {
    key: "cabut",
    label: "Pertimbangkan dicabut",
    color: "#d14134",
    tone: "red",
    hint: "Kontribusi kecil dan terus melemah. Kandidat untuk dikeluarkan dari katalog.",
  },
  {
    key: "bersihkan",
    label: "Bersihkan dari katalog",
    color: "#cfc2c8",
    tone: "mauve",
    hollow: true,
    hint: "Sudah sangat lama tidak terjual, melewati batas Bersihkan di Kriteria (bawaan 365 hari). Secara praktis sudah tidak dijual.",
  },
];

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const ACTION_BY_KEY = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));

/* Pola permintaan (klasifikasi Syntetos–Boylan). Ini bukan warna data,
   jadi tampil sebagai teks saja. */
export const PATTERNS = {
  stabil: {
    label: "Stabil",
    hint: "Terjual hampir setiap bulan dengan nilai yang mirip.",
  },
  fluktuatif: {
    label: "Fluktuatif",
    hint: "Terjual hampir setiap bulan, tapi nilainya naik-turun tajam.",
  },
  sesekali: {
    label: "Sesekali",
    hint: "Ada bulan kosong di antara penjualan, nilainya cukup seragam.",
  },
  borongan: {
    label: "Borongan",
    hint:
      "Jarang terjual, tapi sekali terjual nilainya besar — khas pesanan proyek. Penurunan di produk berpola ini bisa berarti belum ada proyek baru, bukan tren.",
  },
  tipis: {
    label: "Data tipis",
    hint: "Terlalu sedikit bulan berpenjualan untuk menilai polanya.",
  },
};

export const ABC_HINT = {
  A: "Kelompok produk teratas yang bersama-sama menyusun 80% pendapatan.",
  B: "Kelompok berikutnya, sampai 95% pendapatan.",
  C: "Ekor panjang: sisa 5% pendapatan dibagi banyak produk.",
};

/* -------------------------------------------------------------- OKLab      */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toSrgb = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/** Campur dua warna di ruang OKLab — gradasinya rata di mata, tanpa abu kusam di tengah. */
export function mix(c1, c2, t) {
  const a = rgbToOklab(hexToRgb(c1));
  const b = rgbToOklab(hexToRgb(c2));
  const k = Math.max(0, Math.min(1, t));
  return oklabToHex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
}

/** Luminans relatif (WCAG). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Teks di atas isian berwarna: putih atau tinta, mana yang kontrasnya lebih tinggi. */
export function inkOn(hex) {
  const L = luminance(hex);
  const onWhite = (1.05) / (L + 0.05);
  const onInk = (L + 0.05) / (0.0186 + 0.05); // tinta #241a1f
  return onWhite >= onInk ? "#ffffff" : "#241a1f";
}

/* ------------------------------------------------------------- skala      */

const NEUTRAL = "#efe9ec";
export const NEW_COLOR = "#2a78d6";
const POS = "#0e6e52";
const NEG = "#b42318";

/**
 * Divergen untuk pertumbuhan. ±`span` sudah jenuh penuh — tanpa batas ini,
 * satu produk yang naik 2.000% membuat semua yang lain tampak netral.
 */
export function divergingColor(g, span = 0.5) {
  if (g == null || Number.isNaN(g)) return NEUTRAL;
  // Tak hingga = baru (tidak ada di pembanding): biru, sama dengan lencana "baru".
  if (!Number.isFinite(g)) return g > 0 ? NEW_COLOR : NEG;
  const t = Math.max(-1, Math.min(1, g / span));
  return t >= 0 ? mix(NEUTRAL, POS, Math.sqrt(t)) : mix(NEUTRAL, NEG, Math.sqrt(-t));
}

/**
 * Warna pertumbuhan untuk bidang yang ditumpuk di atas putih (pita aliran):
 * titik tengahnya abu sedang, bukan abu sangat muda, supaya pita yang
 * "tetap" masih terlihat. Baru (tanpa pembanding) = biru, sama dengan lencana "baru".
 */
const MID = "#c9bcc3";
export function growthColor(g, span = 0.5) {
  if (g == null || Number.isNaN(g)) return OTHER_COLOR;
  if (!Number.isFinite(g)) return g > 0 ? NEW_COLOR : NEG;
  const t = Math.max(-1, Math.min(1, g / span));
  return t >= 0 ? mix(MID, POS, Math.sqrt(t)) : mix(MID, NEG, Math.sqrt(-t));
}

const SEQ_LO = "#f8e3ee";
const SEQ_HI = "#57002d";

/** Berurut satu hue (anggur) untuk besaran; t dalam 0..1. */
export function sequentialColor(t) {
  return mix(SEQ_LO, SEQ_HI, Math.max(0, Math.min(1, t)));
}

/**
 * Indeks keterwakilan (aktual ÷ harapan). Skala log supaya 2× dan 0,5×
 * berjarak sama dari netral. >1 = lebih besar dari harapan.
 */
export function indexColor(ix) {
  if (ix == null || !Number.isFinite(ix) || ix <= 0) return NEUTRAL;
  const t = Math.max(-1, Math.min(1, Math.log2(ix) / 2)); // 4× atau ¼× jenuh
  return t >= 0 ? mix(NEUTRAL, "#57002d", Math.sqrt(t)) : mix(NEUTRAL, "#2a5ea8", Math.sqrt(-t));
}

/**
 * Warna kategori yang mengikuti ENTITAS, bukan urutannya. Daftar `order`
 * diberikan sekali (diurut dari nilai terbesar), dan anggota di luar tujuh
 * teratas jatuh ke abu "Lainnya".
 */
export function categoricalScale(order) {
  const map = new Map();
  order.slice(0, CATEGORICAL.length).forEach((k, i) => map.set(k, CATEGORICAL[i]));
  return (k) => map.get(k) || OTHER_COLOR;
}

export const COLORS = { NEUTRAL, POS, NEG, SEQ_LO, SEQ_HI };
