/* ============================================================================
   Utilitas murni — tanggal, angka, agregasi
   ----------------------------------------------------------------------------
   Tidak ada React di sini. Semuanya bisa diuji terpisah.
   ========================================================================== */

import { DATE_CANDIDATES } from "./config.js";

/* --------------------------------------------------------------- tanggal   */

const pad2 = (n) => String(n).padStart(2, "0");
export const isoOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/** Nama bulan Indonesia dan Inggris (lengkap atau singkat) → nomor bulan. */
const MONTH_NAMES = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

/** Tanggal ISO hanya kalau komponennya benar-benar ada di kalender. */
function validIso(y, m, d) {
  y = +y;
  m = +m;
  d = +d;
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // mis. 31 Februari
  return isoOf(y, m, d);
}

const fullYear = (y) => (String(y).length === 2 ? 2000 + +y : +y);

/**
 * Ubah nilai mentah jadi string ISO "YYYY-MM-DD".
 * Mengembalikan null kalau tidak bisa dibaca sebagai tanggal.
 *
 * Yang dikenali: 2026-06-09 (dengan atau tanpa jam), 2026/06/09,
 * 09/06/2026 · 09-06-2026 · 09.06.26 (urutan d/m atau m/d dari `fmt`),
 * "9 Jun 2026" · "9 Juni 2026" · "Jun 9, 2026", dan nomor seri tanggal
 * Excel (mis. 46030) yang muncul kalau CSV disimpan dari Excel.
 */
