/* ============================================================================
   Mesin analisis produk
   ----------------------------------------------------------------------------
   Fungsi murni, tanpa React. Semua angka di halaman Portofolio dan Diagnosis
   berasal dari sini, jadi bisa diuji terpisah dan dicocokkan dengan hitungan
   lain (SQL, Python, Excel).

   Pertanyaan yang dijawab, berurutan:
   1. Di tahap mana produk ini?         → siklus hidup (stageOf)
   2. Seberapa penting?                 → kelas ABC, porsi, skor
   3. Bagaimana pola permintaannya?     → Syntetos–Boylan (demandPattern)
   4. Kenapa berubah?                   → dekomposisi LMDI (lmdiDrivers)
   5. Di mana berubah?                  → penjelasan per dimensi (explainDims)
   6. Kalau dicabut, apa akibatnya?     → pengganti, jangkauan, pelanggan
   7. Jadi, apa tindakannya?            → recommend
   ========================================================================== */

import { CRITERIA_DEFAULTS, hasCol, labelOf, unitDef } from "./config.js";
import {
  EMPTY,
  dLabel,
  daysBetween,
  endOfMonth,
  fmt,
  monthIndex,
  monthIndexEnd,
  monthIndexStart,
  nfFull,
  nfPct,
  shiftDays,
  shiftMonthsSafe,
  signedPct,
  toJs,
} from "./format.js";

/** Produk yang muncul di bulan-bulan pertama data tidak bisa dipastikan
    umurnya (bisa saja sudah dijual jauh sebelum data dimulai), jadi tidak
    pernah dianggap "Baru". */
export const CENSOR_MONTHS = 3;

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const rp = (v) => fmt(v, "currency", true);
const dateText = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");
/** Persen tanpa tanda, untuk kalimat "turun 28%" — bukan "turun -28%". */
// Di atas 100% tanpa desimal (391%, bukan 391,2%), sama dengan lencana naik/turun.
const nfPct0 = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 });
const pctAbs = (p) => (Math.abs(p) >= 1 ? nfPct0 : nfPct).format(Math.abs(p));
/** Porsi: "< 0,1%" alih-alih "0%" untuk produk yang kecil tapi tidak nol. */
export const sharePct = (s) => (!s ? "0%" : s < 0.001 ? "< 0,1%" : nfPct.format(s));
const PATTERN_WORD = {
  stabil: "stabil",
  fluktuatif: "fluktuatif",
  sesekali: "sesekali",
  borongan: "borongan",
  tipis: "jarang terjual",
};

/* Nilai yang sebenarnya artefak data: transaksi tanpa lini/kategori,
   biasanya kode listing marketplace yang belum dipetakan ke master barang. */
const UNKNOWN = /tidak diketahui|^\(kosong\)$|^null$|^-$/i;
export const isUnknownKey = (k) => UNKNOWN.test(String(k));

/* ----------------------------------------------------------- label nilai   */

/** Nama tampilan sebuah nilai dimensi. Kode barang dan nama produk memakai peta label. */
export function valueLabel(dim, value, labels) {
  if (dim === "__name") return labels?.__name?.get(value) || value;
  if (dim === "Item_Code") return labels?.Item_Code?.get(value) || value;
  return value;
}

/* ------------------------------------------------------- jendela analisis  */

function finishWindow(P1, P2, kind, months) {
  return {
    p1: { from: P1.from, to: P1.to },
    p2: { from: P2.from, to: P2.to },
    asOf: P1.to,
    asOfM: monthIndex(P1.to),
    kind,
    months: months || null,
    days1: daysBetween(P1.from, P1.to),
    days2: daysBetween(P2.from, P2.to),
  };
}

/** Bagian rentang yang tertutup data (0..1). Tanpa batas data → dianggap penuh. */
export function coverage(range, dataFrom, dataTo) {
  if (!range || !dataFrom || !dataTo) return 1;
  const a = range.from > dataFrom ? range.from : dataFrom;
  const b = range.to < dataTo ? range.to : dataTo;
  if (b < a) return 0;
  return daysBetween(a, b) / Math.max(1, daysBetween(range.from, range.to));
}

/** Jendela bulan W yang berakhir di tanggal acuan. */
function monthWindow(asOf, W) {
  if (asOf === endOfMonth(asOf)) {
    const A = monthIndex(asOf);
    return finishWindow(
      { from: monthIndexStart(A - W + 1), to: asOf },
      { from: monthIndexStart(A - 2 * W + 1), to: monthIndexEnd(A - W) },
      "months",
      W
    );
  }
  const p2to = shiftMonthsSafe(asOf, -W);
  return finishWindow(
    { from: shiftDays(p2to, 1), to: asOf },
    { from: shiftDays(shiftMonthsSafe(asOf, -2 * W), 1), to: p2to },
    "months",
    W
  );
}

/**
 * Tentukan P1 (periode dinilai) dan P2 (pembanding).
 *
 * Mode bulan: P1 = W bulan yang berakhir di tanggal acuan, P2 = W bulan
 * sebelumnya. Kalau tanggal acuan jatuh di akhir bulan, jendelanya dibulatkan
 * ke bulan kalender penuh (Agu 2025–Jul 2026, bukan 31 Jul–31 Jul).
 *
 * Mode global: memakai periode di bilah atas. Kalau "Bandingkan periode"
 * mati, P2 = periode sepanjang P1 tepat sebelumnya. Kalau pembanding diisi
 * SETELAH periode utama, keduanya ditukar: tahap siklus hidup selalu dinilai
 * per akhir periode yang lebih baru, dan transaksi setelah tanggal acuan
 * tidak ikut dihitung.
 *
 * dataFrom/dataTo = rentang tanggal yang ada di data. Dipakai untuk
 * memeriksa apakah P1 dan P2 benar-benar tertutup data; kalau tidak,
 * peringatannya ada di `warnings`.
 */
export function analysisWindow({ mode, asOf, p1, compare, dataFrom = null, dataTo = null }) {
  let w = null;
  let swapped = false;
  if (mode === "global") {
    if (compare) {
      let a = compare.p1;
      let b = compare.p2;
      if (b.to > a.to) {
        [a, b] = [b, a];
        swapped = true;
      }
      w = finishWindow(a, b, "global");
    } else if (p1 && p1.from && p1.to) {
      const n = daysBetween(p1.from, p1.to);
      const to2 = shiftDays(p1.from, -1);
      w = finishWindow(p1, { from: shiftDays(to2, -(n - 1)), to: to2 }, "global");
    }
  }
  if (!w) w = monthWindow(asOf, Number(mode) || 12);

  w.swapped = swapped;
  w.dataFrom = dataFrom;
  w.dataTo = dataTo;
  w.cover1 = coverage(w.p1, dataFrom, dataTo);
  w.cover2 = coverage(w.p2, dataFrom, dataTo);
  w.overlap = w.p2.to >= w.p1.from && w.p2.from <= w.p1.to;

  // Jendela bulan terpanjang yang masih tertutup data penuh, untuk saran.
  w.fitMonths = null;
  if (dataFrom) {
    for (const W of [12, 6, 3]) {
      const t = monthWindow(w.asOf, W);
      if (t.p2.from >= dataFrom) {
        w.fitMonths = W;
        break;
      }
    }
  }
  w.warnings = windowWarnings(w);
  return w;
}

