/* ============================================================================
   Halaman: Portofolio produk
   ----------------------------------------------------------------------------
   Gambaran seluruh produk pada satu tingkat (lini, kategori, nama, atau
   kode barang): di tahap siklus hidup mana, seberapa penting, dan apa
   tindakan yang disarankan.

   Semua bagian saling menyaring (seperti slicer Power BI yang saling
   memengaruhi): klik tahap "Baru" dan kartu Rekomendasi langsung
   menghitung ulang isinya untuk produk Baru saja — lalu klik "Kembangkan"
   untuk menyempitkan lagi. Hitungan setiap kartu selalu memakai semua
   penyaring lain kecuali dirinya sendiri, jadi pilihan yang tersisa
   selalu terlihat.
   ========================================================================== */

import React, { useState, useMemo, useCallback } from "react";

import { hasCol, labelOf } from "../lib/config.js";
import { ACTIONS, ACTION_BY_KEY, STAGES, STAGE_BY_KEY, ABC_HINT } from "../lib/color.js";
import { dLabel, fmt, nfFull, nfPct, signedPct, toJs } from "../lib/format.js";
import { downloadCsv } from "../lib/data.js";
import { sharePct } from "../lib/product.js";
import { actionDefinitions, stageDefinitions } from "../lib/glossary.js";
import { BTN, BTN_QUIET, LINE, MUTED, SELECT, TONES, cx, FOCUS } from "../lib/theme.jsx";
import {
  AbcBadge,
  ActionBadge,
  Dot,
  Field,
  FilterChip,
  Notice,
  PatternText,
  RowSpark,
  Section,
  ShowAll,
  StageBadge,
  TipRow,
  WindowBar,
} from "../components/productui.jsx";
import { InfoButton } from "../components/glossary.jsx";
import { IconChecklist, IconCycle, IconDownload, IconFlag, IconScatter, IconTable } from "../components/icons.jsx";
import { QuadrantScatter } from "../components/productcharts.jsx";
import { ChangeText, CountChange, Delta, Signed } from "../components/delta.jsx";

const rp = (v) => fmt(v, "currency", true);
const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
const ACTION_ORDER = Object.fromEntries(ACTIONS.map((a, i) => [a.key, i]));

/* -------------------------------------------------------- pilihan sumbu   */

const pctAxis = (v) => (v >= 3 ? "≥ +300%" : signedPct(v));

const X_AXES = {
  r1: {
    label: "Pendapatan P1",
    log: true,
    get: (u) => (u.r1 > 0 ? u.r1 : null),
    fmt: rp,
    refMedian: true,
  },
  shareParent: {
    label: "Porsi dalam induk",
    get: (u) => (u.r1 > 0 ? u.shareParent : null),
    fmt: (v) => nfPct.format(v),
    refMedian: true,
  },
  b1: { label: "Cabang aktif P1", get: (u) => u.b1, fmt: (v) => nfFull.format(v), refMedian: true },
  score: { label: "Skor kesehatan", get: (u) => u.score, fmt: (v) => nfFull.format(v), ref: 50 },
  ageM: { label: "Umur (bulan)", get: (u) => u.ageM, fmt: (v) => nfFull.format(v) },
};

const Y_AXES = {
  g: {
    label: "Pertumbuhan P1 vs P2",
    // Produk tanpa penjualan di P2 tidak punya persentase: nilainya tak hingga,
    // digambar di batas atas dengan panah, dan di keterangan disebut "baru".
    get: (u) => (u.g == null ? (u.r1 > 0 ? Infinity : null) : u.g),
    min: -1,
    max: 3,
    includeZero: true,
    ref: 0,
    fmt: pctAxis,
    fmtFull: (v) => <Delta g={v} size="xs" newText="baru (tanpa P2)" />,
  },
  db: {
    label: "Perubahan cabang aktif",
    get: (u) => u.b1 - u.b2,
    includeZero: true,
    ref: 0,
    fmt: (v) => `${v > 0 ? "+" : ""}${nfFull.format(v)}`,
  },
  act12: { label: "Bulan berpenjualan (12 bln)", get: (u) => u.act12, fmt: (v) => nfFull.format(v), ref: 6 },
  dsl: { label: "Hari sejak terakhir terjual", get: (u) => u.dsl, fmt: (v) => nfFull.format(v) },
  score: { label: "Skor kesehatan", get: (u) => u.score, fmt: (v) => nfFull.format(v), ref: 50 },
};

const SIZES = {
  r1: { label: "Pendapatan P1", get: (u) => u.r1 },
  n1: { label: "Transaksi P1", get: (u) => u.n1 },
  none: { label: "Seragam", get: null },
};

