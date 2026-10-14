/* ============================================================================
   Halaman: Peta hierarki
   ----------------------------------------------------------------------------
   Saudara terdekat pohon dekomposisi: hierarkinya sama, tapi SEMUA level
   terlihat sekaligus. Klik satu bagian untuk zoom ke dalamnya.

   Icicle   — persegi panjang bertingkat; paling mudah dibaca.
   Treemap  — kotak sebanding porsi; terbaik untuk "siapa penyumbang terbesar".
   Sunburst — cincin; menarik, tapi sudut lebih sulit dibandingkan mata.

   Luas = nilai P1. Warna = pertumbuhan terhadap P2, porsi dalam induk,
   atau identitas level pertama.
   ========================================================================== */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { BusyOverlay } from "../components/busy.jsx";

import { EXPLORE_DIMS, dimOk, labelOf } from "../lib/config.js";
import { OTHER_KEY, ancestors, buildTree, partition, squarify } from "../lib/explore.js";
import { NEW_COLOR, OTHER_COLOR, categoricalScale, divergingColor, inkOn, sequentialColor } from "../lib/color.js";
import { fmt, nfFull, nfPct, signedPct } from "../lib/format.js";
import { useSettled, useWidth } from "../lib/hooks.js";
import { BTN_QUIET, FOCUS, LINE, MUTED, SELECT, cx } from "../lib/theme.jsx";
import { ChartTip, Field, Section, Segmented, ShowAll, TipRow, WindowBar } from "../components/productui.jsx";
import { IconLayers, IconTable } from "../components/icons.jsx";
import { Delta } from "../components/delta.jsx";

const SIZE_OPTIONS = [
  { key: "Revenue", label: "Pendapatan" },
  { key: "quantity", label: "Qty" },
  { key: "__n", label: "Transaksi" },
];
const COLOR_OPTIONS = [
  { key: "growth", label: "Pertumbuhan" },
  { key: "share", label: "Porsi induk" },
  { key: "top", label: "Level pertama" },
];
const VIEW_OPTIONS = [
  { key: "icicle", label: "Icicle" },
  { key: "treemap", label: "Treemap" },
  { key: "sunburst", label: "Sunburst" },
];

const fmtFor = (size) =>
  size === "Revenue" ? (v) => fmt(v, "currency", true) : size === "quantity" ? (v) => `${fmt(v, "int", true)} unit` : (v) => `${nfFull.format(v)} trx`;


