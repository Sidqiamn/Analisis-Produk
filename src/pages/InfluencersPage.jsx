/* ============================================================================
   Halaman: Pendorong (key influencers)
   ----------------------------------------------------------------------------
   Menjawab "apa yang membuat X lebih (atau kurang) mungkin terjadi?".
   X dipilih pengguna:

   · Status produk   transaksi dari produk dengan tahap / rekomendasi tertentu.
                     Memperlihatkan cabang, kanal, dan cara bayar mana yang
                     paling bergantung pada produk yang sedang menurun atau
                     yang akan dicabut — jadi dampak keputusan bisa diantisipasi.
   · Transaksi besar transaksi yang nilainya masuk 10/25/50% teratas.
   · Nilai tertentu  mis. Kanal = Leads, Kategori = gnet Rockwool.

   Setiap nilai setiap dimensi dinilai dengan LIFT (peluang di dalam kelompok
   ÷ peluang di luar kelompok). Hanya yang lolos uji beda proporsi (|z| ≥ 2
   dan cukup kejadian) dihitung sebagai pendorong; sisanya bisa dimunculkan
   dengan sakelar "lemah" supaya pembaca tahu mana yang masih dugaan.

   Segmen = kombinasi dua kondisi yang lebih tajam daripada masing-masing
   kondisi sendiri-sendiri.

   Supaya mudah dibaca orang yang bukan analis:
   · pengaturan di atas diterjemahkan jadi satu kalimat permintaan
     ("Carikan kondisi … Hitung berdasarkan pendapatan …"),
   · setiap angka punya keterangan saat kursor diarahkan ke sana, dalam
     kalimat lengkap ("Dari seluruh pendapatan lini X selama P1, 91% …"),
   · kondisi yang dipilih punya "Kesimpulan" berupa tanya-jawab dengan kata
     biasa (Sangat / Cukup / Sedikit, Besar / Sedang / Kecil) dan satu
     kalimat "Artinya".
   ========================================================================== */

import React, { useState, useMemo, useEffect, useId, useRef } from "react";

import { DIM_FAMILY, activeUnits, dimOk, labelOf, unitDef } from "../lib/config.js";
import { keyInfluencers, quantile } from "../lib/explore.js";
import { ACTIONS, ACTION_BY_KEY, STAGES, STAGE_BY_KEY } from "../lib/color.js";
import { DOW_ORDER, QTY_BAND_ORDER } from "../lib/data.js";
import { useSettled } from "../lib/hooks.js";
import { fmt, nfFull, nfPct, shortRange } from "../lib/format.js";
import { valueLabel } from "../lib/product.js";
import { BTN_QUIET, FOCUS, LINE, MUTED, SELECT, cx } from "../lib/theme.jsx";
import { ActionBadge, Field, Notice, Section, Segmented, ShowAll, StageBadge, WindowBar } from "../components/productui.jsx";
import { IconFlag, IconKey, IconPin, IconSearch, IconSegments } from "../components/icons.jsx";
import { Tip } from "../components/tip.jsx";
import { BusyOverlay } from "../components/busy.jsx";

/* ------------------------------------------------------------- konstanta */

/** Dimensi yang diuji sebagai faktor. Nama produk & kode barang terlalu
    banyak nilainya untuk jadi faktor yang terbaca. */
const FACTOR_DIMS = ["branch_area", "Branch", "Channel", "Payment_Method", "Lini_Produk", "Category", "Quarter_Name", "__dow", "__qtyband"];

const FACTOR_LIMIT = 12;
const SEG_LIMIT = 10;
const DIM_BAR_LIMIT = 12;
const CONTENTS_LIMIT = 8;

/** Dimensi yang bisa dijadikan hasil pada mode "Nilai tertentu". */
const OUTCOME_DIMS = ["Channel", "Payment_Method", "branch_area", "Branch", "Lini_Produk", "Category", "__name", "Quarter_Name", "__dow", "__qtyband"];

/** Tingkat produk dari kasar ke halus. */
const LEVELS = ["Lini_Produk", "Category", "__name", "Item_Code"];

/** Dimensi produk yang berada DI ATAS tingkat analisis boleh jadi faktor
    status: "lini mana yang paling banyak berisi kategori menurun". */
const ABOVE = { Lini_Produk: [], Category: ["Lini_Produk"], __name: ["Lini_Produk", "Category"], Item_Code: ["Lini_Produk", "Category"] };

/** Dimensi yang nilainya punya urutan alami (bukan diurut dari peluang). */
const NATURAL_ORDER = { __dow: DOW_ORDER, __qtyband: QTY_BAND_ORDER, Quarter_Name: ["Q1", "Q2", "Q3", "Q4"] };

const KINDS = [
  { key: "status", label: "Status produk", hint: "Transaksi dari produk dengan tahap atau rekomendasi tertentu" },
  { key: "big", label: "Transaksi besar", hint: "Transaksi yang nilainya masuk kelompok teratas" },
  { key: "dim", label: "Nilai tertentu", hint: "Transaksi dengan nilai dimensi tertentu, mis. satu kanal atau satu wilayah" },
];
const TOPS = [
  { key: "0.1", label: "10% teratas" },
  { key: "0.25", label: "25%" },
  { key: "0.5", label: "50%" },
];
const SUPPORTS = [20, 30, 50, 100];

/** Keterangan label pengaturan (muncul saat kursor diarahkan ke labelnya). */
const TIPS = {
  kind: "Hal yang ingin dijelaskan. Halaman ini lalu mencari kondisi — wilayah, cabang, kanal, hari, dan lainnya — tempat hal itu jauh lebih sering atau jauh lebih jarang terjadi.",
  status:
    "Tahap siklus hidup atau rekomendasi dari halaman Portofolio. Sebuah transaksi dihitung sebagai kejadian kalau produknya berstatus ini.",
  top: "Batas “transaksi besar”: 10% teratas berarti hanya 10% transaksi P1 dengan nilai tertinggi yang dihitung.",
  dim: "Dimensi dan nilainya, mis. Kanal = Leads: setiap transaksi lewat kanal Leads dihitung sebagai kejadian.",
  dir: "Menaikkan = kondisi tempat kejadian ini lebih sering dari biasanya. Menurunkan = kondisi tempat kejadian ini lebih jarang dari biasanya.",
  per: "Transaksi: setiap transaksi dihitung sama. Pendapatan: transaksi dihitung menurut nilainya, jadi hasilnya berupa porsi omzet — cocok untuk menjawab “berapa bagian pendapatan yang terdampak”.",
  min: "Kelompok yang transaksinya kurang dari angka ini diabaikan, karena hasil dari kelompok kecil mudah kebetulan.",
  factors:
    "Dimensi yang dicari pengaruhnya. Klik untuk menyalakan atau mematikan. Yang dicoret tidak bisa diuji karena ikut menentukan kejadiannya sendiri.",
};

/** Kata kerja per dimensi untuk kalimat "transaksi yang …". */
const VERB = {
  Channel: (v) => `lewat kanal ${v}`,
  Payment_Method: (v) => `dibayar dengan ${v}`,
  Branch: (v) => `terjadi di cabang ${v}`,
  branch_area: (v) => `terjadi di wilayah ${v}`,
  Lini_Produk: (v) => `berisi produk lini ${v}`,
  Category: (v) => `berisi ${v}`,
  __name: (v) => `berisi ${v}`,
  Item_Code: (v) => `berisi ${v}`,
  Quarter_Name: (v) => `terjadi di ${v}`,
  __dow: (v) => `terjadi pada hari ${v}`,
  __qtyband: (v) => `berukuran ${v}`,
};

/* ------------------------------------------------------------- format    */

const rp = (v) => fmt(v, "currency", true);
const nfX1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfX2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (p) => (p == null || Number.isNaN(p) ? "–" : p === 0 ? "0%" : p < 0.001 ? "< 0,1%" : nfPct.format(p));
const times = (x) =>
  x == null || Number.isNaN(x)
    ? "–"
    : x === Infinity
    ? "∞"
    : `${x >= 10 ? nfFull.format(x) : x > 0 && x < 0.1 ? nfX2.format(x) : nfX1.format(x)}×`;
const fid = (f) => `${f.dim}\u0001${f.key}`;
const inP1 = (ln, win) => ln.__d >= win.p1.from && ln.__d <= win.p1.to;

/** Warna arah: ke atas memakai anggur, ke bawah biru — sama dengan skala indeks di Matriks. */
const UP_INK = "var(--brand-700)";
const DOWN_INK = "#2a5ea8";

/* ------------------------------------------------------------- kalimat   */

/** Nama kelompok di dalam kalimat: "lini Installation Hardware & Tools", "cabang BALI". */
const GROUP_NAME = {
  Lini_Produk: (v) => `lini ${v}`,
  Category: (v) => `kategori ${v}`,
  __name: (v) => `produk ${v}`,
  Item_Code: (v) => `kode barang ${v}`,
  Branch: (v) => `cabang ${v}`,
  branch_area: (v) => `wilayah ${v}`,
  Channel: (v) => `kanal ${v}`,
  Payment_Method: (v) => `pembayaran ${v}`,
  Quarter_Name: (v) => `kuartal ${v}`,
  __dow: (v) => `hari ${v}`,
  __qtyband: (v) => `pesanan berukuran ${v}`,
};
const groupFn = (dim) => GROUP_NAME[dim] || ((v) => `${labelOf(dim).toLowerCase()} ${v}`);
// Nilai kosong sudah berbunyi lengkap ("(Lini tidak diketahui)"), jadi tidak diberi awalan.
const bare = (label) => String(label).startsWith("(");
const groupName = (f) => (bare(f.label) ? f.label : groupFn(f.dim)(f.label));