export function parseDate(raw, fmt = "dmy") {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(+raw) ? null : validIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }
  const s = String(raw).trim();
  if (!s) return null;

  // 2026-06-09, 2026-06-09 00:00:00.000, 2026-06-09T10:00:00Z, 2026/06/09
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validIso(m[1], m[2], m[3]);

  // 09/06/2026, 09-06-2026, 09.06.2026, 9/6/26
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = fullYear(m[3]);
    return fmt === "mdy" ? validIso(y, a, b) || validIso(y, b, a) : validIso(y, b, a) || validIso(y, a, b);
  }

  // 9 Jun 2026, 09-Jun-2026, 9 Juni 2026
  m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{4}|\d{2})(?!\d)/);
  if (m && MONTH_NAMES[m[2].toLowerCase()]) return validIso(fullYear(m[3]), MONTH_NAMES[m[2].toLowerCase()], m[1]);

  // Jun 9, 2026 · June 9 2026
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTH_NAMES[m[1].toLowerCase()]) return validIso(m[3], MONTH_NAMES[m[1].toLowerCase()], m[2]);

  // Bulan-tahun tanpa hari: "Jan-26", "Januari 2026", "Jun 2025" → tanggal 1 bulan itu.
  // Tanpa ini, "Jan-26" terbaca peramban sebagai 26 Januari 2001.
  m = s.match(/^([A-Za-z]{3,9})[\s\-/.,]+(\d{4}|\d{2})$/);
  if (m && MONTH_NAMES[m[1].toLowerCase()]) return validIso(fullYear(m[2]), MONTH_NAMES[m[1].toLowerCase()], 1);

  // Nomor seri Excel: hari sejak 30 Des 1899. 20000–80000 ≈ tahun 1954–2119.
  if (/^\d{5}(?:[.,]\d+)?$/.test(s)) {
    const n = Math.floor(Number(s.replace(",", ".")));
    if (n >= 20000 && n <= 80000) {
      const t = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return validIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    return null;
  }

  // Cadangan terakhir: format lain yang dikenali browser. Angka polos
  // (mis. tahun "2026") sengaja ditolak supaya kolom Year tidak tertebak.
  if (/^\d+$/.test(s)) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return validIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/**
 * Tebak d/m/Y atau m/d/Y dengan memindai nilai contoh.
 * Angka pertama > 12 berarti pasti hari; angka kedua > 12 berarti pasti bulan.
 */
export function detectDateFormat(samples) {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const m = String(s ?? "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    else if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** Nama kolom dinormalkan: huruf kecil, tanpa spasi, garis bawah, tanda hubung, titik. */
export const normHeader = (h) => String(h ?? "").replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_\-.]+/g, "");

/**
 * Cari kolom tanggal: dari daftar nama yang lazim, lalu dari nama yang
 * mengandung "date"/"tanggal"/"tgl", lalu dari isinya.
 */
export function detectDateColumn(sample, headers) {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  for (const c of DATE_CANDIDATES) {
    const h = byNorm.get(normHeader(c));
    if (h != null && sampleIsDate(sample, h)) return h;
  }

  const looksLikeDate = headers.filter((h) => /date|tanggal|tgl|waktu/i.test(h));
  for (const h of looksLikeDate) if (sampleIsDate(sample, h)) return h;

  for (const h of headers) {
    let ok = 0;
    let n = 0;
    for (const r of sample) {
      const v = r[h];
      if (v == null || v === "") continue;
      // Wajib ada pemisah, supaya kolom Year (mis. "2026") tidak ikut tertebak.
      if (!/[/\-.\s]/.test(String(v))) continue;
      n++;
      if (parseDate(v)) ok++;
    }
    if (n > 10 && ok / n > 0.8) return h;
  }
  return null;
}

/** Sebagian besar nilai contoh di kolom ini terbaca sebagai tanggal? */
function sampleIsDate(sample, h) {
  let ok = 0;
  let n = 0;
  for (const r of sample) {
    const v = r[h];
    if (v == null || v === "") continue;
    n++;
    if (parseDate(v)) ok++;
  }
  return n > 0 && ok / n >= 0.8;
}

/* ---------------------------------------------------------------- angka    */

/**
 * Tebak format angka satu kolom dari contoh nilainya:
 *   "id" → 1.234.567,89 (titik = ribuan, koma = desimal)
 *   "en" → 1,234,567.89 (koma = ribuan, titik = desimal)
 * Nilai polos tanpa pemisah (1234567) cocok untuk keduanya.
 */
export function detectNumberFormat(values) {
  let id = 0;
  let en = 0;
  for (const raw of values) {
    if (raw == null || typeof raw === "number") continue;
    const s = String(raw).replace(/[^\d.,-]/g, "");
    if (!s) continue;
    const dot = s.includes(".");
    const comma = s.includes(",");
    if (dot && comma) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) id++;
      else en++;
    } else if (comma) {
      if (/^-?\d{1,3}(,\d{3})+$/.test(s)) en++; // 1,234 atau 1,234,567
      else id++; // 12,5
    } else if (dot) {
      if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) id++; // 1.234.567
      else if (!/^-?\d{1,3}\.\d{3}$/.test(s)) en++; // 12.5 (1.234 dibiarkan: ambigu)
    }
  }
  return id > en ? "id" : "en";
}

/**
 * Baca angka dari teks apa pun: "Rp 1.234.567", "1,234.50", "(1.500)" untuk
 * negatif gaya akuntansi, "1,2E+5". Teks yang tidak terbaca → 0.
 */
export function parseNumber(raw, fmt = "en") {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,eE+-]/g, "");
  if (!s) return 0;
  const sign = (n) => (neg ? -n : n);
  if (/\d[eE][+-]?\d/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? sign(n) : 0;
  }
  const asId = () => Number(s.replace(/\./g, "").replace(",", "."));
  const asEn = () => Number(s.replace(/,/g, ""));
  let n = fmt === "id" ? asId() : asEn();
  if (!Number.isFinite(n)) n = fmt === "id" ? asEn() : asId();
  return Number.isFinite(n) ? sign(n) : 0;
}

export const toJs = (iso) => new Date(`${iso}T00:00:00`);
export const fromJs = (d) => isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());

export function shiftDays(iso, n) {
  const d = toJs(iso);
  d.setDate(d.getDate() + n);
  return fromJs(d);
}
export function shiftMonths(iso, n) {
  const d = toJs(iso);
  d.setMonth(d.getMonth() + n);
  return fromJs(d);
}
export function shiftYears(iso, n) {
  const d = toJs(iso);
  d.setFullYear(d.getFullYear() + n);
  return fromJs(d);
}

