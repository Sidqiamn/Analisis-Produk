/* ============================================================================
   Keterangan (glosarium) yang dihitung dari pengaturan yang sedang dipakai
   ----------------------------------------------------------------------------
   Semua kalimat di panel Keterangan dibangun di sini dari `crit` (Kriteria)
   dan `win` (jendela analisis). Ambang, tanggal, dan aturan rekomendasi
   diambil dari sumber yang sama dengan yang dipakai mesin penilai
   (lib/product.js), jadi penjelasannya tidak bisa berbeda dari hitungannya
   — termasuk saat data diganti atau Kriteria diubah.
   ========================================================================== */

import { CRITERIA_DEFAULTS, hasCol } from "./config.js";
import { ACTIONS, PATTERNS, STAGES } from "./color.js";
import { CENSOR_MONTHS, REC_RULES } from "./product.js";
import { dLabel, fmt, monthIndex, monthIndexStart, nfFull, nfPct, shiftDays, signedPct, toJs } from "./format.js";

const date = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const monthName = (m) => MONTH.format(toJs(monthIndexStart(m)));
const pct = (x) => nfPct.format(x);
const range = (r) => `${date(r.from)} – ${date(r.to)}`;

/** Lengkapi kriteria dengan nilai bawaan untuk kunci yang belum ada. */
export const fullCrit = (crit) => ({
  ...CRITERIA_DEFAULTS,
  ...(crit || {}),
  weights: { ...CRITERIA_DEFAULTS.weights, ...(crit?.weights || {}) },
});

/**
 * Definisi tahap siklus hidup, urut sesuai urutan pemeriksaan.
 * @returns [{ key, label, color, hollow, short, rule, basis, note? }]
 */
export function stageDefinitions(critIn, win) {
  const crit = fullCrit(critIn);
  const A = monthIndex(win.asOf);
  const g = pct(crit.growth);
  const dataStartM = win.dataFrom ? monthIndex(win.dataFrom) : null;
  const byKey = Object.fromEntries(STAGES.map((s) => [s.key, s]));

  return [
    {
      ...byKey.tidur,
      short: "Sudah lama tidak terjual.",
      rule: `Tidak ada transaksi selama lebih dari ${crit.dormantDays} hari sebelum tanggal acuan (${date(win.asOf)}), artinya terakhir terjual sebelum ${date(shiftDays(win.asOf, -crit.dormantDays))}.`,
      basis: "Tanggal transaksi terakhir",
    },
    {
      ...byKey.baru,
      short: "Baru mulai dijual.",
      rule: `Transaksi pertamanya terjadi pada ${monthName(A - crit.newMonths + 1)} atau sesudahnya — ${crit.newMonths} bulan terakhir sampai tanggal acuan.`,
      basis: "Tanggal transaksi pertama",
      note:
        dataStartM != null
          ? `Produk yang sudah terjual sejak ${CENSOR_MONTHS} bulan pertama data (${monthName(dataStartM)} – ${monthName(dataStartM + CENSOR_MONTHS - 1)}) tidak pernah dihitung baru, karena bisa saja sudah dijual sebelum data dimulai.`
          : null,
    },
    {
      ...byKey.tumbuh,
      short: "Penjualannya naik.",
      rule: `Pendapatan P1 (${range(win.p1)}) naik ${g} atau lebih dibanding P2 (${range(win.p2)}). Produk yang tidak terjual di P2 tetapi terjual lagi di P1 juga masuk sini.`,
      basis: "Total pendapatan P1 dibanding P2",
    },
    {
      ...byKey.menurun,
      short: "Penjualannya turun.",
      rule: `Pendapatan P1 turun ${g} atau lebih dibanding P2.`,
      basis: "Total pendapatan P1 dibanding P2",
    },
    {
      ...byKey.matang,
      short: "Penjualannya stabil.",
      rule: `Perubahan pendapatan P1 dibanding P2 di antara −${g} dan +${g}.`,
      basis: "Total pendapatan P1 dibanding P2",
    },
  ];
}

/** Urutan pemeriksaan tahap, satu kalimat. */
export const STAGE_ORDER_NOTE =
  "Diperiksa berurutan: Tidak aktif → Baru → Tumbuh, Menurun, atau Matang. Tahap pertama yang cocok yang dipakai, jadi produk baru yang langsung berhenti terjual tetap terbaca Tidak aktif.";

/**
 * Definisi rekomendasi beserta aturan yang menghasilkannya.
 * @returns [{ key, label, color, hollow, hint, rules: [{ order, text, stage }] }]
 */
