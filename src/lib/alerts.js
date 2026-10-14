/* ============================================================================
   Mesin peringatan
   ----------------------------------------------------------------------------
   Memindai data dan mengumpulkan hal yang perlu dilihat SEKARANG:

   1. Produk andalan (kelas A/B) yang berhenti terjual atau turun tajam
   2. Cabang, wilayah, dan kanal yang anjlok, berhenti, atau melonjak
   3. Produk baru yang melonjak, lonjakan mendadak, produk yang bangkit lagi
   4. Perubahan tahap siklus hidup dibanding beberapa bulan lalu, termasuk
      produk yang tampaknya tergeser saudaranya
   5. Lini & kategori yang anjlok atau melonjak
   6. Harga bersih yang tergerus diskon, ketergantungan pada satu cabang
      atau satu pelanggan
   7. Catatan data (data terlambat, transaksi tanpa produk)

   Semua perubahan dihitung pada PERIODE PANTAU (N hari terakhir sampai
   tanggal acuan) dibanding PEMBANDING (periode yang sama tahun lalu, atau
   N hari tepat sebelumnya). Kelas ABC dan tahap siklus hidup tetap diambil
   dari penilaian portofolio (jendela P1/P2), supaya istilahnya sama dengan
   halaman Portofolio dan Diagnosis.

   Fungsi murni tanpa React. Setiap aturan tercatat di ALERT_RULES — satu
   sumber untuk mesin dan untuk penjelasan di halaman — dan setiap
   peringatan membawa langkah hitungnya sendiri (`calc`), jadi angkanya bisa
   dicocokkan dengan Excel atau SQL.
   ========================================================================== */

import { ALERT_DEFAULTS, DIM_FAMILY, dimOk, hasCol, labelOf, unitDef } from "./config.js";
import { STAGE_BY_KEY } from "./color.js";
import {
  dLabel,
  daysBetween,
  endOfMonth,
  fmt,
  monthIndex,
  nfFull,
  nfPct,
  shiftDays,
  shiftMonthsSafe,
  shiftYearSafe,
  signedPct,
  toJs,
} from "./format.js";
import { analysisWindow, buildPortfolio, coverage, driverSentence, isUnknownKey, lmdiDrivers, mainDriver, valueLabel } from "./product.js";

/* ------------------------------------------------------------- format kecil */

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const rp = (v) => fmt(v, "currency", true);
const dateText = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");
const rangeText = (r) => `${dateText(r.from)} – ${dateText(r.to)}`;
// Di atas 100% tanpa desimal (391%, bukan 391,2%), sama dengan lencana naik/turun.
const nfPct0 = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 });
const pctAbs = (p) => (Math.abs(p) >= 1 ? nfPct0 : nfPct).format(Math.abs(p));
const pct = (p) => nfPct.format(p);
const times = (x) => `${nf1.format(x)}×`;
const days = (n) => `${nfFull.format(n)} hari`;
const plusRp = (v) => `${v >= 0 ? "+" : "−"}${rp(Math.abs(v))}`;
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** Kata untuk tingkat produk yang sedang dipakai ("kategori", "produk", …). */
const unitWord = (x) => x?.plural || "produk";

/* ------------------------------------------------------- tingkat & kelompok */

/** Tingkat peringatan. Warna status SELALU tampil bersama ikon dan label. */
export const SEVERITIES = [
  { key: "kritis", label: "Kritis", tone: "red", brief: "Kehilangan besar — lihat hari ini", hint: "Kehilangan besar yang sedang terjadi — sebaiknya dilihat hari ini." },
  { key: "cek", label: "Perlu dicek", tone: "amber", brief: "Memburuk — cari penyebabnya", hint: "Gejala memburuk yang belum tentu masalah — periksa penyebabnya." },
  { key: "peluang", label: "Peluang", tone: "teal", brief: "Sedang naik — siapkan stoknya", hint: "Sesuatu sedang naik — pastikan stok, harga, dan dukungannya." },
  { key: "info", label: "Info", tone: "blue", brief: "Konteks & kualitas data", hint: "Konteks, risiko struktural, atau kualitas data yang memengaruhi bacaan angka." },
];
export const SEVERITY_BY_KEY = Object.fromEntries(SEVERITIES.map((s) => [s.key, s]));
const SEV_RANK = { kritis: 0, cek: 1, peluang: 2, info: 3 };

/** Kelompok di halaman, berurutan dari yang paling mendesak. */
export const ALERT_GROUPS = [
  { key: "andalan", title: "Produk andalan bermasalah", sub: "Produk kelas A dan B yang berhenti terjual atau turun tajam.", tone: "red" },
  { key: "wilayah", title: "Cabang, wilayah & kanal", sub: "Tempat penjualan yang anjlok, berhenti bertransaksi, atau melonjak.", tone: "amber" },
  { key: "peluang", title: "Produk baru & lonjakan", sub: "Produk baru yang cepat naik, lonjakan mendadak, dan produk yang laku lagi.", tone: "teal" },
  { key: "siklus", title: "Perubahan siklus hidup", sub: "Produk yang berpindah tahap dibanding beberapa bulan lalu, dan yang tampak tergeser saudaranya.", tone: "violet" },
  { key: "kelompok", title: "Lini & kategori", sub: "Kelompok produk yang anjlok, berhenti, atau melonjak.", tone: "blue" },
  { key: "risiko", title: "Harga & ketergantungan", sub: "Diskon yang makin dalam dan produk andalan yang bergantung pada satu cabang atau pelanggan.", tone: "mauve" },
  { key: "data", title: "Catatan data", sub: "Hal di data yang perlu diketahui sebelum membaca peringatan lain.", tone: "brand" },
];
export const GROUP_BY_KEY = Object.fromEntries(ALERT_GROUPS.map((g) => [g.key, g]));

/** Dimensi yang dipantau sebagai tempat (cabang, kanal) dan kelompok produk. */
export const ALERT_DIMS = ["Branch", "branch_area", "Channel", "Lini_Produk", "Category"];
const dimGroup = (dim) => (DIM_FAMILY[dim] === "produk" ? "kelompok" : "wilayah");

/* --------------------------------------------------------------- aturan    */

/**
 * Katalog aturan — satu sumber untuk mesin dan halaman. `when` = syarat
 * dalam kalimat (memakai ambang yang sedang berlaku), `level` = cara
 * menentukan tingkat. Urutan di sini = prioritas saat beberapa aturan
 * mengenai produk/cabang yang sama: yang paling atas jadi judul, sisanya
 * tampil sebagai catatan tambahan, supaya satu subjek tidak muncul dua kali.
 */