/* --- aritmetika kalender ---
   Dihitung dari komponen tahun/bulan/hari, bukan Date.setMonth, supaya
   31 Januari + 1 bulan tidak melompat ke 3 Maret. Pakai UTC agar bebas
   pengaruh zona waktu. Bulan boleh melewati batas (0 atau 13): tahunnya
   ikut bergeser sendiri. */
export const ym = (iso) => ({
  y: +iso.slice(0, 4),
  m: +iso.slice(5, 7),
  d: +iso.slice(8, 10),
});

export function monthStart(y, m) {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
export function monthEnd(y, m) {
  const d = new Date(Date.UTC(y, m, 0)); // hari ke-0 bulan berikutnya = hari terakhir
  return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
export const endOfMonth = (iso) => {
  const { y, m } = ym(iso);
  return monthEnd(y, m);
};

export const quarterOf = (m) => Math.floor((m - 1) / 3) + 1;

/** Rentang satu kuartal. q boleh 0 atau 5; tahunnya otomatis bergeser. */
export function quarterRange(y, q) {
  const yy = y + Math.floor((q - 1) / 4);
  const qq = ((((q - 1) % 4) + 4) % 4) + 1;
  const m1 = (qq - 1) * 3 + 1;
  return { from: monthStart(yy, m1), to: monthEnd(yy, m1 + 2) };
}

export const yearRange = (y) => ({ from: isoOf(y, 1, 1), to: isoOf(y, 12, 31) });

/** Geser tahun dengan aman: 29 Feb 2024 − 1 tahun menjadi 28 Feb 2023. */
export function shiftYearSafe(iso, n) {
  const { y, m, d } = ym(iso);
  const last = +monthEnd(y + n, m).slice(8, 10);
  return isoOf(y + n, m, Math.min(d, last));
}

/** Geser bulan dengan aman: 31 Maret − 1 bulan menjadi 28/29 Februari, bukan 3 Maret. */
export function shiftMonthsSafe(iso, n) {
  const { y, m, d } = ym(iso);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (((total % 12) + 12) % 12) + 1;
  const last = +monthEnd(yy, mm).slice(8, 10);
  return isoOf(yy, mm, Math.min(d, last));
}

/** Nomor bulan absolut (tahun×12 + bulan−1). Memudahkan aritmetika antarbulan. */
export const monthIndex = (iso) => +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1);
export const monthIndexStart = (m) => isoOf(Math.floor(m / 12), (m % 12) + 1, 1);
export const monthIndexEnd = (m) => monthEnd(Math.floor(m / 12), (m % 12) + 1);

export function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((toJs(b) - toJs(a)) / 86400000) + 1;
}

export const inRange = (d, r) =>
  !!d && !!r && !!r.from && !!r.to && d >= r.from && d <= r.to;

/* ----------------------------------------------------------------- preset  */

/* Semua preset dihitung dari TANGGAL ACUAN, yaitu isi kotak "dari" pada P1.
   Contoh: acuan 5 Juli 2025 + "Bulan penuh vs bulan sebelumnya" menghasilkan
   P1 = 1–31 Juli 2025 dan P2 = 1–30 Juni 2025.
   Dua preset terakhir tidak memakai acuan: P1 dibiarkan apa adanya, hanya
   P2 yang dihitung. Gunakan itu kalau rentang P1 diketik manual. */