/* --------------------------------------------------------------- kolom    */

const COLUMNS = [
  { key: "label", label: "Produk", sort: (a, b) => a.label.localeCompare(b.label, "id") },
  { key: "stage", label: "Tahap", sort: (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] },
  { key: "pattern", label: "Pola" },
  { key: "abc", label: "ABC", sort: (a, b) => a.abc.localeCompare(b.abc), align: "center" },
  { key: "r1", label: "Pendapatan P1", sort: (a, b) => a.r1 - b.r1, align: "right", num: true },
  { key: "g", label: "Δ vs P2", sort: (a, b) => (a.g ?? 9e9) - (b.g ?? 9e9), align: "right", num: true },
  { key: "b1", label: "Cabang", sort: (a, b) => a.b1 - b.b1, align: "right", num: true, title: "Cabang yang menjual: P2 → P1" },
  { key: "act12", label: "Bln aktif", sort: (a, b) => a.act12 - b.act12, align: "right", num: true, title: "Bulan berpenjualan dari 12 terakhir" },
  { key: "dsl", label: "Terakhir", sort: (a, b) => a.dsl - b.dsl, align: "right", num: true, title: "Hari sejak terakhir terjual" },
  { key: "score", label: "Skor", sort: (a, b) => a.score - b.score, align: "right", num: true },
  { key: "spark", label: "24 bulan", title: "Pendapatan bulanan 24 bulan terakhir; 12 terakhir (P1) berwarna" },
  { key: "rec", label: "Rekomendasi", sort: (a, b) => ACTION_ORDER[a.rec.action] - ACTION_ORDER[b.rec.action] },
];

const PAGE = 60;

/** Salinan objek tanpa satu kunci. */
const omit = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

/* --------------------------------------------------------------- halaman  */