export const ALERT_RULES = [
  {
    key: "silent",
    group: "andalan",
    polarity: "neg",
    title: "Produk andalan berhenti terjual",
    when: (s, c, x) =>
      `${cap(unitWord(x))} kelas A atau B (menurut pendapatan P1) yang sudah lama tidak terjual dibanding kebiasaannya. Batas = maks(${days(s.silentDays)}, ${nf1.format(s.silentFactor)}× jeda normal); jeda normal = median jarak antarhari berpenjualan dalam 24 bulan terakhir. Pola Sesekali dan Data tipis memakai batas minimal ${days(c.dormantDays)} (batas Tidak aktif), pola Borongan minimal ${days(c.projectGraceDays)} (tenggang proyek), karena diam lama wajar bagi mereka. Yang kurang dari 6 hari berpenjualan dalam 24 bulan tidak dinilai.`,
    level: "Kritis untuk kelas A berpola Stabil/Fluktuatif — biasanya laku rutin, lalu tiba-tiba berhenti; selain itu Perlu dicek.",
  },
  {
    key: "drop",
    group: "andalan",
    polarity: "neg",
    title: "Produk andalan turun tajam",
    when: (s, c, x) =>
      `${cap(unitWord(x))} kelas A atau B yang pendapatan periode pantaunya turun lebih dari ${pct(s.dropPct)} dibanding pembanding, dengan minimal ${s.minTx} transaksi di pembanding.`,
    level: "Kritis bila kelas A dan turun ≥ 50%; selain itu Perlu dicek.",
  },
  {
    key: "stageNeg",
    group: "siklus",
    polarity: "neg",
    title: "Tahap siklus memburuk",
    when: (s, c, x) =>
      `Tahap sekarang dibanding tahap ${x.shiftText}. Dicatat: (1) ${unitWord(x)} yang dulu Baru lalu menjadi Menurun atau Tidak aktif — produk baru yang gagal berkembang (hanya yang punya minimal ${c.minTx} transaksi; yang laku 1–3 kali lebih mirip pesanan sekali); (2) ${unitWord(x)} kelas A/B (sekarang atau dulu) yang pindah ke Menurun, atau ke Tidak aktif dengan diam ≥ ${nf1.format(s.silentFactor)}× jeda normalnya; (3) Tumbuh → Matang untuk kelas A (pertumbuhan berhenti). Pola Borongan tidak dihitung untuk (2) dan (3): naik-turunnya mengikuti ada-tidaknya proyek.`,
    level: "Kritis bila kelas A berpola Stabil/Fluktuatif menjadi Tidak aktif; Info untuk Tumbuh → Matang; selain itu Perlu dicek.",
  },
  {
    key: "cannibal",
    group: "siklus",
    polarity: "neg",
    title: "Tampak tergeser produk saudara",
    when: (s, c, x) =>
      `${cap(unitWord(x))} kelas A/B berstatus Menurun yang penurunannya (P1 dibanding P2) setidaknya separuhnya tertutup kenaikan satu ${unitWord(x)} saudara (induk yang sama) yang sedang naik ≥ ${pct(c.growth)}. Tanda pembeli mungkin beralih — bukan bukti. Tidak dihitung di tingkat paling atas (tanpa induk).`,
    level: "Perlu dicek.",
  },
  {
    key: "newSurge",
    group: "peluang",
    polarity: "pos",
    title: "Produk baru melonjak",
    when: (s, c, x) =>
      `${cap(unitWord(x))} berstatus Baru (pertama terjual ≤ ${c.newMonths} bulan lalu dan belum tidak aktif) dengan minimal 2 transaksi di periode pantau, yang (a) sudah masuk kelas A periode pantau — ${unitWord(x)} teratas penyusun ${pct(c.abcA)} pendapatan periode pantau — dan paruh kedua periode pantaunya tidak lebih kecil dari paruh pertama, atau (b) penjualan paruh kedua periode pantau ≥ ${times(1 + s.surgePct)} paruh pertama.`,
    level: "Peluang.",
  },
  {
    key: "surge",
    group: "peluang",
    polarity: "pos",
    title: "Lonjakan penjualan",
    when: (s, c, x) =>
      `${cap(unitWord(x))} lama yang pendapatan periode pantaunya ≥ ${times(1 + s.surgePct)} pembanding dan sekaligus ≥ 1,5× laju total semua ${unitWord(x)} (supaya kenaikan yang hanya ikut arus tidak dihitung), minimal ${s.minTx} transaksi di kedua periode, dan nilainya ≥ ${nfPct.format(s.minShareProduct)} dari total periode pantau. Kalau satu transaksi menyumbang lebih dari separuh kenaikan, diberi catatan "mungkin pesanan sekali".`,
    level: "Peluang.",
  },
  {
    key: "revive",
    group: "peluang",
    polarity: "pos",
    title: "Laku lagi setelah lama diam",
    when: (s, c, x) =>
      `${cap(unitWord(x))} yang kembali terjual di periode pantau setelah tidak terjual ≥ ${days(c.dormantDays)} (atau ≥ 3× jeda normalnya, mana yang lebih panjang), dengan minimal 2 transaksi dan nilai ≥ ${nfPct.format(s.minShareProduct)} dari total periode pantau.`,
    level: "Peluang.",
  },
  {
    key: "stagePos",
    group: "siklus",
    polarity: "pos",
    title: "Tahap siklus membaik",
    when: (s, c, x) =>
      `Tahap sekarang dibanding tahap ${x.shiftText}: pindah ke Tumbuh (dari Baru, Matang, Menurun, atau Tidak aktif), atau Menurun → Matang (penurunan berhenti). Untuk ${unitWord(x)} kelas A/B sekarang atau sebelumnya; pola Borongan hanya dihitung bila sebelumnya Baru.`,
    level: "Peluang; Info untuk Menurun → Matang.",
  },
  {
    key: "dimSilent",
    group: "wilayah",
    polarity: "neg",
    title: "Berhenti bertransaksi",
    when: (s) =>
      `Cabang, wilayah, kanal, lini, atau kategori yang tidak punya transaksi ≥ ${days(s.silentDays)} dan ≥ ${nf1.format(s.silentFactor)}× jeda normalnya (median jarak antarhari bertransaksi, 24 bulan terakhir; minimal 6 hari bertransaksi).`,
    level: "Kritis bila porsinya di P1 ≥ 1% dan diamnya belum lebih dari 120 hari (masalah yang masih baru); selain itu Perlu dicek.",
  },
  {
    key: "dimDrop",
    group: "wilayah",
    polarity: "neg",
    title: "Anjlok",
    when: (s) =>
      `Cabang, wilayah, kanal, lini, atau kategori yang pendapatan periode pantaunya turun lebih dari ${pct(s.dropPct)} dibanding pembanding. Hanya anggota yang di pembanding punya minimal ${s.minTx} transaksi dan ≥ ${nfPct.format(s.minShareDim)} dari total, supaya anggota yang sangat kecil tidak membanjiri daftar. Pertumbuhan total selalu ditampilkan sebagai pembanding.`,
    level: "Kritis bila turun ≥ 50% atau penurunannya ≥ 5% dari total pembanding; selain itu Perlu dicek.",
  },
  {
    key: "dimLag",
    group: "wilayah",
    polarity: "neg",
    title: "Tertinggal dari total",
    when: (s) =>
      `Anggota yang tidak turun sebanyak itu, tetapi lajunya ≤ ${pct(1 - s.dropPct)} laju total — mis. total naik 2× sementara cabang ini hanya 1,2×. Porsinya terhadap total sedang menyusut. Syarat ukuran sama seperti "Anjlok".`,
    level: "Perlu dicek.",
  },
  {
    key: "dimSurge",
    group: "wilayah",
    polarity: "pos",
    title: "Melonjak",
    when: (s) =>
      `Anggota yang naik ≥ ${pct(s.surgePct)} dibanding pembanding dan sekaligus ≥ 1,5× laju total, dengan syarat ukuran yang sama seperti "Anjlok".`,
    level: "Peluang.",
  },
  {
    key: "price",
    group: "risiko",
    polarity: "risk",
    title: "Harga bersih turun",
    when: (s, c, x) =>
      x.hasPriceList
        ? `${cap(unitWord(x))} kelas A/B yang harga bersihnya — pendapatan ÷ (qty × harga daftar) — di periode pantau turun lebih dari ${pct(s.priceDrop)} dibanding pembanding: diskon makin dalam. Minimal ${s.minTx} transaksi berharga daftar di kedua periode.`
        : `Tanpa kolom harga daftar, dihitung hanya di tingkat kode barang: harga rata-rata per unit (pendapatan ÷ qty) kode barang kelas A/B turun lebih dari ${pct(s.priceDrop)}, minimal ${s.minTx} transaksi di kedua periode.`,
    level: "Perlu dicek.",
  },
  {
    key: "concentration",
    group: "risiko",
    polarity: "risk",
    title: "Bergantung pada satu cabang",
    when: (s, c, x) =>
      `${cap(unitWord(x))} kelas A yang dijual di minimal 3 cabang tetapi ≥ ${pct(s.concentration)} pendapatan P1-nya berasal dari satu cabang. Yang memang hanya dijual di 1–2 cabang tidak dihitung.`,
    level: "Info.",
  },
  {
    key: "customer",
    group: "risiko",
    polarity: "risk",
    title: "Bergantung pada satu pelanggan",
    when: (s, c, x) => `${cap(unitWord(x))} kelas A yang ≥ ${pct(s.customerShare)} pendapatan P1-nya berasal dari satu ID pelanggan. Hanya dihitung bila ID pelanggan di data bisa dipercaya.`,
    level: "Info.",
  },
  {
    key: "unknown",
    group: "data",
    polarity: "data",
    title: "Transaksi tanpa produk yang jelas",
    when: () => `Pendapatan periode pantau yang tingkat produknya kosong atau "tidak diketahui" (mis. kode listing yang belum dipetakan) ≥ 1% dari total.`,
    level: "Info.",
  },
  {
    key: "stale",
    group: "data",
    polarity: "data",
    title: "Data belum diperbarui",
    when: () => "Tanggal transaksi terakhir di data lebih dari 7 hari sebelum hari ini. Semua peringatan dihitung per tanggal terakhir itu.",
    level: "Info.",
  },
];
export const RULE_BY_KEY = Object.fromEntries(ALERT_RULES.map((r, i) => [r.key, { ...r, order: i }]));

/** Ambang yang diatur di panel "Atur ambang" (periode pantau & pembanding diatur di kartu utama). */
export const ALERT_THRESHOLD_KEYS = [
  "silentDays",
  "silentFactor",
  "dropPct",
  "surgePct",
  "minTx",
  "minShareDim",
  "minShareProduct",
  "priceDrop",
  "concentration",
  "customerShare",
];