export const PRESETS = [
  { group: "Bulan", key: "month_prev", label: "Bulan penuh vs bulan sebelumnya" },
  { group: "Bulan", key: "month_yoy", label: "Bulan penuh vs bulan sama tahun lalu" },
  { group: "Bulan", key: "mtd_yoy", label: "MTD (awal bulan s/d acuan) vs tahun lalu" },

  { group: "Kuartal", key: "quarter_prev", label: "Kuartal penuh vs kuartal sebelumnya" },
  { group: "Kuartal", key: "quarter_yoy", label: "Kuartal penuh vs kuartal sama tahun lalu" },

  { group: "Tahun", key: "ytd_yoy", label: "YTD (1 Jan s/d acuan) vs tahun lalu" },
  { group: "Tahun", key: "year_prev", label: "Tahun penuh vs tahun sebelumnya" },

  { group: "Bergulir", key: "roll30", label: "30 hari s/d acuan vs 30 hari sebelumnya" },
  { group: "Bergulir", key: "roll90", label: "90 hari s/d acuan vs 90 hari sebelumnya" },

  { group: "Pertahankan P1", key: "keep_prev", label: "P2 = periode sebelumnya, panjang sama" },
  { group: "Pertahankan P1", key: "keep_yoy", label: "P2 = periode sama tahun lalu" },
];

export const PRESET_LABEL = Object.fromEntries(PRESETS.map((p) => [p.key, p.label]));

/**
 * Hitung pasangan rentang untuk sebuah preset.
 * @param kind   kunci preset
 * @param anchor tanggal acuan (ISO) — biasanya isi kotak "dari" pada P1
 * @param cur    rentang P1 saat ini, dipakai oleh preset "Pertahankan P1"
 * @returns [P1, P2] atau null kalau tidak bisa dihitung
 */
export function computePreset(kind, anchor, cur) {
  if (kind === "keep_prev") {
    const n = daysBetween(cur.from, cur.to);
    if (!n) return null;
    const to = shiftDays(cur.from, -1);
    return [{ ...cur }, { from: shiftDays(to, -(n - 1)), to }];
  }
  if (kind === "keep_yoy") {
    if (!cur.from || !cur.to) return null;
    return [
      { ...cur },
      { from: shiftYearSafe(cur.from, -1), to: shiftYearSafe(cur.to, -1) },
    ];
  }

  if (!anchor) return null;
  const { y, m } = ym(anchor);
  const q = quarterOf(m);

  switch (kind) {
    case "month_prev":
      return [
        { from: monthStart(y, m), to: monthEnd(y, m) },
        { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) },
      ];

    case "month_yoy":
      return [
        { from: monthStart(y, m), to: monthEnd(y, m) },
        { from: monthStart(y - 1, m), to: monthEnd(y - 1, m) },
      ];

    case "mtd_yoy":
      return [
        { from: monthStart(y, m), to: anchor },
        { from: monthStart(y - 1, m), to: shiftYearSafe(anchor, -1) },
      ];

    case "quarter_prev":
      return [quarterRange(y, q), quarterRange(y, q - 1)];

    case "quarter_yoy":
      return [quarterRange(y, q), quarterRange(y - 1, q)];

    case "ytd_yoy":
      return [
        { from: isoOf(y, 1, 1), to: anchor },
        { from: isoOf(y - 1, 1, 1), to: shiftYearSafe(anchor, -1) },
      ];

    case "year_prev":
      return [yearRange(y), yearRange(y - 1)];

    case "roll30":
    case "roll90": {
      const n = kind === "roll30" ? 30 : 90;
      const P1 = { from: shiftDays(anchor, -(n - 1)), to: anchor };
      const to2 = shiftDays(P1.from, -1);
      return [P1, { from: shiftDays(to2, -(n - 1)), to: to2 }];
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ angka  */

export const EMPTY = "(kosong)";

export const dLabel = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const shortRange = (r) =>
  r && r.from && r.to ? `${dLabel.format(toJs(r.from))} – ${dLabel.format(toJs(r.to))}` : "–";

export const nfCompact = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const nfFull = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
export const nfPct = new Intl.NumberFormat("id-ID", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function fmt(value, format, compactMode = false) {
  if (value == null || Number.isNaN(value)) return "–";
  const n = compactMode ? nfCompact.format(Math.abs(value)) : nfFull.format(Math.abs(value));
  const sign = value < 0 ? "−" : "";
  return format === "currency" ? `${sign}Rp ${n}` : `${sign}${n}`;
}

/* Persen bertanda untuk kalimat: tanda minus tipografis (−) seperti angka lain di
   aplikasi, dan tanpa desimal di atas 100% (+391%, bukan +391,2%). */
const nfPct0 = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 });
export const signedPct = (p) =>
  p == null || Number.isNaN(p) ? "–" : `${p >= 0 ? "+" : "−"}${(Math.abs(p) >= 1 ? nfPct0 : nfPct).format(Math.abs(p))}`;

export const clip = (s, n) =>
  String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s);

