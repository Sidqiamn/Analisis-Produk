/* ============================================================================
   Halaman: Aliran (parallel sets)
   ----------------------------------------------------------------------------
   Pendapatan P1 mengalir melewati dimensi yang diurutkan sendiri, misalnya
   Kanal → Metode bayar → Lini produk. Pita diwarnai menurut asalnya di
   kolom pertama, jadi kombinasi seperti "penjualan Tokopedia hampir semua
   lari ke Roofing" langsung terlihat — sesuatu yang sulit dilihat di pohon
   dekomposisi, karena pohon hanya mengikuti satu jalur sekaligus.

   Klik sebuah simpul untuk memfokuskan seluruh diagram pada simpul itu.
   ========================================================================== */

import React, { useEffect, useState, useMemo, useRef } from "react";

import { EXPLORE_DIMS, dimOk, labelOf } from "../lib/config.js";
import { OTHER_KEY, buildFlows } from "../lib/explore.js";
import { CATEGORICAL, OTHER_COLOR, growthColor } from "../lib/color.js";
import { fmt, nfFull, nfPct } from "../lib/format.js";
import { useSettled, useWidth } from "../lib/hooks.js";
import { BusyOverlay } from "../components/busy.jsx";
import { BTN_QUIET, FOCUS, LINE, MUTED, SELECT, cx } from "../lib/theme.jsx";
import { ChartTip, Field, FilterChip, Section, Segmented, ShowAll, TipRow, WindowBar } from "../components/productui.jsx";
import { IconFlow, IconTable } from "../components/icons.jsx";
import { Delta } from "../components/delta.jsx";

/** Pertumbuhan P1 terhadap P2; Infinity = baru (tidak ada di P2). */
const growthOf = (v1, v2) => (v2 > 0 ? v1 / v2 - 1 : v1 > 0 ? Infinity : null);

const COLOR_OPTIONS = [
  { key: "root", label: "Asal", hint: "Warna pita = anggota kolom pertama" },
  { key: "growth", label: "Naik/turun", hint: "Hijau = naik dibanding P2, merah = turun, biru = baru" },
];

const SIZE_OPTIONS = [
  { key: "Revenue", label: "Pendapatan" },
  { key: "__n", label: "Transaksi" },
];

/* Bawaan berpusat pada produk: warna pita = lini produk, lalu terlihat lewat
   kanal mana dan ke wilayah mana pendapatannya mengalir. */
const PRESETS = [
  { label: "Lini → Kanal → Wilayah", dims: ["Lini_Produk", "Channel", "branch_area"] },
  { label: "Lini → Kategori → Kanal", dims: ["Lini_Produk", "Category", "Channel"] },
  { label: "Wilayah → Kanal → Lini", dims: ["branch_area", "Channel", "Lini_Produk"] },
  { label: "Kanal → Bayar → Lini", dims: ["Channel", "Payment_Method", "Lini_Produk"] },
];