/** Peringatan tentang jendela yang membuat perbandingan tidak setara. */
function windowWarnings(w) {
  const out = [];
  const range = (r) => `${dateText(r.from)} – ${dateText(r.to)}`;
  if (w.swapped) {
    out.push({
      key: "swapped",
      level: "info",
      text: `Pembanding diisi setelah Periode, jadi keduanya ditukar: yang lebih baru (${range(w.p1)}) dinilai sebagai P1.`,
    });
  }
  if (w.cover2 < 0.95 && w.dataFrom) {
    out.push({
      key: "cover2",
      level: "warn",
      text: `P2 (${range(w.p2)}) hanya ${nfPct.format(w.cover2)} tertutup data, karena data baru mulai ${dateText(w.dataFrom)}. Pertumbuhan jadi tampak lebih tinggi dan banyak produk terbaca "Tumbuh".`,
    });
  }
  if (w.cover1 < 0.95 && w.dataTo) {
    out.push({
      key: "cover1",
      level: "warn",
      text: `P1 (${range(w.p1)}) hanya ${nfPct.format(w.cover1)} tertutup data — data berakhir ${dateText(w.dataTo)}.`,
    });
  }
  if (w.kind === "global" && Math.abs(w.days1 - w.days2) > 1) {
    out.push({
      key: "length",
      level: "warn",
      text: `P1 ${nfFull.format(w.days1)} hari, P2 ${nfFull.format(w.days2)} hari. Pertumbuhan dihitung dari total pendapatan, jadi kedua periode sebaiknya sama panjang.`,
    });
  }
  if (w.overlap) {
    out.push({
      key: "overlap",
      level: "warn",
      text: "P1 dan P2 bertumpang tindih — transaksi di irisannya ikut dihitung di keduanya.",
    });
  }
  return out;
}

/** "12 bulan terakhir" atau "1 Feb–31 Jul 2026", untuk kalimat penjelasan. */
export function windowText(win) {
  if (win.months) return `${win.months} bulan terakhir`;
  return `${dateText(win.p1.from)} – ${dateText(win.p1.to)}`;
}

/* --------------------------------------------------------- statistik dasar */

const logMean = (a, b) =>
  Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)) ? a : (a - b) / (Math.log(a) - Math.log(b));

/** Peringkat persentil 0..1, nilai kembar mendapat rata-rata peringkatnya. */
function percentileRanks(values) {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  if (n === 1) {
    out[0] = 1;
    return out;
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[idx[j + 1]] === values[idx[i]]) j++;
    const avg = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) out[idx[k]] = avg;
    i = j + 1;
  }
  return out;
}

/**
 * Nilai yang paling sering muncul. Nilai yang diketahui selalu didahulukan
 * dari "(kosong)"/"tidak diketahui" — produk yang sebagian barisnya belum
 * dipetakan tetap masuk ke kategorinya yang sebenarnya. Kalau jumlahnya
 * sama, dipilih menurut abjad, supaya hasilnya tidak bergantung pada urutan
 * baris di sumber data (urutan dari Supabase bisa berubah-ubah).
 */
function topVote(votes) {
  let best = null;
  let bestN = -1;
  let bestKnown = false;
  for (const [k, n] of votes) {
    const known = !UNKNOWN.test(String(k));
    const better =
      known !== bestKnown ? known : n !== bestN ? n > bestN : best == null || String(k) < String(best);
    if (better) {
      best = k;
      bestN = n;
      bestKnown = known;
    }
  }
  return best;
}

/** Urutan tetap: nilai P1 terbesar, lalu P2, lalu kunci menurut abjad. */
const byRevenue = (a, b) => b.r1 - a.r1 || b.r2 - a.r2 || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const vote = (map, k) => map.set(k, (map.get(k) || 0) + 1);

/**
 * Pola permintaan menurut Syntetos & Boylan (2005).
 * ADI  = rata-rata jarak antarbulan berpenjualan
 * CV²  = kuadrat koefisien variasi nilai pada bulan berpenjualan
 * Ambang 1,32 dan 0,49 adalah nilai baku dari makalah aslinya.
 */
export function demandPattern(mon, start, end) {
  const per = end - start + 1;
  const nz = [];
  for (let m = start; m <= end; m++) {
    const v = mon.get(m) || 0;
    if (v > 0) nz.push(v);
  }
  if (nz.length < 3 || per < 6) return "tipis";
  const adi = per / nz.length;
  const mean = nz.reduce((a, b) => a + b, 0) / nz.length;
  const variance = nz.reduce((a, b) => a + (b - mean) ** 2, 0) / nz.length;
  const cv2 = variance / (mean * mean);
  if (adi < 1.32) return cv2 < 0.49 ? "stabil" : "fluktuatif";
  return cv2 < 0.49 ? "sesekali" : "borongan";
}