export default function ProductPortfolio({
  portfolio,
  win,
  winMode,
  setWinMode,
  unitKey,
  setUnitKey,
  crit,
  setCrit,
  quality,
  openProduct,
  onMatchLength,
}) {
  const [stageF, setStageF] = useState(() => new Set());
  const [actionF, setActionF] = useState(() => new Set());
  const [brush, setBrush] = useState(null);
  const [brushRect, setBrushRect] = useState(null);
  const [q, setQ] = useState("");
  const [parentF, setParentF] = useState("");
  const [sort, setSort] = useState({ key: "r1", dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [xKey, setXKey] = useState("r1");
  const [yKey, setYKey] = useState("g");
  const [sizeKey, setSizeKey] = useState("r1");
  const [colorKey, setColorKey] = useState("stage");

  const pf = portfolio;
  const U = pf.unitDef;
  const units = pf.units;

  /* Pilihan yang butuh kolom cabang disembunyikan kalau kolomnya tidak ada. */
  const byBranch = hasCol("Branch");
  const xAxes = useMemo(() => {
    let ax = byBranch ? X_AXES : omit(X_AXES, "b1");
    if (!U.parent) ax = omit(ax, "shareParent"); // tanpa induk, porsi induk = porsi total
    return ax;
  }, [byBranch, U.parent]);
  const yAxes = useMemo(() => (byBranch ? Y_AXES : omit(Y_AXES, "db")), [byBranch]);
  const columns = useMemo(() => (byBranch ? COLUMNS : COLUMNS.filter((c) => c.key !== "b1")), [byBranch]);
  const xK = xAxes[xKey] ? xKey : "r1";
  const yK = yAxes[yKey] ? yKey : "g";

  const toggle = (set, setter, k) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    setter(next);
    setLimit(PAGE);
  };

  const parents = useMemo(() => {
    if (!U.parent) return [];
    return Array.from(pf.parents.values())
      .filter((p) => p.r1 > 0 || p.r2 > 0)
      .sort((a, b) => b.r1 - a.r1)
      .map((p) => p.key);
  }, [pf, U.parent]);

  /* --- penyaring gabungan ---
     passWith(u, lewati) = lolos semua penyaring KECUALI yang dilewati.
     Kartu tahap dihitung tanpa penyaring tahap, kartu rekomendasi tanpa
     penyaring rekomendasi — itulah yang membuat keduanya saling menyaring. */
  const passWith = useCallback(
    (u, skip) => {
      if (skip !== "stage" && stageF.size && !stageF.has(u.stage)) return false;
      if (skip !== "action" && actionF.size && !actionF.has(u.rec.action)) return false;
      if (brush && !brush.has(u.key)) return false;
      if (parentF && u.parent !== parentF) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (!u.label.toLowerCase().includes(needle) && !String(u.key).toLowerCase().includes(needle)) return false;
      }
      return true;
    },
    [stageF, actionF, brush, parentF, q]
  );
  const pass = useCallback((u) => passWith(u, null), [passWith]);
  const anyFilter = stageF.size || actionF.size || brush || parentF || q;

  /* --- hitungan kartu yang saling menyaring --- */
  const stageCounts = useMemo(() => {
    const m = {};
    let tot = 0;
    for (const u of units) {
      if (!passWith(u, "stage")) continue;
      const e = (m[u.stage] ||= { n: 0, r1: 0 });
      e.n++;
      e.r1 += u.r1;
      tot += u.r1;
    }
    return { m, tot };
  }, [units, passWith]);
  const actionCounts = useMemo(() => {
    const m = {};
    for (const u of units) {
      if (!passWith(u, "action")) continue;
      const e = (m[u.rec.action] ||= { n: 0, r1: 0, r2: 0 });
      e.n++;
      e.r1 += u.r1;
      e.r2 += u.r2;
    }
    return m;
  }, [units, passWith]);
  const stageCrossed = !!(actionF.size || brush || parentF || q);
  const actionCrossed = !!(stageF.size || brush || parentF || q);

  /* --- Keterangan: dikendalikan halaman ini supaya tabel silangnya bisa menyaring --- */
  const [gOpen, setGOpen] = useState(false);
  const [gTab, setGTab] = useState("tahap");
  const openGlossary = (tab) => {
    setGTab(tab);
    setGOpen(true);
  };
  const glossary = {
    open: gOpen,
    setOpen: setGOpen,
    tab: gTab,
    setTab: setGTab,
    onPickCell: (stage, action) => {
      setStageF(new Set([stage]));
      setActionF(new Set([action]));
      setBrush(null);
      setBrushRect(null);
      setLimit(PAGE);
      setGOpen(false);
    },
  };
  const stageDefs = useMemo(() => Object.fromEntries(stageDefinitions(crit, win).map((d) => [d.key, d])), [crit, win]);
  const actionDefs = useMemo(() => Object.fromEntries(actionDefinitions(crit).map((d) => [d.key, d])), [crit]);

  const filtered = useMemo(() => {
    const out = units.filter(pass);
    const col = columns.find((c) => c.key === sort.key);
    if (col?.sort) out.sort((a, b) => sort.dir * col.sort(a, b));
    return out;
  }, [units, pass, sort, columns]);

  const filteredRev = useMemo(() => filtered.reduce((t, u) => t + u.r1, 0), [filtered]);

  /* --- kuadran --- */
  const plotUnits = useMemo(() => (parentF ? units.filter((u) => u.parent === parentF) : units), [units, parentF]);

  const xAxis = useMemo(() => {
    const ax = xAxes[xK];
    if (!ax.refMedian) return ax;
    const vals = plotUnits.map(ax.get).filter((v) => v != null && v > 0).sort((a, b) => a - b);
    return { ...ax, ref: vals.length ? vals[Math.floor(vals.length / 2)] : null };
  }, [xAxes, xK, plotUnits]);
  const yAxis = yAxes[yK];

  const colorOf = useCallback(
    (u) => {
      const c = colorKey === "action" ? ACTION_BY_KEY[u.rec.action] : STAGE_BY_KEY[u.stage];
      return { fill: c.color, hollow: c.hollow };
    },
    [colorKey]
  );

  const labelKeys = useMemo(() => {
    const top = plotUnits.filter((u) => u.r1 > 0).slice(0, 6).map((u) => u.key);
    return new Set(top);
  }, [plotUnits]);

  const quadrants =
    (xK === "r1" || xK === "shareParent") && yK === "g"
      ? { tr: "Bintang", tl: "Tanda tanya", br: "Andalan", bl: "Beban" }
      : null;

  const notPlotted = plotUnits.length - plotUnits.filter((u) => xAxis.get(u) != null && (!xAxis.log || xAxis.get(u) > 0) && yAxis.get(u) != null).length;

  /* --- daftar periksa --- */
  const checklist = useMemo(() => {
    // Ikut semua penyaring kecuali rekomendasi (daftar ini sendiri dibagi per rekomendasi).
    const by = (a) => units.filter((u) => u.rec.action === a && passWith(u, "action"));
    return {
      // Daftar lengkap; CheckList menampilkan 4 teratas + tombol "Tampilkan semua".
      fix: by("perbaiki").sort((a, b) => b.r2 - b.r1 - (a.r2 - a.r1)),
      drop: by("cabut").sort((a, b) => b.r2 + b.r1 - (a.r2 + a.r1)),
      grow: by("kembangkan").sort((a, b) => b.r1 - b.r2 - (a.r1 - a.r2)),
    };
  }, [units, passWith]);

  const exportRows = () =>
    downloadCsv(
      filtered.map((u) => ({
        [U.label]: u.label,
        Kunci: u.key,
        Induk: u.parent ?? "",
        Tahap: STAGE_BY_KEY[u.stage].label,
        Pola: u.pattern,
        ABC: u.abc,
        Pendapatan_P1: Math.round(u.r1),
        Pendapatan_P2: Math.round(u.r2),
        Pertumbuhan_persen: u.g == null ? "" : (u.g * 100).toFixed(1),
        ...(byBranch ? { Cabang_P2: u.b2, Cabang_P1: u.b1 } : { Transaksi_P2: u.n2, Transaksi_P1: u.n1 }),
        Bulan_aktif_12: u.act12,
        Hari_sejak_terjual: u.dsl,
        Skor: u.score,
        Rekomendasi: ACTION_BY_KEY[u.rec.action].label,
        Alasan: u.rec.why.map((w) => w.t).join(" "),
        Perhatikan: u.rec.watch.join(" "),
      })),
      `portofolio-${U.plural.replace(/\s+/g, "-")}.csv`
    );

  const clearAll = () => {
    setStageF(new Set());
    setActionF(new Set());
    setBrush(null);
    setBrushRect(null);
    setParentF("");
    setQ("");
  };

  const stageTotalR1 = pf.T1 || 1;

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <WindowBar
        unitKey={unitKey}
        setUnitKey={(k) => {
          clearAll();
          setUnitKey(k);
        }}
        winMode={winMode}
        setWinMode={setWinMode}
        win={win}
        crit={crit}
        setCrit={setCrit}
        portfolio={pf}
        onMatchLength={onMatchLength}
        glossary={glossary}
      />

      <div className="space-y-4 p-4">
        {/* ---------------- catatan data ---------------- */}
        {quality.unknownLini > 0 && (unitKey === "Lini_Produk" || unitKey === "Category") && (
          <Notice tone="warn">
            {nfFull.format(quality.unknownLini)} transaksi ({rp(quality.unknownLiniRev)}) tidak punya lini produk — biasanya kode barang yang
            belum dipetakan ke master barang (mis. kode listing marketplace). Mereka tampil sebagai satu baris terpisah bertanda "belum
            dipetakan" dan tidak ikut direkomendasikan. Petakan kodenya supaya penilaian lengkap.
          </Notice>
        )}

        {/* ---------------- ringkasan ---------------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section
            title="Peta siklus hidup"
            icon={IconCycle}
            tone="teal"
            sub={
              stageCrossed
                ? `Dihitung untuk ${U.plural} yang lolos penyaring lain (${filterSummary(actionF, parentF, brush, q)}). Klik tahap untuk menyaring.`
                : `${nfFull.format(pf.nActive)} dari ${nfFull.format(units.length)} ${U.plural} terjual di P1. ${nfFull.format(pf.countA)} ${U.plural} teratas menyusun ${nfPct.format(crit.abcA)} pendapatan. Klik tahap untuk menyaring.`
            }
            actions={<InfoButton compact label="Arti tahap" onClick={() => openGlossary("tahap")} />}
          >
            <div className="flex h-4 w-full overflow-hidden rounded-md bg-[var(--ink-100)]" role="img" aria-label="Porsi pendapatan P1 per tahap siklus hidup">
              {STAGES.map((s) => {
                const r = stageCounts.m[s.key]?.r1 || 0;
                if (!(r > 0) || !(stageCounts.tot > 0)) return null;
                return (
                  <span
                    key={s.key}
                    className="h-full border-r-2 border-[var(--paper)] last:border-r-0"
                    style={{ width: `${(r / stageCounts.tot) * 100}%`, background: s.color, opacity: stageF.size && !stageF.has(s.key) ? 0.25 : 1 }}
                    title={`${s.label}: ${sharePct(r / stageCounts.tot)} pendapatan P1${stageCrossed ? " (dalam pilihan ini)" : ""}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {STAGES.map((s) => {
                const st = stageCounts.m[s.key] || { n: 0, r1: 0 };
                const total = pf.byStage[s.key]?.n || 0;
                return (
                  <SummaryCard
                    key={s.key}
                    item={s}
                    n={st.n}
                    total={total}
                    crossed={stageCrossed}
                    sub={`${sharePct(st.r1 / stageTotalR1)} pendapatan`}
                    on={stageF.has(s.key)}
                    onClick={() => toggle(stageF, setStageF, s.key)}
                    title={`${s.label} — ${stageDefs[s.key]?.rule || s.hint}`}
                  />
                );
              })}
            </div>
          </Section>

          <Section
            title="Rekomendasi"
            icon={IconFlag}
            tone="amber"
            sub={
              actionCrossed
                ? `Untuk ${U.plural} ${stageF.size ? `berstatus ${Array.from(stageF).map((k) => STAGE_BY_KEY[k].label).join(" atau ")}` : "yang lolos penyaring"}${
                    brush || parentF || q ? " dan penyaring lain" : ""
                  }. Klik untuk menyempitkan lagi.`
                : "Klik untuk menyaring. Setiap rekomendasi punya alasan tertulis di tabel dan halaman diagnosis."
            }
            actions={<InfoButton compact label="Arti rekomendasi" onClick={() => openGlossary("rekomendasi")} />}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACTIONS.map((a) => {
                const st = actionCounts[a.key] || { n: 0, r1: 0, r2: 0 };
                const total = pf.byAction[a.key]?.n || 0;
                const rules = actionDefs[a.key]?.rules || [];
                return (
                  <SummaryCard
                    key={a.key}
                    item={a}
                    n={st.n}
                    total={total}
                    crossed={actionCrossed}
                    sub={a.key === "bersihkan" ? `${rp(st.r2)} di P2` : `${sharePct(st.r1 / stageTotalR1)} pendapatan`}
                    on={actionF.has(a.key)}
                    onClick={() => toggle(actionF, setActionF, a.key)}
                    title={`${a.label} — ${a.hint}\nAturan: ${rules.map((r) => r.text).join("; ")}`}
                  />
                );
              })}
            </div>
          </Section>
        </div>

        {/* ---------------- kuadran + daftar periksa ---------------- */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Section
            title="Peta produk"
            icon={IconScatter}
            tone="blue"
            sub="Setiap titik satu produk. Arahkan kursor untuk detail, klik untuk diagnosis, seret di area kosong untuk memilih sekelompok produk."
          >
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Field label="Sumbu X">
                <select className={SELECT} value={xK} onChange={(e) => setXKey(e.target.value)}>
                  {Object.entries(xAxes).map(([k, a]) => (
                    <option key={k} value={k}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sumbu Y">
                <select className={SELECT} value={yK} onChange={(e) => setYKey(e.target.value)}>
                  {Object.entries(yAxes).map(([k, a]) => (
                    <option key={k} value={k}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ukuran">
                <select className={SELECT} value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
                  {Object.entries(SIZES).map(([k, a]) => (
                    <option key={k} value={k}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Warna">
                <select className={SELECT} value={colorKey} onChange={(e) => setColorKey(e.target.value)}>
                  <option value="stage">Tahap siklus</option>
                  <option value="action">Rekomendasi</option>
                </select>
              </Field>
              {parents.length > 0 && (
                <Field label="Batasi ke" className="ml-auto">
                  <select className={SELECT} value={parentF} onChange={(e) => setParentF(e.target.value)}>
                    <option value="">Semua {labelOf(U.parent).toLowerCase()}</option>
                    {parents.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {/* legenda = penyaring */}
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {(colorKey === "action" ? ACTIONS : STAGES).map((c) => {
                const set = colorKey === "action" ? actionF : stageF;
                const setter = colorKey === "action" ? setActionF : setStageF;
                const n = colorKey === "action" ? pf.byAction[c.key]?.n || 0 : pf.byStage[c.key]?.n || 0;
                if (!n) return null;
                const on = set.has(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(set, setter, c.key)}
                    className={cx(
                      "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] transition-colors",
                      FOCUS,
                      on ? "bg-[var(--brand-50)] text-[var(--brand-800)]" : "text-[var(--ink-700)] hover:bg-[var(--ink-50)]",
                      set.size && !on && "opacity-50"
                    )}
                    aria-pressed={on}
                  >
                    <Dot color={c.color} hollow={c.hollow} />
                    {c.label}
                    <span className="text-[var(--ink-400)]">{nfFull.format(n)}</span>
                  </button>
                );
              })}
            </div>

            <QuadrantScatter
              units={plotUnits}
              xAxis={xAxis}
              yAxis={yAxis}
              sizeGet={SIZES[sizeKey].get}
              colorOf={colorOf}
              quadrants={quadrants}
              dimmed={anyFilter ? (u) => !pass(u) : null}
              labelKeys={labelKeys}
              brushRect={brushRect}
              onPick={(u) => openProduct(u.key)}
              onBrush={(keys, rect) => {
                setBrush(keys);
                setBrushRect(keys ? rect : null);
                setLimit(PAGE);
              }}
              tipExtra={(u) => (
                <>
                  <TipRow name="Tahap" value={STAGE_BY_KEY[u.stage].label} />
                  <TipRow name="Rekomendasi" value={ACTION_BY_KEY[u.rec.action].label} />
                </>
              )}
            />
            <p className={cx("mt-1 text-[11px]", MUTED)}>
              {quadrants && "Garis vertikal = median. "}
              {notPlotted > 0 && `${nfFull.format(notPlotted)} ${U.plural} tanpa nilai pada sumbu ini (mis. tidak terjual di P1) tidak tampil — tetap ada di tabel. `}
              {yK === "g" && "Panah ke atas = pertumbuhan di atas 300% atau tanpa pembanding."}
            </p>
          </Section>

          <Section
            title="Daftar periksa keputusan"
            icon={IconChecklist}
            tone="red"
            sub={anyFilter ? "Yang paling layak dilihat lebih dulu, mengikuti penyaring yang aktif." : "Yang paling layak dilihat lebih dulu."}
            bodyClass="p-0"
          >
            <CheckList
              title="Perlu diperbaiki"
              hint="Penting tapi turun — diurut dari kehilangan terbesar"
              color={ACTION_BY_KEY.perbaiki.color}
              items={checklist.fix}
              metric={(u) => (
                <>
                  <Signed v={u.r1 - u.r2} className="font-medium" /> <Delta g={u.g} p1={u.r1} p2={u.r2} size="xs" /> ·{" "}
                  {byBranch ? (
                    <>
                      cabang <CountChange from={u.b2} to={u.b1} />
                    </>
                  ) : (
                    <>
                      transaksi <CountChange from={u.n2} to={u.n1} />
                    </>
                  )}
                </>
              )}
              onPick={openProduct}
            />
            <CheckList
              title="Kandidat dicabut"
              hint="Kecil dan melemah — diurut dari yang dulu paling besar"
              color={ACTION_BY_KEY.cabut.color}
              items={checklist.drop}
              metric={(u) => (
                <>
                  {rp(u.r2)} → {rp(u.r1)} <Delta g={u.g} p1={u.r1} p2={u.r2} size="xs" /> · terakhir {u.dsl} hari lalu
                </>
              )}
              onPick={openProduct}
            />
            <CheckList
              title="Sedang naik"
              hint="Kenaikan terbesar"
              color={ACTION_BY_KEY.kembangkan.color}
              items={checklist.grow}
              metric={(u) => (
                <>
                  <Signed v={u.r1 - u.r2} className="font-medium" /> <Delta g={u.g} p1={u.r1} p2={u.r2} size="xs" />
                </>
              )}
              onPick={openProduct}
              last
            />
          </Section>
        </div>

        {/* ---------------- tabel ---------------- */}
        <Section
          title={`Semua ${U.plural}`}
          icon={IconTable}
          tone="mauve"
          sub={`${nfFull.format(filtered.length)} ${U.plural} · ${rp(filteredRev)} pendapatan P1${anyFilter ? " (tersaring)" : ""}. Klik baris untuk diagnosis.`}
          bodyClass="p-0"
          actions={
            <>
              <input
                className={cx(
                  "w-[200px] rounded-md border bg-[var(--ink-50)] px-2.5 py-1.5 text-xs text-[var(--ink-900)] focus:border-[var(--brand-400)] focus:bg-[var(--paper)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
                  LINE
                )}
                placeholder={`Cari ${U.label.toLowerCase()}…`}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
                aria-label="Cari produk"
              />
              <button type="button" className={cx(BTN, "inline-flex items-center gap-1.5")} onClick={exportRows}>
                <IconDownload className="h-4 w-4" />
                Unduh CSV
              </button>
            </>
          }
        >
          {anyFilter && (
            <div className={cx("flex flex-wrap items-center gap-1.5 border-b px-4 py-2", LINE)}>
              <span className={cx("text-[11px]", MUTED)}>Penyaring</span>
              {Array.from(stageF).map((k) => (
                <FilterChip key={k} color={STAGE_BY_KEY[k].color} hollow={STAGE_BY_KEY[k].hollow} onClear={() => toggle(stageF, setStageF, k)}>
                  {STAGE_BY_KEY[k].label}
                </FilterChip>
              ))}
              {Array.from(actionF).map((k) => (
                <FilterChip key={k} color={ACTION_BY_KEY[k].color} hollow={ACTION_BY_KEY[k].hollow} onClear={() => toggle(actionF, setActionF, k)}>
                  {ACTION_BY_KEY[k].label}
                </FilterChip>
              ))}
              {brush && (
                <FilterChip
                  onClear={() => {
                    setBrush(null);
                    setBrushRect(null);
                  }}
                >
                  {nfFull.format(brush.size)} dipilih dari peta
                </FilterChip>
              )}
              {parentF && <FilterChip onClear={() => setParentF("")}>{parentF}</FilterChip>}
              {q && <FilterChip onClear={() => setQ("")}>"{q}"</FilterChip>}
              <button type="button" className={BTN_QUIET} onClick={clearAll}>
                Bersihkan semua
              </button>
            </div>
          )}

          <div className="dt-scroll overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse text-xs">
              <thead>
                <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
                  {columns.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cx(
                          "sticky top-0 bg-[var(--paper)] px-3 py-2 font-medium",
                          // Kolom nama ikut menempel di kiri saat tabel digeser ke samping.
                          c.key === "label" && "left-0 z-[3] shadow-[1px_0_0_var(--ink-100)]",
                          c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                        )}
                        title={c.title}
                        aria-sort={on ? (sort.dir < 0 ? "descending" : "ascending") : undefined}
                      >
                        {c.sort ? (
                          <button
                            type="button"
                            className={cx("inline-flex items-center gap-1 rounded hover:text-[var(--brand-700)]", FOCUS, on && "text-[var(--brand-700)]")}
                            onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : c.num ? -1 : 1 }))}
                          >
                            {c.label}
                            <span aria-hidden="true" className="text-[9px]">
                              {on ? (sort.dir < 0 ? "▼" : "▲") : ""}
                            </span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((u) => (
                  <tr
                    key={u.key}
                    tabIndex={0}
                    onClick={() => openProduct(u.key)}
                    onKeyDown={(e) => e.key === "Enter" && openProduct(u.key)}
                    className="group cursor-pointer border-b border-[var(--ink-100)] transition-colors hover:bg-[var(--brand-50)] focus-visible:bg-[var(--brand-50)] focus-visible:outline-none"
                  >
                    <td className="sticky left-0 z-[1] max-w-[300px] bg-[var(--paper)] px-3 py-2 shadow-[1px_0_0_var(--ink-100)] transition-colors group-hover:bg-[var(--brand-50)] group-focus-visible:bg-[var(--brand-50)]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-[var(--ink-900)]" title={u.label}>
                          {u.label}
                        </span>
                        {u.unknown && (
                          <span className="flex-none rounded bg-[var(--note-bg)] px-1.5 py-px text-[10px] text-[var(--note)]" title="Transaksi tanpa lini/kategori — bukan produk sungguhan">
                            belum dipetakan
                          </span>
                        )}
                      </div>
                      {u.sub && <div className={cx("truncate text-[11px]", MUTED)}>{u.sub}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <StageBadge stage={u.stage} />
                    </td>
                    <td className="px-3 py-2">
                      <PatternText pattern={u.pattern} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span title={ABC_HINT[u.abc]}>
                        <AbcBadge abc={u.abc} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-900)]">{rp(u.r1)}</td>
                    <td className="px-3 py-2 text-right">
                      <Delta g={u.g} p1={u.r1} p2={u.r2} size="sm" />
                    </td>
                    {byBranch && (
                      <td className="px-3 py-2 text-right">
                        <CountChange from={u.b2} to={u.b1} />
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-700)]">{u.act12}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-700)]" title={`Terakhir terjual ${dLabel.format(toJs(u.last))}`}>
                      {u.dsl === 0 ? "hari ini" : `${nfFull.format(u.dsl)} hr`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--ink-900)]">{u.score}</td>
                    <td className="px-3 py-2">
                      <RowSpark series={u.series} />
                    </td>
                    <td className="max-w-[320px] px-3 py-2">
                      <ActionBadge action={u.rec.action} />
                      <div className={cx("mt-0.5 line-clamp-2 text-[11px] leading-snug", MUTED)} title={u.rec.why.map((w) => w.t).join(" ")}>
                        <ChangeText>{u.rec.why[0]?.t}</ChangeText>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className={cx("px-4 py-12 text-center text-xs", MUTED)}>
              Tidak ada {U.plural} yang cocok dengan penyaring ini.{" "}
              <button type="button" className="text-[var(--brand-700)] underline" onClick={clearAll}>
                Bersihkan penyaring
              </button>
            </div>
          )}

          {filtered.length > PAGE && (
            <div className={cx("flex flex-wrap items-center justify-center gap-3 border-t px-4 py-3", LINE)}>
              <span className={cx("text-[11px]", MUTED)}>
                Menampilkan {nfFull.format(Math.min(limit, filtered.length))} dari {nfFull.format(filtered.length)} {U.plural}
              </span>
              {filtered.length > limit && (
                <button type="button" className={BTN} onClick={() => setLimit((l) => l + PAGE)}>
                  Tampilkan {Math.min(PAGE, filtered.length - limit)} lagi
                </button>
              )}
              <ShowAll
                total={filtered.length}
                limit={PAGE}
                open={limit >= filtered.length}
                onToggle={() => setLimit((l) => (l >= filtered.length ? PAGE : filtered.length))}
                noun={U.plural}
              />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- kartu ringkasan  */

/** Kalimat pendek tentang penyaring lain yang sedang aktif. */
function filterSummary(actionF, parentF, brush, q) {
  const parts = [];
  if (actionF.size) parts.push(Array.from(actionF).map((k) => ACTION_BY_KEY[k].label).join(" atau "));
  if (parentF) parts.push(parentF);
  if (brush) parts.push(`${nfFull.format(brush.size)} dipilih dari peta`);
  if (q) parts.push(`"${q}"`);
  return parts.join(", ");
}

/**
 * Kartu tahap atau rekomendasi. Garis kiri berwarna = identitas; saat
 * dipilih, kartu terisi tinta warnanya. Kalau penyaring lain aktif, angka
 * besarnya adalah hitungan dalam pilihan itu, dengan total keseluruhan di
 * sebelahnya ("3 dari 7").
 */
function SummaryCard({ item, n, total, crossed, sub, on, onClick, title }) {
  const t = TONES[item.tone] || TONES.mauve;
  const accent = item.hollow ? "#a8949c" : item.color;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!n && !on}
      aria-pressed={on}
      title={title}
      className={cx(
        "rounded-lg border px-2.5 py-2.5 text-left transition-[box-shadow,background-color,opacity] disabled:cursor-default disabled:opacity-45",
        !on && "hover:bg-[var(--band)]",
        FOCUS
      )}
      style={{
        background: on ? t.tint : "var(--paper)",
        borderColor: on ? accent : t.line,
        boxShadow: on ? `0 0 0 1px ${accent}, inset 4px 0 0 ${accent}` : `inset 3px 0 0 ${accent}`,
      }}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-900)]">
        <Dot color={item.color} hollow={item.hollow} />
        <span className="truncate">{item.label}</span>
      </span>
      <span className="mt-1 flex items-baseline gap-1">
        <span className="dt-display text-[24px] font-semibold leading-none text-[var(--ink-900)]">{nfFull.format(n)}</span>
        {crossed && n !== total && <span className="text-[11.5px] text-[var(--ink-500)]">dari {nfFull.format(total)}</span>}
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-600)]">{sub}</span>
    </button>
  );
}

/* ------------------------------------------------------- daftar periksa   */

const CHECK_LIMIT = 4;

function CheckList({ title, hint, color, items, metric, onPick, last }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, CHECK_LIMIT);
  return (
    <div className={cx("px-4 py-3", !last && `border-b ${LINE}`)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-900)]">
        <Dot color={color} />
        {title}
        <span className="ml-auto text-[11px] font-normal tabular-nums text-[var(--ink-500)]">{nfFull.format(items.length)}</span>
      </div>
      <div className={cx("mb-1.5 text-[11px]", MUTED)}>{hint}</div>
      {items.length === 0 ? (
        <div className={cx("py-1 text-[11px]", MUTED)}>Tidak ada.</div>
      ) : (
        <ul className={cx(all && items.length > 12 && "dt-scroll max-h-[440px] overflow-auto pr-1")}>
          {shown.map((u) => (
            <li key={u.key}>
              <button
                type="button"
                onClick={() => onPick(u.key)}
                className={cx("-mx-1.5 block w-[calc(100%+12px)] rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--brand-50)]", FOCUS)}
              >
                <span className="block truncate text-[12px] text-[var(--ink-900)]">{u.label}</span>
                <span className="block truncate text-[11px] tabular-nums text-[var(--ink-500)]">{metric(u)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length > CHECK_LIMIT && (
        <div className="mt-1.5">
          <ShowAll total={items.length} limit={CHECK_LIMIT} open={all} onToggle={() => setAll((v) => !v)} />
        </div>
      )}
    </div>
  );
}