/** Nama kelompok dengan nilainya ditebalkan: lini <b>Installation Hardware & Tools</b>. */
function GroupText({ f }) {
  const [pre, post] = bare(f.label) ? ["", ""] : groupFn(f.dim)("\u0000").split("\u0000");
  return (
    <>
      {pre}
      <b className="font-semibold text-[var(--ink-900)]">{f.label}</b>
      {post}
    </>
  );
}

/** Sebutan singkat kelompok yang sedang dibahas ("lini ini"). Kuartal dan hari
    tetap disebut lengkap: "kuartal ini" atau "hari ini" terbaca sebagai waktu sekarang. */
const THIS = {
  Lini_Produk: "lini ini",
  Category: "kategori ini",
  __name: "produk ini",
  Item_Code: "barang ini",
  Branch: "cabang ini",
  branch_area: "wilayah ini",
  Channel: "kanal ini",
  Payment_Method: "metode bayar ini",
  __qtyband: "ukuran pesanan ini",
};
const thisOf = (f) => THIS[f.dim] || groupName(f);

const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** "a", "a dan b", "a, b, dan c". */
const joinList = (xs) => (xs.length <= 1 ? xs.join("") : xs.length === 2 ? `${xs[0]} dan ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, dan ${xs[xs.length - 1]}`);

/** Bagian pilihan pengguna di dalam kalimat permintaan. */
function Em({ children }) {
  return <b className="font-semibold text-[var(--brand-700)]">{children}</b>;
}

/**
 * Keterangan setiap angka satu kondisi, dalam kalimat lengkap. Dipakai di
 * daftar (saat kursor diarahkan ke angka) dan di rincian.
 */
function factorTips(f, per, outcome, ki, minSupport) {
  const g = groupName(f);
  const rev = per === "rev";
  const whole = rev ? "pendapatan" : "transaksi";
  const what = rev ? outcome.whatRev : outcome.what;
  const cover = ki?.WK ? f.wk / ki.WK : 0;
  const only = (x, y) => (x < y ? "hanya " : "");
  return {
    inside:
      f.rate === 0
        ? `Dari seluruh ${whole} ${g} selama P1, tidak ada yang ${what}.`
        : `Dari seluruh ${whole} ${g} selama P1, ${only(f.rate, f.rateOut)}${pct(f.rate)} ${what}.`,
    outside:
      f.rateOut === 0
        ? `Di luar ${g}, tidak ada sama sekali.`
        : `Dari seluruh ${whole} selain ${g}, ${only(f.rateOut, f.rate)}${pct(f.rateOut)} ${what}.`,
    lift:
      f.lift === Infinity
        ? `Di luar ${g} tidak ada sama sekali, jadi kejadian ini hanya ada di sini — tidak bisa dibagi.`
        : f.rate === 0
        ? `Di ${g} tidak ada sama sekali, sedangkan di luarnya ${pct(f.rateOut)}.`
        : `Lift = porsi di kelompok ini ÷ porsi di luarnya = ${pct(f.rate)} ÷ ${pct(f.rateOut)} ≈ ${times(f.lift)}. ` +
          (f.lift >= 1
            ? `Artinya ${times(f.lift)} lipat porsi di luar ${g}.`
            : `Artinya hanya ${times(f.lift)} porsi di luar ${g}.`) +
          ` 1× berarti sama saja; makin jauh dari 1×, makin kuat kaitannya.`,
    count:
      `${cap(g)} punya ${nfFull.format(f.n)} transaksi di P1` +
      (rev ? ` (${rp(f.wn)}, ${pct(f.share)} pendapatan P1).` : ` (${pct(f.share)} transaksi P1).`) +
      (minSupport ? ` Kelompok dengan kurang dari ${nfFull.format(minSupport)} transaksi diabaikan, karena hasilnya mudah kebetulan.` : ""),
    cover: rev
      ? `Dari seluruh ${outcome.nounRev} selama P1 (${rp(ki?.WK || 0)}), ${pct(cover)} — ${rp(f.wk)} — ada di ${g}.`
      : `Dari seluruh ${outcome.nounTx} selama P1 (${nfFull.format(ki?.K || 0)} transaksi), ${pct(cover)} — ${nfFull.format(f.k)} transaksi — ada di ${g}.`,
    size: rev
      ? `${cap(g)} mencakup ${pct(f.share)} dari seluruh pendapatan P1 (${rp(f.wn)} dari ${rp(ki?.WN || 0)}).`
      : `${cap(g)} mencakup ${pct(f.share)} dari seluruh transaksi P1 (${nfFull.format(f.n)} dari ${nfFull.format(ki?.N || 0)}).`,
  };
}

const WEAK_TIP =
  "Selisihnya belum lolos uji statistik: kejadiannya sedikit, atau pendapatannya ditopang segelintir transaksi besar. Anggap sebagai dugaan, bukan kesimpulan.";

/** Kata biasa untuk besaran: dipakai di tabel Kesimpulan. */
const dependWord = (r) => (r >= 0.5 ? "Sangat" : r >= 0.2 ? "Cukup" : r >= 0.05 ? "Sedikit" : r > 0 ? "Hampir tidak" : "Tidak sama sekali");
const oftenWord = (r) => (r >= 0.5 ? "Sangat sering" : r >= 0.2 ? "Cukup sering" : r >= 0.05 ? "Jarang" : r > 0 ? "Sangat jarang" : "Tidak pernah");
const compareWord = (f) =>
  f.lift === Infinity
    ? "Hanya ada di sini"
    : f.rate === 0
    ? "Tidak ada sama sekali"
    : f.lift >= 3
    ? "Jauh lebih tinggi"
    : f.lift >= 1.5
    ? "Lebih tinggi"
    : f.lift >= 1.1
    ? "Sedikit lebih tinggi"
    : f.lift > 1 / 1.1
    ? "Hampir sama"
    : f.lift > 1 / 1.5
    ? "Sedikit lebih rendah"
    : f.lift > 1 / 3
    ? "Lebih rendah"
    : "Jauh lebih rendah";
const coverWord = (c) => (c >= 0.4 ? "Besar" : c >= 0.15 ? "Sedang" : c > 0 ? "Kecil" : "Tidak ada");
const sizeWord = (s) => (s >= 0.2 ? "Besar" : s >= 0.05 ? "Sedang" : "Kecil");
/** Kekuatan kaitan dari lift (untuk arah turun dipakai kebalikannya). */
const strengthWord = (k) => (k >= 3 ? "sangat kuat" : k >= 2 ? "kuat" : k >= 1.3 ? "sedang" : "lemah");

/** Baris tanya-jawab "Kesimpulan untuk …". */
function conclusionRows(f, ki, per, outcome) {
  const T = thisOf(f);
  const rev = per === "rev";
  const cover = ki.WK ? f.wk / ki.WK : 0;
  const cw = coverWord(cover);
  return [
    rev
      ? { q: `Seberapa bergantung pendapatan ${T} pada ${outcome.short}?`, word: dependWord(f.rate), rest: `${pct(f.rate)} pendapatannya` }
      : { q: `Seberapa sering transaksi di ${T} ${outcome.what}?`, word: oftenWord(f.rate), rest: `${pct(f.rate)} transaksinya` },
    {
      q: `Dibanding di luar ${T}?`,
      word: compareWord(f),
      rest: `${pct(f.rate)} di sini dibanding ${pct(f.rateOut)} di luar${Number.isFinite(f.lift) && f.lift > 0 ? ` (${times(f.lift)})` : ""}`,
    },
    {
      q: `Seberapa besar porsinya dari seluruh ${rev ? outcome.nounRev : outcome.nounTx}?`,
      word: cw,
      rest: `${cw === "Kecil" ? "hanya " : ""}${pct(cover)} (${rev ? `${rp(f.wk)} dari ${rp(ki.WK)}` : `${nfFull.format(f.k)} dari ${nfFull.format(ki.K)} transaksi`})`,
    },
    {
      q: THIS[f.dim] ? `Seberapa besar ${T}?` : `Seberapa besar kelompok ${T}?`,
      word: sizeWord(f.share),
      rest: rev
        ? `sekitar ${rp(f.wn)} dari ${nfFull.format(f.n)} transaksi (${pct(f.share)} pendapatan P1)`
        : `${nfFull.format(f.n)} transaksi (${pct(f.share)} transaksi P1)`,
    },
    f.strong
      ? { q: "Seberapa yakin hasil ini?", word: "Yakin", rest: "selisihnya terlalu besar untuk sebuah kebetulan" }
      : {
          q: "Seberapa yakin hasil ini?",
          word: "Belum yakin",
          rest: rev
            ? "kejadiannya sedikit atau pendapatannya ditopang segelintir transaksi besar — anggap sebagai dugaan"
            : "kejadiannya terlalu sedikit — anggap sebagai dugaan",
          warn: true,
        },
  ];
}