export function actionDefinitions(critIn) {
  const crit = fullCrit(critIn);
  return ACTIONS.map((a) => ({
    ...a,
    rules: REC_RULES.map((r, i) => ({ id: r.id, order: i + 1, action: r.action, stage: r.stage, text: r.when(crit) })).filter(
      (r) => r.action === a.key
    ),
  }));
}

/** Dasar data setiap penilaian — menjawab "dihitung dari apa?". */
export function basisRows(critIn) {
  const crit = fullCrit(critIn);
  return [
    ["Tidak aktif", `Tanggal transaksi terakhir (lebih dari ${crit.dormantDays} hari)`],
    ["Bersihkan dari katalog", `Tanggal transaksi terakhir (lebih dari ${crit.cleanDays} hari)`],
    ["Baru", `Tanggal transaksi pertama (${crit.newMonths} bulan terakhir)`],
    ["Tumbuh, Menurun, Matang", `Total pendapatan P1 dibanding P2 (ambang ±${pct(crit.growth)})`],
    ["Kelas ABC", `Porsi pendapatan P1 (A sampai ${pct(crit.abcA)}, B sampai ${pct(crit.abcB)})`],
    ["Pola permintaan", "Pendapatan per bulan, 24 bulan terakhir"],
    ["Data tipis", `Jumlah transaksi P1 + P2 (kurang dari ${crit.minTx})`],
  ];
}

/** Istilah lain yang muncul di halaman produk. */
export function termDefinitions(critIn, win) {
  const crit = fullCrit(critIn);
  const byBranch = hasCol("Branch");
  // Sama dengan mesin penilai: tanpa kolom cabang, bobot jangkauan = 0.
  const w = byBranch ? crit.weights : { ...crit.weights, reach: 0 };
  const wSum = w.contrib + w.trend + w.reach + w.consistency + w.recency || 1;
  const wp = (k) => pct(w[k] / wSum);
  const parts = [
    ["contrib", "kontribusi pendapatan"],
    ["trend", "tren P1 vs P2"],
    ["reach", "jangkauan cabang"],
    ["consistency", "konsistensi bulan berpenjualan"],
    ["recency", "kebaruan penjualan terakhir"],
  ]
    .filter(([k]) => w[k] > 0)
    .map(([k, label]) => `${label} ${wp(k)}`);
  const defs = [
    {
      term: "P1, P2, dan tanggal acuan",
      text: `P1 = ${range(win.p1)}, periode yang dinilai. P2 = ${range(win.p2)}, pembandingnya. Tanggal acuan ${date(win.asOf)} adalah akhir P1 — mengikuti tanggal akhir Periode di bilah atas. Transaksi sesudah tanggal acuan tidak ikut dihitung.`,
    },
    {
      term: "Hari sejak terakhir terjual",
      text: "Dihitung terhadap tanggal acuan, bukan tanggal hari ini. Dengan begitu analisis atas data lama atau periode lampau tetap benar.",
    },
    {
      term: "Kelas ABC",
      text: `Produk diurut dari pendapatan P1 terbesar. A = kelompok teratas yang bersama-sama menyusun ${pct(crit.abcA)} pendapatan; B = berikutnya sampai ${pct(crit.abcB)}; C = sisanya, termasuk yang tidak terjual di P1.`,
    },
    {
      term: "Data tipis",
      text: `Kurang dari ${crit.minTx} transaksi di P1 dan P2 digabung. Terlalu sedikit untuk menilai tren, jadi biasanya hanya dipantau.`,
    },
    {
      term: "Pola permintaan",
      text: "Dihitung dari bulan-bulan berpenjualan dalam 24 bulan terakhir: seberapa sering ada penjualan (jarak rata-rata antarbulan, batas 1,32) dan seberapa seragam nilainya (variasi, batas 0,49). Metode Syntetos–Boylan.",
      items: Object.entries(PATTERNS).map(([k, p]) => ({ key: k, label: p.label, text: p.hint })),
    },
    {
      term: "Skor kesehatan (0–100)",
      text: `Rata-rata berbobot ${parts.length} komponen, masing-masing dinilai relatif terhadap produk lain di tingkat yang sama: ${parts.join(", ")}.${
        byBranch ? "" : " Jangkauan cabang tidak dihitung karena data tidak punya kolom cabang."
      } Rincian dan hitungan lengkapnya ada di tab Skor kesehatan.`,
    },
    byBranch && {
      term: "Cabang aktif",
      text: "Jumlah cabang yang punya minimal satu transaksi produk itu dalam periode. Ditulis P2 → P1, mis. 23 → 8.",
    },
    {
      term: "Pengganti terdekat",
      text: "Produk lain di induk yang sama (lini atau kategori) yang masih sehat — Baru, Tumbuh, atau Matang — dan pendapatan P1-nya terbesar.",
    },
    byBranch && {
      term: "Indikasi pelanggan pindah",
      text: "Di setiap cabang tempat produk turun, berapa bagian penurunannya yang tertutup kenaikan produk sejenis di cabang yang sama. Ini indikasi, bukan bukti, karena belum tentu pembelinya orang yang sama.",
    },
  ];
  return defs.filter(Boolean);
}

