/* ============================================================================
   Halaman: Matriks silang
   ----------------------------------------------------------------------------
   Dua dimensi sekaligus, baris dan kolom dipilih bebas. Empat cara mewarnai:

   Nilai        — besar pendapatan P1 (satu hue, terang ke gelap)
   Pertumbuhan  — P1 vs P2 (merah turun · abu netral · teal naik)
   Indeks       — nilai sel ÷ nilai yang diharapkan kalau baris dan kolom
                  tidak saling terkait. Tempat mencari keanehan: kategori
                  yang laku 8× di satu wilayah, atau yang nyaris tidak laku
                  di wilayah lain walau besar di tempat lain.
   Porsi baris  — komposisi tiap baris (kolom mana yang mendominasi)

   Marimekko menampilkan hal yang sama sebagai luas: lebar kolom = porsi
   baris dari total, tinggi segmen = komposisi di dalamnya.
   ========================================================================== */

import React, { useState, useMemo, useRef } from "react";
import { BusyOverlay } from "../components/busy.jsx";

import { EXPLORE_DIMS, activeUnits, dimOk, labelOf } from "../lib/config.js";
import { OTHER_KEY, buildMatrix, cellKey } from "../lib/explore.js";
import { CATEGORICAL, NEW_COLOR, OTHER_COLOR, divergingColor, indexColor, inkOn, sequentialColor } from "../lib/color.js";
import { Delta } from "../components/delta.jsx";
import { fmt, nfFull, nfPct, signedPct } from "../lib/format.js";
import { valueLabel } from "../lib/product.js";
import { useScrollBox, useSettled, useWidth } from "../lib/hooks.js";
import { FOCUS, LINE, MUTED, SELECT, cx } from "../lib/theme.jsx";
import { ChartTip, Field, Notice, Section, Segmented, ShowAll, TipRow, WindowBar } from "../components/productui.jsx";
import { IconGrid } from "../components/icons.jsx";

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const rp = (v) => fmt(v, "currency", true);
const growthText = (g) => (g == null ? "–" : g === Infinity ? "baru" : signedPct(g));

const SIZES = [
  [10, 8],
  [15, 10],
  [25, 12],
  [40, 16],
];
const DETAIL_LIMIT = 10;

const METRICS = [
  { key: "value", label: "Nilai", hint: "Pendapatan P1" },
  { key: "growth", label: "Pertumbuhan", hint: "P1 dibanding P2" },
  { key: "index", label: "Indeks", hint: "Aktual ÷ harapan jika baris dan kolom tak berkaitan" },
  { key: "rowShare", label: "Porsi baris", hint: "Porsi sel di dalam barisnya" },
];