/** Median jarak (hari) antara hari-hari berpenjualan. */
function medianGap(days) {
  // Di bawah enam hari berpenjualan, median jaraknya terlalu mudah kebetulan.
  if (days.size < 6) return null;
  const arr = Array.from(days).sort();
  const gaps = [];
  for (let i = 1; i < arr.length; i++) gaps.push(daysBetween(arr[i - 1], arr[i]) - 1);
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/* ------------------------------------------------------ tahap siklus hidup */

/**
 * Tahap siklus hidup. Urutan pemeriksaan penting:
 * tidak aktif → baru → tumbuh/menurun/matang.
 * "Tidak aktif" diperiksa lebih dulu supaya produk baru yang langsung macet
 * tidak tersembunyi di balik label "Baru".
 */
export function stageOf(u, crit) {
  if (u.dsl > crit.dormantDays) return "tidur";
  if (u.isYoung ?? u.ageM <= crit.newMonths) return "baru";
  if (u.g == null) return u.r1 > 0 ? "tumbuh" : "tidur";
  if (u.g >= crit.growth) return "tumbuh";
  if (u.g <= -crit.growth) return "menurun";
  return "matang";
}

/* ---------------------------------------------------- dekomposisi penyebab */

/**
 * Pendapatan = cabang aktif × transaksi per cabang × qty per transaksi × harga
 *
 * Diurai dengan LMDI-I (Ang, 2005): efek tiap faktor = L(V₁,V₀) · ln(x₁/x₀),
 * dengan L rata-rata logaritmik. Jumlah keempat efek PERSIS sama dengan
 * selisih pendapatan — tidak ada sisa "interaksi" yang tak bisa dijelaskan.
 * Syaratnya semua faktor > 0 di kedua periode; kalau produk baru muncul
 * atau berhenti total, penguraian tidak berlaku dan dijelaskan dengan kata.
 */
export function lmdiDrivers(m, split = true) {
  // Tanpa kolom cabang, jangkauan × frekuensi digabung jadi jumlah transaksi.
  const byBranch = hasCol("Branch");
  if (!(m.r1 > 0 && m.r2 > 0 && m.n1 > 0 && m.n2 > 0)) return null;
  if (byBranch && !(m.b1 > 0 && m.b2 > 0)) return null;
  const f = byBranch
    ? [
        { key: "br", x1: m.b1, x0: m.b2 },
        { key: "dens", x1: m.n1 / m.b1, x0: m.n2 / m.b2 },
      ]
    : [{ key: "tx", x1: m.n1, x0: m.n2 }];
  /* Qty dan harga hanya dipisah di tingkat kode barang. Di tingkat yang
     lebih tinggi satuannya bercampur (sekrup per pcs, papan per lembar),
     sehingga "harga rata-rata" sebenarnya pergeseran bauran: pindah dari
     sekrup ke papan menaikkan harga dan menurunkan qty sekaligus. Hasil
     kalinya — nilai per transaksi — tetap bermakna, jadi itu yang dipakai. */
  if (split && m.q1 > 0 && m.q2 > 0) {
    f.push({ key: "size", x1: m.q1 / m.n1, x0: m.q2 / m.n2 });
    f.push({ key: "price", x1: m.r1 / m.q1, x0: m.r2 / m.q2 });
  } else {
    // Tanpa qty (kolomnya tidak ada atau nol), cukup nilai per transaksi.
    f.push({ key: "ticket", x1: m.r1 / m.n1, x0: m.r2 / m.n2 });
  }
  if (f.some((x) => !(x.x1 > 0 && x.x0 > 0))) return null;
  const L = logMean(m.r1, m.r2);
  return f.map((x) => ({ ...x, effect: L * Math.log(x.x1 / x.x0) }));
}

export const DRIVER_INFO = {
  ticket: {
    label: "Nilai per transaksi",
    long: "nilai rata-rata per transaksi",
    fmt: (x) => rp(x),
  },
  br: {
    label: "Jangkauan cabang",
    long: "jumlah cabang yang menjual",
    fmt: (x) => `${nfFull.format(x)} cabang`,
  },
  tx: {
    label: "Jumlah transaksi",
    long: "jumlah transaksi",
    fmt: (x) => `${nfFull.format(x)} transaksi`,
  },
  dens: {
    label: "Frekuensi per cabang",
    long: "transaksi per cabang",
    fmt: (x) => `${nf1.format(x)} transaksi`,
  },
  size: {
    label: "Ukuran pesanan",
    long: "unit per transaksi",
    fmt: (x) => `${nf1.format(x)} unit`,
  },
  price: {
    label: "Harga rata-rata",
    long: "harga rata-rata per unit",
    fmt: (x) => rp(x),
  },
};

/** Kalimat untuk faktor penyebab terbesar. */
export function driverSentence(drv, rising) {
  const info = DRIVER_INFO[drv.key];
  const head = rising ? "Pendorong terbesar" : "Penyebab terbesar";
  return `${head}: ${info.long} ${info.fmt(drv.x0)} → ${info.fmt(drv.x1)} (${drv.effect >= 0 ? "+" : "−"}${rp(Math.abs(drv.effect))}).`;
}

/** Faktor yang paling banyak menyumbang ke arah perubahan total. */
export function mainDriver(drivers, delta) {
  if (!drivers) return null;
  let best = null;
  for (const d of drivers) {
    if (Math.sign(d.effect) !== Math.sign(delta)) continue;
    if (!best || Math.abs(d.effect) > Math.abs(best.effect)) best = d;
  }
  return best;
}

/* ------------------------------------------------------------- portofolio  */

/**
 * Hitung semua produk pada satu tingkat analisis.
 *
 * @param lines  baris transaksi (sudah tersaring slicer), semua tanggal
 * @param unit   kunci tingkat: Lini_Produk | Category | __name | Item_Code
 * @param win    hasil analysisWindow()
 * @param crit   ambang penilaian (lihat CRITERIA_DEFAULTS)
 */
export function buildPortfolio(lines, { unit, win, crit = CRITERIA_DEFAULTS, labels, customersReliable }) {
  crit = { ...CRITERIA_DEFAULTS, ...crit, weights: { ...CRITERIA_DEFAULTS.weights, ...(crit?.weights || {}) } };
  const U = unitDef(unit);
  const parentField = U.parent;
  const { p1, p2, asOf, asOfM: A } = win;
  // Bulan pertama data; produk yang sudah ada sejak awal data umurnya tidak diketahui.
  const dataStartM = win.dataFrom ? monthIndex(win.dataFrom) : null;
  const gapFrom = shiftDays(asOf, -729); // 24 bulan terakhir untuk jarak antarpenjualan
  const map = new Map();

  for (const ln of lines) {
    const d = ln.__d;
    if (d > asOf) continue; // tidak ada kebocoran data dari masa depan
    const k = ln[unit];
    let u = map.get(k);
    if (!u) {
      u = {
        key: k,
        first: d,
        last: d,
        mon: new Map(),
        r1: 0,
        r2: 0,
        q1: 0,
        q2: 0,
        n1: 0,
        n2: 0,
        br1: new Set(),
        br2: new Set(),
        cu1: customersReliable ? new Set() : null,
        cu2: customersReliable ? new Set() : null,
        parentVotes: parentField ? new Map() : null,
        liniVotes: new Map(),
        days: new Set(),
      };
      map.set(k, u);
    }
    if (d < u.first) u.first = d;
    if (d > u.last) u.last = d;
    const v = ln.Revenue;
    u.mon.set(ln.__m, (u.mon.get(ln.__m) || 0) + v);
    if (d >= gapFrom) u.days.add(d);
    if (parentField) vote(u.parentVotes, ln[parentField]);
    vote(u.liniVotes, ln.Lini_Produk);

    // Dua `if` terpisah, bukan if/else: kalau P1 dan P2 bertumpang tindih,
    // transaksi di irisannya memang dihitung di kedua sisi.
    if (d >= p1.from && d <= p1.to) {
      u.r1 += v;
      u.q1 += ln.quantity;
      u.n1 += 1;
      u.br1.add(ln.Branch);
      if (u.cu1) u.cu1.add(ln.id_customer);
    }
    if (d >= p2.from && d <= p2.to) {
      u.r2 += v;
      u.q2 += ln.quantity;
      u.n2 += 1;
      u.br2.add(ln.Branch);
      if (u.cu2) u.cu2.add(ln.id_customer);
    }
  }

  const units = Array.from(map.values());
  let T1 = 0;
  let T2 = 0;

  for (const u of units) {
    T1 += u.r1;
    T2 += u.r2;
    u.parent = parentField ? topVote(u.parentVotes) : null;
    u.lini = topVote(u.liniVotes);
    u.label = valueLabel(unit, u.key, labels);
    u.sub =
      unit === "Item_Code" ? [u.key, u.parent].filter(Boolean).join(" · ") : unit === "Lini_Produk" ? "" : u.parent;
    u.firstM = monthIndex(u.first);
    u.ageM = A - u.firstM + 1;
    u.censored = dataStartM != null && u.firstM < dataStartM + CENSOR_MONTHS;
    u.isYoung = !u.censored && u.ageM <= crit.newMonths;
    u.isOld = u.censored || u.ageM > crit.thinAgeMonths;
    u.dsl = Math.max(0, daysBetween(u.last, asOf) - 1);
    u.g = u.r2 > 0 ? (u.r1 - u.r2) / u.r2 : null;
    u.b1 = u.br1.size;
    u.b2 = u.br2.size;
    u.c1 = u.cu1 ? u.cu1.size : null;
    u.c2 = u.cu2 ? u.cu2.size : null;

    const series = new Array(24);
    for (let i = 0; i < 24; i++) series[i] = u.mon.get(A - 23 + i) || 0;
    u.series = series;
    let act = 0;
    for (let i = 12; i < 24; i++) if (series[i] > 0) act++;
    u.act12 = act;

    u.pattern = demandPattern(u.mon, Math.max(A - 23, u.firstM), A);
    u.gap = medianGap(u.days);
    u.overdue = u.gap != null && u.dsl > Math.max(30, 3 * u.gap);
    u.thin = u.n1 + u.n2 < crit.minTx;
    u.stage = stageOf(u, crit);
    u.drivers = lmdiDrivers(u, unit === "Item_Code");
    u.unknown = UNKNOWN.test(u.key);

    // Bersihkan struktur sementara supaya memori tetap ringan.
    u.parentVotes = null;
    u.liniVotes = null;
    u.days = null;
    u.cu1 = null;
    u.cu2 = null;
  }

  /* --- kelas ABC dari pendapatan P1 --- */
  const ranked = units.filter((u) => u.r1 > 0).sort(byRevenue);
  let cum = 0;
  for (const u of ranked) {
    const before = T1 ? cum / T1 : 0;
    u.abc = before < crit.abcA ? "A" : before < crit.abcB ? "B" : "C";
    cum += u.r1;
    u.cum = T1 ? cum / T1 : 0;
  }
  for (const u of units) {
    if (!(u.r1 > 0)) {
      u.abc = "C";
      u.cum = 1;
    }
    u.share = T1 ? u.r1 / T1 : 0;
  }
  const countA = units.filter((u) => u.abc === "A").length;

  /* --- induk dan saudara --- */
  const parents = new Map();
  const parentOf = (u) => (parentField ? u.parent : "__all");
  for (const u of units) {
    const pk = parentOf(u);
    let p = parents.get(pk);
    if (!p) {
      p = { key: pk, r1: 0, r2: 0, units: [] };
      parents.set(pk, p);
    }
    p.r1 += u.r1;
    p.r2 += u.r2;
    p.units.push(u);
  }
  for (const p of parents.values()) {
    p.g = p.r2 > 0 ? (p.r1 - p.r2) / p.r2 : null;
    p.units.sort(byRevenue);
  }

  for (const u of units) {
    const p = parents.get(parentOf(u));
    u.shareParent = p.r1 ? u.r1 / p.r1 : 0;
    /* Pertumbuhan SAUDARA, bukan induk. Induk mencakup produk ini sendiri:
       kalau produk ini turun Rp 690 jt dan induknya turun Rp 418 jt, induk
       tampak "ikut turun" padahal saudara-saudaranya justru naik Rp 272 jt.
       Membandingkan dengan induk utuh akan menyalahkan pasar atas masalah
       yang sebenarnya ada di produk ini. */
    const o1 = p.r1 - u.r1;
    const o2 = p.r2 - u.r2;
    u.parentG = o2 > 0 ? (o1 - o2) / o2 : null;
    u.othersR1 = o1;
    u.othersR2 = o2;
    let sub = null;
    let active = 0;
    for (const s of p.units) {
      if (s === u || s.unknown) continue;
      if (s.r1 > 0) active++;
      // Pengganti hanya dicari di dalam induk yang sama. Di tingkat lini
      // tidak ada induk: Roofing bukan pengganti perkakas pemasangan.
      if (
        parentField &&
        !sub &&
        s.r1 > 0 &&
        !s.thin &&
        (s.stage === "tumbuh" || s.stage === "matang" || s.stage === "baru")
      ) {
        sub = s;
      }
    }
    u.substitute = sub;
    u.hasSubstitute = !!sub && sub.r1 >= u.r1;
    u.activeSiblings = active;
  }

  /* --- skor kesehatan: rata-rata berbobot dari lima persentil --- */
  const contrib = percentileRanks(units.map((u) => u.r1));
  const trend = percentileRanks(
    units.map((u) => (u.g == null ? (u.r1 > 0 ? 2 : -1) : Math.max(-1, Math.min(2, u.g))))
  );
  const reach = percentileRanks(units.map((u) => u.b1));
  // Tanpa kolom cabang, jangkauan tidak bisa diukur — bobotnya dinolkan.
  const w = hasCol("Branch") ? crit.weights : { ...crit.weights, reach: 0 };
  const wSum = w.contrib + w.trend + w.reach + w.consistency + w.recency || 1;
  units.forEach((u, i) => {
    const parts = {
      contrib: contrib[i],
      trend: trend[i],
      reach: reach[i],
      consistency: u.act12 / 12,
      recency: Math.max(0, 1 - u.dsl / 365),
    };
    u.scoreParts = parts;
    u.score = Math.round(
      (100 *
        (w.contrib * parts.contrib +
          w.trend * parts.trend +
          w.reach * parts.reach +
          w.consistency * parts.consistency +
          w.recency * parts.recency)) /
        wSum
    );
  });

  /* --- rekomendasi --- */
  const ctx = { crit, U, win, parentField };
  for (const u of units) u.rec = recommend(u, ctx);

  /* --- ringkasan --- */
  const byStage = {};
  const byAction = {};
  for (const u of units) {
    const s = (byStage[u.stage] ||= { n: 0, r1: 0, r2: 0 });
    s.n++;
    s.r1 += u.r1;
    s.r2 += u.r2;
    const a = (byAction[u.rec.action] ||= { n: 0, r1: 0, r2: 0 });
    a.n++;
    a.r1 += u.r1;
    a.r2 += u.r2;
  }

  units.sort(byRevenue);

  return {
    unit,
    unitDef: U,
    units,
    byKey: new Map(units.map((u) => [u.key, u])),
    parents,
    T1,
    T2,
    countA,
    nActive: ranked.length,
    byStage,
    byAction,
    win,
    crit,
    weights: w,
  };
}

/* ------------------------------------------------------------ rekomendasi   */

const isAB = (u) => u.abc === "A" || u.abc === "B";
const isRegular = (u) => u.pattern === "stabil" || u.pattern === "fluktuatif";

/**
 * Aturan rekomendasi — SATU sumber untuk mesin dan halaman Keterangan.
 * Diperiksa berurutan dari atas; aturan pertama yang cocok menentukan
 * tindakan. `when(crit)` adalah kalimat yang ditampilkan di Keterangan,
 * `test(u, crit)` adalah syarat yang benar-benar dipakai menghitung.
 *
 * Sengaja berupa aturan, bukan model: setiap rekomendasi harus bisa
 * dijelaskan dengan satu kalimat yang bisa dibantah.
 */
export const REC_RULES = [
  {
    id: "unknown",
    action: "pantau",
    stage: null,
    when: () => "Baris tanpa nama lini/kategori (mis. kode barang yang belum dipetakan) — bukan produk sungguhan, tidak pernah dicabut",
    test: (u) => u.unknown,
  },
  {
    id: "clean",
    action: "bersihkan",
    stage: "tidur",
    when: (c) => `Tidak terjual lebih dari ${c.cleanDays} hari`,
    test: (u, c) => u.dsl > c.cleanDays,
  },
  {
    id: "dormant-young",
    action: "pantau",
    stage: "tidur",
    when: (c) => `Tidak aktif, tetapi baru beredar ${c.newMonths} bulan atau kurang`,
    test: (u) => u.stage === "tidur" && u.isYoung,
  },
  {
    id: "dormant-core-regular",
    action: "perbaiki",
    stage: "tidur",
    when: () => "Tidak aktif, kelas A/B, dan biasanya laku rutin (pola Stabil atau Fluktuatif)",
    test: (u) => u.stage === "tidur" && isAB(u) && isRegular(u),
  },
  {
    id: "dormant-core",
    action: "pantau",
    stage: "tidur",
    when: () => "Tidak aktif, kelas A/B, tetapi polanya tidak rutin (Sesekali, Borongan, atau Data tipis)",
    test: (u) => u.stage === "tidur" && isAB(u),
  },
  {
    id: "dormant",
    action: "cabut",
    stage: "tidur",
    when: () => "Tidak aktif dan kelas C",
    test: (u) => u.stage === "tidur",
  },
  {
    id: "new-thin",
    action: "pantau",
    stage: "baru",
    when: (c) => `Baru, tetapi transaksinya kurang dari ${c.minTx}`,
    test: (u) => u.stage === "baru" && u.thin,
  },
  {
    id: "new",
    action: "kembangkan",
    stage: "baru",
    when: (c) => `Baru, dengan ${c.minTx} transaksi atau lebih`,
    test: (u) => u.stage === "baru",
  },
  {
    id: "thin-old",
    action: "cabut",
    stage: null,
    when: (c) =>
      `Data tipis (kurang dari ${c.minTx} transaksi di P1 + P2), kelas C, dan sudah beredar lebih dari ${c.thinAgeMonths} bulan`,
    test: (u) => u.thin && u.abc === "C" && u.isOld,
  },
  {
    id: "thin",
    action: "pantau",
    stage: null,
    when: (c) => `Data tipis lainnya (kurang dari ${c.minTx} transaksi di P1 + P2)`,
    test: (u) => u.thin,
  },
  {
    id: "growing",
    action: "kembangkan",
    stage: "tumbuh",
    when: () => "Tumbuh",
    test: (u) => u.stage === "tumbuh",
  },
  {
    id: "mature-core",
    action: "pertahankan",
    stage: "matang",
    when: () => "Matang dan kelas A/B",
    test: (u) => u.stage === "matang" && isAB(u),
  },
  {
    id: "mature",
    action: "pantau",
    stage: "matang",
    when: () => "Matang dan kelas C",
    test: (u) => u.stage === "matang",
  },
  {
    id: "declining-core",
    action: "perbaiki",
    stage: "menurun",
    when: () => "Menurun dan kelas A/B",
    test: (u) => u.stage === "menurun" && isAB(u),
  },
  {
    id: "declining-project",
    action: "pantau",
    stage: "menurun",
    when: (c) => `Menurun, kelas C, pola Borongan, dan masih terjual dalam ${c.projectGraceDays} hari terakhir`,
    test: (u, c) => u.stage === "menurun" && u.pattern === "borongan" && u.dsl <= c.projectGraceDays,
  },
  {
    id: "declining",
    action: "cabut",
    stage: "menurun",
    when: () => "Menurun dan kelas C",
    test: (u) => u.stage === "menurun",
  },
];

/** Aturan yang berlaku untuk satu produk. */
export function ruleFor(u, crit) {
  return REC_RULES.find((r) => r.test(u, crit)) || REC_RULES[REC_RULES.length - 1];
}

/**
 * Rekomendasi satu produk: tindakan dari REC_RULES, lalu alasan tertulis.
 *
 * why   = alasan yang mendukung tindakan
 * watch = hal yang perlu diperiksa sebelum bertindak
 */
export function recommend(u, { crit, U, parentField }) {
  crit = { ...CRITERIA_DEFAULTS, ...crit };
  const rule = ruleFor(u, crit);
  const action = rule.action;
  const why = [];
  const watch = [];
  const share = sharePct(u.share);
  const parentName = parentField ? u.parent : "portofolio";
  const delta = u.r1 - u.r2;
  const n = u.n1 + u.n2;

  switch (rule.id) {
    case "unknown":
      // Bukan produk sungguhan — jangan sampai ikut direkomendasikan dicabut.
      return {
        action,
        rule: rule.id,
        why: [
          {
            t: `Bukan produk: ${nfFull.format(u.n1)} transaksi tanpa nama ${labelOf(U.key).toLowerCase()}. Biasanya kode barang yang belum dipetakan ke master barang.`,
            tone: "neutral",
          },
        ],
        watch: ["Petakan kode-kode ini ke barang internal supaya ikut dinilai dengan benar."],
      };
    case "clean":
      why.push({ t: `Terakhir terjual ${dateText(u.last)}, ${nfFull.format(u.dsl)} hari lalu (batas ${crit.cleanDays} hari).`, tone: "neg" });
      break;
    case "dormant-young":
      why.push({ t: `Baru ${u.ageM} bulan beredar, tapi sudah ${nfFull.format(u.dsl)} hari tidak terjual.`, tone: "neg" });
      break;
    case "dormant-core-regular":
      // Hanya produk yang biasanya laku rutin yang patut dicemaskan saat berhenti.
      why.push({
        t: `Penyumbang kelas ${u.abc} (${share} pendapatan) yang biasanya laku rutin, kini ${nfFull.format(u.dsl)} hari tidak terjual.`,
        tone: "neg",
      });
      break;
    case "dormant-core":
      // Kelas A/B karena beberapa pesanan besar, bukan karena laku rutin.
      why.push({ t: `Menyumbang ${share} pendapatan lewat ${nfFull.format(u.n1)} transaksi, terakhir ${dateText(u.last)}.`, tone: "neutral" });
      why.push({
        t: `Polanya ${u.pattern === "tipis" ? "jarang terjual" : u.pattern} — jeda ${nfFull.format(u.dsl)} hari belum tentu berarti berhenti.`,
        tone: "neutral",
      });
      break;
    case "dormant":
      why.push({ t: `Tidak terjual ${nfFull.format(u.dsl)} hari, sejak ${dateText(u.last)} (batas tidak aktif ${crit.dormantDays} hari).`, tone: "neg" });
      why.push({ t: `Kontribusinya kecil: ${share} pendapatan.`, tone: "neutral" });
      break;
    case "new-thin":
    case "new":
      why.push({ t: `Pertama terjual ${dateText(u.first)} (${u.ageM} bulan lalu).`, tone: "neutral" });
      why.push(
        rule.id === "new-thin"
          ? { t: `Baru ${n} transaksi — belum cukup untuk menilai.`, tone: "neutral" }
          : { t: `${nfFull.format(u.n1)} transaksi${hasCol("Branch") ? ` di ${u.b1} cabang` : ""} sejauh ini.`, tone: "pos" }
      );
      break;
    case "thin-old":
      why.push({
        t: u.censored
          ? `Hanya ${n} transaksi di kedua periode, padahal sudah terjual sejak awal data.`
          : `Hanya ${n} transaksi di kedua periode, padahal sudah ${u.ageM} bulan beredar.`,
        tone: "neg",
      });
      why.push({ t: `Kontribusinya kecil: ${share} pendapatan.`, tone: "neutral" });
      break;
    case "thin":
      why.push({ t: `Data tipis: hanya ${n} transaksi di kedua periode.`, tone: "neutral" });
      break;
    case "growing":
      why.push(
        u.r2 > 0
          ? { t: `Naik ${pctAbs(u.g)} dibanding periode pembanding.`, tone: "pos" }
          : { t: "Kembali terjual setelah kosong di periode pembanding.", tone: "pos" }
      );
      break;
    case "mature-core":
      why.push({ t: `Stabil (${signedPct(u.g)}) dan menyumbang ${share} pendapatan.`, tone: "pos" });
      break;
    case "mature":
      why.push({ t: `Stabil (${signedPct(u.g)}), tapi kontribusinya kecil: ${share}.`, tone: "neutral" });
      break;
    case "declining-core":
      why.push({ t: `Penyumbang kelas ${u.abc} (${share} pendapatan) yang turun ${pctAbs(u.g)}.`, tone: "neg" });
      if (!isRegular(u) && u.pattern !== "tipis") {
        watch.push(`Polanya ${PATTERN_WORD[u.pattern]}: sebagian penurunan bisa karena jadwal pesanan, bukan tren.`);
      }
      break;
    case "declining-project":
      why.push({ t: `Turun ${pctAbs(u.g)}, tapi polanya borongan.`, tone: "neg" });
      why.push({ t: "Penurunan bisa karena belum ada pesanan proyek, bukan karena tren.", tone: "neutral" });
      break;
    default:
      // declining
      why.push({ t: `Turun ${pctAbs(u.g)} dibanding periode pembanding.`, tone: "neg" });
      why.push({ t: `Kontribusinya kecil: ${share} pendapatan.`, tone: "neutral" });
  }

  /* --- penyebab utama perubahan, kalau bisa diurai --- */
  const main = mainDriver(u.drivers, delta);
  const activeStage = u.stage === "menurun" || u.stage === "tumbuh" || u.stage === "matang";
  if (main && activeStage && Math.abs(delta) > 0) {
    why.push({ t: driverSentence(main, delta > 0), tone: delta > 0 ? "pos" : "neg" });
  }
  if (hasCol("Branch") && (!main || main.key !== "br") && u.b1 > 0 && u.b2 >= 4 && u.b1 <= 0.6 * u.b2) {
    why.push({ t: `Cabang yang menjual turun dari ${u.b2} ke ${u.b1}.`, tone: "neg" });
  }

  /* --- hal yang perlu ditimbang sebelum mencabut --- */
  if (action === "cabut" || action === "bersihkan") {
    if (u.hasSubstitute && u.substitute) {
      const s2 = u.substitute;
      const tail = `${s2.label} (${rp(s2.r1)}, ${s2.g == null ? "baru" : signedPct(s2.g)})`;
      // Di tingkat kategori, saudara satu lini belum tentu bisa menggantikan.
      // Yang bisa dikatakan jujur hanya bahwa lininya tetap punya produk sehat.
      why.push({
        t:
          U.key === "Category"
            ? `${labelOf(parentField)} ${parentName} tetap punya produk yang sehat, mis. ${tail}.`
            : `Ada alternatif dalam ${parentName}: ${tail}.`,
        tone: "neutral",
      });
    } else if (u.activeSiblings === 0 && parentField) {
      watch.push(
        `Satu-satunya produk yang masih terjual di ${parentName}. Mencabutnya berarti keluar dari ${labelOf(parentField).toLowerCase()} ini.`
      );
    }
    if (hasCol("Branch") && u.b1 >= 5) watch.push(`Masih dijual di ${u.b1} cabang pada periode ini.`);
    if (u.pattern === "borongan" && action === "cabut") {
      watch.push("Pola borongan: satu pesanan proyek bisa mengubah gambaran ini.");
    }
  }
  if (u.overdue && (u.stage === "matang" || u.stage === "tumbuh" || u.stage === "menurun")) {
    watch.push(`Biasanya terjual tiap ±${nfFull.format(u.gap)} hari, sekarang sudah ${nfFull.format(u.dsl)} hari.`);
  }
  if (action === "perbaiki" && u.parentG != null && u.g != null && u.parentG > 0 && u.g < 0) {
    watch.push(
      `Produk lain di ${parentField ? parentName : "portofolio"} justru tumbuh ${pctAbs(u.parentG)} — masalahnya di produk ini, bukan pasarnya.`
    );
  }

  return { action, why, watch, rule: rule.id };
}

/* ======================================================= diagnosis produk */

/** Baris milik satu produk sampai tanggal acuan. */
export function unitLines(lines, unit, key, asOf) {
  const out = [];
  for (const ln of lines) if (ln[unit] === key && ln.__d <= asOf) out.push(ln);
  return out;
}

/**
 * Deret bulanan dari bulan pertama terjual sampai tanggal acuan, plus
 * rata-rata bergulir 12 bulan. Rata-rata dihitung dari bulan yang sudah
 * dilewati sejak peluncuran, jadi produk muda tidak tampak rendah palsu.
 */
export function monthlySeries(ls, fromM, toM) {
  const n = toM - fromM + 1;
  const r = new Array(n).fill(0);
  const tx = new Array(n).fill(0);
  const br = Array.from({ length: n }, () => new Set());
  for (const ln of ls) {
    const i = ln.__m - fromM;
    if (i < 0 || i >= n) continue;
    r[i] += ln.Revenue;
    tx[i] += 1;
    br[i].add(ln.Branch);
  }
  const ma = new Array(n);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += r[i];
    if (i >= 12) run -= r[i - 12];
    ma[i] = run / Math.min(12, i + 1);
  }
  let peakI = 0;
  for (let i = 1; i < n; i++) if (ma[i] > ma[peakI]) peakI = i;
  return {
    fromM,
    toM,
    months: Array.from({ length: n }, (_, i) => fromM + i),
    r,
    tx,
    br: br.map((s) => s.size),
    ma,
    peakI,
  };
}