/** Tabel silang tahap × rekomendasi dari portofolio yang sedang tampil. */
export function stageActionMatrix(units) {
  const m = {};
  for (const s of STAGES) m[s.key] = Object.fromEntries(ACTIONS.map((a) => [a.key, 0]));
  for (const u of units) {
    if (m[u.stage] && u.rec) m[u.stage][u.rec.action] = (m[u.stage][u.rec.action] || 0) + 1;
  }
  return m;
}

/* ============================================================================
   Skor kesehatan
   ----------------------------------------------------------------------------
   Rumusnya sama persis dengan buildPortfolio() di lib/product.js:

     skor = Σ (nilai komponen × bobot) ÷ Σ bobot,  dibulatkan

   Tiga komponen pertama RELATIF (peringkat persentil di antara semua produk
   di tingkat yang sama); dua terakhir MUTLAK (tidak dibandingkan).
   ========================================================================== */

const nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rp = (v) => fmt(v, "currency", true);

/** Bobot yang benar-benar dipakai: tanpa kolom cabang, jangkauan = 0. */
export function effectiveWeights(critIn, weightsIn) {
  const crit = fullCrit(critIn);
  const w = weightsIn || crit.weights;
  return hasCol("Branch") ? { ...w } : { ...w, reach: 0 };
}

/**
 * Arti setiap komponen skor.
 * @returns [{ key, label, question, how, kind: "relatif"|"mutlak", weight, share }]
 */
export function scoreDefinitions(critIn, weightsIn, unitPlural = "produk") {
  const w = effectiveWeights(critIn, weightsIn);
  const sum = w.contrib + w.trend + w.reach + w.consistency + w.recency || 1;
  const P = unitPlural;
  const defs = [
    {
      key: "contrib",
      label: "Kontribusi",
      question: "Seberapa besar pendapatannya?",
      how: `Semua ${P} di tingkat ini diurut dari pendapatan P1 terkecil sampai terbesar. Nilainya adalah posisi produk ini di urutan itu: 0 = terkecil, 100 = terbesar. Nilai 88 artinya pendapatannya lebih besar dari sekitar 88% ${P} lain. ${P.charAt(0).toUpperCase()}${P.slice(1)} dengan angka yang sama mendapat nilai yang sama, yaitu rata-rata posisi mereka.`,
      kind: "relatif",
    },
    {
      key: "trend",
      label: "Tren",
      question: "Sedang naik atau turun?",
      how: `Pertumbuhan pendapatan P1 dibanding P2, diurut dari yang paling turun sampai yang paling naik, lalu dinilai dengan cara yang sama (0–100). Pertumbuhan dibatasi −100% sampai +200% supaya satu lonjakan ekstrem tidak mendominasi; semua yang naik lebih dari 200% — dan ${P} yang tidak terjual di P2 tetapi terjual di P1 — dianggap sama di urutan teratas, sehingga nilainya bisa di bawah 100. Yang tidak terjual sama sekali di urutan terbawah.`,
      kind: "relatif",
    },
    {
      key: "reach",
      label: "Jangkauan",
      question: "Seberapa luas dijual?",
      how: hasCol("Branch")
        ? `Jumlah cabang yang menjual produk ini di P1, diurut dan dinilai seperti Kontribusi (0 = paling sedikit cabang, 100 = paling banyak).`
        : "Tidak dihitung: data tidak punya kolom cabang, jadi bobotnya dijadikan 0.",
      kind: "relatif",
    },
    {
      key: "consistency",
      label: "Konsistensi",
      question: "Seberapa rutin laku?",
      how: "Jumlah bulan yang ada penjualannya dalam 12 bulan terakhir sampai tanggal acuan, dibagi 12. Terjual setiap bulan = 100; terjual 6 dari 12 bulan = 50. Tidak dibandingkan dengan produk lain.",
      kind: "mutlak",
    },
    {
      key: "recency",
      label: "Kebaruan",
      question: "Kapan terakhir terjual?",
      how: "100 kalau terjual tepat pada tanggal acuan, lalu turun merata sampai 0 kalau sudah 365 hari atau lebih tidak terjual. Terakhir terjual 73 hari lalu = 80. Tidak dibandingkan dengan produk lain.",
      kind: "mutlak",
    },
  ];
  return defs.map((d) => ({ ...d, weight: w[d.key], share: w[d.key] / sum }));
}