/** Batas wajar tiap pengaturan — dipakai panel dan saat membaca pengaturan tersimpan. */
const LIMITS = {
  watchDays: [7, 365, true],
  silentDays: [7, 365, true],
  silentFactor: [1, 20],
  dropPct: [0.05, 0.95],
  surgePct: [0.1, 10],
  minTx: [1, 100, true],
  minShareDim: [0, 0.2],
  minShareProduct: [0, 0.1],
  priceDrop: [0.01, 0.9],
  concentration: [0.3, 1],
  customerShare: [0.2, 1],
};

/**
 * Rapikan pengaturan dari mana pun (tersimpan di peramban, diketik pengguna):
 * angka di luar batas dijepit, kunci tak dikenal dibuang, sisanya bawaan.
 */
export function normalizeAlertCfg(raw) {
  const out = { ...ALERT_DEFAULTS, off: [] };
  if (!raw || typeof raw !== "object") return out;
  for (const [k, [lo, hi, int]] of Object.entries(LIMITS)) {
    const v = Number(raw[k]);
    if (raw[k] != null && Number.isFinite(v)) out[k] = int ? Math.round(Math.max(lo, Math.min(hi, v))) : Math.max(lo, Math.min(hi, v));
  }
  if (raw.compare === "yoy" || raw.compare === "prev") out.compare = raw.compare;
  if (Array.isArray(raw.off)) out.off = Array.from(new Set(raw.off.filter((k) => RULE_BY_KEY[k])));
  return out;
}

/** Ambang mana yang dipakai aturan mana — supaya panel hanya menampilkan yang relevan. */
export const THRESHOLD_RULES = {
  silentDays: ["silent", "dimSilent"],
  silentFactor: ["silent", "dimSilent", "stageNeg"],
  dropPct: ["drop", "dimDrop", "dimLag"],
  surgePct: ["newSurge", "surge", "dimSurge"],
  minTx: ["drop", "surge", "dimDrop", "dimLag", "dimSurge", "price"],
  minShareDim: ["dimDrop", "dimLag", "dimSurge"],
  minShareProduct: ["surge", "revive"],
  priceDrop: ["price"],
  concentration: ["concentration"],
  customerShare: ["customer"],
};

/* ------------------------------------------------------------ periode     */

/**
 * Periode pantau dan pembandingnya.
 *
 * Tanggal acuan = akhir P1 (sama dengan halaman produk lain), tetapi tidak
 * pernah melewati tanggal terakhir di data: kalau P1 diatur sampai masa
 * depan, hari-hari tanpa data akan terbaca sebagai "tidak terjual".
 */
export function alertWindows(win, settings) {
  const s = { ...ALERT_DEFAULTS, ...settings };
  const N = Math.max(7, Math.round(s.watchDays));
  const dataTo = win.dataTo || win.asOf;
  const dataFrom = win.dataFrom || null;
  const ref = win.asOf < dataTo ? win.asOf : dataTo;
  const R = { from: shiftDays(ref, -(N - 1)), to: ref };
  const yoy = { from: shiftYearSafe(R.from, -1), to: shiftYearSafe(R.to, -1) };
  const prev = { from: shiftDays(R.from, -N), to: shiftDays(R.from, -1) };
  const cov = (r) => coverage(r, dataFrom, dataTo);
  const notes = [];

  if (win.asOf > dataTo) {
    notes.push({
      key: "asof",
      level: "info",
      text: `Tanggal acuan (${dateText(win.asOf)}) melewati akhir data, jadi peringatan dihitung per ${dateText(dataTo)} — tanggal transaksi terakhir.`,
    });
  }

  let mode = s.compare === "prev" ? "prev" : "yoy";
  let B = mode === "prev" ? prev : yoy;
  const okR = cov(R) >= 0.98;
  if (!okR) {
    notes.push({
      key: "coverR",
      level: "warn",
      text: `Periode pantau (${rangeText(R)}) tidak tertutup penuh oleh data, yang baru mulai ${dateText(dataFrom)}. Peringatan perubahan (turun, naik, lonjakan, harga) dimatikan; pendekkan periode pantau.`,
    });
  } else if (cov(B) < 0.98) {
    if (mode === "yoy" && cov(prev) >= 0.98) {
      notes.push({
        key: "coverB",
        level: "info",
        text: `Data tahun lalu belum lengkap untuk ${rangeText(yoy)}, jadi pembanding diganti ${days(N)} tepat sebelumnya (${rangeText(prev)}). Waspadai pola musiman.`,
      });
      mode = "prev";
      B = prev;
    } else {
      notes.push({
        key: "coverB",
        level: "warn",
        text: `Pembanding (${rangeText(B)}) tidak tertutup penuh oleh data. Peringatan perubahan dimatikan; pendekkan periode pantau atau ganti pembanding.`,
      });
    }
  }
  const okChange = okR && cov(B) >= 0.98;
  const months = Math.max(1, Math.round(N / 30.44));
  return {
    N,
    ref,
    R,
    B,
    mode,
    okChange,
    notes,
    months,
    half: shiftDays(R.from, Math.floor(N / 2)),
    label: `${days(N)} terakhir`,
    cmpLabel: mode === "yoy" ? "periode yang sama tahun lalu" : `${days(N)} sebelumnya`,
  };
}

/** Jendela analisis yang sama, digeser mundur — untuk membaca tahap "dulu". */
export function shiftedWindow(win, months, nDays) {
  if (win.kind === "months") {
    const back = shiftMonthsSafe(win.asOf, -months);
    const asOf = win.asOf === endOfMonth(win.asOf) ? endOfMonth(back) : back;
    return analysisWindow({ mode: String(win.months), asOf, dataFrom: win.dataFrom, dataTo: win.dataTo });
  }
  const sh = (r) => ({ from: shiftDays(r.from, -nDays), to: shiftDays(r.to, -nDays) });
  const p1 = sh(win.p1);
  return analysisWindow({
    mode: "global",
    asOf: p1.to,
    p1,
    compare: { p1, p2: sh(win.p2) },
    dataFrom: win.dataFrom,
    dataTo: win.dataTo,
  });
}

/**
 * Portofolio "dulu" — penilaian yang sama, digeser mundur sepanjang periode
 * pantau — untuk membaca perubahan tahap. Ini bagian termahal, jadi halaman
 * menyimpannya terpisah: mengubah ambang lain tidak menghitungnya ulang.
 */
export function previousPortfolio({ lines, portfolio, win, crit, labels, watchDays }) {
  const N = Math.max(7, Math.round(watchDays ?? ALERT_DEFAULTS.watchDays));
  const months = Math.max(1, Math.round(N / 30.44));
  const prevWin = shiftedWindow(win, months, N);
  const ok = prevWin.cover2 >= 0.95 && (!win.dataFrom || prevWin.p1.from >= win.dataFrom);
  return {
    N,
    unit: portfolio.unit,
    win,
    crit,
    prevWin,
    ok,
    pf: ok ? buildPortfolio(lines, { unit: portfolio.unit, win: prevWin, crit, labels, customersReliable: false }) : null,
  };
}

/* ------------------------------------------------------------ pembantu    */

/** Median jarak (selisih hari) antarhari bertransaksi — 1 = laku setiap hari.
    Rumusnya sama dengan `gap` di mesin produk, supaya kedua angka sebanding. */
function medianGap(daySet) {
  if (!daySet || daySet.size < 6) return null;
  const arr = Array.from(daySet).sort();
  const gaps = [];
  for (let i = 1; i < arr.length; i++) gaps.push(daysBetween(arr[i - 1], arr[i]) - 1);
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

const isAB = (u) => !!u && (u.abc === "A" || u.abc === "B");
/** Pola yang biasanya laku rutin — diam lama pada pola ini benar-benar janggal. */
const REGULAR = new Set(["stabil", "fluktuatif"]);
const growth = (r, b) => (b > 0 ? (r - b) / b : null);

/** Deret bulanan `n` bulan yang berakhir di bulan `endM`. */
function seriesOf(mon, endM, n = 15) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (mon && mon.get(endM - n + 1 + i)) || 0;
  return out;
}

function newAcc() {
  return {
    r: 0, // pendapatan periode pantau
    n: 0, // transaksi periode pantau
    q: 0,
    br: null,
    b: 0, // pendapatan pembanding
    bn: 0,
    bq: 0,
    bbr: null,
    h1: 0, // paruh pertama periode pantau
    h2: 0,
    h2n: 0,
    maxLine: 0,
    firstR: null, // transaksi pertama di periode pantau
    lastBefore: null, // transaksi terakhir sebelum periode pantau
    lvR: 0, // nilai daftar (qty × harga daftar) periode pantau
    lrR: 0,
    lnR: 0,
    lvB: 0,
    lrB: 0,
    lnB: 0,
  };
}

/* ---------------------------------------------------------------- mesin    */