/* -------------------------------------------------------------- agregasi   */

export function keyOf(row, dim) {
  const v = row[dim];
  if (v === null || v === undefined || v === "") return EMPTY;
  const s = String(v).trim();
  return s === "" || s.toUpperCase() === "NULL" ? EMPTY : s;
}

export function sumBy(rows, field) {
  let t = 0;
  for (const row of rows) t += Number(row[field]) || 0;
  return t;
}

/**
 * Agregasi satu dimensi.
 * Tanpa compare  → { label, value }
 * Dengan compare → { label, value: p1 - p2, p1, p2, pct }
 *
 * Catatan: pengecekan P1 dan P2 sengaja memakai dua `if` terpisah, bukan
 * if/else. Kalau kedua rentang bertumpang tindih, baris yang masuk keduanya
 * memang harus dihitung di dua sisi.
 */
export function aggregate(rows, dim, field, compare) {
  const acc = new Map();

  if (!compare) {
    for (const row of rows) {
      const k = keyOf(row, dim);
      acc.set(k, (acc.get(k) || 0) + (Number(row[field]) || 0));
    }
    return Array.from(acc, ([label, value]) => ({ label, value })).sort(
      (a, b) => b.value - a.value
    );
  }

  for (const row of rows) {
    const k = keyOf(row, dim);
    let e = acc.get(k);
    if (!e) {
      e = { label: k, p1: 0, p2: 0 };
      acc.set(k, e);
    }
    const v = Number(row[field]) || 0;
    if (inRange(row.__d, compare.p1)) e.p1 += v;
    if (inRange(row.__d, compare.p2)) e.p2 += v;
  }

  return Array.from(acc.values())
    .map((e) => ({
      ...e,
      value: e.p1 - e.p2,
      // Persen hanya bermakna terhadap pembanding positif.
      pct: e.p2 > 0 ? (e.p1 - e.p2) / e.p2 : null,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Total lengkap: nilai yang dipakai pohon, plus kedua sisi dan Δ%. */
export function totalsOf(rows, field, compare) {
  if (!compare) {
    const v = sumBy(rows, field);
    return { value: v, p1: v, p2: null, pct: null };
  }
  let p1 = 0;
  let p2 = 0;
  for (const row of rows) {
    const v = Number(row[field]) || 0;
    if (inRange(row.__d, compare.p1)) p1 += v;
    if (inRange(row.__d, compare.p2)) p2 += v;
  }
  return { value: p1 - p2, p1, p2, pct: p2 > 0 ? (p1 - p2) / p2 : null };
}

export const totalOf = (rows, field, compare) => totalsOf(rows, field, compare).value;

export function sortNodes(nodes, mode) {
  const out = nodes.slice();
  if (mode === "asc") out.sort((a, b) => a.value - b.value);
  else if (mode === "name") out.sort((a, b) => a.label.localeCompare(b.label, "id"));
  else out.sort((a, b) => b.value - a.value);
  return out;
}

/** Sisakan k anggota terbesar, sisanya dilebur jadi satu baris. */
export function topWithRest(nodes, k) {
  if (nodes.length <= k + 1) return nodes.slice().sort((a, b) => b.value - a.value);
  const byMag = nodes.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const rest = byMag.slice(k);
  const acc = { label: `${rest.length} lainnya`, value: 0, p1: 0, p2: 0, pct: null };
  for (const r of rest) {
    acc.value += r.value;
    acc.p1 += r.p1 || 0;
    acc.p2 += r.p2 || 0;
  }
  if (acc.p2 > 0) acc.pct = (acc.p1 - acc.p2) / acc.p2;
  return [...byMag.slice(0, k), acc].sort((a, b) => b.value - a.value);
}