/** Penjelasan singkat arti angka "×30". */
export function weightNote(critIn, weightsIn) {
  const w = effectiveWeights(critIn, weightsIn);
  const sum = w.contrib + w.trend + w.reach + w.consistency + w.recency || 1;
  const ex = w.contrib;
  return `Angka di belakang tanda × adalah bobot: seberapa besar pengaruh komponen itu ke skor akhir. Jumlah semua bobot saat ini ${nfFull.format(sum)}, jadi ×${nfFull.format(ex)} pada Kontribusi berarti Kontribusi menyumbang ${pct(ex / sum)} skor. Bobot bisa diubah di Kriteria; skornya dihitung ulang seketika.`;
}

/**
 * Hitungan skor lengkap untuk satu produk.
 * @param u      produk (dari buildPortfolio)
 * @param units  semua produk di tingkat yang sama (pf.units)
 * @param weights bobot efektif (pf.weights)
 * @returns { rows: [{ key, label, data, rankText, value, weight, points }], sum, total, score }
 */
export function scoreBreakdown(u, units, weights) {
  const w = weights || CRITERIA_DEFAULTS.weights;
  const sum = w.contrib + w.trend + w.reach + w.consistency + w.recency || 1;
  const n = units.length;
  const trendVal = (x) => (x.g == null ? (x.r1 > 0 ? 2 : -1) : Math.max(-1, Math.min(2, x.g)));
  // Peringkat 1 = terbesar. Produk dengan angka sama berbagi peringkat dan
  // berbagi nilai (rata-rata posisinya) — disebutkan supaya "peringkat 1"
  // dengan nilai di bawah 100 tidak membingungkan.
  const rankOf = (get) => 1 + units.filter((x) => get(x) > get(u)).length;
  const tiesOf = (get) => units.filter((x) => x !== u && get(x) === get(u)).length;
  const rk = (get) => {
    const ties = tiesOf(get);
    return `peringkat ${nfFull.format(rankOf(get))} dari ${nfFull.format(n)}${ties ? `, sama dengan ${nfFull.format(ties)} lainnya` : ""}`;
  };

  const rows = [
    { key: "contrib", label: "Kontribusi", data: `Pendapatan P1 ${rp(u.r1)}`, rankText: rk((x) => x.r1) },
    {
      key: "trend",
      label: "Tren",
      data:
        u.g == null
          ? u.r1 > 0
            ? "Terjual di P1, tidak di P2"
            : "Tidak terjual di P1 maupun P2"
          : `Pertumbuhan ${signedPct(u.g)}${u.g > 2 ? " (dihitung +200%)" : u.g < -1 ? " (dihitung −100%)" : ""}`,
      rankText: rk(trendVal),
    },
    {
      key: "reach",
      label: "Jangkauan",
      data: hasCol("Branch") ? `${nfFull.format(u.b1)} cabang di P1` : "Tidak ada kolom cabang",
      rankText: hasCol("Branch") ? rk((x) => x.b1) : "",
    },
    { key: "consistency", label: "Konsistensi", data: `${nfFull.format(u.act12)} dari 12 bulan ada penjualan`, rankText: "" },
    {
      key: "recency",
      label: "Kebaruan",
      data: u.dsl === 0 ? "Terjual pada tanggal acuan" : `Terakhir terjual ${nfFull.format(u.dsl)} hari sebelum tanggal acuan`,
      rankText: "",
    },
  ].map((r) => {
    const value = (u.scoreParts?.[r.key] ?? 0) * 100;
    return { ...r, value, weight: w[r.key], points: (value * w[r.key]) / sum };
  });

  const total = rows.reduce((t, r) => t + r.points, 0);
  // Rumus ditulis dengan nilai satu desimal — angka yang sama dengan tabel —
  // supaya pembaca bisa menghitung ulang sendiri dan mendapat hasil yang sama.
  const r1 = (v) => Math.round(v * 10) / 10;
  const shown = rows.filter((r) => r.weight > 0);
  const shownTotal = shown.reduce((t, r) => t + r1(r.value) * r.weight, 0) / sum;
  return {
    rows,
    sum,
    total,
    score: u.score,
    formula: `(${shown.map((r) => `${nf1.format(r1(r.value))} × ${nfFull.format(r.weight)}`).join(" + ")}) ÷ ${nfFull.format(sum)} = ${nf1.format(shownTotal)}`,
  };
}

export const fmtPoints = (v) => nf1.format(v);