/** Ringkasan P1/P2 untuk sekumpulan baris (pendapatan, qty, transaksi, cabang). */
export function windowStats(ls, win) {
  const m = { r1: 0, r2: 0, q1: 0, q2: 0, n1: 0, n2: 0, b1: 0, b2: 0 };
  const s1 = new Set();
  const s2 = new Set();
  for (const ln of ls) {
    const d = ln.__d;
    if (d >= win.p1.from && d <= win.p1.to) {
      m.r1 += ln.Revenue;
      m.q1 += ln.quantity;
      m.n1 += 1;
      s1.add(ln.Branch);
    }
    if (d >= win.p2.from && d <= win.p2.to) {
      m.r2 += ln.Revenue;
      m.q2 += ln.quantity;
      m.n2 += 1;
      s2.add(ln.Branch);
    }
  }
  m.b1 = s1.size;
  m.b2 = s2.size;
  m.g = m.r2 > 0 ? (m.r1 - m.r2) / m.r2 : null;
  return m;
}

/**
 * Di dimensi mana perubahan paling "tidak merata"?
 *
 * Kalau semua cabang turun 20%, cabang tidak menjelaskan apa-apa — itu
 * penurunan menyeluruh. Kalau satu cabang menanggung seluruh penurunan,
 * cabanglah jawabannya. Ukurannya:
 *
 *   daya jelaskan = (3 terbesar dari |Δᵢ − P2ᵢ·g|) / Σ |Δᵢ|
 *
 * Δᵢ  = perubahan anggota i,  g = pertumbuhan total.
 * Δᵢ − P2ᵢ·g adalah bagian perubahan yang TIDAK bisa dijelaskan oleh
 * "semua ikut naik/turun bersama". Nol berarti semua anggota bergerak
 * proporsional; mendekati 1 berarti sedikit anggota menanggung semuanya.
 */