/** Satu kalimat "Artinya" dari tabel Kesimpulan — memakai kata yang sama dengan tabelnya. */
function meaningText(f, ki, per, outcome) {
  const T = thisOf(f);
  const rev = per === "rev";
  if (!f.strong) return "Belum meyakinkan, jadi anggap sebagai dugaan. Perpanjang jendela analisis supaya datanya lebih banyak, lalu lihat lagi.";
  const noun = rev ? outcome.nounRev : outcome.nounTx;
  if (f.rate > f.rateOut) {
    const cover = ki.WK ? f.wk / ki.WK : 0;
    const s = strengthWord(f.lift);
    const strong = s === "kuat" || s === "sangat kuat";
    const cw = coverWord(cover);
    if (cw === "Besar")
      return strong
        ? `Kaitannya ${s} dan cakupannya besar: ${pct(cover)} dari seluruh ${noun} ada di ${T}. Ini salah satu tempat yang layak dilihat lebih dulu.`
        : `Kaitannya ${s}, tapi cakupannya besar: ${pct(cover)} dari seluruh ${noun} ada di ${T}. Karena besarnya, tetap layak dilihat lebih dulu.`;
    if (cw === "Sedang")
      return strong
        ? `Kaitannya ${s} dan cakupannya sedang: ${pct(cover)} dari seluruh ${noun} ada di ${T}. Layak diperhatikan.`
        : `Kaitannya ${s} dan cakupannya sedang (${pct(cover)} dari seluruh ${noun}). Layak dipantau, tapi bukan prioritas utama.`;
    return strong
      ? `Kaitannya ${s}, tapi cakupannya kecil: hanya ${pct(cover)} dari seluruh ${noun} ada di ${T}. Penting bagi ${T} sendiri, tapi pengaruhnya ke total perusahaan terbatas.`
      : `Kaitannya ${s} dan cakupannya kecil (${pct(cover)} dari seluruh ${noun}), jadi bukan prioritas.`;
  }
  const s = strengthWord(f.lift > 0 ? 1 / f.lift : Infinity);
  const far = s === "kuat" || s === "sangat kuat";
  const head = `${cap(outcome.short)} ${far ? "jauh " : ""}lebih jarang di ${T}: ${pct(f.rate)} dibanding ${pct(f.rateOut)} di luar.`;
  const size = `${pct(f.share)} ${rev ? "pendapatan" : "transaksi"} P1`;
  const sw = sizeWord(f.share);
  return sw === "Besar"
    ? `${head} Karena ${T} besar — ${size} — selisih ini ikut menekan rata-rata perusahaan.`
    : sw === "Sedang"
    ? `${head} ${cap(T)} berukuran sedang — ${size} — jadi selisih ini sedikit ikut menekan rata-rata perusahaan.`
    : `${head} ${cap(T)} kecil — ${size} — jadi pengaruhnya ke rata-rata perusahaan terbatas.`;
}

/* ================================================================ halaman */