/** Semua keturunan sebuah simpul (termasuk dirinya), sampai kedalaman tertentu. */
function descendants(node, maxDepth) {
  const out = [];
  const walk = (n) => {
    out.push(n);
    if (n.children && n.depth < maxDepth) n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export default function HierarchyPage({ lines, labels, win, winMode, setWinMode, onMatchLength}) {
  const avail = EXPLORE_DIMS.filter(dimOk);
  // Pilihan langsung (kontrol). Petanya dibangun dari salinan "tenang" di bawah.
  const [levelsIn, setLevels] = useState(() => {
    const pref = ["Lini_Produk", "Category", "__name"].filter(dimOk);
    return pref.length >= 2 ? pref : avail.slice(0, 3);
  });
  const [sizeIn, setSize] = useState("Revenue");
  const [colorBy, setColorBy] = useState("growth");
  const [view, setView] = useState("icicle");
  const [maxChildrenIn, setMaxChildrenState] = useState(12);
  const [lastMax, setLastMax] = useState(12);
  const [showGone, setShowGone] = useState(false);
  const setMaxChildren = (v) => {
    if (v) setLastMax(v);
    setMaxChildrenState(v);
  };
  const [focusPath, setFocusPath] = useState([]);
  /* Peta dengan banyak level atau "Semua" anak berat dibangun: hitungannya
     baru dimulai sesudah logo memuat tergambar. */
  const askLive = useMemo(() => ({ levels: levelsIn, size: sizeIn, maxChildren: maxChildrenIn }), [levelsIn, sizeIn, maxChildrenIn]);
  const [ask, recalculating] = useSettled(askLive);
  const { levels, size, maxChildren } = ask;
  const [hover, setHover] = useState(null);

  const boxRef = useRef(null);
  const width = useWidth(boxRef, 900);
  const height = 540;
  const vf = fmtFor(size);

  // maxChildren 0 = semua anak ditampilkan, tanpa simpul "n lainnya".
  const tree = useMemo(
    () => partition(buildTree(lines, { levels, win, size, maxChildren: maxChildren || Infinity, labels })),
    [lines, levels, win, size, maxChildren, labels]
  );

  // Fokus disimpan sebagai jalur kunci, supaya tetap valid saat pohon dibangun ulang.
  const focus = useMemo(() => {
    let n = tree;
    for (const k of focusPath) {
      const c = n.children?.find((x) => x.key === k);
      if (!c) break;
      n = c;
    }
    return n;
  }, [tree, focusPath]);

  useEffect(() => setFocusPath([]), [levels.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = (node) => {
    if (!node) return;
    setHover(null);
    setFocusPath(ancestors(node).slice(1).map((n) => n.key));
  };

  const topScale = useMemo(() => categoricalScale((tree.children || []).filter((c) => c.key !== OTHER_KEY).map((c) => c.key)), [tree]);
  const colorOf = (n) => {
    if (n.depth === 0) return "#e7dee2";
    if (colorBy === "growth") return divergingColor(n.g);
    if (colorBy === "share") return sequentialColor(Math.sqrt(Math.max(0, n.shareParent)));
    const top = ancestors(n)[1];
    return !top || top.key === OTHER_KEY ? OTHER_COLOR : topScale(top.key);
  };

  const onHover = (node, e) => {
    if (!node) return setHover(null);
    const r = boxRef.current.getBoundingClientRect();
    setHover({ node, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  /* --- pengaturan level --- */
  const setLevel = (i, dim) => setLevels(levelsIn.map((d, j) => (j === i ? dim : d)));
  const removeLevel = (i) => setLevels(levelsIn.filter((_, j) => j !== i));
  const addLevel = () => {
    const next = avail.find((d) => !levelsIn.includes(d));
    if (next) setLevels([...levelsIn, next]);
  };

  const crumbs = ancestors(focus);
  const kids = focus.children || [];
  const gone = focus.vanished?.items || [];

  // Berapa anggota yang sedang digabung ke simpul "lainnya" di seluruh peta.
  const merged = useMemo(() => {
    let groups = 0;
    let members = 0;
    let widest = 0;
    const walk = (n) => {
      const ch = n.children || [];
      widest = Math.max(widest, ch.length);
      for (const c of ch) {
        if (c.other) {
          groups++;
          members += c.members || 0;
        }
        walk(c);
      }
    };
    walk(tree);
    return { groups, members, widest };
  }, [tree]);

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <BusyOverlay show={recalculating} label="Menyusun ulang peta…" sub="Sebentar, hierarkinya sedang dibangun ulang." />
      <WindowBar winMode={winMode} setWinMode={setWinMode} win={win} showUnit={false} onMatchLength={onMatchLength} />

      <div className="space-y-4 p-4">
        <Section
          title="Peta hierarki"
          icon={IconLayers}
          tone="teal"
          sub="Luas setiap bagian = nilai P1. Klik bagian untuk zoom ke dalamnya; klik jalur di atas grafik untuk keluar lagi. Icicle menampilkan dua level di bawah fokus — zoom untuk membuka level berikutnya."
          bodyClass="p-0"
        >
          {/* ---------------- pengaturan ---------------- */}
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3", LINE)}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cx("mr-1 text-[11px]", MUTED)}>Level</span>
              {levelsIn.map((d, i) => (
                <React.Fragment key={`${i}-${d}`}>
                  {i > 0 && <span className="text-[var(--ink-300)]">›</span>}
                  <span className="inline-flex items-center rounded-md border border-[var(--ink-200)] bg-[var(--paper)]">
                    <select
                      className={cx("cursor-pointer rounded-md bg-transparent py-1 pl-2 pr-1 text-xs font-medium text-[var(--ink-900)]", FOCUS)}
                      value={d}
                      onChange={(e) => setLevel(i, e.target.value)}
                      aria-label={`Level ${i + 1}`}
                    >
                      {avail.filter((x) => x === d || !levelsIn.includes(x)).map((x) => (
                        <option key={x} value={x}>
                          {labelOf(x)}
                        </option>
                      ))}
                    </select>
                    {levelsIn.length > 1 && (
                      <button type="button" className={cx(BTN_QUIET, "px-1")} onClick={() => removeLevel(i)} aria-label={`Hapus level ${labelOf(d)}`}>
                        ✕
                      </button>
                    )}
                  </span>
                </React.Fragment>
              ))}
              {levelsIn.length < 4 && (
                <button type="button" className={BTN_QUIET} onClick={addLevel}>
                  + Tambah level
                </button>
              )}
            </div>
            <Segmented label="Tampilan" value={view} onChange={setView} options={VIEW_OPTIONS} />
            <Field label="Ukuran">
              <Segmented label="Ukuran" value={sizeIn} onChange={setSize} options={SIZE_OPTIONS} />
            </Field>
            <Field label="Warna">
              <Segmented label="Warna" value={colorBy} onChange={setColorBy} options={COLOR_OPTIONS} />
            </Field>
            <Field label="Maks anak">
              <select className={SELECT} value={maxChildrenIn} onChange={(e) => setMaxChildren(Number(e.target.value))}>
                {[8, 12, 24, 48].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={0}>Semua</option>
              </select>
            </Field>
          </div>

          {/* ---------------- jalur zoom ---------------- */}
          <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs">
            {crumbs.map((n, i) => (
              <React.Fragment key={n.id}>
                {i > 0 && <span className="text-[var(--ink-300)]">›</span>}
                {i < crumbs.length - 1 ? (
                  <button type="button" onClick={() => zoomTo(n)} className={cx("rounded px-1.5 py-0.5 text-[var(--brand-700)] hover:bg-[var(--brand-50)]", FOCUS)}>
                    {n.label}
                  </button>
                ) : (
                  <span className="px-1.5 py-0.5 font-semibold text-[var(--ink-900)]">
                    {n.label} <span className="font-normal text-[var(--ink-500)]">· {vf(n.v1)}</span>
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ---------------- grafik ---------------- */}
          <div className="relative px-4 pb-3 pt-2" ref={boxRef}>
            {view === "icicle" && (
              <Icicle focus={focus} depthMax={Math.min(levels.length, focus.depth + 2)} width={width - 32} height={height} colorOf={colorOf} vf={vf} onZoom={zoomTo} onHover={onHover} />
            )}
            {view === "treemap" && <Treemap focus={focus} width={width - 32} height={height} colorOf={colorOf} vf={vf} onZoom={zoomTo} onHover={onHover} />}
            {view === "sunburst" && (
              <Sunburst focus={focus} tree={tree} width={width - 32} height={height} colorOf={colorOf} vf={vf} onZoom={zoomTo} onHover={onHover} />
            )}
            {hover && (
              <ChartTip x={hover.x} y={hover.y} width={width} height={height + 40} w={240}>
                <div className="text-[var(--ink-500)]">
                  {ancestors(hover.node)
                    .slice(1, -1)
                    .map((n) => n.label)
                    .join(" › ") || labelOf(hover.node.dim || "")}
                </div>
                <div className="font-semibold leading-snug text-[var(--ink-900)]">{hover.node.label}</div>
                <TipRow name="P1" value={vf(hover.node.v1)} />
                <TipRow name="Porsi induk" value={nfPct.format(hover.node.shareParent)} />
                <TipRow name="P2" value={vf(hover.node.v2)} />
                <TipRow name="Perubahan" value={<Delta g={hover.node.g} p1={hover.node.v1} p2={hover.node.v2} size="xs" />} />
                {hover.node.children?.length > 0 && <div className="mt-1.5 border-t border-[var(--ink-100)] pt-1 text-[var(--ink-500)]">Klik untuk zoom</div>}
                {hover.node.other && (
                  <div className="mt-1.5 border-t border-[var(--ink-100)] pt-1 text-[var(--ink-500)]">Gabungan anggota kecil. Pilih “Tampilkan semua anggota” di bawah grafik untuk memecahnya.</div>
                )}
              </ChartTip>
            )}
          </div>

          {/* ---------------- semua anggota ---------------- */}
          {(merged.members > 0 || (maxChildren === 0 && merged.widest > lastMax)) && (
            <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5 text-[11px]", LINE, MUTED)}>
              <span>
                {merged.members > 0
                  ? `${nfFull.format(merged.members)} anggota kecil sedang digabung ke ${nfFull.format(merged.groups)} simpul abu-abu “lainnya” (maks ${maxChildren} anak per induk).`
                  : "Semua anggota ditampilkan, tanpa simpul “lainnya”. Bagian yang sangat kecil mungkin tidak berlabel — arahkan kursor atau lihat tabel di bawah."}
              </span>
              <ShowAll
                total={1}
                limit={0}
                open={merged.members === 0}
                onToggle={() => {
                  setHover(null);
                  setMaxChildren(merged.members > 0 ? 0 : lastMax);
                }}
                closedLabel={`Tampilkan semua anggota (+${nfFull.format(merged.members)})`}
                openLabel={`Ringkas lagi (${lastMax} per induk)`}
              />
            </div>
          )}

          {/* ---------------- legenda ---------------- */}
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-4 py-2.5 text-[11px]", LINE)}>
            <Legend colorBy={colorBy} tree={tree} topScale={topScale} />
            {focus.vanished?.n > 0 && (
              <span className={cx("ml-auto", MUTED)}>
                {nfFull.format(focus.vanished.n)} anggota di level ini tidak terjual di P1 (P2: {vf(focus.vanished.v2)}) — tidak punya luas.
              </span>
            )}
          </div>
        </Section>

        {/* ---------------- tabel pendamping ---------------- */}
        <Section title={`Isi "${focus.label}"`} icon={IconTable} tone="mauve" sub="Tampilan tabel dari level yang sedang dilihat. Klik baris untuk zoom." bodyClass="p-0">
          {/* Di layar sempit tabelnya digeser sendiri ke samping, bukan seluruh halaman. */}
          <div className="dt-scroll overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-xs">
              <thead>
                <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
                  <th className="px-4 py-2 text-left font-medium">{kids[0] ? labelOf(kids[0].dim) : gone[0] ? labelOf(gone[0].dim) : "Anggota"}</th>
                  <th className="px-3 py-2 text-right font-medium">P1</th>
                  <th className="px-3 py-2 text-right font-medium">Porsi</th>
                  <th className="px-3 py-2 text-right font-medium">P2</th>
                  <th className="px-4 py-2 text-right font-medium">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {kids.map((n) => (
                  <tr
                    key={n.id}
                    onClick={n.children?.length ? () => zoomTo(n) : undefined}
                    className={cx("border-b border-[var(--ink-100)]", n.children?.length && "cursor-pointer transition-colors hover:bg-[var(--brand-50)]")}
                  >
                    <td className="px-4 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: colorOf(n) }} />
                        <span className={cx("truncate", n.other ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>{n.label}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{vf(n.v1)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{nfPct.format(n.shareParent)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{vf(n.v2)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <Delta g={n.g} p1={n.v1} p2={n.v2} size="xs" />
                    </td>
                  </tr>
                ))}
                {showGone &&
                  gone.map((g) => (
                    <tr key={`gone-${g.key}`} className="border-b border-[var(--ink-100)] bg-[var(--ink-50)]">
                      <td className="px-4 py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 flex-none rounded-sm border border-dashed border-[var(--ink-400)]" />
                          <span className="truncate text-[var(--ink-600)]">{g.label}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-500)]">{vf(0)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-500)]">{nfPct.format(0)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{vf(g.v2)}</td>
                      <td className="px-4 py-1.5 text-right">
                        <Delta g={-1} p1={0} p2={g.v2} size="xs" />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!kids.length && !gone.length && <p className={cx("px-4 py-6 text-xs", MUTED)}>Ini level terdalam.</p>}
          {gone.length > 0 && (
            <div className={cx("flex flex-wrap items-center gap-3 border-b px-4 py-2.5", LINE)}>
              <span className={cx("text-[11px]", MUTED)}>
                {nfFull.format(gone.length)} anggota terjual di P2 tetapi tidak di P1 (P2: {vf(focus.vanished.v2)}). Mereka tidak punya luas di grafik.
              </span>
              <ShowAll
                total={gone.length}
                limit={0}
                open={showGone}
                onToggle={() => setShowGone((v) => !v)}
                closedLabel={`Tampilkan juga ${nfFull.format(gone.length)} yang hilang di P1`}
                openLabel="Sembunyikan yang hilang di P1"
              />
            </div>
          )}
          {(() => {
            // Tombol "Tampilkan semua": membuka simpul "n lainnya" di seluruh peta (Maks anak = Semua).
            const other = kids.find((n) => n.other);
            const total = other ? kids.length - 1 + (other.members || 0) : kids.length;
            const lim = maxChildren || lastMax;
            if (!other && !(maxChildren === 0 && kids.length > lastMax)) return null;
            return (
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className={cx("text-[11px]", MUTED)}>
                  {other ? `${nfFull.format(other.members)} anggota kecil digabung menjadi "${other.label}".` : `Semua ${nfFull.format(kids.length)} anggota ditampilkan.`}
                </span>
                <ShowAll
                  total={total}
                  limit={other ? kids.length - 1 : lim}
                  open={!other}
                  onToggle={() => setMaxChildren(other ? 0 : lastMax)}
                  openLabel={`Ringkas lagi (${lastMax} teratas)`}
                />
              </div>
            );
          })()}
        </Section>
      </div>
    </div>
  );
}

/* ================================================================ icicle */

const MOVE = "top .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1), left .45s cubic-bezier(.22,1,.36,1), width .45s cubic-bezier(.22,1,.36,1)";

function Icicle({ focus, depthMax, width, height, colorOf, vf, onZoom, onHover }) {
  const cols = depthMax - focus.depth + 1;
  const firstW = Math.min(170, Math.max(110, width * 0.16));
  const restW = cols > 1 ? (width - firstW) / (cols - 1) : width;
  const colX = (d) => (d === focus.depth ? 0 : firstW + (d - focus.depth - 1) * restW);
  const colW = (d) => (d === focus.depth ? firstW : restW);
  const span = focus.x1 - focus.x0 || 1;
  const nodes = descendants(focus, depthMax);

  return (
    <div className="relative overflow-hidden rounded-md" style={{ width, height }} onMouseLeave={() => onHover(null)}>
      {nodes.map((n) => {
        const top = ((n.x0 - focus.x0) / span) * height;
        const h = ((n.x1 - n.x0) / span) * height;
        if (h < 0.6) return null;
        const bg = colorOf(n);
        const ink = inkOn(bg);
        const isFocus = n === focus;
        const clickable = isFocus ? !!n.parent : n.children?.length > 0;
        return (
          <div
            key={n.id}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onZoom(isFocus ? n.parent : n) : undefined}
            onKeyDown={clickable ? (e) => e.key === "Enter" && onZoom(isFocus ? n.parent : n) : undefined}
            onMouseMove={(e) => onHover(n, e)}
            className={cx("absolute overflow-hidden rounded-[3px] px-2 hover:brightness-95", clickable && "cursor-pointer", FOCUS)}
            style={{
              top,
              left: colX(n.depth),
              width: colW(n.depth) - 2,
              height: Math.max(0.6, h - (h > 4 ? 2 : 0)),
              background: bg,
              color: ink,
              transition: MOVE,
            }}
          >
            {h >= 16 && (
              <div className="truncate pt-[3px] text-[11.5px] font-medium leading-tight">
                {isFocus && n.parent ? "‹ " : ""}
                {n.label}
              </div>
            )}
            {h >= 32 && (
              <div className="truncate text-[10.5px] leading-tight opacity-80">
                {vf(n.v1)} · {nfPct.format(n.shareParent)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =============================================================== treemap */

function Treemap({ focus, width, height, colorOf, vf, onZoom, onHover }) {
  const kids = focus.children || [];
  const rects = squarify(kids, 0, 0, width, height);
  return (
    <div className="relative overflow-hidden rounded-md" style={{ width, height }} onMouseLeave={() => onHover(null)}>
      {rects.map(({ node: n, x, y, w, h }) => {
        const bg = colorOf(n);
        const ink = inkOn(bg);
        const clickable = n.children?.length > 0;
        const inner = clickable && w >= 70 && h >= 56 ? squarify(n.children, 3, 22, w - 8, h - 27) : [];
        return (
          <div
            key={n.id}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onZoom(n) : undefined}
            onKeyDown={clickable ? (e) => e.key === "Enter" && onZoom(n) : undefined}
            onMouseMove={(e) => onHover(n, e)}
            className={cx("absolute overflow-hidden rounded-[3px]", clickable && "cursor-pointer", FOCUS)}
            style={{ left: x, top: y, width: Math.max(0, w - 2), height: Math.max(0, h - 2), background: bg, color: ink, transition: MOVE }}
          >
            {w >= 46 && h >= 20 && (
              <div className="truncate px-1.5 pt-1 text-[11.5px] font-semibold leading-tight">
                {n.label}
                {w >= 120 && <span className="ml-1.5 font-normal opacity-80">{vf(n.v1)}</span>}
              </div>
            )}
            {inner.map((c) => {
              const cbg = colorOf(c.node);
              return (
                <div
                  key={c.node.id}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    onHover(c.node, e);
                  }}
                  className="absolute overflow-hidden rounded-[2px]"
                  style={{
                    left: c.x,
                    top: c.y,
                    width: Math.max(0, c.w - 1.5),
                    height: Math.max(0, c.h - 1.5),
                    background: cbg,
                    color: inkOn(cbg),
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35)",
                  }}
                >
                  {c.w >= 74 && c.h >= 22 && <div className="truncate px-1 pt-0.5 text-[10.5px] leading-tight opacity-90">{c.node.label}</div>}
                </div>
              );
            })}
          </div>
        );
      })}
      {!rects.length && <div className={cx("p-6 text-xs", MUTED)}>Ini level terdalam — kembali lewat jalur di atas.</div>}
    </div>
  );
}

/* ============================================================== sunburst */

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function arcPath(a0, a1, r0, r1) {
  const pad = Math.min(0.004, (a1 - a0) / 4);
  const s = a0 + pad;
  const e = a1 - pad;
  if (e <= s) return "";
  const large = e - s > Math.PI ? 1 : 0;
  const p = (a, r) => `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
  return `M${p(s, r1)}A${r1},${r1} 0 ${large} 1 ${p(e, r1)}L${p(e, r0)}A${r0},${r0} 0 ${large} 0 ${p(s, r0)}Z`;
}

function Sunburst({ focus, tree, width, height, colorOf, vf, onZoom, onHover }) {
  const RINGS = 3;
  const size = Math.min(width, height);
  const R = size / 2 - 6;
  const r0 = R * 0.24;
  const ringW = (R - r0) / RINGS;

  // Animasi zoom: domain sudut dan kedalaman di-tween, bukan diganti mendadak.
  const [dom, setDom] = useState({ x0: focus.x0, x1: focus.x1, d: focus.depth });
  const domRef = useRef(dom);
  useEffect(() => {
    const from = domRef.current;
    const to = { x0: focus.x0, x1: focus.x1, d: focus.depth };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      domRef.current = to;
      setDom(to);
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const k = ease(Math.min(1, (now - t0) / 520));
      const cur = { x0: from.x0 + (to.x0 - from.x0) * k, x1: from.x1 + (to.x1 - from.x1) * k, d: from.d + (to.d - from.d) * k };
      domRef.current = cur;
      setDom(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus]);

  const span = dom.x1 - dom.x0 || 1;
  const ang = (x) => ((Math.max(dom.x0, Math.min(dom.x1, x)) - dom.x0) / span) * Math.PI * 2;
  const all = useMemo(() => descendants(tree, 99), [tree]);

  return (
    <div className="relative flex justify-center" style={{ width, height }} onMouseLeave={() => onHover(null)}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label="Sunburst">
        {all.map((n) => {
          const k = n.depth - dom.d;
          if (k <= 0.01 || k > RINGS + 0.99) return null;
          const a0 = ang(n.x0);
          const a1 = ang(n.x1);
          if (a1 - a0 < 0.002) return null;
          const ri = r0 + (k - 1) * ringW;
          const ro = ri + ringW - 2;
          if (ro <= r0) return null;
          const bg = colorOf(n);
          const mid = (a0 + a1) / 2;
          const midR = (ri + ro) / 2;
          const room = (a1 - a0) * midR;
          const showText = room >= 15 && ringW >= 40;
          const deg = (mid * 180) / Math.PI;
          const flip = deg > 180;
          const maxChars = Math.max(3, Math.floor((ringW - 10) / 5.8));
          const text = n.label.length > maxChars ? `${n.label.slice(0, maxChars - 1)}…` : n.label;
          const clickable = n.children?.length > 0;
          return (
            <g key={n.id}>
              <path
                d={arcPath(a0, a1, ri, ro)}
                fill={bg}
                className={clickable ? "cursor-pointer" : undefined}
                onClick={clickable ? () => onZoom(n) : undefined}
                onMouseMove={(e) => onHover(n, e)}
              />
              {showText && (
                <text
                  transform={`rotate(${deg - 90}) translate(${midR}) rotate(${flip ? 180 : 0})`}
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize="10.5"
                  fill={inkOn(bg)}
                  pointerEvents="none"
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}
        <circle
          r={r0 - 3}
          fill="var(--paper)"
          stroke="var(--ink-200)"
          className={focus.parent ? "cursor-pointer" : undefined}
          onClick={focus.parent ? () => onZoom(focus.parent) : undefined}
        />
        <text textAnchor="middle" dy="-0.2em" fontSize="12" fontWeight="600" fill="var(--ink-900)" pointerEvents="none">
          {focus.label.length > 18 ? `${focus.label.slice(0, 17)}…` : focus.label}
        </text>
        <text textAnchor="middle" dy="1.2em" fontSize="11" fill="var(--ink-500)" pointerEvents="none">
          {vf(focus.v1)}
        </text>
        {focus.parent && (
          <text textAnchor="middle" dy="2.7em" fontSize="10" fill="var(--brand-700)" pointerEvents="none">
            ‹ keluar
          </text>
        )}
      </svg>
    </div>
  );
}

/* ================================================================ legenda */

function Legend({ colorBy, tree, topScale }) {
  const [all, setAll] = useState(false);
  if (colorBy === "growth") {
    const stops = [-0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5];
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className={MUTED}>Pertumbuhan P1 vs P2</span>
        <Delta g={-0.5} label="turun 50%+" size="xs" />
        <span className="flex overflow-hidden rounded">
          {stops.map((s) => (
            <span key={s} className="h-3 w-7" style={{ background: divergingColor(s) }} title={signedPct(s)} />
          ))}
        </span>
        <Delta g={0.5} label="naik 50%+" size="xs" />
        <span className="inline-flex items-center gap-1 text-[var(--ink-600)]">
          <span className="h-3 w-3 rounded-sm" style={{ background: NEW_COLOR }} />
          baru
        </span>
      </span>
    );
  }
  if (colorBy === "share") {
    return (
      <span className="flex items-center gap-2">
        <span className={MUTED}>Porsi dalam induk</span>
        <span className="flex overflow-hidden rounded">
          {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map((s) => (
            <span key={s} className="h-3 w-7" style={{ background: sequentialColor(Math.sqrt(s)) }} title={nfPct.format(s)} />
          ))}
        </span>
        <span className="text-[var(--ink-600)]">1% → 100%</span>
      </span>
    );
  }
  const kidsAll = tree.children || [];
  const tops = all ? kidsAll : kidsAll.slice(0, 8);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {tops.map((c) => (
        <span key={c.key} className="flex items-center gap-1.5 text-[var(--ink-700)]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.key === OTHER_KEY ? OTHER_COLOR : topScale(c.key) }} />
          {c.label}
        </span>
      ))}
      <ShowAll total={kidsAll.length} limit={8} open={all} onToggle={() => setAll((v) => !v)} />
    </span>
  );
}