export default function MatrixPage({ lines, labels, win, winMode, setWinMode, openProductAt, onMatchLength}) {
  const avail = EXPLORE_DIMS.filter(dimOk);
  const pick = (...pref) => pref.find((d) => avail.includes(d)) || avail[0];
  // Pilihan langsung (kontrol). Matriksnya dihitung dari salinan "tenang" di bawah.
  const [rowDimIn, setRowDim] = useState(() => pick("Category", "Lini_Produk", "__name"));
  const [colDimIn, setColDim] = useState(() => pick("branch_area", "Branch", "Channel", ...avail.filter((d) => d !== pick("Category", "Lini_Produk", "__name"))));
  const [metric, setMetric] = useState("value");
  const [view, setView] = useState("heatmap");
  // 0 × 0 = "Semua": tidak ada baris/kolom yang digabung menjadi "lainnya".
  const [maxRowsIn, setMaxRows] = useState(15);
  const [maxColsIn, setMaxCols] = useState(10);
  const [lastSize, setLastSize] = useState([15, 10]);
  const [sel, setSel] = useState(null);
  const [detailAll, setDetailAll] = useState(false);
  const setSize = (r, c) => {
    if (r && c) setLastSize([r, c]);
    setMaxRows(r);
    setMaxCols(c);
  };
  /* Matriks besar (mis. "Semua baris × semua kolom") berat dihitung dan
     digambar: hitungannya baru dimulai sesudah logo memuat tergambar. */
  const askLive = useMemo(
    () => ({ rowDim: rowDimIn, colDim: colDimIn, maxRows: maxRowsIn, maxCols: maxColsIn }),
    [rowDimIn, colDimIn, maxRowsIn, maxColsIn]
  );
  const [ask, recalculating] = useSettled(askLive);
  const { rowDim, colDim, maxRows, maxCols } = ask;
  const allMode = maxRows === 0 && maxCols === 0;
  const allModeIn = maxRowsIn === 0 && maxColsIn === 0;

  const mx = useMemo(
    () => buildMatrix(lines, { rowDim, colDim, win, size: "Revenue", maxRows: maxRows || Infinity, maxCols: maxCols || Infinity, labels }),
    [lines, rowDim, colDim, win, maxRows, maxCols, labels]
  );
  const shownRows = mx.rows.filter((r) => !r.other).length;
  const shownCols = mx.cols.filter((c) => !c.other).length;
  const merged = mx.rows.some((r) => r.other) || mx.cols.some((c) => c.other);

  const maxV = useMemo(() => {
    let m = 0;
    for (const c of mx.cells.values()) if (c.v1 > m) m = c.v1;
    return m || 1;
  }, [mx]);

  const cellColor = (c) => {
    if (!c || (!(c.v1 > 0) && !(c.v2 > 0))) return "var(--paper)";
    if (metric === "value") return c.v1 > 0 ? sequentialColor(Math.sqrt(c.v1 / maxV)) : "var(--ink-50)";
    if (metric === "growth") return divergingColor(c.g);
    if (metric === "index") return indexColor(c.idx);
    return sequentialColor(Math.sqrt(c.rowShare));
  };
  const cellText = (c) => {
    if (!c || (!(c.v1 > 0) && !(c.v2 > 0))) return "";
    // Tanpa "Rp" di dalam sel supaya muat satu baris; satuannya ada di legenda.
    if (metric === "value") return c.v1 > 0 ? fmt(c.v1, "int", true) : "0";
    if (metric === "growth") return growthText(c.g);
    if (metric === "index") return c.idx == null ? "–" : `${nf1.format(c.idx)}×`;
    return nfPct.format(c.rowShare);
  };

  const swap = () => {
    setRowDim(colDimIn);
    setColDim(rowDimIn);
    setSel(null);
  };

  /* --- isi sel terpilih: satu tingkat di bawah, atau dimensi lain yang ada --- */
  const usedDims = [rowDim, colDim];
  const detailPrefs = usedDims.includes("Category")
    ? ["__name", "Item_Code", "Branch"]
    : usedDims.some((d) => d === "__name" || d === "Item_Code")
    ? ["Branch", "branch_area", "Channel"]
    : ["Category", "__name", "Lini_Produk", "Item_Code", "Branch"];
  const detailDim =
    detailPrefs.find((d) => dimOk(d) && !usedDims.includes(d)) || avail.find((d) => !usedDims.includes(d)) || rowDim;

  const detailFull = useMemo(() => {
    if (!sel || sel.r === OTHER_KEY || sel.c === OTHER_KEY) return null;
    const acc = new Map();
    for (const ln of lines) {
      if (ln[rowDim] !== sel.r || ln[colDim] !== sel.c) continue;
      const d = ln.__d;
      const in1 = d >= win.p1.from && d <= win.p1.to;
      const in2 = d >= win.p2.from && d <= win.p2.to;
      if (!in1 && !in2) continue;
      const k = ln[detailDim];
      let e = acc.get(k);
      if (!e) acc.set(k, (e = { key: k, label: valueLabel(detailDim, k, labels), v1: 0, v2: 0 }));
      if (in1) e.v1 += ln.Revenue;
      if (in2) e.v2 += ln.Revenue;
    }
    return Array.from(acc.values())
      .map((e) => ({ ...e, g: e.v2 > 0 ? (e.v1 - e.v2) / e.v2 : e.v1 > 0 ? Infinity : null }))
      .sort((a, b) => b.v1 - a.v1 || b.v2 - a.v2 || String(a.label).localeCompare(String(b.label)));
  }, [sel, lines, rowDim, colDim, detailDim, win, labels]);
  const detail = detailFull ? (detailAll ? detailFull : detailFull.slice(0, DETAIL_LIMIT)) : null;

  /* Grafiknya di-memo: saat pilihan baru sedang dihitung, grafik lama tidak
     perlu digambar ulang (bisa ribuan sel), jadi logo memuat langsung muncul. */
  const chartEl = useMemo(
    () =>
      view === "heatmap" ? (
        <Heatmap mx={mx} cellColor={cellColor} cellText={cellText} sel={sel} onSel={setSel} />
      ) : (
        <Marimekko mx={mx} sel={sel} onSel={setSel} />
      ),
    [view, mx, metric, maxV, sel] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selCell = sel ? mx.cells.get(cellKey(sel.r, sel.c)) : null;
  const rowOf = (k) => mx.rows.find((r) => r.key === k);
  const colOf = (k) => mx.cols.find((c) => c.key === k);

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <BusyOverlay show={recalculating} label="Menyusun ulang matriks…" sub="Sebentar, sel-selnya sedang dihitung ulang." />
      <WindowBar winMode={winMode} setWinMode={setWinMode} win={win} showUnit={false} onMatchLength={onMatchLength} />
      <div className="space-y-4 p-4">
        <Section
          title="Matriks silang"
          icon={IconGrid}
          tone="blue"
          sub="Pilih dua dimensi. Klik sel untuk melihat isinya. Gunakan warna Indeks untuk menemukan kombinasi yang jauh di atas atau di bawah kewajaran."
          bodyClass="p-0"
        >
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3", LINE)}>
            <Field label="Baris">
              <select className={SELECT} value={rowDimIn} onChange={(e) => (setRowDim(e.target.value), setSel(null))}>
                {avail.filter((d) => d !== colDimIn).map((d) => (
                  <option key={d} value={d}>
                    {labelOf(d)}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" onClick={swap} className={cx("rounded px-1.5 py-1 text-[var(--ink-500)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)]", FOCUS)} title="Tukar baris dan kolom" aria-label="Tukar baris dan kolom">
              ⇄
            </button>
            <Field label="Kolom">
              <select className={SELECT} value={colDimIn} onChange={(e) => (setColDim(e.target.value), setSel(null))}>
                {avail.filter((d) => d !== rowDimIn).map((d) => (
                  <option key={d} value={d}>
                    {labelOf(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Segmented label="Tampilan" value={view} onChange={setView} options={[{ key: "heatmap", label: "Heatmap" }, { key: "marimekko", label: "Marimekko" }]} />
            {view === "heatmap" && (
              <Field label="Warna">
                <Segmented label="Warna" value={metric} onChange={setMetric} options={METRICS} />
              </Field>
            )}
            <Field label="Maks">
              <select
                className={SELECT}
                value={`${maxRowsIn}x${maxColsIn}`}
                onChange={(e) => {
                  const [r, c] = e.target.value.split("x").map(Number);
                  setSize(r, c);
                }}
              >
                {SIZES.map(([r, c]) => (
                  <option key={`${r}x${c}`} value={`${r}x${c}`}>
                    {r} baris × {c} kolom
                  </option>
                ))}
                <option value="0x0">Semua baris × semua kolom</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 p-4">
              {chartEl}
              {view === "heatmap" && <HeatLegend metric={metric} maxV={maxV} />}
              {mx.rows.length > 0 && (
                <div className={cx("mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-[11px]", LINE, MUTED)}>
                  <span>
                    Menampilkan {nfFull.format(shownRows)} dari {nfFull.format(mx.nRows)} {labelOf(rowDim).toLowerCase()} ×{" "}
                    {nfFull.format(shownCols)} dari {nfFull.format(mx.nCols)} {labelOf(colDim).toLowerCase()}
                    {merged ? ". Sisanya digabung di baris/kolom abu-abu \u201clainnya\u201d." : "."}
                  </span>
                  {(allMode ? mx.nRows > lastSize[0] || mx.nCols > lastSize[1] : merged) && (
                    <ShowAll
                      total={1}
                      limit={0}
                      open={allModeIn}
                      onToggle={() => {
                        setSel(null);
                        setSize(...(allModeIn ? lastSize : [0, 0]));
                      }}
                      closedLabel="Tampilkan semua baris & kolom"
                      openLabel={`Ringkas lagi (${lastSize[0]} × ${lastSize[1]})`}
                    />
                  )}
                </div>
              )}
            </div>

            {/* ---------------- isi sel ---------------- */}
            <aside className={cx("border-t p-4 xl:border-l xl:border-t-0", LINE)}>
              {!selCell ? (
                <p className={cx("text-xs leading-relaxed", MUTED)}>
                  Klik sebuah sel untuk melihat angkanya dan {labelOf(detailDim).toLowerCase()} apa saja yang ada di dalamnya.
                </p>
              ) : (
                <>
                  <div className={cx("text-[11px]", MUTED)}>
                    {labelOf(rowDim)} × {labelOf(colDim)}
                  </div>
                  <div className="mt-0.5 text-[13px] font-semibold leading-snug text-[var(--ink-900)]">
                    {rowOf(sel.r)?.label} × {colOf(sel.c)?.label}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <Def label="P1" value={rp(selCell.v1)} />
                    <Def label="P2" value={rp(selCell.v2)} />
                    <Def label="Perubahan" value={<Delta g={selCell.g} p1={selCell.v1} p2={selCell.v2} size="md" />} />
                    <Def label="Indeks" value={selCell.idx == null ? "–" : `${nf1.format(selCell.idx)}×`} />
                    <Def label="Porsi baris" value={nfPct.format(selCell.rowShare)} />
                    <Def label="Porsi kolom" value={nfPct.format(selCell.colShare)} />
                  </dl>
                  {selCell.idx != null && (
                    <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-700)]">
                      {selCell.idx >= 1.5
                        ? `Kombinasi ini ${nf1.format(selCell.idx)}× lebih besar dari yang wajar — kekuatan lokal yang mungkin bisa ditiru di tempat lain.`
                        : selCell.idx <= 0.5
                        ? `Kombinasi ini hanya ${nf1.format(selCell.idx)}× dari yang wajar — celah: ${rowOf(sel.r)?.label} kurang laku di ${colOf(sel.c)?.label} dibanding di tempat lain.`
                        : "Kombinasi ini sesuai dengan yang wajar dari ukuran baris dan kolomnya."}
                    </p>
                  )}
                  {detail && detail.length > 0 && (
                    <>
                      <div className="mt-4 text-[11px] font-semibold text-[var(--ink-700)]">
                        {labelOf(detailDim)} terbesar di sel ini · {nfFull.format(detailFull.length)}
                      </div>
                      <ul className={cx("mt-1", detailAll && detail.length > 14 && "dt-scroll max-h-[440px] overflow-auto pr-1")}>
                        {detail.map((d) => {
                          const canOpen = activeUnits().some((u) => u.key === detailDim) && openProductAt;
                          const Tag = canOpen ? "button" : "div";
                          return (
                            <li key={d.key}>
                              <Tag
                                type={canOpen ? "button" : undefined}
                                onClick={canOpen ? () => openProductAt(detailDim, d.key) : undefined}
                                className={cx(
                                  "-mx-1.5 grid w-[calc(100%+12px)] grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 rounded-md px-1.5 py-1 text-left text-xs",
                                  canOpen && "transition-colors hover:bg-[var(--brand-50)]",
                                  canOpen && FOCUS
                                )}
                                title={canOpen ? "Buka diagnosis" : undefined}
                              >
                                <span className="truncate text-[var(--ink-900)]">{d.label}</span>
                                <span className="tabular-nums text-[var(--ink-600)]">
                                  {rp(d.v1)} <Delta g={d.g} p1={d.v1} p2={d.v2} size="xs" />
                                </span>
                              </Tag>
                            </li>
                          );
                        })}
                      </ul>
                      {detailFull.length > DETAIL_LIMIT && (
                        <div className="mt-2">
                          <ShowAll
                            total={detailFull.length}
                            limit={DETAIL_LIMIT}
                            open={detailAll}
                            onToggle={() => setDetailAll((v) => !v)}
                            noun={labelOf(detailDim).toLowerCase()}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {(sel.r === OTHER_KEY || sel.c === OTHER_KEY) && (
                    <p className={cx("mt-3 text-[11.5px] leading-relaxed", MUTED)}>
                      Sel ini gabungan anggota kecil. Pilih <b>Tampilkan semua baris &amp; kolom</b> di bawah matriks untuk memecahnya.
                    </p>
                  )}
                </>
              )}
            </aside>
          </div>
        </Section>
        {mx.rows.length === 0 && <Notice>Tidak ada transaksi pada jendela ini.</Notice>}
      </div>
    </div>
  );
}

function Def({ label, value, tone }) {
  return (
    <div>
      <dt className={cx("text-[11px]", MUTED)}>{label}</dt>
      <dd className={cx("font-semibold tabular-nums", tone === "pos" ? "text-[var(--pos)]" : tone === "neg" ? "text-[var(--neg)]" : "text-[var(--ink-900)]")}>{value}</dd>
    </div>
  );
}

/* ================================================================ heatmap */

/* Matriks besar (mode "Semua" dengan ratusan/ribuan anggota) digambar
   sebagian: hanya baris dan kolom yang terlihat di kotak gulir, ditambah
   cadangan beberapa baris/kolom di sekelilingnya. Ukuran sel dibuat tetap
   supaya posisi gulir bisa dihitung tanpa mengukur DOM. */
const BIG_ROWS = 120;
const BIG_COLS = 40;
const ROW_H = 34; // tombol 32px + jarak antarsel 2px
const COL_W = 76;
const FIRST_W = 200;
const TOTAL_W = 150;
const SP = 2;
const HEAD_H = 44;

function Heatmap({ mx, cellColor, cellText, sel, onSel }) {
  const big = mx.rows.length > BIG_ROWS || mx.cols.length > BIG_COLS;
  const boxRef = useRef(null);
  const box = useScrollBox(boxRef, big);

  let r0 = 0;
  let r1 = mx.rows.length;
  let c0 = 0;
  let c1 = mx.cols.length;
  if (big) {
    r0 = Math.max(0, Math.floor((box.top - HEAD_H) / ROW_H) - 10);
    r1 = Math.min(mx.rows.length, Math.ceil((box.top + box.h) / ROW_H) + 10);
    c0 = Math.max(0, Math.floor(box.left / (COL_W + SP)) - 3);
    c1 = Math.min(mx.cols.length, Math.ceil((box.left + box.w - FIRST_W) / (COL_W + SP)) + 3);
  }
  const cols = mx.cols.slice(c0, c1);
  const rows = mx.rows.slice(r0, r1);
  const padL = big && c0 > 0 ? c0 * (COL_W + SP) - SP : 0;
  const padR = big && c1 < mx.cols.length ? (mx.cols.length - c1) * (COL_W + SP) - SP : 0;
  const padT = big && r0 > 0 ? r0 * ROW_H - SP : 0;
  const padB = big && r1 < mx.rows.length ? (mx.rows.length - r1) * ROW_H - SP : 0;
  const span = 2 + cols.length + (padL ? 1 : 0) + (padR ? 1 : 0);
  const tableW = big ? FIRST_W + mx.cols.length * (COL_W + SP) + TOTAL_W + 3 * SP : undefined;
  const fixed = (w) => (big ? { width: w, minWidth: w, maxWidth: w } : undefined);
  const stickyFoot = big ? "sticky bottom-0 z-[1] bg-[var(--paper)]" : "";

  return (
    <div ref={boxRef} className={cx("dt-scroll overflow-auto rounded-md border border-[var(--ink-100)]", big && "max-h-[70vh]")}>
      <table
        className="border-separate border-spacing-[2px] text-[11px]"
        style={big ? { tableLayout: "fixed", width: tableW } : undefined}
      >
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-[3] bg-[var(--paper)] px-2 py-1.5 text-left font-medium text-[var(--ink-500)]"
              style={fixed(FIRST_W)}
            >
              {labelOf(mx.rowDim)} ↓ · {labelOf(mx.colDim)} →
            </th>
            {padL > 0 && <th aria-hidden="true" className="sticky top-0 bg-[var(--paper)]" style={fixed(padL)} />}
            {cols.map((c) => (
              <th
                key={c.key}
                className={cx("sticky top-0 z-[1] bg-[var(--paper)] px-1 py-1.5 align-bottom font-medium text-[var(--ink-700)]", big ? "overflow-hidden" : "max-w-[96px]")}
                style={fixed(COL_W)}
                title={c.label}
              >
                <span className="line-clamp-2 block leading-tight">{c.label}</span>
              </th>
            ))}
            {padR > 0 && <th aria-hidden="true" className="sticky top-0 bg-[var(--paper)]" style={fixed(padR)} />}
            <th className="sticky top-0 z-[1] bg-[var(--paper)] px-2 py-1.5 text-right font-medium text-[var(--ink-500)]" style={fixed(TOTAL_W)}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {padT > 0 && (
            <tr aria-hidden="true">
              <td colSpan={span} style={{ height: padT, padding: 0 }} />
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key}>
              <th
                className={cx("sticky left-0 z-[1] bg-[var(--paper)] px-2 py-1 text-left font-normal", !big && "max-w-[220px]")}
                style={fixed(FIRST_W)}
                title={r.label}
              >
                <span className={cx("block truncate", r.other ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>{r.label}</span>
              </th>
              {padL > 0 && <td aria-hidden="true" />}
              {cols.map((c) => {
                const cell = mx.cells.get(cellKey(r.key, c.key));
                const bg = cellColor(cell);
                const on = sel && sel.r === r.key && sel.c === c.key;
                const txt = cellText(cell);
                return (
                  <td key={c.key} className="p-0">
                    <button
                      type="button"
                      onClick={() => onSel(cell ? { r: r.key, c: c.key } : null)}
                      className={cx(
                        "block h-8 w-full whitespace-nowrap rounded-[3px] px-1.5 text-center tabular-nums transition-shadow",
                        big ? "overflow-hidden" : "min-w-[66px]",
                        FOCUS,
                        on && "ring-2 ring-[var(--ink-900)] ring-offset-1"
                      )}
                      style={{ background: bg, color: bg.startsWith("var") ? "var(--ink-400)" : inkOn(bg) }}
                      title={cell ? `${r.label} × ${c.label}\nP1 ${rp(cell.v1)} · P2 ${rp(cell.v2)} · ${growthText(cell.g)}${cell.idx != null ? ` · indeks ${nf1.format(cell.idx)}×` : ""}` : "Tidak ada transaksi"}
                    >
                      {txt}
                    </button>
                  </td>
                );
              })}
              {padR > 0 && <td aria-hidden="true" />}
              <td className="whitespace-nowrap px-2 text-right tabular-nums text-[var(--ink-700)]">
                {rp(r.v1)} <Delta g={r.g} p1={r.v1} p2={r.v2} size="xs" />
              </td>
            </tr>
          ))}
          {padB > 0 && (
            <tr aria-hidden="true">
              <td colSpan={span} style={{ height: padB, padding: 0 }} />
            </tr>
          )}
          <tr>
            <th className={cx("sticky left-0 bg-[var(--paper)] px-2 py-1 text-left font-medium text-[var(--ink-500)]", big && "bottom-0 z-[2]")}>Total</th>
            {padL > 0 && <td aria-hidden="true" className={stickyFoot} />}
            {cols.map((c) => (
              <td key={c.key} className={cx("whitespace-nowrap px-1 py-1 text-center tabular-nums text-[var(--ink-700)]", big && "overflow-hidden", stickyFoot)}>
                {rp(c.v1)}
              </td>
            ))}
            {padR > 0 && <td aria-hidden="true" className={stickyFoot} />}
            <td className={cx("px-2 py-1 text-right font-semibold tabular-nums text-[var(--ink-900)]", stickyFoot)}>{rp(mx.T1)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function HeatLegend({ metric, maxV }) {
  let stops;
  let left;
  let right;
  if (metric === "value") {
    stops = [0.02, 0.1, 0.25, 0.5, 0.75, 1].map((t) => sequentialColor(Math.sqrt(t)));
    left = "kecil";
    right = `${rp(maxV)} (angka di sel dalam Rupiah)`;
  } else if (metric === "growth") {
    stops = [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5].map((g) => divergingColor(g));
    left = <Delta g={-0.5} label="turun 50%+" size="xs" />;
    right = <Delta g={0.5} label="naik 50%+" size="xs" />;
  } else if (metric === "index") {
    stops = [0.25, 0.5, 0.75, 1, 1.5, 2, 4].map((x) => indexColor(x));
    left = "¼× kurang laku";
    right = "4× sangat laku";
  } else {
    stops = [0.02, 0.1, 0.25, 0.5, 1].map((t) => sequentialColor(Math.sqrt(t)));
    left = "0%";
    right = "100% baris";
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--ink-600)]">
      <span>{left}</span>
      <span className="flex overflow-hidden rounded">
        {stops.map((s, i) => (
          <span key={i} className="h-3 w-7" style={{ background: s }} />
        ))}
      </span>
      <span>{right}</span>
      {metric === "growth" && (
        <span className="ml-1 inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm" style={{ background: NEW_COLOR }} />
          baru
        </span>
      )}
      {metric === "index" && <span className={cx("ml-2", MUTED)}>1× = sesuai harapan dari ukuran baris dan kolomnya</span>}
    </div>
  );
}

/* ============================================================== marimekko */

const LEGEND_LIMIT = 14;

function Marimekko({ mx, sel, onSel }) {
  const ref = useRef(null);
  const width = useWidth(ref, 800);
  const [hover, setHover] = useState(null);
  const [legendAll, setLegendAll] = useState(false);
  const H = 440;
  const M = { top: 8, right: 8, bottom: 64, left: 40 };
  const iw = Math.max(200, width - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const total = mx.T1 || 1;

  const colorOfCol = useMemo(() => {
    const keys = mx.cols.filter((c) => !c.other).map((c) => c.key);
    const m = new Map(keys.slice(0, CATEGORICAL.length).map((k, i) => [k, CATEGORICAL[i]]));
    return (k) => m.get(k) || OTHER_COLOR;
  }, [mx]);

  const bars = useMemo(() => {
    let x = M.left;
    const gap = 2;
    return mx.rows
      .filter((r) => r.v1 > 0)
      .map((r) => {
        const w = (r.v1 / total) * iw;
        let y = M.top;
        const segs = mx.cols
          .map((c) => {
            const cell = mx.cells.get(cellKey(r.key, c.key));
            const v = cell ? cell.v1 : 0;
            if (!(v > 0)) return null;
            const h = (v / r.v1) * ih;
            const s = { r, c, cell, x, y, w: Math.max(0.5, w - gap), h: Math.max(0.5, h - gap) };
            y += h;
            return s;
          })
          .filter(Boolean);
        const bar = { r, x, w, segs };
        x += w;
        return bar;
      });
  }, [mx, iw, ih, total]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Bentuk-bentuknya dihitung sekali per data/pilihan, bukan setiap kursor
     bergerak — penting saat mode "Semua" berisi ribuan segmen. */
  const shapes = useMemo(
    () =>
      bars.map((b) => (
        <g key={b.r.key}>
          {b.segs.map((s) => {
            const fill = colorOfCol(s.c.key);
            const on = sel && sel.r === s.r.key && sel.c === s.c.key;
            const pct = s.cell.v1 / s.r.v1;
            return (
              <g
                key={s.c.key}
                className="cursor-pointer"
                onClick={() => onSel({ r: s.r.key, c: s.c.key })}
                onMouseMove={(e) => {
                  const rect = ref.current.getBoundingClientRect();
                  setHover({ s, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
              >
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="2" fill={fill} stroke={on ? "var(--ink-900)" : "none"} strokeWidth="2" />
                {s.w >= 36 && s.h >= 16 && (
                  <text x={s.x + s.w / 2} y={s.y + s.h / 2} dy="0.35em" textAnchor="middle" fontSize="10.5" fill={inkOn(fill)} pointerEvents="none">
                    {nfPct.format(pct)}
                  </text>
                )}
              </g>
            );
          })}
          {b.w >= 34 && (
            <text transform={`translate(${b.x + b.w / 2 - 1} ${M.top + ih + 10}) rotate(35)`} fontSize="10.5" fill={b.r.other ? "var(--ink-500)" : "var(--ink-800)"}>
              {b.r.label.length > 16 ? `${b.r.label.slice(0, 15)}…` : b.r.label}
            </text>
          )}
        </g>
      )),
    [bars, sel, colorOfCol, onSel, ih] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unlabeled = bars.filter((b) => b.w < 34).length;
  const legend = legendAll ? mx.cols : mx.cols.slice(0, LEGEND_LIMIT);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={`Marimekko ${labelOf(mx.rowDim)} dan ${labelOf(mx.colDim)}`} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={M.left - 6} y={M.top + ih - t * ih + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-400)">
            {nfPct.format(t)}
          </text>
        ))}
        {shapes}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-700)]">
        <span className={MUTED}>{labelOf(mx.colDim)}:</span>
        {legend.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOfCol(c.key) }} />
            {c.label}
          </span>
        ))}
        <ShowAll
          total={mx.cols.length}
          limit={LEGEND_LIMIT}
          open={legendAll}
          onToggle={() => setLegendAll((v) => !v)}
          noun={labelOf(mx.colDim).toLowerCase()}
        />
      </div>
      <p className={cx("mt-1 text-[11px]", MUTED)}>
        Lebar kolom = porsi {labelOf(mx.rowDim).toLowerCase()} dari total P1. Tinggi segmen = komposisi {labelOf(mx.colDim).toLowerCase()} di dalamnya.
        {mx.cols.filter((c) => !c.other).length > CATEGORICAL.length
          ? ` Hanya ${CATEGORICAL.length} ${labelOf(mx.colDim).toLowerCase()} terbesar yang diberi warna; sisanya abu-abu.`
          : ""}
        {unlabeled > 0 ? ` ${nfFull.format(unlabeled)} kolom terlalu sempit untuk diberi nama — arahkan kursor, atau pakai Heatmap.` : ""}
      </p>
      {hover && (
        <ChartTip x={hover.x} y={hover.y} width={width} height={H} w={230}>
          <div className="font-semibold leading-snug text-[var(--ink-900)]">
            {hover.s.r.label} × {hover.s.c.label}
          </div>
          <TipRow name="P1" value={rp(hover.s.cell.v1)} swatch={colorOfCol(hover.s.c.key)} />
          <TipRow name={`Porsi dalam ${hover.s.r.label}`.slice(0, 28)} value={nfPct.format(hover.s.cell.v1 / hover.s.r.v1)} />
          <TipRow name="Perubahan" value={<Delta g={hover.s.cell.g} p1={hover.s.cell.v1} p2={hover.s.cell.v2} size="xs" />} />
          <TipRow name="Indeks" value={hover.s.cell.idx == null ? "–" : `${nf1.format(hover.s.cell.idx)}×`} />
        </ChartTip>
      )}
    </div>
  );
}