/**
 * Kumpulkan semua peringatan.
 *
 * @param lines      baris transaksi (sudah tersaring slicer), semua tanggal
 * @param portfolio  hasil buildPortfolio() pada tingkat produk yang dipilih
 * @param win        jendela analisis (analysisWindow)
 * @param crit       kriteria penilaian produk
 * @param settings   ambang peringatan (lihat ALERT_DEFAULTS)
 * @param quality    ringkasan kualitas data (untuk ID pelanggan)
 * @param today      tanggal hari ini (ISO), untuk aturan "data belum diperbarui"
 */
export function buildAlerts({ lines, portfolio, win, crit, settings, labels, quality, today, prev }) {
  const s = { ...ALERT_DEFAULTS, ...settings };
  const pf = portfolio;
  const unit = pf.unit;
  const U = pf.unitDef || unitDef(unit);
  const W = alertWindows(win, s);
  const { R, B, ref, okChange } = W;
  const refM = monthIndex(ref);
  const branchOn = hasCol("Branch");
  const plOn = hasCol("Price_List");
  const custOn = !!quality?.customersReliable;
  const dims = ALERT_DIMS.filter((d) => dimOk(d) && d !== unit);
  const off = new Set(Array.isArray(s.off) ? s.off : []);
  const gapFrom = shiftDays(ref, -729);
  const effDays1 = Math.max(1, Math.round((win.days1 || 365) * (win.cover1 ?? 1)));
  /* Hari P1 yang benar-benar dilalui sebuah produk: produk yang baru
     diluncurkan di tengah P1 dihitung rata-rata hariannya sejak peluncuran. */
  const p1End = win.p1.to < ref ? win.p1.to : ref;
  const spanOf = (first) => Math.max(1, Math.min(effDays1, daysBetween(first > win.p1.from ? first : win.p1.from, p1End)));

  /* --- satu lintasan data --- */
  const acc = new Map();
  const dimAcc = Object.fromEntries(dims.map((d) => [d, new Map()]));
  const p1Branch = new Map(); // produk kelas A → Map(cabang → pendapatan P1)
  const p1Cust = new Map(); // produk kelas A → Map(pelanggan → pendapatan P1)
  let TR = 0;
  let TB = 0;
  let TP1 = 0;
  let unkR = 0;
  let nBranches = 0;
  const branchSeen = branchOn ? new Set() : null;

  for (const ln of lines) {
    const d = ln.__d;
    if (!d || d > ref) continue;
    const v = ln.Revenue;
    const inR = d >= R.from;
    const inB = d >= B.from && d <= B.to;
    const inP1 = d >= win.p1.from && d <= win.p1.to;
    const k = ln[unit];
    let a = acc.get(k);
    if (!a) acc.set(k, (a = newAcc()));
    const listOk = plOn && ln.quantity > 0 && ln.Price_List > 0;

    if (inR) {
      a.r += v;
      a.n += 1;
      a.q += ln.quantity;
      if (branchOn) (a.br ||= new Set()).add(ln.Branch);
      if (v > a.maxLine) a.maxLine = v;
      if (!a.firstR || d < a.firstR) a.firstR = d;
      if (d >= W.half) {
        a.h2 += v;
        a.h2n += 1;
      } else a.h1 += v;
      if (listOk) {
        a.lvR += ln.quantity * ln.Price_List;
        a.lrR += v;
        a.lnR += 1;
      }
      TR += v;
      if (isUnknownKey(k)) unkR += v;
    } else if (!a.lastBefore || d > a.lastBefore) {
      a.lastBefore = d;
    }
    if (inB) {
      a.b += v;
      a.bn += 1;
      a.bq += ln.quantity;
      if (branchOn) (a.bbr ||= new Set()).add(ln.Branch);
      if (listOk) {
        a.lvB += ln.quantity * ln.Price_List;
        a.lrB += v;
        a.lnB += 1;
      }
      TB += v;
    }
    if (inP1) {
      TP1 += v;
      if (branchOn) branchSeen.add(ln.Branch);
      const u = pf.byKey.get(k);
      if (u && u.abc === "A") {
        if (branchOn) {
          let m = p1Branch.get(k);
          if (!m) p1Branch.set(k, (m = new Map()));
          m.set(ln.Branch, (m.get(ln.Branch) || 0) + v);
        }
        if (custOn && ln.id_customer) {
          let m = p1Cust.get(k);
          if (!m) p1Cust.set(k, (m = new Map()));
          m.set(ln.id_customer, (m.get(ln.id_customer) || 0) + v);
        }
      }
    }

    for (const dim of dims) {
      const key = ln[dim];
      const map = dimAcc[dim];
      let e = map.get(key);
      if (!e) map.set(key, (e = { r: 0, n: 0, b: 0, bn: 0, p1: 0, last: d, days: new Set(), mon: new Map() }));
      if (inR) {
        e.r += v;
        e.n += 1;
      }
      if (inB) {
        e.b += v;
        e.bn += 1;
      }
      if (inP1) e.p1 += v;
      if (d > e.last) e.last = d;
      if (d >= gapFrom) e.days.add(d);
      e.mon.set(ln.__m, (e.mon.get(ln.__m) || 0) + v);
    }
  }
  if (branchOn) nBranches = branchSeen.size;

  /* --- aturan yang bisa dipakai untuk data ini, dan yang dimatikan pengguna --- */
  const why = {};
  if (!custOn) why.customer = "kolom ID pelanggan tidak ada atau tidak bisa dipercaya (lihat Data)";
  if (!branchOn) why.concentration = "data tidak punya kolom cabang";
  else if (nBranches < 3) why.concentration = "data hanya punya kurang dari 3 cabang";
  if (!plOn && unit !== "Item_Code") why.price = "tanpa kolom harga daftar, hanya bisa di tingkat Kode barang";
  if (!U.parent) why.cannibal = `${U.label} tidak punya induk untuk mencari produk saudara`;
  if (!dims.length) for (const k of ["dimSilent", "dimDrop", "dimLag", "dimSurge"]) why[k] = "data tidak punya kolom cabang, wilayah, kanal, lini, atau kategori lain";
  const enabled = (rule) => !off.has(rule) && !why[rule];

  /* --- pengumpul temuan: satu subjek bisa kena beberapa aturan --- */
  const hits = [];
  const hit = (rule, subject, body) => {
    if (enabled(rule)) hits.push({ rule, subject, ...body });
  };
  const unitSubject = (u) => ({ kind: "unit", dim: unit, key: u.key, label: u.label, sub: u.sub || "" });
  const unitFacts = (u) => [
    { label: "Kelas", value: u.abc },
    { label: "Tahap", value: STAGE_BY_KEY[u.stage]?.label || u.stage },
    { label: "Porsi P1", value: u.share < 0.001 ? "< 0,1%" : pct(u.share) },
    { label: "Pendapatan P1", value: rp(u.r1) },
    { label: "Terakhir terjual", value: dateText(u.last) },
  ];
  const unitSpark = (u) => seriesOf(u.mon, refM);
  const explainUnit = (u) => ({ path: [{ dim: unit, key: u.key, label: u.label }], p1: R, p2: B });
  const winText = `periode pantau (${rangeText(R)})`;
  const cmpText = `pembanding (${rangeText(B)})`;

  /* ------------------------------------------------ produk: andalan diam */
  for (const u of pf.units) {
    if (u.unknown || !isAB(u) || !(u.r1 > 0) || u.gap == null) continue;
    const dsl = Math.max(0, daysBetween(u.last, ref) - 1);
    const base = Math.max(s.silentDays, Math.ceil(s.silentFactor * u.gap));
    let need = base;
    let why = "";
    if (u.pattern === "borongan" && need < crit.projectGraceDays) {
      need = crit.projectGraceDays;
      why = `pola Borongan → minimal tenggang proyek ${crit.projectGraceDays} hari`;
    } else if (!REGULAR.has(u.pattern) && u.pattern !== "borongan" && need < crit.dormantDays) {
      need = crit.dormantDays;
      why = `pola ${u.pattern === "tipis" ? "Data tipis" : "Sesekali"} → minimal batas Tidak aktif ${crit.dormantDays} hari`;
    }
    if (dsl < need) continue;
    const span = spanOf(u.first);
    const perDay = u.r1 / span;
    hit("silent", unitSubject(u), {
      severity: u.abc === "A" && REGULAR.has(u.pattern) ? "kritis" : "cek",
      headline: `Tidak terjual ${days(dsl)}`,
      text: `Terakhir terjual ${dateText(u.last)}. Biasanya terjual tiap ±${days(Math.max(1, Math.round(u.gap)))}${why ? ` (pola ${u.pattern})` : ""}; batasnya ${days(need)}.`,
      impact: -perDay * dsl,
      impactLabel: "perkiraan pendapatan yang tidak masuk",
      facts: [
        ...unitFacts(u),
        { label: "Pola", value: u.pattern },
        { label: "Biasanya terjual", value: `tiap ±${days(Math.max(1, Math.round(u.gap)))}` },
      ],
      calc: [
        `Hari tanpa penjualan = ${dateText(ref)} − ${dateText(u.last)} = ${days(dsl)}.`,
        `Batas = maks(${s.silentDays}, ${nf1.format(s.silentFactor)} × jeda normal ${nf1.format(u.gap)}) = ${days(base)}${why ? `; ${why}` : ""} → batas ${days(need)}.`,
        `Perkiraan pendapatan yang tidak masuk = pendapatan P1 ${rp(u.r1)} ÷ ${nfFull.format(span)} hari aktif di P1 × ${days(dsl)} ≈ ${rp(perDay * dsl)}.`,
      ],
      spark: unitSpark(u),
      unit: u,
      explain: explainUnit(u),
    });
  }

  /* ------------------------------------------------ produk: perubahan     */
  // Kelas periode pantau (untuk produk baru): urut pendapatan periode pantau.
  const recentRank = new Map();
  {
    const live = [];
    for (const [k, a] of acc) if (a.r > 0 && !isUnknownKey(k)) live.push([k, a.r]);
    live.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    const tot = live.reduce((t, x) => t + x[1], 0) || 1;
    let cum = 0;
    live.forEach(([k, r], i) => {
      const before = cum / tot;
      recentRank.set(k, { rank: i + 1, of: live.length, cls: before < crit.abcA ? "A" : before < crit.abcB ? "B" : "C" });
      cum += r;
    });
  }

  // Laju total: lonjakan harus jauh di atas arus umum, bukan sekadar ikut naik.
  const relX = TB > 0 ? TR / TB : null;
  const surgeX = Math.max(1 + s.surgePct, relX ? 1.5 * relX : 0);
  const totalText = relX ? `total semua ${U.plural} ${signedPct(relX - 1)}` : "";

  for (const u of pf.units) {
    if (u.unknown) continue;
    const a = acc.get(u.key);
    if (!a) continue;
    const g = growth(a.r, a.b);

    // Turun tajam (kelas A/B).
    if (okChange && isAB(u) && a.bn >= s.minTx && a.b > 0 && g <= -s.dropPct) {
      const drv = lmdiDrivers(
        { r1: a.r, r2: a.b, n1: a.n, n2: a.bn, b1: a.br?.size || 0, b2: a.bbr?.size || 0, q1: a.q, q2: a.bq },
        unit === "Item_Code"
      );
      const main = mainDriver(drv, a.r - a.b);
      hit("drop", unitSubject(u), {
        severity: u.abc === "A" && g <= -0.5 ? "kritis" : "cek",
        headline: a.r > 0 ? `Turun ${pctAbs(g)}` : "Tidak terjual sama sekali di periode pantau",
        text: `${rp(a.r)} di ${W.label} dibanding ${rp(a.b)} di ${W.cmpLabel} (${totalText}).${main ? ` ${driverSentence(main, false)}` : ""}`,
        impact: a.r - a.b,
        impactLabel: "selisih terhadap pembanding",
        facts: [
          ...unitFacts(u),
          { label: "Transaksi", value: `${nfFull.format(a.bn)} → ${nfFull.format(a.n)}` },
          ...(branchOn ? [{ label: "Cabang yang menjual", value: `${nfFull.format(a.bbr?.size || 0)} → ${nfFull.format(a.br?.size || 0)}` }] : []),
        ],
        calc: [
          `Pendapatan ${winText} = ${rp(a.r)}; ${cmpText} = ${rp(a.b)}.`,
          `Perubahan = (${rp(a.r)} − ${rp(a.b)}) ÷ ${rp(a.b)} = ${signedPct(g)} (batas −${pct(s.dropPct)}).`,
          ...(drv ? [`Penguraian LMDI: ${drv.map((x) => `${x.key === "br" ? "jangkauan" : x.key === "dens" ? "frekuensi" : x.key === "size" ? "ukuran pesanan" : x.key === "price" ? "harga" : x.key === "tx" ? "transaksi" : "nilai per transaksi"} ${plusRp(x.effect)}`).join(" · ")}.`] : []),
        ],
        spark: unitSpark(u),
        unit: u,
        explain: explainUnit(u),
      });
    }

    // Produk baru yang melonjak.
    if (u.stage === "baru" && a.n >= 2) {
      const rr = recentRank.get(u.key);
      const big = !!rr && rr.cls === "A" && a.h2 >= a.h1;
      const accel = a.h1 > 0 && a.h2n >= 2 && a.h2 >= (1 + s.surgePct) * a.h1;
      if (big || accel) {
        const ageDays = Math.max(0, daysBetween(u.first, ref) - 1);
        const parts = [];
        if (big) parts.push(`sudah peringkat ${nfFull.format(rr.rank)} dari ${nfFull.format(rr.of)} ${U.plural} di ${W.label} (kelas ${rr.cls})`);
        if (accel) parts.push(`paruh kedua periode pantau ${rp(a.h2)} vs paruh pertama ${rp(a.h1)} (${times(a.h2 / a.h1)})`);
        hit("newSurge", unitSubject(u), {
          severity: "peluang",
          headline: big ? `Baru ${nfFull.format(ageDays)} hari, sudah kelas ${rr.cls}` : `Baru, penjualan ${times(a.h2 / a.h1)} lebih cepat`,
          text: `Pertama terjual ${dateText(u.first)}. ${parts.join("; ")[0].toUpperCase()}${parts.join("; ").slice(1)}.`,
          impact: a.r,
          impactLabel: "pendapatan periode pantau",
          facts: [
            { label: "Pertama terjual", value: dateText(u.first) },
            { label: "Transaksi pantau", value: nfFull.format(a.n) },
            ...(branchOn ? [{ label: "Cabang", value: nfFull.format(a.br?.size || 0) }] : []),
            { label: "Pendapatan pantau", value: rp(a.r) },
            ...(rr ? [{ label: "Peringkat pantau", value: `${nfFull.format(rr.rank)} dari ${nfFull.format(rr.of)}` }] : []),
          ],
          calc: [
            `Tahap Baru: pertama terjual ${dateText(u.first)}, ${u.ageM} bulan sebelum tanggal acuan (batas ${crit.newMonths} bulan).`,
            ...(rr ? [`Kelas periode pantau: urutkan ${U.plural} menurut pendapatan ${winText}; porsi kumulatif sebelum produk ini ${rr.cls === "A" ? `< ${pct(crit.abcA)} → kelas A` : `→ kelas ${rr.cls}`}.`] : []),
            `Paruh pertama (${dateText(R.from)} – ${dateText(shiftDays(W.half, -1))}) = ${rp(a.h1)}; paruh kedua (${dateText(W.half)} – ${dateText(R.to)}) = ${rp(a.h2)}.`,
          ],
          spark: unitSpark(u),
          unit: u,
          explain: explainUnit(u),
        });
      }
    }

    // Lonjakan produk lama.
    if (
      okChange &&
      u.stage !== "baru" &&
      a.bn >= s.minTx &&
      a.n >= s.minTx &&
      a.b > 0 &&
      a.r >= surgeX * a.b &&
      a.r >= s.minShareProduct * TR
    ) {
      const rise = a.r - a.b;
      const lumpy = rise > 0 && a.maxLine > 0.5 * rise;
      hit("surge", unitSubject(u), {
        severity: "peluang",
        headline: `Naik ${times(a.r / a.b)} (${signedPct(g)})`,
        text: `${rp(a.r)} di ${W.label} dibanding ${rp(a.b)} di ${W.cmpLabel} (${totalText}).${lumpy ? ` Satu transaksi ${rp(a.maxLine)} menyumbang ${pct(a.maxLine / rise)} kenaikan — mungkin pesanan sekali.` : ""}`,
        impact: rise,
        impactLabel: "selisih terhadap pembanding",
        facts: [...unitFacts(u), { label: "Transaksi", value: `${nfFull.format(a.bn)} → ${nfFull.format(a.n)}` }],
        calc: [
          `Pendapatan ${winText} = ${rp(a.r)}; ${cmpText} = ${rp(a.b)} → ${times(a.r / a.b)}.`,
          `Batas = maks(${times(1 + s.surgePct)}, 1,5 × laju total ${relX ? times(relX) : "–"}) = ${times(surgeX)}.`,
          `Porsi dari total periode pantau = ${rp(a.r)} ÷ ${rp(TR)} = ${nfPct.format(a.r / (TR || 1))} (minimal ${nfPct.format(s.minShareProduct)}).`,
          `Transaksi terbesar di periode pantau = ${rp(a.maxLine)}.`,
        ],
        spark: unitSpark(u),
        unit: u,
        explain: explainUnit(u),
        note: lumpy ? "mungkin pesanan sekali" : null,
      });
    }

    // Laku lagi setelah lama diam.
    if (a.firstR && a.lastBefore && a.n >= 2 && a.r >= s.minShareProduct * TR) {
      const quiet = daysBetween(a.lastBefore, a.firstR) - 1;
      const need = Math.max(crit.dormantDays, Math.ceil(3 * (u.gap || 0)));
      if (quiet >= need) {
        hit("revive", unitSubject(u), {
          severity: "peluang",
          headline: `Laku lagi setelah ${days(quiet)} diam`,
          text: `Sebelumnya terakhir terjual ${dateText(a.lastBefore)}; kembali terjual ${dateText(a.firstR)}. ${nfFull.format(a.n)} transaksi senilai ${rp(a.r)} di ${W.label}.`,
          impact: a.r,
          impactLabel: "pendapatan periode pantau",
          facts: [...unitFacts(u), { label: "Diam", value: days(quiet) }],
          calc: [
            `Jarak = ${dateText(a.firstR)} − ${dateText(a.lastBefore)} = ${days(quiet)} tanpa penjualan.`,
            `Batas = maks(${crit.dormantDays} hari tidak aktif, 3 × jeda normal ${u.gap == null ? "–" : nf1.format(u.gap)}) = ${days(need)}.`,
          ],
          spark: unitSpark(u),
          unit: u,
          explain: explainUnit(u),
        });
      }
    }

    // Harga bersih tergerus.
    if (okChange && isAB(u)) {
      let pr = null;
      if (plOn) {
        if (a.lnR >= s.minTx && a.lnB >= s.minTx && a.lvR > 0 && a.lvB > 0) {
          const now = a.lrR / a.lvR;
          const then = a.lrB / a.lvB;
          pr = {
            now,
            then,
            ch: now / then - 1,
            lost: (then - now) * a.lvR,
            text: `Pendapatan ${pct(now)} dari harga daftar di ${W.label}, sebelumnya ${pct(then)}.`,
            calc: [
              `Harga bersih = pendapatan ÷ (qty × harga daftar): sekarang ${rp(a.lrR)} ÷ ${rp(a.lvR)} = ${pct(now)}; pembanding ${rp(a.lrB)} ÷ ${rp(a.lvB)} = ${pct(then)}.`,
              `Perubahan = ${pct(now)} ÷ ${pct(then)} − 1 = ${signedPct(now / then - 1)} (batas −${pct(s.priceDrop)}).`,
              `Selisih rupiah ≈ (${pct(then)} − ${pct(now)}) × nilai daftar ${rp(a.lvR)} = ${rp((then - now) * a.lvR)}.`,
            ],
          };
        }
      } else if (unit === "Item_Code" && a.q > 0 && a.bq > 0 && a.n >= s.minTx && a.bn >= s.minTx) {
        const now = a.r / a.q;
        const then = a.b / a.bq;
        pr = {
          now,
          then,
          ch: now / then - 1,
          lost: (then - now) * a.q,
          text: `Harga rata-rata ${rp(now)} per unit di ${W.label}, sebelumnya ${rp(then)}.`,
          calc: [
            `Harga rata-rata = pendapatan ÷ qty: sekarang ${rp(a.r)} ÷ ${nfFull.format(a.q)} = ${rp(now)}; pembanding ${rp(a.b)} ÷ ${nfFull.format(a.bq)} = ${rp(then)}.`,
            `Perubahan = ${signedPct(now / then - 1)} (batas −${pct(s.priceDrop)}).`,
          ],
        };
      }
      if (pr && pr.ch <= -s.priceDrop) {
        hit("price", unitSubject(u), {
          severity: "cek",
          headline: `Harga bersih turun ${pctAbs(pr.ch)}`,
          text: pr.text,
          impact: -Math.max(0, pr.lost),
          impactLabel: "pendapatan yang hilang karena harga",
          facts: unitFacts(u),
          calc: pr.calc,
          spark: unitSpark(u),
          unit: u,
          explain: explainUnit(u),
        });
      }
    }
  }

  /* ------------------------------------------------ produk: konsentrasi  */
  if (branchOn && nBranches >= 3) {
    for (const [k, m] of p1Branch) {
      const u = pf.byKey.get(k);
      if (!u || u.unknown || !(u.r1 > 0)) continue;
      let topB = null;
      let topV = 0;
      for (const [b, v] of m) if (v > topV || (v === topV && String(b) < String(topB))) [topB, topV] = [b, v];
      const share = topV / u.r1;
      if (m.size >= 3 && share >= s.concentration) {
        hit("concentration", unitSubject(u), {
          severity: "info",
          headline: `${pct(share)} dari ${topB}`,
          text: `${rp(topV)} dari ${rp(u.r1)} pendapatan P1 berasal dari ${topB}; ${nfFull.format(m.size - 1)} cabang lain berbagi sisanya. Gangguan di cabang ini langsung memukul produk andalan ini.`,
          impact: null,
          facts: [...unitFacts(u), { label: "Cabang yang menjual (P1)", value: nfFull.format(m.size) }],
          calc: [`Porsi cabang terbesar = ${rp(topV)} ÷ ${rp(u.r1)} = ${pct(share)} (batas ${pct(s.concentration)}).`],
          spark: unitSpark(u),
          unit: u,
          explain: null,
        });
      }
    }
  }
  if (custOn) {
    for (const [k, m] of p1Cust) {
      const u = pf.byKey.get(k);
      if (!u || u.unknown || !(u.r1 > 0)) continue;
      let topC = null;
      let topV = 0;
      for (const [c, v] of m) if (v > topV || (v === topV && String(c) < String(topC))) [topC, topV] = [c, v];
      const share = topV / u.r1;
      if (share >= s.customerShare) {
        hit("customer", unitSubject(u), {
          severity: "info",
          headline: `${pct(share)} dari satu pelanggan`,
          text: `${rp(topV)} dari ${rp(u.r1)} pendapatan P1 berasal dari pelanggan ${topC}${m.size > 1 ? ` (dari ${nfFull.format(m.size)} pelanggan)` : ""}. Kemungkinan pesanan proyek; kalau pelanggan ini berhenti, angkanya ikut hilang.`,
          impact: null,
          facts: unitFacts(u),
          calc: [`Porsi pelanggan terbesar = ${rp(topV)} ÷ ${rp(u.r1)} = ${pct(share)} (batas ${pct(s.customerShare)}).`],
          spark: unitSpark(u),
          unit: u,
          explain: null,
        });
      }
    }
  }

  /* ------------------------------------------------ produk: tergeser      */
  if (U.parent) {
    for (const u of pf.units) {
      if (u.unknown || u.stage !== "menurun" || !isAB(u) || !(u.r2 > u.r1)) continue;
      const p = pf.parents.get(u.parent);
      if (!p) continue;
      const loss = u.r2 - u.r1;
      let best = null;
      for (const sib of p.units) {
        if (sib === u || sib.unknown || !(sib.r1 > 0)) continue;
        const gain = sib.r1 - sib.r2;
        const ok = sib.r2 > 0 ? (sib.r1 - sib.r2) / sib.r2 >= crit.growth : sib.r1 > 0;
        if (ok && gain > 0 && (!best || gain > best.gain)) best = { sib, gain };
      }
      if (best && best.gain >= 0.5 * loss) {
        const parentLabel = valueLabel(U.parent, u.parent, labels);
        hit("cannibal", unitSubject(u), {
          severity: "cek",
          headline: `Tergeser ${best.sib.label}?`,
          text: `Turun ${rp(loss)} (P1 dibanding P2) sementara ${best.sib.label} di ${parentLabel} naik ${rp(best.gain)} — ${pct(Math.min(1, best.gain / loss))} penurunannya tertutup. Pembeli mungkin beralih.`,
          impact: -loss,
          impactLabel: "selisih P1 dibanding P2",
          facts: [...unitFacts(u), { label: "Saudara yang naik", value: best.sib.label }, { label: "Induk", value: parentLabel }],
          calc: [
            `Penurunan produk ini = P2 ${rp(u.r2)} − P1 ${rp(u.r1)} = ${rp(loss)}.`,
            `Kenaikan ${best.sib.label} = P1 ${rp(best.sib.r1)} − P2 ${rp(best.sib.r2)} = ${rp(best.gain)} (${best.sib.r2 > 0 ? signedPct(best.sib.g) : "baru"}).`,
            `Tertutup = ${rp(best.gain)} ÷ ${rp(loss)} = ${pct(best.gain / loss)} (minimal 50%).`,
          ],
          spark: unitSpark(u),
          unit: u,
          sibling: best.sib,
          explain: { path: [{ dim: U.parent, key: u.parent, label: parentLabel }], p1: win.p1, p2: win.p2 },
        });
      }
    }
  }

  /* ------------------------------------------------ produk: tahap berubah */
  let shift = null;
  if (enabled("stageNeg") || enabled("stagePos")) {
    // Pakai hasil simpanan halaman kalau masih cocok; kalau tidak, hitung sendiri.
    const P =
      prev && prev.N === W.N && prev.unit === unit && prev.win === win && prev.crit === crit
        ? prev
        : previousPortfolio({ lines, portfolio: pf, win, crit, labels, watchDays: W.N });
    const prevWin = P.prevWin;
    const shiftText = win.kind === "months" ? `${W.months} bulan lalu (per ${dateText(prevWin.asOf)})` : `per ${dateText(prevWin.asOf)}`;
    shift = { asOf: prevWin.asOf, text: shiftText, ok: P.ok };
    if (!shift.ok) {
      W.notes.push({
        key: "shift",
        level: "info",
        text: `Perubahan tahap tidak dihitung: data belum cukup panjang untuk menilai tahap ${shiftText} (jendela P2-nya dimulai sebelum data).`,
      });
    } else {
      const prevPf = P.pf;
      for (const u of pf.units) {
        if (u.unknown) continue;
        const p = prevPf.byKey.get(u.key);
        if (!p || p.stage === u.stage) continue;
        const from = p.stage;
        const to = u.stage;
        const wasAB = isAB(u) || isAB(p);
        const wasA = u.abc === "A" || p.abc === "A";
        const project = u.pattern === "borongan";
        const dslNow = Math.max(0, daysBetween(u.last, ref) - 1);
        let rule = null;
        let severity = null;
        if (to === "tidur" || to === "menurun") {
          if (from === "baru") {
            // Produk baru yang gagal: hanya yang sempat diluncurkan sungguhan
            // (minimal `minTx` transaksi). Yang laku 1–3 kali lalu berhenti
            // lebih mirip pesanan sekali daripada peluncuran yang gagal.
            if (!u.thin) {
              rule = "stageNeg";
              severity = "cek";
            }
          } else if (wasAB && !project) {
            if (to === "menurun") {
              rule = "stageNeg";
              severity = "cek";
            } else if (u.gap != null && dslNow >= s.silentFactor * u.gap) {
              rule = "stageNeg";
              severity = wasA && REGULAR.has(u.pattern) ? "kritis" : "cek";
            }
          }
        } else if (to === "tumbuh") {
          if (wasAB && (!project || from === "baru")) {
            rule = "stagePos";
            severity = "peluang";
          }
        } else if (from === "tumbuh" && to === "matang") {
          if (wasA && !project) {
            rule = "stageNeg";
            severity = "info";
          }
        } else if (from === "menurun" && to === "matang") {
          if (wasAB && !project) {
            rule = "stagePos";
            severity = "info";
          }
        }
        if (!rule) continue;
        const fromL = STAGE_BY_KEY[from]?.label || from;
        const toL = STAGE_BY_KEY[to]?.label || to;
        const gText = (x) => (x.g == null ? (x.r1 > 0 ? "baru terjual" : "tidak terjual") : signedPct(x.g));
        let impact = null;
        let impactLabel = null;
        const calc = [
          `Tahap ${shiftText}: ${fromL} — P1 ${rangeText(prevWin.p1)} ${rp(p.r1)} vs P2 ${rp(p.r2)} (${gText(p)}), terakhir terjual ${dateText(p.last)}.`,
          `Tahap sekarang: ${toL} — P1 ${rangeText(win.p1)} ${rp(u.r1)} vs P2 ${rp(u.r2)} (${gText(u)}), terakhir terjual ${dateText(u.last)}.`,
          `Aturan tahap: tidak terjual > ${crit.dormantDays} hari → Tidak aktif; umur ≤ ${crit.newMonths} bulan → Baru; perubahan P1 vs P2 ≥ +${pct(crit.growth)} → Tumbuh, ≤ −${pct(crit.growth)} → Menurun, selain itu Matang.`,
        ];
        if (to === "tidur") {
          const span = spanOf(u.first);
          impact = -(u.r1 / span) * dslNow;
          impactLabel = "perkiraan pendapatan yang tidak masuk";
          calc.push(`Perkiraan pendapatan yang tidak masuk = ${rp(u.r1)} ÷ ${nfFull.format(span)} hari aktif di P1 × ${days(dslNow)} tanpa penjualan ≈ ${rp(-impact)}.`);
        } else if (to === "menurun" || to === "tumbuh") {
          impact = u.r1 - u.r2;
          impactLabel = "selisih P1 dibanding P2";
        }
        hit(rule, unitSubject(u), {
          severity,
          headline: `${fromL} → ${toL}`,
          text:
            from === "baru" && rule === "stageNeg"
              ? `Produk baru yang gagal berkembang: ${shiftText} masih Baru, sekarang ${toL}${to === "tidur" ? ` — terakhir terjual ${dateText(u.last)}` : ` (P1 ${gText(u)})`}.`
              : `${shiftText[0].toUpperCase()}${shiftText.slice(1)} tahapnya ${fromL} (P1 ${gText(p)}), sekarang ${toL} (${to === "tidur" ? `terakhir terjual ${dateText(u.last)}` : `P1 ${gText(u)}`}).`,
          impact,
          impactLabel,
          facts: [...unitFacts(u), { label: "Pola", value: u.pattern }, { label: `Kelas ${win.kind === "months" ? `${W.months} bulan lalu` : "sebelumnya"}`, value: p.abc }],
          calc,
          spark: unitSpark(u),
          unit: u,
          prevStage: from,
          explain: { path: [{ dim: unit, key: u.key, label: u.label }], p1: win.p1, p2: win.p2 },
        });
      }
    }
  }

  /* ------------------------------------------------ cabang & kelompok    */
  for (const dim of dims) {
    const group = dimGroup(dim);
    const dimLabel = labelOf(dim);
    for (const [key, e] of dimAcc[dim]) {
      if (isUnknownKey(key)) continue;
      const label = valueLabel(dim, key, labels);
      const subject = { kind: "dim", dim, key, label, sub: dimLabel };
      const spark = seriesOf(e.mon, refM);
      const explain = { path: [{ dim, key, label }], p1: R, p2: B };
      const shareP1 = TP1 ? e.p1 / TP1 : 0;
      const shareText = shareP1 < 0.001 ? "< 0,1%" : pct(shareP1);

      // Berhenti bertransaksi.
      const gap = medianGap(e.days);
      const dsl = Math.max(0, daysBetween(e.last, ref) - 1);
      if (gap != null) {
        const need = Math.max(s.silentDays, Math.ceil(s.silentFactor * gap));
        if (dsl >= need) {
          const span = Math.max(1, Math.min(effDays1, daysBetween(win.p1.from, p1End)));
          hit("dimSilent", subject, {
            group,
            severity: shareP1 >= 0.01 && dsl <= 120 ? "kritis" : "cek",
            headline: `Tidak ada transaksi ${days(dsl)}`,
            text: `Transaksi terakhir ${dateText(e.last)}. Biasanya bertransaksi tiap ±${days(Math.max(1, Math.round(gap)))}; porsinya di P1 ${shareText}.`,
            impact: e.p1 > 0 ? -(e.p1 / span) * dsl : null,
            impactLabel: "perkiraan pendapatan yang tidak masuk",
            facts: [
              { label: dimLabel, value: label },
              { label: "Transaksi terakhir", value: dateText(e.last) },
              { label: "Pendapatan P1", value: rp(e.p1) },
              { label: "Porsi P1", value: shareText },
            ],
            calc: [
              `Hari tanpa transaksi = ${dateText(ref)} − ${dateText(e.last)} = ${days(dsl)}.`,
              `Batas = maks(${s.silentDays}, ${nf1.format(s.silentFactor)} × jeda normal ${nf1.format(gap)}) = ${days(need)}.`,
              ...(e.p1 > 0 ? [`Perkiraan pendapatan yang tidak masuk = ${rp(e.p1)} ÷ ${nfFull.format(span)} hari P1 × ${days(dsl)} ≈ ${rp((e.p1 / span) * dsl)}.`] : []),
            ],
            spark,
            explain,
          });
        }
      }

      if (!okChange || e.bn < s.minTx || !(e.b > 0) || e.b < s.minShareDim * TB) continue;
      const g = growth(e.r, e.b);
      const x = e.r / e.b;
      const idx = relX ? x / relX : null;
      const sizeCalc = `Ukuran: ${nfFull.format(e.bn)} transaksi (min ${s.minTx}), ${pct(e.b / (TB || 1))} dari total pembanding ${rp(TB)} (min ${nfPct.format(s.minShareDim)}).`;
      const totalLine = relX ? `Total semua: ${rp(TR)} vs ${rp(TB)} = ${signedPct(relX - 1)} (laju ${times(relX)}).` : "";
      const baseFacts = [
        { label: dimLabel, value: label },
        { label: "Transaksi", value: `${nfFull.format(e.bn)} → ${nfFull.format(e.n)}` },
        { label: "Porsi pembanding", value: pct(e.b / (TB || 1)) },
        { label: "Pertumbuhan total", value: relX ? signedPct(relX - 1) : "–" },
      ];
      if (g <= -s.dropPct) {
        const loss = e.b - e.r;
        hit("dimDrop", subject, {
          group,
          severity: g <= -0.5 || loss >= 0.05 * TB ? "kritis" : "cek",
          headline: e.r > 0 ? `Turun ${pctAbs(g)}` : "Tidak ada transaksi di periode pantau",
          text: `${rp(e.r)} di ${W.label} dibanding ${rp(e.b)} di ${W.cmpLabel} (${nfFull.format(e.bn)} → ${nfFull.format(e.n)} transaksi), sementara total ${relX ? signedPct(relX - 1) : "–"}.`,
          impact: e.r - e.b,
          impactLabel: "selisih terhadap pembanding",
          facts: baseFacts,
          calc: [
            `Pendapatan ${winText} = ${rp(e.r)}; ${cmpText} = ${rp(e.b)}.`,
            `Perubahan = (${rp(e.r)} − ${rp(e.b)}) ÷ ${rp(e.b)} = ${signedPct(g)} (batas −${pct(s.dropPct)}).`,
            sizeCalc,
            ...(totalLine ? [totalLine] : []),
          ],
          spark,
          explain,
        });
      } else if (idx != null && idx <= 1 - s.dropPct) {
        const shortfall = e.b * relX - e.r;
        hit("dimLag", subject, {
          group,
          severity: "cek",
          headline: `Tertinggal: ${signedPct(g)} saat total ${signedPct(relX - 1)}`,
          text: `${rp(e.r)} di ${W.label} dibanding ${rp(e.b)} di ${W.cmpLabel}. Kalau tumbuh selaju total, mestinya ±${rp(e.b * relX)}; porsinya terhadap total menyusut dari ${pct(e.b / TB)} ke ${pct(e.r / (TR || 1))}.`,
          impact: -shortfall,
          impactLabel: "kekurangan dibanding tumbuh selaju total",
          facts: baseFacts,
          calc: [
            `Laju anggota = ${rp(e.r)} ÷ ${rp(e.b)} = ${times(x)}; laju total = ${rp(TR)} ÷ ${rp(TB)} = ${times(relX)}.`,
            `Indeks = ${times(x)} ÷ ${times(relX)} = ${nf1.format(idx * 100)}% dari laju total (batas ${pct(1 - s.dropPct)}).`,
            `Kekurangan = ${rp(e.b)} × ${times(relX)} − ${rp(e.r)} = ${rp(shortfall)}.`,
            sizeCalc,
          ],
          spark,
          explain,
        });
      } else if (g >= s.surgePct && relX && x >= 1.5 * relX) {
        hit("dimSurge", subject, {
          group,
          severity: "peluang",
          headline: `Naik ${times(x)} (${signedPct(g)})`,
          text: `${rp(e.r)} di ${W.label} dibanding ${rp(e.b)} di ${W.cmpLabel} (${nfFull.format(e.bn)} → ${nfFull.format(e.n)} transaksi), jauh di atas total ${signedPct(relX - 1)}.`,
          impact: e.r - e.b,
          impactLabel: "selisih terhadap pembanding",
          facts: baseFacts,
          calc: [
            `Pendapatan ${winText} = ${rp(e.r)}; ${cmpText} = ${rp(e.b)} → ${times(x)} (${signedPct(g)}).`,
            `Batas = naik ≥ ${pct(s.surgePct)} dan laju ≥ 1,5 × laju total ${times(relX)} = ${times(1.5 * relX)}.`,
            sizeCalc,
          ],
          spark,
          explain,
        });
      }
    }
  }

  /* ------------------------------------------------ catatan data          */
  if (TR > 0 && unkR / TR >= 0.01) {
    hit("unknown", { kind: "data", dim: unit, key: "unknown", label: `${U.label} tidak diketahui`, sub: "" }, {
      severity: "info",
      headline: `${pct(unkR / TR)} pendapatan pantau`,
      text: `${rp(unkR)} dari ${rp(TR)} pendapatan ${W.label} tidak punya ${U.label.toLowerCase()} yang jelas — biasanya kode listing yang belum dipetakan ke master barang. Angka per ${U.plural} jadi sedikit lebih rendah dari kenyataannya.`,
      impact: null,
      facts: [],
      calc: [`Porsi = ${rp(unkR)} ÷ ${rp(TR)} = ${pct(unkR / TR)} (batas 1%).`],
      spark: null,
      explain: null,
    });
  }
  if (today && win.dataTo) {
    const lag = daysBetween(win.dataTo, today) - 1;
    if (lag > 7) {
      hit("stale", { kind: "data", dim: null, key: "stale", label: "Data terakhir", sub: "" }, {
        severity: "info",
        headline: `${dateText(win.dataTo)} — ${days(lag)} lalu`,
        text: `Transaksi terakhir di data tercatat ${dateText(win.dataTo)}, ${days(lag)} sebelum hari ini (${dateText(today)}). Semua peringatan dihitung per tanggal itu; muat ulang data untuk kondisi terkini.`,
        impact: null,
        facts: [],
        calc: [`Jeda = ${dateText(today)} − ${dateText(win.dataTo)} = ${days(lag)} (batas 7 hari).`],
        spark: null,
        explain: null,
      });
    }
  }

  /* --- gabungkan: satu subjek per arah, aturan paling atas jadi judul --- */
  const items = mergeHits(hits);
  const counts = { kritis: 0, cek: 0, peluang: 0, info: 0, total: items.length };
  for (const it of items) counts[it.severity]++;

  return {
    settings: s,
    windows: W,
    shift,
    items,
    counts,
    totals: { TR, TB, TP1 },
    unitDef: U,
    dims,
    context: {
      plural: U.plural,
      unavailable: why,
      off: Array.from(off).filter((k) => RULE_BY_KEY[k]),
      shiftText: shift?.text || `${W.months} bulan lalu`,
      hasPriceList: plOn,
      hasBranch: branchOn,
      customers: custOn,
    },
  };
}