export function explainDims(ls, dims, win, labels) {
  const out = [];
  for (const dim of dims) {
    const acc = new Map();
    for (const ln of ls) {
      const d = ln.__d;
      const in1 = d >= win.p1.from && d <= win.p1.to;
      const in2 = d >= win.p2.from && d <= win.p2.to;
      if (!in1 && !in2) continue;
      const k = ln[dim];
      let e = acc.get(k);
      if (!e) acc.set(k, (e = { key: k, r1: 0, r2: 0 }));
      if (in1) e.r1 += ln.Revenue;
      if (in2) e.r2 += ln.Revenue;
    }
    const members = Array.from(acc.values());
    let T1 = 0;
    let T2 = 0;
    for (const m of members) {
      m.d = m.r1 - m.r2;
      m.g = m.r2 > 0 ? m.d / m.r2 : null;
      m.label = valueLabel(dim, m.key, labels);
      T1 += m.r1;
      T2 += m.r2;
    }
    const dT = T1 - T2;
    const gT = T2 > 0 ? dT / T2 : null;
    let gross = 0;
    const excess = [];
    for (const m of members) {
      gross += Math.abs(m.d);
      m.excess = gT == null ? m.d : m.d - m.r2 * gT;
      excess.push(Math.abs(m.excess));
    }
    /* Hanya TIGA penyimpangan terbesar yang dihitung. Tanpa batas ini,
       dimensi dengan ribuan anggota (kode barang) selalu menang, karena
       ribuan perubahan kecil yang tersebar juga "tidak proporsional" —
       padahal tidak ada satu pun yang bisa ditunjuk sebagai penyebab. */
    excess.sort((a, b) => b - a);
    const top3 = (excess[0] || 0) + (excess[1] || 0) + (excess[2] || 0);
    members.sort((a, b) => b.d - a.d);
    const n = members.length;
    out.push({
      dim,
      label: labelOf(dim),
      members,
      T1,
      T2,
      dT,
      n,
      // Dimensi dengan satu anggota tidak bisa menjelaskan apa pun.
      power: n < 2 || gross === 0 ? 0 : Math.min(1, top3 / gross),
      sentence: dimSentence(members, dT),
    });
  }
  return out.sort((a, b) => b.power - a.power);
}