export default function FlowsPage({ lines, labels, win, winMode, setWinMode, onMatchLength}) {
  // Hanya dimensi yang ada di data; urutan siap pakai yang kolomnya hilang dilewati.
  const avail = EXPLORE_DIMS.filter(dimOk);
  const presets = PRESETS.map((p) => ({ ...p, dims: p.dims.filter(dimOk) })).filter((p) => p.dims.length >= 2);
  // Pilihan langsung (kontrol). Alirannya dihitung dari salinan "tenang" di bawah.
  const [dimsIn, setDims] = useState(() => (presets[0] ? presets[0].dims : avail.slice(0, 3)));
  const [sizeIn, setSize] = useState("Revenue");
  // 0 = "Semua": tidak ada anggota yang digabung menjadi "lainnya".
  const [topKIn, setTopK] = useState(7);
  const [lastK, setLastK] = useState(7);
  const changeTopK = (v) => {
    if (v) setLastK(v);
    setTopK(v);
  };
  const [focusIn, setFocus] = useState(null);
  /* Aliran dengan banyak anggota (mis. nama produk, "Semua") berat dihitung
     dan digambar: hitungannya baru dimulai sesudah logo memuat tergambar. */
  const askLive = useMemo(() => ({ dims: dimsIn, size: sizeIn, topK: topKIn, focus: focusIn }), [dimsIn, sizeIn, topKIn, focusIn]);
  const [ask, recalculating] = useSettled(askLive);
  const { dims, size, topK, focus } = ask;
  /* Sorotan (apa yang disentuh kursor) dipisah dari posisi tooltip. Pita dan
     simpul hanya digambar ulang saat sorotannya berganti, bukan setiap kursor
     bergerak — penting saat pilihan "Semua" berisi ribuan pita. */
  const [hot, setHotState] = useState(null);
  const [tip, setTip] = useState(null);
  const [view, setView] = useState("chart");
  const [colorBy, setColorBy] = useState("root");
  const byGrowth = colorBy === "growth";

  const boxRef = useRef(null);
  const width = useWidth(boxRef, 900);
  const vf = size === "Revenue" ? (v) => fmt(v, "currency", true) : (v) => `${nfFull.format(v)} trx`;

  const flows = useMemo(
    () => buildFlows(lines, { dims, win, size, topK: topK || Infinity, labels, focus }),
    [lines, dims, win, size, topK, labels, focus]
  );
  const allMembers = topK === 0;
  const maxNodes = Math.max(1, ...flows.columns.map((c) => c.nodes.length));
  // Anggota yang sedang digabung ke simpul "lainnya", dijumlah per kolom.
  const hiddenMembers = flows.columns.reduce((t, c) => t + c.nodes.reduce((u, nd) => u + (nd.other ? nd.members : 0), 0), 0);
  const rootCount = flows.columns[0] ? flows.columns[0].nodes.filter((nd) => !nd.other).length : 0;

  /* --- tata letak --- */
  // Mode "Semua" boleh setinggi yang diperlukan supaya simpul tidak berdesakan.
  // Jarak per simpul mengecil kalau anggotanya ratusan/ribuan (mis. nama produk).
  const pitch = maxNodes > 200 ? 9 : maxNodes > 24 ? 18 : 30;
  const H = allMembers ? Math.max(420, 60 + maxNodes * pitch) : Math.max(420, Math.min(720, 60 + maxNodes * 46));
  // Ruang kanan mengikuti label terpanjang di kolom terakhir (maks 24 huruf + persen).
  const lastCol = flows.columns[flows.columns.length - 1];
  const lastChars = lastCol && lastCol.nodes.length ? Math.max(8, ...lastCol.nodes.map((nd) => Math.min(24, nd.label.length) + 7)) : 12;
  const M = { top: 26, right: Math.min(250, Math.max(120, Math.round(lastChars * 6.5) + 14)), bottom: 12, left: 12 };
  const nodeW = 12;
  const iw = Math.max(200, width - 32 - M.left - M.right);
  const ih = H - M.top - M.bottom;
  const gap = maxNodes > 200 ? 2 : maxNodes > 24 ? 4 : 10;
  const n = flows.columns.length;
  const colX = (i) => M.left + (n === 1 ? 0 : (i / (n - 1)) * (iw - nodeW));

  const layout = useMemo(() => {
    const total = flows.total || 1;
    const k = Math.min(...flows.columns.map((c) => (ih - gap * (c.nodes.length - 1)) / total));
    const cols = flows.columns.map((c, ci) => {
      const used = total * k + gap * (c.nodes.length - 1);
      let y = M.top + (ih - used) / 2;
      const nodes = c.nodes.map((nd, ni) => {
        const h = nd.value * k;
        const out = { ...nd, ci, ni, x: colX(ci), y0: y, y1: y + h, outOff: 0, inOff: 0 };
        y += h + gap;
        return out;
      });
      return { ...c, nodes, idx: new Map(nodes.map((nd) => [nd.key, nd])) };
    });
    const rootIdx = new Map(cols[0].nodes.map((nd, i) => [nd.key, i]));
    const color = (root) => (root === OTHER_KEY ? OTHER_COLOR : CATEGORICAL[rootIdx.get(root)] || OTHER_COLOR);

    const ribbons = [];
    flows.segments.forEach((seg, si) => {
      const A = cols[si];
      const B = cols[si + 1];
      const outSorted = seg.slice().sort((p, q) => B.idx.get(p.b).ni - B.idx.get(q.b).ni || rootIdx.get(p.root) - rootIdx.get(q.root));
      const inSorted = seg.slice().sort((p, q) => A.idx.get(p.a).ni - A.idx.get(q.a).ni || rootIdx.get(p.root) - rootIdx.get(q.root));
      const sy = new Map();
      for (const f of outSorted) {
        const a = A.idx.get(f.a);
        sy.set(f, a.y0 + a.outOff);
        a.outOff += f.value * k;
      }
      for (const f of inSorted) {
        const b = B.idx.get(f.b);
        const h = f.value * k;
        const s0 = sy.get(f);
        const t0 = b.y0 + b.inOff;
        b.inOff += h;
        const x0 = colX(si) + nodeW;
        const x1 = colX(si + 1);
        const xm = (x0 + x1) / 2;
        ribbons.push({
          f,
          si,
          color: color(f.root),
          d: `M${x0},${s0}C${xm},${s0} ${xm},${t0} ${x1},${t0}L${x1},${t0 + h}C${xm},${t0 + h} ${xm},${s0 + h} ${x0},${s0 + h}Z`,
          mid: { x: xm, y: (s0 + t0) / 2 + h / 2 },
        });
      }
    });
    return { cols, ribbons, color };
  }, [flows, ih, iw, gap]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearHover = () => {
    setHotState(null);
    setTip(null);
  };
  useEffect(clearHover, [layout]);
  const move = (e, h) => {
    const rect = boxRef.current.getBoundingClientRect();
    setHotState((prev) => (prev && prev.id === h.id ? prev : h));
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const ribbonEls = useMemo(() => {
    const isHot = (r, i) => {
      if (!hot) return true;
      if (hot.kind === "ribbon") return i === hot.ri;
      if (hot.ci === 0) return r.f.root === hot.key;
      if (hot.ci === r.si) return r.f.a === hot.key;
      if (hot.ci === r.si + 1) return r.f.b === hot.key;
      return false;
    };
    return layout.ribbons.map((r, i) => (
      <path
        key={i}
        d={r.d}
        fill={byGrowth ? growthColor(growthOf(r.f.value, r.f.v2)) : r.color}
        fillOpacity={isHot(r, i) ? (hot ? 0.8 : byGrowth ? 0.6 : 0.42) : 0.08}
        style={{ transition: "fill-opacity .15s" }}
        onMouseMove={(e) => move(e, { id: `r${i}`, kind: "ribbon", ri: i })}
      />
    ));
  }, [layout, hot, byGrowth]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeEls = useMemo(
    () =>
      layout.cols.map((c, ci) =>
        c.nodes.map((nd) => {
          const h = nd.y1 - nd.y0;
          const fill = byGrowth
            ? growthColor(growthOf(nd.value, nd.v2))
            : ci === 0
            ? layout.color(nd.key)
            : nd.other
            ? OTHER_COLOR
            : "var(--ink-600)";
          const canFocus = !nd.other && !(focus && focus.dim === c.dim);
          return (
            <g
              key={`${ci}-${nd.key}`}
              className={canFocus ? "cursor-pointer" : undefined}
              onClick={canFocus ? () => setFocus({ dim: c.dim, key: nd.key, label: nd.label }) : undefined}
              onMouseMove={(e) => move(e, { id: `n${ci}\u0001${nd.key}`, kind: "node", ci, key: nd.key, nd })}
            >
              <rect x={nd.x} y={nd.y0} width={nodeW} height={Math.max(1, h)} rx="2" fill={fill} />
              {h >= 11 && (
                <text
                  x={nd.x + nodeW + 6}
                  y={(nd.y0 + nd.y1) / 2}
                  dy="0.35em"
                  fontSize="11"
                  fill="var(--ink-800)"
                  stroke="var(--paper)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {nd.label.length > 24 ? `${nd.label.slice(0, 23)}…` : nd.label}
                  <tspan fill="var(--ink-500)"> {nfPct.format(nd.value / (flows.total || 1))}</tspan>
                </text>
              )}
            </g>
          );
        })
      ),
    [layout, focus, flows.total, byGrowth] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setDim = (i, d) => {
    setDims(dimsIn.map((x, j) => (j === i ? d : x)));
    setFocus(null);
  };

  const pathLabel = (keys) =>
    keys
      .map((k, i) => {
        const col = flows.columns[i];
        const nd = col.nodes.find((x) => x.key === k);
        return nd ? nd.label : k;
      })
      .join(" → ");

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <BusyOverlay show={recalculating} label="Menyusun ulang aliran…" sub="Sebentar, jalur-jalurnya sedang dihitung ulang." />
      <WindowBar winMode={winMode} setWinMode={setWinMode} win={win} showUnit={false} onMatchLength={onMatchLength} />
      <div className="space-y-4 p-4">
        <Section
          title="Aliran pendapatan P1"
          icon={IconFlow}
          tone="blue"
          sub={
            byGrowth
              ? "Tebal pita = besar nilai P1 yang lewat. Warna = naik (hijau) atau turun (merah) dibanding P2; biru = baru. Arahkan kursor ke simpul atau pita, klik simpul untuk fokus."
              : "Tebal pita = besar nilai yang lewat. Warna pita = asalnya di kolom pertama. Arahkan kursor ke simpul atau pita, klik simpul untuk fokus."
          }
          bodyClass="p-0"
          actions={
            <Segmented
              label="Tampilan"
              value={view}
              onChange={setView}
              options={[
                { key: "chart", label: "Grafik" },
                { key: "table", label: "Tabel" },
              ]}
            />
          }
        >
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3", LINE)}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cx("mr-1 text-[11px]", MUTED)}>Urutan</span>
              {dimsIn.map((d, i) => (
                <React.Fragment key={`${i}-${d}`}>
                  {i > 0 && <span className="text-[var(--ink-300)]">→</span>}
                  <span className="inline-flex items-center rounded-md border border-[var(--ink-200)] bg-[var(--paper)]">
                    <select
                      className={cx("cursor-pointer rounded-md bg-transparent py-1 pl-2 pr-1 text-xs font-medium text-[var(--ink-900)]", FOCUS)}
                      value={d}
                      onChange={(e) => setDim(i, e.target.value)}
                      aria-label={`Kolom ${i + 1}`}
                    >
                      {avail.filter((x) => x === d || !dimsIn.includes(x)).map((x) => (
                        <option key={x} value={x}>
                          {labelOf(x)}
                        </option>
                      ))}
                    </select>
                    {dimsIn.length > 2 && (
                      <button
                        type="button"
                        className={cx(BTN_QUIET, "px-1")}
                        onClick={() => {
                          setDims(dimsIn.filter((_, j) => j !== i));
                          setFocus(null);
                        }}
                        aria-label={`Hapus ${labelOf(d)}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </React.Fragment>
              ))}
              {dimsIn.length < 4 && (
                <button
                  type="button"
                  className={BTN_QUIET}
                  onClick={() => setDims([...dimsIn, avail.find((x) => !dimsIn.includes(x))].filter(Boolean))}
                >
                  + Tambah
                </button>
              )}
            </div>
            <Field label="Contoh">
              <select
                className={SELECT}
                value=""
                onChange={(e) => {
                  const p = presets[Number(e.target.value)];
                  if (p) {
                    setDims(p.dims);
                    setFocus(null);
                  }
                }}
              >
                <option value="">Pilih urutan siap pakai…</option>
                {presets.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ukuran">
              <Segmented label="Ukuran" value={sizeIn} onChange={setSize} options={SIZE_OPTIONS} />
            </Field>
            <Field label="Warna">
              <Segmented label="Warna" value={colorBy} onChange={setColorBy} options={COLOR_OPTIONS} />
            </Field>
            <Field label="Anggota per kolom">
              <select className={SELECT} value={topKIn} onChange={(e) => changeTopK(Number(e.target.value))}>
                {[4, 5, 7, 10, 14].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
                <option value={0}>Semua</option>
              </select>
            </Field>
            {focusIn && (
              <FilterChip onClear={() => setFocus(null)}>
                Fokus {labelOf(focusIn.dim)}: {focusIn.label}
              </FilterChip>
            )}
          </div>

          <div className="relative px-4 py-3" ref={boxRef}>
            {flows.total <= 0 ? (
              <p className={cx("py-10 text-center text-xs", MUTED)}>Tidak ada transaksi di P1.</p>
            ) : view === "table" ? (
              <PathTable flows={flows} pathLabel={pathLabel} vf={vf} />
            ) : (
              <>
                <svg width={width - 32} height={H} role="img" aria-label={`Aliran ${dims.map(labelOf).join(" ke ")}`} onMouseLeave={clearHover}>
                  {layout.cols.map((c, ci) => (
                    <text key={`h${ci}`} x={colX(ci) + (ci === n - 1 ? nodeW : 0)} y={14} textAnchor={ci === n - 1 ? "end" : "start"} fontSize="11" fontWeight="600" fill="var(--ink-700)">
                      {c.label}
                    </text>
                  ))}
                  {ribbonEls}
                  {nodeEls}
                </svg>
                {byGrowth && <GrowthLegend total={flows.total} total2={flows.total2} vf={vf} />}

                {hot && tip && (
                  <ChartTip x={tip.x} y={tip.y} width={width} height={H} w={250}>
                    {hot.kind === "ribbon" ? (
                      (() => {
                        const r = layout.ribbons[hot.ri];
                        if (!r) return null;
                        const from = flows.columns[r.si].nodes.find((x) => x.key === r.f.a);
                        const to = flows.columns[r.si + 1].nodes.find((x) => x.key === r.f.b);
                        return (
                          <>
                            <div className="font-semibold leading-snug text-[var(--ink-900)]">
                              {from?.label} → {to?.label}
                            </div>
                            {r.si > 0 && <div className="text-[var(--ink-500)]">asal {flows.columns[0].nodes.find((x) => x.key === r.f.root)?.label}</div>}
                            <TipRow name="Nilai P1" value={vf(r.f.value)} swatch={byGrowth ? growthColor(growthOf(r.f.value, r.f.v2)) : r.color} />
                            <TipRow name="P2" value={vf(r.f.v2 || 0)} />
                            <TipRow name="Perubahan" value={<Delta g={growthOf(r.f.value, r.f.v2)} p1={r.f.value} p2={r.f.v2 || 0} size="xs" />} />
                            <TipRow name="Dari total" value={nfPct.format(r.f.value / (flows.total || 1))} />
                            <TipRow name={`Dari ${from?.label ?? ""}`.slice(0, 26)} value={nfPct.format(r.f.value / (from?.value || 1))} />
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <div className="text-[var(--ink-500)]">{flows.columns[hot.ci]?.label}</div>
                        <div className="font-semibold leading-snug text-[var(--ink-900)]">{hot.nd.label}</div>
                        <TipRow name="Nilai P1" value={vf(hot.nd.value)} />
                        <TipRow name="P2" value={vf(hot.nd.v2 || 0)} />
                        <TipRow name="Perubahan" value={<Delta g={growthOf(hot.nd.value, hot.nd.v2)} p1={hot.nd.value} p2={hot.nd.v2 || 0} size="xs" />} />
                        <TipRow name="Dari total" value={nfPct.format(hot.nd.value / (flows.total || 1))} />
                        {!hot.nd.other && <div className="mt-1.5 border-t border-[var(--ink-100)] pt-1 text-[var(--ink-500)]">Klik untuk fokus</div>}
                      </>
                    )}
                  </ChartTip>
                )}
              </>
            )}
          </div>

          <div className={cx("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2.5 text-[11px]", LINE, MUTED)}>
            <span className="min-w-0">
              {nfFull.format(flows.n)} transaksi · {vf(flows.total)}
              {focus ? ` · hanya yang melewati ${focus.label}` : ""}.{" "}
              {allMembers
                ? rootCount > CATEGORICAL.length
                  ? `Semua anggota ditampilkan. ${CATEGORICAL.length} anggota terbesar di kolom pertama diberi warna; ${rootCount - CATEGORICAL.length} sisanya abu-abu — arahkan kursor untuk melihat namanya, atau buka tampilan Tabel.`
                  : "Semua anggota ditampilkan."
                : hiddenMembers > 0
                  ? `Kolom pertama dibatasi 7 anggota berwarna. ${nfFull.format(hiddenMembers)} anggota kecil sedang digabung menjadi simpul abu-abu "lainnya".`
                  : "Semua anggota sudah tampil."}
            </span>
            {(allMembers ? maxNodes > 8 : hiddenMembers > 0) && (
              <ShowAll
                total={1}
                limit={0}
                open={allMembers}
                onToggle={() => {
                  changeTopK(allMembers ? lastK || 7 : 0);
                  clearHover();
                }}
                closedLabel={`Tampilkan semua anggota (+${nfFull.format(hiddenMembers)})`}
                openLabel={`Ringkas lagi (${lastK || 7} per kolom)`}
              />
            )}
          </div>
        </Section>

        <TopPaths flows={flows} pathLabel={pathLabel} vf={vf} color={layout.color} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- jalur teratas */

const TOP_PATHS = 8;

function TopPaths({ flows, pathLabel, vf, color }) {
  const [all, setAll] = useState(false);
  const top = all ? flows.paths : flows.paths.slice(0, TOP_PATHS);
  if (!top.length) return null;
  const max = flows.paths[0].value || 1;
  return (
    <Section
      title={`Jalur terbesar · ${nfFull.format(flows.paths.length)} jalur`}
      icon={IconTable}
      tone="mauve"
      sub="Kombinasi lengkap dari kolom pertama sampai terakhir, diurut dari nilai terbesar. Kolom kanan = naik/turun dibanding P2."
      bodyClass="p-2"
    >
      <div className={cx(all && top.length > 24 && "dt-scroll max-h-[560px] overflow-auto pr-1")}>
      {top.map((p) => (
        <div key={p.keys.join("|")} className="grid grid-cols-[minmax(0,1fr)_7rem_4rem_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: color(p.keys[0]) }} />
            <span className="truncate text-[var(--ink-900)]" title={pathLabel(p.keys)}>
              {pathLabel(p.keys)}
            </span>
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
            <span className="block h-full rounded-full bg-[var(--brand-600)]" style={{ width: `${Math.max(0, (p.value / max) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-[var(--ink-700)]" title={vf(p.value)}>
            {nfPct.format(p.value / (flows.total || 1))}
          </span>
          <span className="text-right" title={`P2 ${vf(p.v2 || 0)}`}>
            <Delta g={growthOf(p.value, p.v2)} p1={p.value} p2={p.v2 || 0} size="xs" />
          </span>
        </div>
      ))}
      </div>
      {flows.paths.length > TOP_PATHS && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-2 text-[11px] text-[var(--ink-500)]">
          <span>
            Menampilkan {nfFull.format(top.length)} dari {nfFull.format(flows.paths.length)} jalur
          </span>
          <ShowAll total={flows.paths.length} limit={TOP_PATHS} open={all} onToggle={() => setAll((v) => !v)} noun="jalur" />
        </div>
      )}
    </Section>
  );
}

const TABLE_PATHS = 40;

function PathTable({ flows, pathLabel, vf }) {
  const [all, setAll] = useState(false);
  const rows = all ? flows.paths : flows.paths.slice(0, TABLE_PATHS);
  return (
    <>
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
          <th className="px-2 py-2 text-left font-medium">{flows.columns.map((c) => c.label).join(" → ")}</th>
          <th className="px-2 py-2 text-right font-medium">P1</th>
          <th className="px-2 py-2 text-right font-medium">Dari total</th>
          <th className="px-2 py-2 text-right font-medium">P2</th>
          <th className="px-2 py-2 text-right font-medium">Perubahan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.keys.join("|")} className="border-b border-[var(--ink-100)]">
            <td className="px-2 py-1.5 text-[var(--ink-900)]">{pathLabel(p.keys)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{vf(p.value)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{nfPct.format(p.value / (flows.total || 1))}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{vf(p.v2 || 0)}</td>
            <td className="px-2 py-1.5 text-right">
              <Delta g={growthOf(p.value, p.v2)} p1={p.value} p2={p.v2 || 0} size="xs" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {flows.paths.length > TABLE_PATHS && (
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2.5 text-[11px] text-[var(--ink-500)]">
        <span>
          Menampilkan {nfFull.format(rows.length)} dari {nfFull.format(flows.paths.length)} jalur
        </span>
        <ShowAll total={flows.paths.length} limit={TABLE_PATHS} open={all} onToggle={() => setAll((v) => !v)} noun="jalur" />
      </div>
    )}
    </>
  );
}

/* ------------------------------------------------------------ legenda     */

function GrowthLegend({ total, total2, vf }) {
  const stops = [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5];
  const g = total2 > 0 ? total / total2 - 1 : null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--ink-600)]">
      <span className="inline-flex items-center gap-1.5">
        <Delta g={-0.5} label="turun 50%+" size="xs" />
        <span className="flex overflow-hidden rounded">
          {stops.map((s) => (
            <span key={s} className="h-3 w-6" style={{ background: growthColor(s) }} />
          ))}
        </span>
        <Delta g={0.5} label="naik 50%+" size="xs" />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm" style={{ background: growthColor(Infinity) }} />
        baru (tidak ada di P2)
      </span>
      <span className="text-[var(--ink-500)]">
        Total {vf(total)} vs {vf(total2)} di P2 <Delta g={g} p1={total} p2={total2} size="xs" />
      </span>
    </div>
  );
}