/**
 * Satu subjek (produk/cabang) bisa kena beberapa aturan searah, mis. "tidak
 * terjual 45 hari" dan "Matang → Tidak aktif". Yang paling atas di
 * ALERT_RULES menjadi judul dan menentukan tingkat; sisanya ikut sebagai
 * catatan `also`. Aturan risiko dan data berdiri sendiri.
 */
function mergeHits(hits) {
  const buckets = new Map();
  for (const h of hits) {
    const r = RULE_BY_KEY[h.rule];
    const pol = r.polarity === "neg" || r.polarity === "pos" ? r.polarity : `${r.polarity}:${h.rule}`;
    const id = `${h.subject.kind}\u0001${h.subject.dim}\u0001${h.subject.key}\u0001${pol}`;
    let b = buckets.get(id);
    if (!b) buckets.set(id, (b = []));
    b.push(h);
  }
  const out = [];
  for (const [id, list] of buckets) {
    list.sort((a, b) => RULE_BY_KEY[a.rule].order - RULE_BY_KEY[b.rule].order);
    const main = list[0];
    const rule = RULE_BY_KEY[main.rule];
    // Tingkat mengikuti temuan utama (judulnya); temuan lain tampil sebagai catatan.
    const sev = main.severity;
    out.push({
      ...main,
      id,
      group: main.group || rule.group,
      polarity: rule.polarity,
      ruleTitle: rule.title,
      severity: sev,
      also: list.slice(1).map((h) => ({ rule: h.rule, ruleTitle: RULE_BY_KEY[h.rule].title, headline: h.headline, text: h.text, severity: h.severity, calc: h.calc })),
    });
  }
  out.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      (b.impact == null ? -1 : 0) - (a.impact == null ? -1 : 0) ||
      Math.abs(b.impact || 0) - Math.abs(a.impact || 0) ||
      String(a.subject.label).localeCompare(String(b.subject.label), "id") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  return out;
}

/** Baris CSV untuk tombol unduh. */
export function alertsCsvRows(items) {
  return items.map((it) => ({
    Tingkat: SEVERITY_BY_KEY[it.severity]?.label || it.severity,
    Kelompok: GROUP_BY_KEY[it.group]?.title || it.group,
    Jenis: it.ruleTitle,
    Dimensi: it.subject.dim ? labelOf(it.subject.dim) : "",
    Subjek: it.subject.label,
    Kunci: it.subject.key,
    Ringkas: it.headline,
    Keterangan: it.text,
    Dampak_Rp: it.impact == null ? "" : Math.round(it.impact),
    Arti_dampak: it.impact == null ? "" : it.impactLabel || "",
    Catatan_lain: it.also.map((a) => `${a.ruleTitle}: ${a.headline}`).join(" | "),
    Perhitungan: (it.calc || []).join(" "),
  }));
}