export default function InfluencersPage({
  lines,
  labels,
  portfolio,
  win,
  winMode,
  setWinMode,
  unitKey,
  setUnitKey,
  crit,
  setCrit,
  openProductAt,
  explainInVariance,
  onMatchLength,
}) {
  // Pengaturan pertanyaan, nilai LANGSUNG (dipakai kontrol dan kalimat permintaan).
  const [kindIn, setKind] = useState("status");
  const [statusIn, setStatus] = useState("stage:menurun");
  const [topIn, setTop] = useState("0.1");
  const [oDimIn, setODim] = useState(() => OUTCOME_DIMS.find(dimOk) || "Channel");
  const [oValIn, setOVal] = useState(null);
  const [dirIn, setDir] = useState("up");
  const [perIn, setPer] = useState("rev");
  const [minSupportIn, setMinSupport] = useState(30);
  const [offIn, setOff] = useState(() => new Set());
  const [rankBy, setRankBy] = useState("lift");
  const [showWeak, setShowWeak] = useState(false);
  const [selId, setSelId] = useState(null);
  const [allFactors, setAllFactors] = useState(false);
  const [openSeg, setOpenSeg] = useState(null);
  const [allSegs, setAllSegs] = useState(false);

  /* Hitungan berat memakai salinan "tenang" pengaturan itu, yang baru menyusul
     sesudah logo memuat tergambar — kontrolnya tetap terasa seketika. */
  const askLive = useMemo(
    () => ({ kind: kindIn, status: statusIn, top: topIn, oDim: oDimIn, oVal: oValIn, dir: dirIn, per: perIn, minSupport: minSupportIn, off: offIn }),
    [kindIn, statusIn, topIn, oDimIn, oValIn, dirIn, perIn, minSupportIn, offIn]
  );
  const [ask, recalculating] = useSettled(askLive);
  const { kind, status, top, oDim, oVal, dir, per, minSupport, off } = ask;

  const unit = unitDef(unitKey);

  /* Memilih kondisi di layar satu kolom (rincian ada di bawah daftar):
     gulir ke rinciannya, supaya kesimpulannya langsung terlihat. */
  const detailRef = useRef(null);
  const [pickTick, setPickTick] = useState(0);
  const pick = (f) => {
    setSelId(fid(f));
    setPickTick((t) => t + 1);
  };
  useEffect(() => {
    if (!pickTick || typeof window === "undefined" || !detailRef.current) return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    detailRef.current.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [pickTick]);

  // Ganti pertanyaan → mulai lagi dari pendorong teratas.
  useEffect(() => {
    setSelId(null);
    setOpenSeg(null);
    setAllFactors(false);
    setAllSegs(false);
  }, [kind, status, top, oDim, oVal, dir, per, unitKey]);

  const changeKind = (k) => {
    setKind(k);
    // Status produk paling bermakna sebagai porsi omzet ("berapa bagian
    // pendapatan cabang ini bergantung pada produk menurun"); dua lainnya
    // paling alami dihitung per transaksi.
    setPer(k === "status" ? "rev" : "tx");
  };

  /* --- pilihan nilai untuk mode "Nilai tertentu" --- */
  const optionsFor = (k, d) => {
    if (k !== "dim") return [];
    const m = new Map();
    for (const ln of lines) {
      if (!inP1(ln, win)) continue;
      const v = ln[d];
      m.set(v, (m.get(v) || 0) + 1);
    }
    // Semua nilai, diurut dari yang paling sering muncul.
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([key, n]) => ({ key, n, label: valueLabel(d, key, labels) }));
  };
  const valueOptions = useMemo(() => optionsFor(kind, oDim), [kind, lines, oDim, win, labels]); // eslint-disable-line react-hooks/exhaustive-deps
  const valueOptionsLive = useMemo(
    () => (kindIn === kind && oDimIn === oDim ? valueOptions : optionsFor(kindIn, oDimIn)),
    [kindIn, oDimIn, kind, oDim, valueOptions, lines, win, labels] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const effVal = (opts, v) => (opts.some((o) => o.key === v) ? v : opts[0]?.key ?? null);
  const oValEff = effVal(valueOptions, oVal);
  const oValEffLive = effVal(valueOptionsLive, oValIn);

  /* --- hasil yang dijelaskan --- */
  const makeOutcome = (kind, status, top, oDim, oValEff) => {
    if (kind === "big") {
      const vals = [];
      for (const ln of lines) if (inP1(ln, win) && ln.Revenue > 0) vals.push(ln.Revenue);
      const thr = quantile(vals, 1 - Number(top));
      return {
        test: (ln) => ln.Revenue >= thr,
        what: `bernilai besar (≥ ${rp(thr)})`,
        whatRev: "datang dari transaksi bernilai besar",
        label: `Transaksi ≥ ${rp(thr)}`,
        listWhat: "transaksi bernilai besar",
        short: "transaksi bernilai besar",
        nounRev: "pendapatan dari transaksi bernilai besar",
        nounTx: "transaksi bernilai besar",
        ask: (
          <>
            bernilai besar (<Em>{Math.round(Number(top) * 100)}% teratas</Em>, ≥ {rp(thr)})
          </>
        ),
      };
    }
    if (kind === "status") {
      const [t, v] = status.split(":");
      const map = portfolio?.byKey;
      const uk = unitKey;
      const test =
        t === "stage"
          ? (ln) => map?.get(ln[uk])?.stage === v
          : (ln) => map?.get(ln[uk])?.rec.action === v;
      const sLabel = t === "stage" ? STAGE_BY_KEY[v]?.label || v : ACTION_BY_KEY[v]?.label || v;
      const phrase = t === "stage" ? `yang ${sLabel.toLowerCase()}` : `berlabel “${sLabel}”`;
      return {
        test,
        what: `berasal dari ${unit.plural} ${phrase}`,
        whatRev: `berasal dari ${unit.plural} ${phrase}`,
        label: `${unit.plural[0].toUpperCase()}${unit.plural.slice(1)} ${phrase}`,
        listWhat: `transaksi ${unit.plural} ${phrase}`,
        short: `${unit.plural} ${phrase}`,
        nounRev: `pendapatan ${unit.plural} ${phrase}`,
        nounTx: `transaksi ${unit.plural} ${phrase}`,
        ask:
          t === "stage" ? (
            <>
              berasal dari {unit.plural} yang <Em>{sLabel}</Em>
            </>
          ) : (
            <>
              berasal dari {unit.plural} berlabel <Em>{sLabel}</Em>
            </>
          ),
        statusType: t,
        statusKey: v,
      };
    }
    const v = oValEff;
    const vLabel = valueLabel(oDim, v, labels);
    const verbFn = VERB[oDim] || ((x) => `dengan ${labelOf(oDim).toLowerCase()} ${x}`);
    const verb = verbFn(vLabel);
    const [vPre, vPost] = verbFn("\u0000").split("\u0000");
    return {
      test: (ln) => ln[oDim] === v,
      what: verb,
      whatRev: `datang dari transaksi yang ${verb}`,
      label: `${labelOf(oDim)} = ${vLabel}`,
      listWhat: `transaksi yang ${verb}`,
      short: `transaksi yang ${verb}`,
      nounRev: `pendapatan dari transaksi yang ${verb}`,
      nounTx: `transaksi yang ${verb}`,
      ask: (
        <>
          {vPre}
          <Em>{vLabel}</Em>
          {vPost}
        </>
      ),
    };
  };
  const outcome = useMemo(
    () => makeOutcome(kind, status, top, oDim, oValEff),
    [kind, top, status, portfolio, unitKey, unit, oDim, oValEff, lines, win, labels] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Versi langsung hanya untuk kalimat permintaan; sama dengan `outcome` kalau tidak ada yang menunggu.
  const outcomeLive = useMemo(
    () => (askLive === ask ? outcome : makeOutcome(kindIn, statusIn, topIn, oDimIn, oValEffLive)),
    [askLive, ask, outcome, kindIn, statusIn, topIn, oDimIn, oValEffLive, portfolio, unitKey, lines, win, labels] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* --- faktor yang boleh diuji untuk pertanyaan ini --- */
  const candidatesFor = (kind, oDim) => {
    const avail = FACTOR_DIMS.filter(dimOk);
    if (kind === "big") return avail.filter((d) => d !== "__qtyband"); // ukuran pesanan pasti menentukan nilai
    if (kind === "status")
      return avail.filter((d) => DIM_FAMILY[d] !== "waktu" && (DIM_FAMILY[d] !== "produk" || (ABOVE[unitKey] || []).includes(d)));
    const fam = DIM_FAMILY[oDim];
    return avail.filter((d) => d !== oDim && !(fam && DIM_FAMILY[d] === fam));
  };
  const candidateDims = useMemo(() => candidatesFor(kind, oDim), [kind, unitKey, oDim]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidateDimsLive = useMemo(() => candidatesFor(kindIn, oDimIn), [kindIn, unitKey, oDimIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const factorDims = candidateDims.filter((d) => !off.has(d));
  const factorDimsLive = candidateDimsLive.filter((d) => !offIn.has(d));
  const factorKey = factorDims.join("|");

  /* --- mesin --- */
  const ki = useMemo(() => {
    if (!factorDims.length) return null;
    return keyInfluencers(lines, {
      win,
      outcome: outcome.test,
      factorDims,
      minSupport,
      labels,
      weight: per === "rev" ? (ln) => ln.Revenue : undefined,
    });
  }, [lines, win, outcome, factorKey, minSupport, labels, per]); // eslint-disable-line react-hooks/exhaustive-deps

  const up = dir === "up";
  const sameDir = (f) => (up ? f.rate > f.rateOut : f.rate < f.rateOut);

  const ranked = useMemo(() => {
    if (!ki) return [];
    const list = ki.factors.filter((f) => sameDir(f) && (showWeak || f.strong));
    const score =
      rankBy === "impact"
        ? (f) => (up ? f.excess : -f.excess)
        : (f) => (up ? f.lift : f.lift > 0 ? 1 / f.lift : Infinity);
    return list.sort((a, b) => b.strong - a.strong || score(b) - score(a) || b.n - a.n);
  }, [ki, up, rankBy, showWeak]); // eslint-disable-line react-hooks/exhaustive-deps

  const weakCount = ki ? ki.factors.filter((f) => sameDir(f) && !f.strong).length : 0;

  const sel = useMemo(() => {
    if (!ki) return null;
    if (selId) {
      const i = selId.indexOf("\u0001");
      const d = selId.slice(0, i);
      const k = selId.slice(i + 1);
      const f = ki.byDim[d]?.find((x) => String(x.key) === k);
      if (f) return f;
    }
    return ranked[0] || null;
  }, [ki, selId, ranked]);

  /* --- tingkat daftar isi kelompok --- */
  const contentsDim = useMemo(() => (kind === "dim" ? refineDim(unitKey, [oDim]) : unitKey), [kind, oDim, unitKey]);

  const segsAll = ki ? (up ? ki.segUp : ki.segDown) : [];
  const segs = allSegs ? segsAll : segsAll.slice(0, SEG_LIMIT);
  const segMax = Math.max(ki ? ki.base : 0, ...segs.map((x) => x.rate)) * 1.04;
  const empty = ki && (ki.K === 0 || ki.base >= 0.999);
  const shownFactors = allFactors ? ranked : ranked.slice(0, FACTOR_LIMIT);
  const maxRate = Math.max(1e-6, ...shownFactors.map((f) => Math.max(f.rate, f.rateOut))) * 1.04;

  const toggleOff = (d) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <BusyOverlay show={recalculating} label="Menguji ulang semua kondisi…" sub="Sebentar, pendorongnya sedang dihitung ulang." />
      <WindowBar
        unitKey={unitKey}
        setUnitKey={setUnitKey}
        winMode={winMode}
        setWinMode={setWinMode}
        win={win}
        crit={crit}
        setCrit={setCrit}
        portfolio={portfolio}
        onMatchLength={onMatchLength}
      />

      <div className="space-y-4 p-4">
        {/* ============================================ pertanyaan */}
        <Section
          title="Apa yang ingin dijelaskan?"
          icon={IconKey}
          tone="brand"
          sub="Pilih kejadiannya dan cara menghitungnya. Halaman ini lalu mencari kondisi — wilayah, cabang, kanal, cara bayar, hari, ukuran pesanan — yang membuat kejadian itu jauh lebih sering atau jauh lebih jarang terjadi di P1. Arahkan kursor ke label bergaris titik untuk artinya."
          bodyClass="p-0"
        >
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b px-4 py-3", LINE)}>
            <Field label="Kejadian" tip={TIPS.kind}>
              <Segmented label="Kejadian" value={kindIn} onChange={changeKind} options={KINDS} />
            </Field>

            {kindIn === "status" && (
              <Field label={`${unit.label} berstatus`} tip={TIPS.status}>
                <select className={SELECT} value={statusIn} onChange={(e) => setStatus(e.target.value)}>
                  <optgroup label="Tahap siklus hidup">
                    {STAGES.map((s) => (
                      <option key={s.key} value={`stage:${s.key}`}>
                        {s.label} ({portfolio?.byStage?.[s.key]?.n || 0})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Rekomendasi">
                    {ACTIONS.map((a) => (
                      <option key={a.key} value={`action:${a.key}`}>
                        {a.label} ({portfolio?.byAction?.[a.key]?.n || 0})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
            )}

            {kindIn === "big" && (
              <Field label="Ambang" tip={TIPS.top}>
                <Segmented label="Ambang transaksi besar" value={topIn} onChange={setTop} options={TOPS} />
              </Field>
            )}

            {kindIn === "dim" && (
              <>
                <Field label="Dimensi" tip={TIPS.dim}>
                  <select
                    className={SELECT}
                    value={oDimIn}
                    onChange={(e) => {
                      setODim(e.target.value);
                      setOVal(null);
                    }}
                  >
                    {OUTCOME_DIMS.filter(dimOk).map((d) => (
                      <option key={d} value={d}>
                        {labelOf(d)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="=">
                  <select className={cx(SELECT, "max-w-[260px]")} value={oValEffLive ?? ""} onChange={(e) => setOVal(e.target.value)}>
                    {valueOptionsLive.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label} ({nfFull.format(o.n)})
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>

          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b px-4 py-3", LINE)}>
            <Field label="Cari yang" tip={TIPS.dir}>
              <Segmented
                label="Arah"
                value={dirIn}
                onChange={setDir}
                options={[
                  { key: "up", label: "Menaikkan peluang" },
                  { key: "down", label: "Menurunkan peluang" },
                ]}
              />
            </Field>
            <Field label="Hitung per" tip={TIPS.per}>
              <Segmented
                label="Satuan"
                value={perIn}
                onChange={setPer}
                options={[
                  { key: "tx", label: "Transaksi", hint: "Peluang = porsi transaksi" },
                  { key: "rev", label: "Pendapatan", hint: "Peluang = porsi pendapatan" },
                ]}
              />
            </Field>
            <Field label="Kelompok minimal" tip={TIPS.min}>
              <select className={SELECT} value={minSupportIn} onChange={(e) => setMinSupport(Number(e.target.value))}>
                {SUPPORTS.map((n) => (
                  <option key={n} value={n}>
                    {n} transaksi
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className={cx("flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5", LINE)}>
            <span className={cx("mr-1 text-[11px]", MUTED)}>
              <Tip tip={TIPS.factors} focusable={false}>
                Faktor yang diuji
              </Tip>
            </span>
            {FACTOR_DIMS.filter(dimOk).map((d) => {
              const allowed = candidateDimsLive.includes(d);
              const on = allowed && !offIn.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={on}
                  onClick={() => toggleOff(d)}
                  title={
                    allowed
                      ? on
                        ? "Klik untuk berhenti menguji dimensi ini"
                        : "Klik untuk ikut menguji dimensi ini"
                      : "Tidak diuji: dimensi ini ikut menentukan kejadian yang dijelaskan, jadi hasilnya pasti cocok dan tidak berarti apa-apa."
                  }
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    FOCUS,
                    on
                      ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-800)]"
                      : "border-[var(--ink-200)] bg-[var(--paper)] text-[var(--ink-500)] hover:border-[var(--brand-200)]",
                    !allowed && "cursor-not-allowed line-through opacity-50 hover:border-[var(--ink-200)]"
                  )}
                >
                  {labelOf(d)}
                </button>
              );
            })}
          </div>

          <QuestionLine
            factorDims={factorDimsLive}
            up={dirIn === "up"}
            outcome={outcomeLive}
            per={perIn}
            minSupport={minSupportIn}
            range={win?.p1 ? shortRange(win.p1) : null}
          />
          {ki && !(ki.K === 0 || ki.base >= 0.999) && (
            <Headline ki={ki} outcome={outcome} per={per} up={up} ranked={ranked} onPick={pick} />
          )}
        </Section>

        {/* ============================================ isi */}
        {!ki ? (
          <Notice tone="warn">Nyalakan minimal satu faktor untuk diuji.</Notice>
        ) : empty ? (
          <Notice tone="warn" title={ki.K === 0 ? "Kejadian ini tidak muncul di P1" : "Semua transaksi P1 memenuhi kejadian ini"}>
            {ki.K === 0
              ? kind === "status"
                ? `Tidak ada transaksi P1 yang ${outcome.what}. Produk berstatus ini memang tidak terjual di jendela ini — pilih status lain, atau ganti tingkat analisis.`
                : `Tidak ada transaksi P1 yang ${outcome.what}. Pilih kejadian lain atau perpanjang jendela.`
              : "Tidak ada yang bisa dibandingkan. Pilih kejadian yang lebih sempit."}
          </Notice>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* ------------------------------ daftar pendorong */}
            <Section
              title={up ? "Kondisi yang menaikkan peluang" : "Kondisi yang menurunkan peluang"}
              icon={IconFlag}
              tone={up ? "brand" : "blue"}
              sub={
                <>
                  {up
                    ? `Diurut dari ${rankBy === "lift" ? "lift terbesar (paling kuat)" : "kelebihan kejadian terbanyak (paling berdampak)"}. Lift = porsi di dalam kelompok ÷ porsi di luar kelompok.`
                    : `Diurut dari ${rankBy === "lift" ? "lift terkecil (paling kuat menekan)" : "kekurangan kejadian terbanyak"}. Lift di bawah 1× artinya kejadian ini jarang terjadi di kelompok itu.`}{" "}
                  Arahkan kursor ke angka untuk artinya; klik sebuah kondisi untuk kesimpulannya.
                </>
              }
              actions={
                <Segmented
                  label="Urutkan"
                  size="xs"
                  value={rankBy}
                  onChange={setRankBy}
                  options={[
                    { key: "lift", label: "Paling kuat", hint: "Urut dari lift" },
                    {
                      key: "impact",
                      label: "Paling berdampak",
                      hint: "Urut dari jumlah kejadian yang lebih (atau kurang) dibanding kalau kelompok ini berperilaku seperti sisanya",
                    },
                  ]}
                />
              }
              bodyClass="p-2"
            >
              <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 pt-1 text-[11px]", MUTED)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: up ? UP_INK : DOWN_INK }} />
                  di kelompok ini
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full border-[1.5px] border-[var(--ink-400)] bg-[var(--paper)]" />
                  di luar kelompok
                </span>
                {weakCount > 0 && (
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-[var(--ink-600)]">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[var(--brand-700)]"
                      checked={showWeak}
                      onChange={(e) => setShowWeak(e.target.checked)}
                    />
                    Tampilkan {weakCount} yang lemah
                  </label>
                )}
              </div>

              {ranked.length === 0 ? (
                <p className={cx("px-2 pb-3 text-xs leading-relaxed", MUTED)}>
                  Tidak ada kondisi yang cukup meyakinkan.{" "}
                  {weakCount > 0
                    ? `Ada ${weakCount} yang lemah — centang di atas untuk melihatnya sebagai dugaan.`
                    : "Coba turunkan kelompok minimal, ubah arah, atau nyalakan faktor lain."}
                </p>
              ) : (
                <ol className="space-y-0.5">
                  {shownFactors.map((f, i) => (
                    <FactorRow
                      key={fid(f)}
                      f={f}
                      i={i}
                      up={up}
                      max={maxRate}
                      on={sel && fid(sel) === fid(f)}
                      onClick={() => pick(f)}
                      tips={factorTips(f, per, outcome, ki, minSupport)}
                    />
                  ))}
                </ol>
              )}
              {ranked.length > FACTOR_LIMIT && (
                <div className="px-2 pt-2">
                  <ShowAll total={ranked.length} limit={FACTOR_LIMIT} open={allFactors} onToggle={() => setAllFactors((v) => !v)} noun="kondisi" />
                </div>
              )}
            </Section>

            {/* ------------------------------ rincian */}
            <div className="scroll-mt-3 lg:sticky lg:top-3" ref={detailRef}>
              {sel ? (
                <FactorDetail
                  f={sel}
                  ki={ki}
                  per={per}
                  outcome={outcome}
                  minSupport={minSupport}
                  lines={lines}
                  win={win}
                  labels={labels}
                  contentsDim={contentsDim}
                  unitKey={unitKey}
                  portfolio={portfolio}
                  onPickValue={(f) => setSelId(fid(f))}
                  openProductAt={openProductAt}
                  explainInVariance={explainInVariance}
                />
              ) : (
                <Section title="Rincian">
                  <p className={cx("text-xs", MUTED)}>Pilih sebuah kondisi di kiri untuk melihat rinciannya.</p>
                </Section>
              )}
            </div>
          </div>
        )}

        {/* ============================================ segmen */}
        {ki && !empty && (
          <Section
            title={up ? "Segmen dengan peluang tertinggi" : "Segmen dengan peluang terendah"}
            icon={IconSegments}
            tone="violet"
            sub="Gabungan dua kondisi yang lebih tajam daripada masing-masing kondisinya sendiri — tempat kejadian ini paling terkumpul (atau paling langka). Klik untuk melihat isinya."
            bodyClass="p-2"
          >
            {segs.length === 0 ? (
              <p className={cx("px-2 py-2 text-xs leading-relaxed", MUTED)}>
                Tidak ada gabungan dua kondisi yang lebih tajam daripada kondisi tunggalnya. Artinya pendorong di atas sudah bekerja sendiri-sendiri.
              </p>
            ) : (
              <ol className="grid items-start gap-x-3 gap-y-0.5 xl:grid-cols-2">
                {segs.map((s, i) => (
                  <SegmentRow
                    key={s.parts.map((p) => `${p.dim}=${p.key}`).join("&")}
                    s={s}
                    i={i}
                    up={up}
                    per={per}
                    base={ki.base}
                    max={segMax}
                    open={openSeg === i}
                    onToggle={() => setOpenSeg(openSeg === i ? null : i)}
                    outcome={outcome}
                    lines={lines}
                    win={win}
                    labels={labels}
                    contentsDim={contentsDim}
                    unitKey={unitKey}
                    portfolio={portfolio}
                    openProductAt={openProductAt}
                  />
                ))}
              </ol>
            )}
            {segsAll.length > SEG_LIMIT && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-2 text-[11px] text-[var(--ink-500)]">
                <span>
                  Menampilkan {nfFull.format(segs.length)} dari {nfFull.format(segsAll.length)} segmen
                </span>
                <ShowAll
                  total={segsAll.length}
                  limit={SEG_LIMIT}
                  open={allSegs}
                  onToggle={() => {
                    if (allSegs && openSeg != null && openSeg >= SEG_LIMIT) setOpenSeg(null);
                    setAllSegs((v) => !v);
                  }}
                  noun="segmen"
                />
              </div>
            )}
          </Section>
        )}

        {ki && !empty && (
          <p className={cx("max-w-[100ch] px-1 text-[11px] leading-relaxed", MUTED)}>
            Cara membaca: lift 3× berarti kejadian ini tiga kali lebih sering terjadi di kelompok itu dibanding di luar kelompok itu. Ini
            hubungan, bukan sebab-akibat — kondisi yang saling berkaitan (mis. cabang tertentu yang hampir semua transaksinya lewat satu
            kanal) bisa sama-sama muncul. Kondisi berlabel <i>lemah</i> belum lolos uji statistik: kejadiannya sedikit atau omzetnya
            ditopang segelintir transaksi besar. Angka bergaris titik punya keterangan saat kursor diarahkan ke sana.
          </p>
        )}
      </div>
    </div>
  );
}

/* ================================================================ judul   */

function FactorName({ f, onClick }) {
  const body = <GroupText f={f} />;
  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("rounded underline decoration-[var(--brand-200)] decoration-2 underline-offset-[3px] hover:decoration-[var(--brand-500)]", FOCUS)}
    >
      {body}
    </button>
  );
}

/**
 * Pengaturan di atas dalam satu kalimat permintaan, supaya jelas apa yang
 * sedang dicari halaman ini. Setiap bagian yang ditebalkan berasal dari
 * pilihan pengguna.
 */
function QuestionLine({ factorDims, up, outcome, per, minSupport, range }) {
  const names = factorDims.map((d) => labelOf(d).toLowerCase());
  // Lebih dari empat faktor: sebut tiga, sisanya diringkas (daftar lengkap saat kursor diarahkan).
  const shown = names.length > 4 ? names.slice(0, 3) : names;
  const rest = names.slice(shown.length);
  return (
    <div className={cx("flex items-start gap-3 border-b bg-[var(--brand-50)] px-4 py-3", LINE)}>
      <span
        className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--paper)] text-[var(--brand-700)] ring-1 ring-[var(--brand-200)]"
        aria-hidden="true"
      >
        <IconSearch className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className={cx("text-[11.5px]", MUTED)}>Pengaturan di atas berarti</div>
        <p className="mt-0.5 max-w-[88ch] text-[13.5px] leading-relaxed text-[var(--ink-900)]" aria-live="polite">
          Carikan kondisi (
          {!names.length ? (
            <span className="text-[var(--note)]">belum ada faktor yang dinyalakan</span>
          ) : rest.length ? (
            <>
              {shown.join(", ")}, dan{" "}
              <Tip tip={`Juga: ${joinList(rest)}.`}>{nfFull.format(rest.length)} lainnya</Tip>
            </>
          ) : (
            joinList(names)
          )}
          ) yang membuat transaksi selama P1
          {range && (
            <>
              {" "}
              (<span className="whitespace-nowrap">{range}</span>)
            </>
          )}{" "}
          <Em>{up ? "lebih sering" : "lebih jarang"}</Em> {outcome.ask}. Hitung
          berdasarkan{" "}
          <Em>{per === "rev" ? "pendapatan" : "jumlah transaksi"}</Em>, dan abaikan kelompok yang transaksinya kurang dari{" "}
          <Em>{nfFull.format(minSupport)}</Em>.
        </p>
      </div>
    </div>
  );
}

/** Jawaban singkat: angka rata-rata seluruh perusahaan + kondisi terkuat. */
function Headline({ ki, outcome, per, up, ranked, onPick }) {
  // "Paling tinggi/rendah" adalah klaim tentang kekuatan, jadi selalu diurut
  // dari lift — tidak ikut pilihan "Paling berdampak" di daftar.
  const strong = ranked
    .filter((f) => f.strong)
    .sort((a, b) => (up ? b.lift - a.lift : a.lift - b.lift) || b.n - a.n)
    .slice(0, 2);
  const rev = per === "rev";
  const tail = (f, first) =>
    f.lift === Infinity
      ? `${pct(f.rate)}, di luarnya tidak ada sama sekali`
      : f.rate === 0
      ? `tidak ada sama sekali, di luarnya ${pct(f.rateOut)}`
      : `${pct(f.rate)}, ${up ? "" : "hanya "}${times(f.lift)}${first ? " porsi di luarnya" : ""}`;
  const baseTip = rev
    ? `Rata-rata seluruh perusahaan: dari seluruh pendapatan P1 (${rp(ki.WN)}), ${pct(ki.base)} — ${rp(ki.WK)} — ${outcome.whatRev}. Setiap kondisi di bawah dibandingkan dengan angka ini.`
    : `Rata-rata seluruh perusahaan: dari ${nfFull.format(ki.N)} transaksi P1, ${pct(ki.base)} — ${nfFull.format(ki.K)} transaksi — ${outcome.what}. Setiap kondisi di bawah dibandingkan dengan angka ini.`;
  return (
    <div className="grid items-start gap-x-5 gap-y-2 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <Tip tip={baseTip} cue={false} className="block min-w-[7.5rem] rounded-md">
        <span className="block text-[28px] font-semibold leading-none tabular-nums text-[var(--ink-900)]">{pct(ki.base)}</span>
        <span className={cx("mt-1 block text-[11px]", MUTED)}>
          <span className="underline decoration-dotted decoration-[var(--ink-400)] underline-offset-[3px]">rata-rata seluruh perusahaan</span>
        </span>
      </Tip>
      <div className="min-w-0">
        <div className={cx("text-[11.5px]", MUTED)}>Hasilnya</div>
        <p className="mt-0.5 max-w-[80ch] text-[13px] leading-relaxed text-[var(--ink-800)]">
          {rev ? (
            <>
              Rata-rata, <b className="font-semibold">{pct(ki.base)}</b> pendapatan P1 {outcome.whatRev} — {rp(ki.WK)} dari {rp(ki.WN)}.{" "}
            </>
          ) : (
            <>
              Rata-rata, <b className="font-semibold">{pct(ki.base)}</b> transaksi P1 {outcome.what} — {nfFull.format(ki.K)} dari{" "}
              {nfFull.format(ki.N)} transaksi.{" "}
            </>
          )}
          {strong.length ? (
            <>
              Porsi itu paling {up ? "tinggi" : "rendah"} di <FactorName f={strong[0]} onClick={() => onPick(strong[0])} /> ({tail(strong[0], true)})
              {strong[1] && (
                <>
                  {" "}
                  dan <FactorName f={strong[1]} onClick={() => onPick(strong[1])} /> ({tail(strong[1], false)})
                </>
              )}
              . Klik namanya untuk melihat kesimpulannya.
            </>
          ) : (
            <span className={MUTED}>Belum ada kondisi yang cukup meyakinkan membuatnya {up ? "lebih sering" : "lebih jarang"}.</span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ================================================================ baris   */

/** Dua titik di satu garis: peluang di luar (cincin) dan di dalam (isi). */
function Dumbbell({ a, b, max, up, mark }) {
  const x = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const ink = up ? UP_INK : DOWN_INK;
  return (
    <span className="relative mt-1.5 block h-3.5" aria-hidden="true">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--ink-100)]" />
      {mark != null && (
        <span className="absolute top-0 h-3.5 border-l border-dashed border-[var(--ink-400)]" style={{ left: x(mark) }} />
      )}
      <span
        className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full"
        style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})`, background: ink, opacity: 0.35 }}
      />
      <span
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[var(--ink-400)] bg-[var(--paper)]"
        style={{ left: x(a) }}
      />
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: x(b), background: ink, boxShadow: "0 0 0 2px var(--paper)" }}
      />
    </span>
  );
}

function LiftPill({ value, up, weak }) {
  return (
    <span
      className={cx(
        "whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ring-1",
        weak
          ? "bg-[var(--ink-50)] text-[var(--ink-500)] ring-[var(--ink-200)]"
          : up
          ? "bg-[var(--brand-50)] text-[var(--brand-800)] ring-[var(--brand-200)]"
          : "bg-[#eef3fa] text-[#1f4b8f] ring-[#cbdaf0]"
      )}
    >
      {value}
    </span>
  );
}

function FactorRow({ f, i, up, max, on, onClick, tips }) {
  // Angka-angka di baris ini punya keterangan saat kursor diarahkan ke sana.
  // Untuk pembaca layar, keterangan lengkapnya dipasang di tombol barisnya.
  const descId = useId();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        aria-describedby={descId}
        className={cx(
          "grid w-full grid-cols-[1.1rem_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
          FOCUS,
          on ? "border-[var(--brand-300)] bg-[var(--brand-50)]" : "border-transparent hover:bg-[var(--ink-50)]"
        )}
      >
        <span className="pt-px text-[11px] tabular-nums text-[var(--ink-400)]">{i + 1}</span>
        <span className={cx("min-w-0", !f.strong && "opacity-60")}>
          <span className="block truncate text-[12.5px]" title={`${f.dimLabel} ${f.label}`}>
            <span className="text-[var(--ink-500)]">{f.dimLabel}</span>{" "}
            <span className="font-semibold text-[var(--ink-900)]">{f.label}</span>
          </span>
          <Dumbbell a={f.rateOut} b={f.rate} max={max} up={up} />
          <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-500)]">
            <Tip tip={tips.inside} focusable={false} cue="faint">
              {pct(f.rate)} di sini
            </Tip>{" "}
            ·{" "}
            <Tip tip={tips.outside} focusable={false} cue="faint">
              {pct(f.rateOut)} di luar
            </Tip>{" "}
            ·{" "}
            <Tip tip={tips.count} focusable={false} cue="faint">
              {nfFull.format(f.n)} transaksi
            </Tip>
            {!f.strong && (
              <Tip tip={WEAK_TIP} focusable={false} cue={false} className="ml-1">
                <span className="rounded bg-[var(--ink-100)] px-1 text-[10px] text-[var(--ink-600)]">lemah</span>
              </Tip>
            )}
          </span>
        </span>
        <Tip tip={tips.lift} focusable={false} cue={false}>
          <LiftPill value={f.lift === Infinity ? "hanya di sini" : times(f.lift)} up={up} weak={!f.strong} />
        </Tip>
        <span id={descId} hidden>
          {`${tips.inside} ${tips.outside} ${tips.lift}${f.strong ? "" : ` ${WEAK_TIP}`}`}
        </span>
      </button>
    </li>
  );
}

/* ================================================================ rincian */

/**
 * Kalimat penjelas satu kondisi, dengan kata-kata pengguna:
 * "Dari seluruh pendapatan lini X selama P1, 91% berasal dari kategori yang
 * menurun — 16× porsi di luar lini ini (5,5%)."
 */
function factorSentence(f, per, outcome) {
  const G = <GroupText f={f} />;
  const T = thisOf(f);
  const rev = per === "rev";
  const whole = rev ? "pendapatan" : "transaksi";
  const what = rev ? outcome.whatRev : outcome.what;
  if (f.rate === 0)
    return (
      <>
        Dari seluruh {whole} {G} selama P1, tidak ada yang {what}; di luar {T} {pct(f.rateOut)}.
      </>
    );
  if (f.lift === Infinity)
    return (
      <>
        Dari seluruh {whole} {G} selama P1, <b className="font-semibold">{pct(f.rate)}</b> {what} — di luar {T} tidak ada sama sekali.
      </>
    );
  return f.rate > f.rateOut ? (
    <>
      Dari seluruh {whole} {G} selama P1, <b className="font-semibold">{pct(f.rate)}</b> {what} — <b className="font-semibold">{times(f.lift)}</b> porsi
      di luar {T} ({pct(f.rateOut)}).
    </>
  ) : (
    <>
      Dari seluruh {whole} {G} selama P1, hanya <b className="font-semibold">{pct(f.rate)}</b> {what}, dibanding {pct(f.rateOut)} di luar {T}.
    </>
  );
}

/** Satu angka di rincian: label bergaris titik (ada keterangan), angka, catatan kecil. */
function MiniStat({ label, value, note, tip }) {
  return (
    <Tip tip={tip} cue={false} className="block rounded-md">
      <span className={cx("block text-[11px] leading-tight", MUTED)}>
        <span className="underline decoration-dotted decoration-[var(--ink-400)] underline-offset-[3px]">{label}</span>
      </span>
      <span className="mt-0.5 block text-[15px] font-semibold tabular-nums text-[var(--ink-900)]">{value}</span>
      {note && <span className="mt-0.5 block text-[10.5px] leading-tight text-[var(--ink-500)]">{note}</span>}
    </Tip>
  );
}

/** Tanya-jawab dengan kata biasa + satu kalimat "Artinya". */
function Conclusion({ f, ki, per, outcome }) {
  const rows = conclusionRows(f, ki, per, outcome);
  return (
    <div>
      <h3 className="text-[12.5px] font-semibold text-[var(--ink-900)]">Kesimpulan untuk {thisOf(f)}</h3>
      {/* Pasangan tanya-jawab = daftar definisi. Di layar lebar tampil dua kolom
          (Pertanyaan | Jawaban); di ponsel jawabannya turun ke bawah pertanyaan. */}
      <div className="mt-1.5 text-[12px] leading-snug">
        <div
          className={cx("hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-x-4 border-b py-1.5 text-[11px] text-[var(--ink-500)] sm:grid", LINE)}
          aria-hidden="true"
        >
          <span>Pertanyaan</span>
          <span>Jawaban</span>
        </div>
        <dl>
          {rows.map((r) => (
            <div
              key={r.q}
              className="grid gap-x-4 gap-y-0.5 border-b border-[var(--ink-100)] py-2 last:border-b-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
            >
              <dt className="text-[var(--ink-600)] sm:text-[var(--ink-700)]">{r.q}</dt>
              <dd className="text-[var(--ink-800)]">
                <b className={cx("font-semibold", r.warn ? "text-[var(--amber-700)]" : "text-[var(--ink-900)]")}>{r.word}</b>
                {r.rest ? `, ${r.rest}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p
        className={cx(
          "mt-2.5 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed text-[var(--ink-800)]",
          f.strong ? "border-[var(--ink-200)] bg-[var(--ink-50)]" : "border-[var(--amber-100)] bg-[var(--amber-50)]"
        )}
      >
        <b className="font-semibold text-[var(--ink-900)]">Artinya: </b>
        {meaningText(f, ki, per, outcome)}
      </p>
    </div>
  );
}

function FactorDetail({
  f,
  ki,
  per,
  outcome,
  minSupport,
  lines,
  win,
  labels,
  contentsDim,
  unitKey,
  portfolio,
  onPickValue,
  openProductAt,
  explainInVariance,
}) {
  const isUp = f.rate > f.rateOut;
  const cover = ki.WK ? f.wk / ki.WK : 0;
  const match = useMemo(() => (ln) => ln[f.dim] === f.key, [f.dim, f.key]);
  const tips = factorTips(f, per, outcome, ki, minSupport);
  const rev = per === "rev";
  const whole = rev ? "pendapatan" : "transaksi";

  return (
    <Section
      icon={IconPin}
      tone="violet"
      title={
        <span>
          <span className="font-normal text-[var(--ink-500)]">{f.dimLabel}</span> {f.label}
        </span>
      }
      actions={
        explainInVariance && (
          <button
            type="button"
            className={BTN_QUIET}
            onClick={() => explainInVariance([{ dim: f.dim, key: f.key, label: f.label }])}
            title="Buka halaman Penjelasan perubahan dengan lingkup kelompok ini"
          >
            Uraikan perubahannya →
          </button>
        )
      }
      bodyClass="p-0"
    >
      <div className="space-y-3 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-[var(--ink-800)]">{factorSentence(f, per, outcome)}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <MiniStat label="Di kelompok ini" value={pct(f.rate)} note={`dari ${whole} ${thisOf(f)}`} tip={tips.inside} />
          <MiniStat label="Di luar kelompok" value={pct(f.rateOut)} note={`dari ${whole} selebihnya`} tip={tips.outside} />
          <MiniStat
            label="Lift"
            value={f.lift === Infinity ? "∞" : times(f.lift)}
            note={f.lift === Infinity || f.rate === 0 ? null : `${pct(f.rate)} ÷ ${pct(f.rateOut)}`}
            tip={tips.lift}
          />
          {isUp ? (
            <MiniStat
              label="Bagian dari total"
              value={pct(cover)}
              note={rev ? `dari ${rp(ki.WK)}` : `dari ${nfFull.format(ki.K)} transaksi`}
              tip={tips.cover}
            />
          ) : (
            <MiniStat label="Ukuran kelompok" value={pct(f.share)} note={`dari ${whole} P1`} tip={tips.size} />
          )}
        </div>
      </div>

      <div className={cx("border-t px-4 py-3", LINE)}>
        <Conclusion f={f} ki={ki} per={per} outcome={outcome} />
      </div>

      <div className={cx("border-t px-4 py-3", LINE)}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-[var(--ink-800)]">Semua nilai {f.dimLabel.toLowerCase()}</h3>
          <span className={cx("text-[11px]", MUTED)}>klik untuk berpindah</span>
        </div>
        <DimBars
          list={ki.byDim[f.dim] || []}
          dim={f.dim}
          base={ki.base}
          selKey={f.key}
          minSupport={minSupport}
          onPick={onPickValue}
          per={per}
          outcome={outcome}
        />
      </div>

      <div className={cx("border-t px-4 py-3", LINE)}>
        <Contents
          match={match}
          dims={[f.dim]}
          outcome={outcome}
          lines={lines}
          win={win}
          labels={labels}
          contentsDim={contentsDim}
          unitKey={unitKey}
          portfolio={portfolio}
          openProductAt={openProductAt}
          title={`Isi kelompok ${f.label}`}
        />
      </div>
    </Section>
  );
}

/** Peluang setiap nilai satu dimensi, dengan garis rata-rata. */
function DimBars({ list, dim, base, selKey, minSupport, onPick, per, outcome }) {
  const [all, setAll] = useState(false);
  const order = NATURAL_ORDER[dim];
  const rows = useMemo(() => {
    if (!order) return list;
    const ix = (k) => {
      const i = order.indexOf(k);
      return i < 0 ? 999 : i;
    };
    return [...list].sort((a, b) => ix(a.key) - ix(b.key));
  }, [list, order]);
  const shown = all ? rows : rows.slice(0, DIM_BAR_LIMIT);
  let max = Math.max(base, 1e-6);
  for (const r of rows) if (r.rate > max) max = r.rate;
  max *= 1.06;
  const x = (v) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div>
      <ul className="space-y-[3px]">
        {shown.map((r) => {
          const on = r.key === selKey;
          const small = r.n < minSupport;
          const fill = on ? "var(--brand-700)" : r.rate >= base ? "var(--brand-200)" : "var(--ink-300)";
          return (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className={cx(
                  "grid w-full grid-cols-[minmax(5.5rem,9.5rem)_minmax(0,1fr)_6.6rem] items-center gap-2 rounded px-1 py-[3px] text-left text-[11.5px] transition-colors hover:bg-[var(--ink-50)]",
                  FOCUS,
                  on && "bg-[var(--brand-50)]"
                )}
              >
                <span
                  className={cx("truncate", on ? "font-semibold text-[var(--ink-900)]" : small ? "text-[var(--ink-400)]" : "text-[var(--ink-700)]")}
                  title={r.label}
                >
                  {r.label}
                </span>
                <span className="relative block h-3.5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[3px]"
                    style={{
                      width: x(r.rate),
                      minWidth: r.rate > 0 ? 2 : 0,
                      background: small ? `repeating-linear-gradient(135deg, ${fill} 0 3px, transparent 3px 6px)` : fill,
                      boxShadow: small ? `inset 0 0 0 1px ${fill}` : undefined,
                    }}
                  />
                  <span className="absolute -inset-y-[3px] border-l border-dashed border-[var(--ink-500)]" style={{ left: x(base) }} />
                </span>
                <span className="text-right tabular-nums text-[var(--ink-600)]">
                  <Tip
                    focusable={false}
                    cue="faint"
                    tip={
                      <>
                        {factorTips(r, per, outcome, null, 0).inside} {cap(groupName(r))} punya {nfFull.format(r.n)} transaksi di P1
                        {small ? ` — di bawah ${nfFull.format(minSupport)}, jadi jangan disimpulkan.` : "."}
                      </>
                    }
                  >
                    <span className={on ? "font-semibold text-[var(--ink-900)]" : ""}>{pct(r.rate)}</span>{" "}
                    <span className="text-[var(--ink-400)]">· {nfFull.format(r.n)}</span>
                  </Tip>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={cx("mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]", MUTED)}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 border-l border-dashed border-[var(--ink-500)]" /> rata-rata semua {pct(base)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-sm"
            style={{ background: "repeating-linear-gradient(135deg, var(--ink-300) 0 3px, transparent 3px 6px)", boxShadow: "inset 0 0 0 1px var(--ink-300)" }}
          />
          kurang dari {minSupport} transaksi
        </span>
        <span>angka kanan = jumlah transaksi</span>
        <ShowAll className="ml-auto" total={rows.length} limit={DIM_BAR_LIMIT} open={all} onToggle={() => setAll((v) => !v)} noun="nilai" />
      </div>
    </div>
  );
}

/**
 * Tingkat daftar isi untuk sebuah kelompok. Kalau kelompoknya sendiri sudah
 * sebuah produk (mis. Kategori = gnet Rockwool), daftar di tingkat yang sama
 * hanya berisi dirinya — jadi turunkan satu tingkat (ke nama produk).
 */
function refineDim(base, dims) {
  // Hanya tingkat yang kolomnya ada di data; kalau tidak ada tingkat lebih halus, pakai cabang.
  const levels = LEVELS.filter((l) => activeUnits().some((u) => u.key === l));
  let cd = base;
  for (const d of dims) {
    const i = levels.indexOf(d);
    if (i >= 0 && levels.includes(cd) && i >= levels.indexOf(cd)) {
      cd = levels[i + 1] || (dimOk("Branch") ? "Branch" : base);
    }
  }
  return cd;
}

/** Produk (atau tingkat lain) yang mengisi kejadian di dalam sebuah kelompok. */
function Contents({ match, dims = [], outcome, lines, win, labels, contentsDim: baseDim, unitKey, portfolio, openProductAt, title }) {
  const contentsDim = refineDim(baseDim, dims);
  const [all, setAll] = useState(false);
  const data = useMemo(() => {
    const acc = new Map();
    let tot = 0;
    for (const ln of lines) {
      if (!inP1(ln, win) || !match(ln) || !outcome.test(ln)) continue;
      const k = ln[contentsDim];
      let e = acc.get(k);
      if (!e) acc.set(k, (e = { key: k, label: valueLabel(contentsDim, k, labels), r: 0, n: 0 }));
      e.r += ln.Revenue;
      e.n++;
      tot += ln.Revenue;
    }
    const list = Array.from(acc.values()).sort((a, b) => b.r - a.r || b.n - a.n || String(a.label).localeCompare(String(b.label)));
    return { list, tot };
  }, [lines, win, match, outcome, contentsDim, labels]);
  const shown = all ? data.list : data.list.slice(0, CONTENTS_LIMIT);

  const canOpen = activeUnits().some((u) => u.key === contentsDim) && !!openProductAt;
  const unitWord = (activeUnits().find((u) => u.key === contentsDim)?.label || labelOf(contentsDim)).toLowerCase();

  return (
    <div>
      <h3 className="text-[12px] font-semibold text-[var(--ink-800)]">{title}</h3>
      <p className={cx("mt-0.5 text-[11px] leading-snug", MUTED)}>
        {unitWord[0].toUpperCase() + unitWord.slice(1)} dengan pendapatan terbesar di antara {outcome.listWhat}
        {canOpen ? " — klik untuk membuka diagnosisnya." : "."}
      </p>
      {data.list.length === 0 ? (
        <p className={cx("mt-2 text-xs", MUTED)}>Tidak ada {outcome.listWhat} di kelompok ini.</p>
      ) : (
        <ul className={cx("mt-1.5", all && shown.length > 16 && "dt-scroll max-h-[460px] overflow-auto pr-1")}>
          {shown.map((c) => {
            const u = contentsDim === unitKey ? portfolio?.byKey?.get(c.key) : null;
            // Kalau kejadiannya sendiri sebuah rekomendasi, lencana rekomendasi
            // akan sama semua — tampilkan tahapnya saja.
            const badge = !u ? null : outcome.statusType === "action" ? <StageBadge stage={u.stage} /> : <ActionBadge action={u.rec.action} />;
            const Tag = canOpen ? "button" : "div";
            return (
              <li key={c.key}>
                <Tag
                  type={canOpen ? "button" : undefined}
                  onClick={canOpen ? () => openProductAt(contentsDim, c.key) : undefined}
                  className={cx(
                    "-mx-1.5 grid w-[calc(100%+12px)] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-md px-1.5 py-1 text-left text-xs",
                    canOpen && "transition-colors hover:bg-[var(--brand-50)]",
                    canOpen && FOCUS
                  )}
                  title={canOpen ? "Buka diagnosis" : undefined}
                >
                  <span className="truncate text-[var(--ink-900)]">{c.label}</span>
                  <span>{badge}</span>
                  <span className="whitespace-nowrap text-right tabular-nums text-[var(--ink-600)]">
                    {rp(c.r)} <span className="text-[var(--ink-400)]">· {pct(data.tot ? c.r / data.tot : 0)}</span>
                  </span>
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
      {data.list.length > CONTENTS_LIMIT && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ink-500)]">
          <span>
            {nfFull.format(shown.length)} dari {nfFull.format(data.list.length)} {unitWord}
          </span>
          <ShowAll total={data.list.length} limit={CONTENTS_LIMIT} open={all} onToggle={() => setAll((v) => !v)} noun={unitWord} />
        </div>
      )}
    </div>
  );
}

/* ================================================================ segmen  */

function SegmentRow({ s, i, up, per, base, max, open, onToggle, outcome, lines, win, labels, contentsDim, unitKey, portfolio, openProductAt }) {
  const match = useMemo(() => {
    const [a, b] = s.parts;
    return (ln) => ln[a.dim] === a.key && ln[b.dim] === b.key;
  }, [s]);
  const rev = per === "rev";
  const whole = rev ? "pendapatan" : "transaksi";
  const what = rev ? outcome.whatRev : outcome.what;
  const both = joinList(s.parts.map((x) => groupName(x)));
  const descId = useId();
  const tips = {
    rate: `Dari seluruh ${whole} yang sekaligus ${both} selama P1, ${s.rate < base ? "hanya " : ""}${pct(s.rate)} ${what}.`,
    base: `Rata-rata seluruh perusahaan: ${pct(base)} ${whole} P1 ${what}.`,
    size: `Segmen ini berisi ${nfFull.format(s.n)} transaksi — ${pct(s.share)} dari seluruh ${whole} P1.`,
    lift: `Lift segmen = porsi di segmen ini ÷ rata-rata seluruh perusahaan = ${pct(s.rate)} ÷ ${pct(base)} ≈ ${times(s.lift)}.`,
  };
  return (
    <li className={cx("rounded-lg border transition-colors", open ? "border-[var(--brand-200)] bg-[var(--paper)]" : "border-transparent")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-describedby={descId}
        className={cx(
          "grid w-full grid-cols-[1.1rem_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--ink-50)]",
          FOCUS
        )}
      >
        <span className="pt-0.5 text-[11px] tabular-nums text-[var(--ink-400)]">{i + 1}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
            {s.parts.map((p, j) => (
              <React.Fragment key={p.dim}>
                {j > 0 && <span className="text-[var(--ink-400)]">+</span>}
                <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] px-1.5 py-0.5">
                  <span className="text-[var(--ink-500)]">{p.dimLabel}</span>
                  <span className="truncate font-semibold text-[var(--ink-900)]">{p.label}</span>
                </span>
              </React.Fragment>
            ))}
          </span>
          <Dumbbell a={base} b={s.rate} max={max} up={up} />
          <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-500)]">
            <Tip tip={tips.rate} focusable={false} cue="faint">
              {pct(s.rate)} di segmen ini
            </Tip>{" "}
            ·{" "}
            <Tip tip={tips.base} focusable={false} cue="faint">
              rata-rata {pct(base)}
            </Tip>{" "}
            ·{" "}
            <Tip tip={tips.size} focusable={false} cue="faint">
              {nfFull.format(s.n)} transaksi ({pct(s.share)} dari {whole} P1)
            </Tip>
          </span>
        </span>
        <Tip tip={tips.lift} focusable={false} cue={false}>
          <LiftPill value={times(s.lift)} up={up} />
        </Tip>
        <span id={descId} hidden>
          {`${tips.rate} ${tips.base} ${tips.lift}`}
        </span>
      </button>
      {open && (
        <div className="dt-fade grid gap-4 border-t border-[var(--ink-100)] px-3 py-3">
          <div className="text-xs leading-relaxed text-[var(--ink-700)]">
            <div className="mb-1 font-semibold text-[var(--ink-800)]">Kenapa segmen ini menonjol</div>
            <ul className="space-y-1">
              {s.parts.map((p) => (
                <li key={p.dim} className="flex items-baseline justify-between gap-3">
                  <span>
                    Hanya {p.dimLabel.toLowerCase()} <b className="font-semibold">{p.label}</b>
                  </span>
                  <span className="tabular-nums">{pct(p.rate)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 border-t border-[var(--ink-100)] pt-1">
                <span>Keduanya sekaligus</span>
                <b className="font-semibold tabular-nums text-[var(--ink-900)]">{pct(s.rate)}</b>
              </li>
            </ul>
            <p className={cx("mt-2 text-[11px]", MUTED)}>
              {up
                ? "Gabungannya lebih tajam daripada masing-masing kondisi — keduanya saling memperkuat."
                : "Gabungannya lebih rendah daripada masing-masing kondisi — keduanya sama-sama menekan."}
            </p>
          </div>
          <Contents
            match={match}
            dims={s.parts.map((p) => p.dim)}
            outcome={outcome}
            lines={lines}
            win={win}
            labels={labels}
            contentsDim={contentsDim}
            unitKey={unitKey}
            portfolio={portfolio}
            openProductAt={openProductAt}
            title="Isi segmen"
          />
        </div>
      )}
    </li>
  );
}