/** "Penurunan terutama dari Jakarta (−Rp 112 jt) dan Surabaya (−Rp 52 jt); diimbangi …" */
export function dimSentence(members, dT) {
  if (!members.length || dT === 0) return "Tidak ada perubahan.";
  const down = dT < 0;
  const same = members.filter((m) => (down ? m.d < 0 : m.d > 0)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const opp = members.filter((m) => (down ? m.d > 0 : m.d < 0)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const sumSame = same.reduce((t, m) => t + m.d, 0);
  const top = same.slice(0, 2);
  const topShare = sumSame ? top.reduce((t, m) => t + m.d, 0) / sumSame : 0;
  const pieces = top.map((m) => `${m.label} (${m.d > 0 ? "+" : "−"}${rp(Math.abs(m.d))})`);
  let s = `${down ? "Penurunan" : "Kenaikan"} terutama dari ${pieces.join(" dan ")}`;
  if (same.length > 2) s += ` — ${nfPct.format(topShare)} dari seluruh ${down ? "penurunan" : "kenaikan"}`;
  s += ".";
  if (opp.length) {
    const o = opp[0];
    s += ` Diimbangi ${o.label} (${o.d > 0 ? "+" : "−"}${rp(Math.abs(o.d))}).`;
  }
  return s;
}

/**
 * Harga · Volume · Produk baru · Produk berhenti, di tingkat kode barang.
 *
 *   harga   = Σ q₁ (p₁ − p₀)            untuk kode yang terjual di kedua periode
 *   volume  = Σ (q₁ − q₀) p₀            idem
 *   baru    = Σ pendapatan P1           kode yang tidak terjual di P2
 *   berhenti= −Σ pendapatan P2          kode yang tidak terjual di P1
 *
 * Keempatnya berjumlah persis selisih total. Volume dihitung per kode lalu
 * dijumlah dalam rupiah, jadi aman walau satuannya berbeda (roll, lembar, pcs).
 */
export function priceVolume(ls, win) {
  const acc = new Map();
  for (const ln of ls) {
    const d = ln.__d;
    const in1 = d >= win.p1.from && d <= win.p1.to;
    const in2 = d >= win.p2.from && d <= win.p2.to;
    if (!in1 && !in2) continue;
    let e = acc.get(ln.Item_Code);
    if (!e) acc.set(ln.Item_Code, (e = { r1: 0, r2: 0, q1: 0, q2: 0 }));
    if (in1) {
      e.r1 += ln.Revenue;
      e.q1 += ln.quantity;
    }
    if (in2) {
      e.r2 += ln.Revenue;
      e.q2 += ln.quantity;
    }
  }
  const out = { price: 0, volume: 0, added: 0, lost: 0, nAdded: 0, nLost: 0, nCont: 0, T1: 0, T2: 0 };
  for (const e of acc.values()) {
    out.T1 += e.r1;
    out.T2 += e.r2;
    if (e.q1 > 0 && e.q2 > 0 && e.r2 > 0) {
      const p0 = e.r2 / e.q2;
      out.price += e.r1 - e.q1 * p0;
      out.volume += (e.q1 - e.q2) * p0;
      out.nCont++;
    } else if (e.r1 > 0) {
      out.added += e.r1;
      out.nAdded++;
    } else if (e.r2 > 0) {
      out.lost -= e.r2;
      out.nLost++;
    }
  }
  return out;
}

/**
 * Jembatan pelanggan: pelanggan hilang · pelanggan baru · pelanggan bertahan.
 * Hanya dijalankan kalau ID pelanggan bisa dipercaya.
 */
export function customerBridge(ls, win) {
  const c = new Map();
  for (const ln of ls) {
    const d = ln.__d;
    const in1 = d >= win.p1.from && d <= win.p1.to;
    const in2 = d >= win.p2.from && d <= win.p2.to;
    if (!in1 && !in2) continue;
    let e = c.get(ln.id_customer);
    if (!e) c.set(ln.id_customer, (e = { r1: 0, r2: 0 }));
    if (in1) e.r1 += ln.Revenue;
    if (in2) e.r2 += ln.Revenue;
  }
  const b = {
    lost: { n: 0, r: 0 },
    added: { n: 0, r: 0 },
    kept: { n: 0, r1: 0, r2: 0 },
    n1: 0,
    top1: 0,
    T1: 0,
  };
  let top = 0;
  for (const e of c.values()) {
    if (e.r1 > 0) {
      b.n1++;
      b.T1 += e.r1;
      if (e.r1 > top) top = e.r1;
    }
    if (e.r1 > 0 && e.r2 > 0) {
      b.kept.n++;
      b.kept.r1 += e.r1;
      b.kept.r2 += e.r2;
    } else if (e.r1 > 0) {
      b.added.n++;
      b.added.r += e.r1;
    } else if (e.r2 > 0) {
      b.lost.n++;
      b.lost.r += e.r2;
    }
  }
  b.top1 = b.T1 ? top / b.T1 : 0;
  return b;
}

/**
 * Indikasi perpindahan ke produk sejenis.
 *
 * Di setiap cabang tempat produk ini turun, berapa kenaikan produk lain di
 * induk yang sama? Yang dihitung hanya kenaikan sampai sebesar penurunannya
 * sendiri, supaya pertumbuhan alami saudara tidak tercatat sebagai
 * perpindahan. Ini INDIKASI, bukan bukti — tanpa data pelanggan yang andal,
 * tidak bisa dipastikan pembelinya orang yang sama.
 */
export function switchingSignal(lines, { unit, key, parentField, parentValue, win }) {
  const byBr = new Map();
  for (const ln of lines) {
    if (ln.__d > win.asOf) continue;
    if (parentField && ln[parentField] !== parentValue) continue;
    const d = ln.__d;
    const in1 = d >= win.p1.from && d <= win.p1.to;
    const in2 = d >= win.p2.from && d <= win.p2.to;
    if (!in1 && !in2) continue;
    let e = byBr.get(ln.Branch);
    if (!e) byBr.set(ln.Branch, (e = { branch: ln.Branch, s1: 0, s2: 0, o1: 0, o2: 0 }));
    const self = ln[unit] === key;
    if (in1) self ? (e.s1 += ln.Revenue) : (e.o1 += ln.Revenue);
    if (in2) self ? (e.s2 += ln.Revenue) : (e.o2 += ln.Revenue);
  }
  let loss = 0;
  let caught = 0;
  let nLossBranches = 0;
  const rows = [];
  for (const e of byBr.values()) {
    e.ds = e.s1 - e.s2;
    e.do = e.o1 - e.o2;
    if (e.ds < 0) {
      nLossBranches++;
      loss += -e.ds;
      caught += Math.min(-e.ds, Math.max(0, e.do));
    }
    if (e.s1 > 0 || e.s2 > 0) rows.push(e);
  }
  rows.sort((a, b) => a.ds - b.ds);
  return { rows, loss, caught, ratio: loss ? caught / loss : null, nLossBranches };
}

/** Pendapatan bulanan induk (atau seluruh portofolio) untuk perbandingan tren. */
export function parentMonthly(lines, parentField, parentValue, fromM, toM) {
  const n = toM - fromM + 1;
  const r = new Array(n).fill(0);
  for (const ln of lines) {
    if (parentField && ln[parentField] !== parentValue) continue;
    const i = ln.__m - fromM;
    if (i >= 0 && i < n) r[i] += ln.Revenue;
  }
  return r;
}

/** Rata-rata bergulir 12 bulan dari deret bulanan. */
export function rolling12(r) {
  const out = new Array(r.length);
  let run = 0;
  for (let i = 0; i < r.length; i++) {
    run += r[i];
    if (i >= 12) run -= r[i - 12];
    out[i] = run / Math.min(12, i + 1);
  }
  return out;
}

/** Penjelasan tahap dalam satu kalimat, untuk kepala halaman Diagnosis. */
export function stageSentence(u, crit, win) {
  const w = win.months ? `${win.months} bulan terakhir` : "periode ini";
  const prev = win.months ? `${win.months} bulan sebelumnya` : "periode pembanding";
  switch (u.stage) {
    case "baru":
      return `Pertama terjual ${dateText(u.first)}, ${u.ageM} bulan lalu — masih dalam masa perkenalan (≤ ${crit.newMonths} bulan).`;
    case "tidur":
      return `Terakhir terjual ${dateText(u.last)}, ${nfFull.format(u.dsl)} hari lalu — melewati batas ${crit.dormantDays} hari.`;
    case "tumbuh":
      return u.r2 > 0
        ? `Pendapatan ${w} naik ${pctAbs(u.g)} dibanding ${prev}.`
        : `Kembali terjual setelah tidak ada penjualan di ${prev}.`;
    case "menurun":
      return `Pendapatan ${w} turun ${pctAbs(u.g)} dibanding ${prev}.`;
    default:
      return `Pendapatan ${w} bergerak ${signedPct(u.g)} dibanding ${prev}, masih dalam ±${nfPct.format(crit.growth)}.`;
  }
}

export { EMPTY };
