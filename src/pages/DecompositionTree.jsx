/* ============================================================================
   Halaman: pohon dekomposisi
   ----------------------------------------------------------------------------
   Menerima baris yang SUDAH disaring oleh App (slicer + rentang tanggal).
   Halaman ini hanya mengurus pohonnya sendiri: level, node terpilih, menu
   uraikan, dan garis penghubung.
   ========================================================================== */

import React, { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

import { NODE_LIMIT, labelOf } from "../lib/config.js";
import {
  aggregate,
  fmt,
  keyOf,
  nfPct,
  sortNodes,
  totalOf,
  totalsOf,
} from "../lib/format.js";
import { useClickOutside } from "../lib/hooks.js";
import {
  BTN_QUIET,
  CARD,
  FOCUS,
  LINE,
  MENU,
  MENU_ITEM,
  MUTED,
  ROOT_CLASS,
  ROOT_FONT,
  cx,
} from "../lib/theme.jsx";
import { ChartPanel } from "../components/charts.jsx";
import { CompareHint, Delta, Signed } from "../components/delta.jsx";

/* ------------------------------------------------------------ SplitMenu    */

/**
 * Menu "uraikan". Dirender lewat portal ke <body> dengan posisi terkunci ke
 * layar, bukan di dalam kanvas.
 *
 * Alasannya: kanvas punya overflow-auto. Menu absolut di dalamnya akan
 * terpotong begitu tingginya melebihi ruang yang tersisa — itulah kenapa baris
 * pertama sempat hilang saat tombol + ditekan di node paling atas. Dengan
 * portal, satu-satunya batas adalah jendela browser, dan posisinya dijepit
 * supaya seluruh isi menu selalu terbaca.
 *
 * Menu tumbuh ke bawah dari tepi atas node, bukan dari titik tengahnya, jadi
 * baris pertama muncul lebih dulu dan baris terakhirlah yang bergeser kalau
 * ruangnya kurang.
 */
function SplitMenu({ anchorEl, dims, onPick, onAi, onClose }) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const box = boxRef.current;
    if (!box || !anchorEl) return;
    const a = anchorEl.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const pad = 12;

    let top = a.top - 6;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    if (top < pad) top = pad;

    // Menu menumpuk di atas node yang diuraikan, seperti Power BI. Kalau mepet
    // tepi kanan, dibalik ke sisi kiri node.
    let left = a.left + 14;
    if (left + w > window.innerWidth - pad) left = a.right - w - 14;
    if (left < pad) left = pad;

    setPos({ top, left });
  }, [anchorEl]);

  useLayoutEffect(() => {
    place();
  }, [place, dims]);

  useEffect(() => {
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  useClickOutside(boxRef, onClose, true, "[data-dt-split]");

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div
        className={cx(
          MENU,
          "dt-pop dt-scroll fixed z-[9999] max-h-[min(70vh,520px)] w-[238px] origin-top-left overflow-auto"
        )}
        style={{
          top: pos ? pos.top : 0,
          left: pos ? pos.left : 0,
          visibility: pos ? "visible" : "hidden",
        }}
        ref={boxRef}
        role="menu"
      >
        <div className={cx("px-2.5 pb-1 pt-1.5 text-[11px]", MUTED)}>Biar dicarikan</div>
        <button className={MENU_ITEM} type="button" onClick={() => onAi("high")}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pos)]" />
          Dimensi dengan nilai tertinggi
        </button>
        <button className={MENU_ITEM} type="button" onClick={() => onAi("low")}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--neg)]" />
          Dimensi dengan nilai terendah
        </button>

        {dims.length > 0 && <div className="mx-1 my-1 h-px bg-[var(--ink-200)]" />}
        {dims.length > 0 && (
          <div className={cx("px-2.5 pb-1 pt-1.5 text-[11px]", MUTED)}>Uraikan berdasarkan</div>
        )}
        {dims.map((d) => (
          <button key={d} className={MENU_ITEM} type="button" onClick={() => onPick(d)}>
            {labelOf(d)}
          </button>
        ))}
        {dims.length === 0 && (
          <div className={cx("px-2.5 py-2 text-xs", MUTED)}>Semua dimensi sudah dipakai</div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* --------------------------------------------------------------- halaman   */

const PLUS_BASE = `absolute -right-3 top-1/2 z-[3] grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full border transition-all duration-200 hover:scale-110 active:scale-95 ${FOCUS}`;

export default function DecompositionTree({
  rows = [],
  dimensions,
  measure,
  compare,
  p1,
  anySlicer,
  nodeLimit = NODE_LIMIT,
  onEnableCompare,
}) {
  const [levels, setLevels] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [menuAt, setMenuAt] = useState(null);
  const [shareMode, setShareMode] = useState("parent");
  const [hoverKey, setHoverKey] = useState(null);
  const [chartOpen, setChartOpen] = useState(true);

  const grandTotals = useMemo(
    () => totalsOf(rows, measure.field, compare),
    [rows, measure.field, compare]
  );
  const grandTotal = grandTotals.value;

  const levelData = useMemo(() => {
    const out = [];
    let scope = rows;
    for (let i = 0; i < levels.length; i++) {
      const { dim, sort } = levels[i];
      const nodes = sortNodes(aggregate(scope, dim, measure.field, compare), sort);
      const total = totalOf(scope, measure.field, compare);
      const max = nodes.reduce((m, n) => Math.max(m, Math.abs(n.value)), 0);
      out.push({ nodes, total, max });
      const picked = levels[i].selected;
      if (picked == null) break;
      scope = scope.filter((r) => keyOf(r, dim) === picked);
    }
    return out;
  }, [rows, levels, measure.field, compare]);

  /**
   * Lingkup yang sedang difokuskan pohon: baris yang masuk, lalu setiap node
   * yang sudah dipilih di jalur. Grafik memakai ini, jadi menekan sebuah node
   * langsung mempersempit grafiknya juga.
   */
  const focusScope = useMemo(() => {
    let out = rows;
    for (const l of levels) {
      if (l.selected == null) break;
      out = out.filter((r) => keyOf(r, l.dim) === l.selected);
    }
    return out;
  }, [rows, levels]);

  const scopeFor = useCallback(
    (levelIndex, label) => {
      let scope = rows;
      for (let i = 0; i < levelIndex; i++) {
        scope = scope.filter((r) => keyOf(r, levels[i].dim) === levels[i].selected);
      }
      if (levelIndex >= 0) {
        scope = scope.filter((r) => keyOf(r, levels[levelIndex].dim) === label);
      }
      return scope;
    },
    [rows, levels]
  );

  const unusedAt = useCallback(
    (levelIndex) => {
      const used = new Set(levels.slice(0, levelIndex + 1).map((l) => l.dim));
      return dimensions.filter((d) => !used.has(d));
    },
    [levels, dimensions]
  );

  /* --- aksi --- */

  const splitFrom = useCallback((levelIndex, label, dim) => {
    setLevels((prev) => {
      const next = prev.slice(0, levelIndex + 1);
      if (levelIndex >= 0) next[levelIndex] = { ...next[levelIndex], selected: label };
      return [...next, { dim, selected: null, sort: "desc" }];
    });
    setMenuAt(null);
  }, []);

  const aiSplit = useCallback(
    (levelIndex, label, mode) => {
      const scope = scopeFor(levelIndex, label);
      const candidates = unusedAt(levelIndex);
      let best = null;
      for (const dim of candidates) {
        const nodes = aggregate(scope, dim, measure.field, compare);
        if (!nodes.length) continue;
        const pick = mode === "high" ? nodes[0] : nodes[nodes.length - 1];
        if (!best || (mode === "high" ? pick.value > best.value : pick.value < best.value)) {
          best = { dim, ...pick };
        }
      }
      if (!best) {
        setMenuAt(null);
        return;
      }
      setLevels((prev) => {
        const next = prev.slice(0, levelIndex + 1);
        if (levelIndex >= 0) next[levelIndex] = { ...next[levelIndex], selected: label };
        return [...next, { dim: best.dim, selected: best.label, sort: "desc" }];
      });
      setMenuAt(null);
    },
    [scopeFor, unusedAt, measure.field, compare]
  );

  const pickNode = useCallback((levelIndex, label) => {
    setLevels((prev) => {
      const next = prev.slice(0, levelIndex + 1);
      const already = next[levelIndex].selected === label;
      next[levelIndex] = { ...next[levelIndex], selected: already ? null : label };
      return next;
    });
  }, []);

  const changeDim = useCallback((levelIndex, dim) => {
    setLevels((prev) => {
      const next = prev.slice(0, levelIndex + 1);
      next[levelIndex] = { dim, selected: null, sort: next[levelIndex].sort };
      return next;
    });
  }, []);

  const cycleSort = useCallback((levelIndex) => {
    setLevels((prev) => {
      const next = prev.slice();
      const order = { desc: "asc", asc: "name", name: "desc" };
      next[levelIndex] = { ...next[levelIndex], sort: order[next[levelIndex].sort] || "desc" };
      return next;
    });
  }, []);

  const removeLevel = useCallback((levelIndex) => {
    setLevels((prev) => prev.slice(0, levelIndex));
  }, []);

  const reset = useCallback(() => {
    setLevels([]);
    setExpanded({});
    setMenuAt(null);
  }, []);

  /* --- garis penghubung --- */

  const canvasRef = useRef(null);
  const nodeRefs = useRef(new Map());
  const [links, setLinks] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const sigRef = useRef("");

  const setNodeRef = useCallback(
    (key) => (el) => {
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    },
    []
  );

  const measureLinks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const next = [];

    for (let i = 0; i < levelData.length; i++) {
      const parentKey = i === 0 ? "root" : `${i - 1}:${levels[i - 1].selected}`;
      const parentEl = nodeRefs.current.get(parentKey);
      if (!parentEl) continue;
      const pr = parentEl.getBoundingClientRect();
      const x1 = pr.right - base.left;
      const y1 = pr.top - base.top + pr.height / 2;

      for (const node of levelData[i].nodes) {
        const el = nodeRefs.current.get(`${i}:${node.label}`);
        if (!el) continue;
        const cr = el.getBoundingClientRect();
        const x2 = cr.left - base.left;
        const y2 = cr.top - base.top + cr.height / 2;
        const mid = x1 + (x2 - x1) / 2;
        next.push({
          key: `${i}:${node.label}`,
          d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
          on: levels[i].selected === node.label,
        });
      }
    }

    // Hanya perbarui state kalau geometrinya benar-benar berubah,
    // supaya tidak terjadi render loop.
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const sig = `${w}x${h}|${next.map((l) => `${l.key}~${l.on}~${l.d}`).join("|")}`;
    if (sig === sigRef.current) return;
    sigRef.current = sig;

    setLinks(next);
    setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [levelData, levels]);

  useLayoutEffect(() => {
    measureLinks();
  }, [measureLinks, expanded, shareMode, compare]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureLinks());
    ro.observe(canvas);
    window.addEventListener("resize", measureLinks);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureLinks);
    };
  }, [measureLinks]);

  /* --- render --- */

  const trail = levels.filter((l) => l.selected != null);
  const trailText = trail.length
    ? `Mengikuti ${trail.map((l) => `${labelOf(l.dim)} ${l.selected}`).join(" › ")}`
    : "Seluruh baris terpilih";
  const sortLabel = { desc: "Nilai ↓", asc: "Nilai ↑", name: "A–Z" };
  // Dimensi yang paling sering dipakai untuk langkah pertama.
  const starters = ["Branch", "Lini_Produk", "Channel", "branch_area", "Category", "Payment_Method"]
    .filter((d) => dimensions.includes(d))
    .slice(0, 4);


  const renderNodeBody = (node, level) => {
    const share =
      shareMode === "total"
        ? grandTotal
          ? node.value / grandTotal
          : 0
        : level.total
        ? node.value / level.total
        : 0;
    const width = level.max ? (Math.abs(node.value) / level.max) * 100 : 0;
    const on = node.__on;

    const valueColor = "text-[var(--ink-900)]";
    const fill = compare
      ? node.value < 0
        ? "dt-fill-neg"
        : "dt-fill-pos"
      : on
      ? "dt-fill"
      : "dt-fill-mute";

    return (
      <>
        <div
          className={cx(
            "truncate text-xs transition-colors",
            on ? "text-[var(--brand-700)]" : "text-[var(--ink-600)]"
          )}
        >
          {node.label}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {compare ? (
            <Signed v={node.value} format={measure.format} className="text-[16px] font-semibold tracking-[-.015em]" />
          ) : (
            <span className={cx("text-[16px] font-semibold tracking-[-.015em]", valueColor)}>
              {fmt(node.value, measure.format, true)}
            </span>
          )}
          {compare && <Delta g={node.pct} p1={node.p1} p2={node.p2} variant="chip" size="xs" />}
        </div>

        {compare && (
          <div className={cx("mt-1.5 grid grid-cols-2 gap-x-2 border-t pt-1.5 text-[11px]", LINE)}>
            <div>
              <div className="text-[var(--ink-500)]">P1</div>
              <div className="font-medium text-[var(--ink-900)]">
                {fmt(node.p1, measure.format, true)}
              </div>
            </div>
            <div>
              <div className="text-[var(--ink-500)]">P2</div>
              <div className="font-medium text-[var(--ink-600)]">
                {fmt(node.p2, measure.format, true)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
          <div
            className={cx("h-full rounded-full transition-[width] duration-500 ease-out", fill)}
            style={{ width: `${width}%` }}
          />
        </div>

        <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
          {compare
            ? node.p2 > 0
              ? "selisih dibanding P2"
              : node.p1 > 0
              ? "tidak ada di P2"
              : "–"
            : `${nfPct.format(share)} dari ${shareMode === "total" ? "total" : "induk"}`}
        </div>
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------------- ringkasan ---------------- */}
      <div className={cx("flex flex-wrap items-center gap-x-5 gap-y-3 border-b px-4 py-3", LINE)}>
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {compare ? (
              <Signed v={grandTotal} format={measure.format} compact={false} className="text-[26px] font-semibold tracking-[-.02em]" />
            ) : (
              <span className="text-[26px] font-semibold tracking-[-.02em] text-[var(--brand-700)]">{fmt(grandTotal, measure.format)}</span>
            )}
            {compare && <Delta g={grandTotals.pct} p1={grandTotals.p1} p2={grandTotals.p2} variant="chip" size="md" />}
          </div>
          <div className={cx("mt-0.5 text-[11px]", MUTED)}>
            {compare ? (
              <>
                Selisih P1 − P2 · P1 {fmt(grandTotals.p1, measure.format, true)} vs P2 {fmt(grandTotals.p2, measure.format, true)}. Pohon di bawah
                mengurai selisih ini.
              </>
            ) : (
              `Total ${measure.label.toLowerCase()}`
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-1.5">
          <button
            className={BTN_QUIET}
            type="button"
            onClick={() => setShareMode((m) => (m === "parent" ? "total" : "parent"))}
          >
            Porsi dari {shareMode === "parent" ? "induk" : "total"}
          </button>
          <button className={BTN_QUIET} type="button" onClick={reset} disabled={!levels.length}>
            Mulai ulang
          </button>
        </div>
      </div>

      {!compare && <CompareHint onEnable={onEnableCompare} className="mx-4 mt-3" />}

      {/* ---------------- jejak ---------------- */}
      {trail.length > 0 && (
        <div
          className={cx(
            "flex flex-wrap items-center gap-1.5 border-b bg-[var(--paper)] px-4 py-2 text-xs",
            LINE
          )}
        >
          <span className={MUTED}>Jalur</span>
          {trail.map((l, i) => (
            <React.Fragment key={l.dim}>
              {i > 0 && <span className="text-[var(--ink-300)]">›</span>}
              <span className="rounded-full border border-[var(--brand-200)] bg-[var(--brand-50)] px-2.5 py-0.5 font-medium text-[var(--brand-700)]">
                <span className="font-normal text-[var(--ink-500)]">{labelOf(l.dim)} </span>
                {l.selected}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ---------------- grafik ---------------- */}
      <ChartPanel
        rows={focusScope}
        measure={measure}
        compare={compare}
        p1={p1}
        dimensions={dimensions}
        trailText={trailText}
        open={chartOpen}
        onToggle={() => setChartOpen((v) => !v)}
      />

      {/* ---------------- kanvas ---------------- */}
      <div className="dt-canvas dt-scroll min-h-0 flex-1 overflow-auto px-5 pb-8 pt-6" data-dt-scrollroot="">
        <div className="relative flex w-max min-w-full items-start gap-16" ref={canvasRef}>
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={canvasSize.w}
            height={canvasSize.h}
            aria-hidden="true"
          >
            {links.map((l) => {
              const hot = l.on || l.key === hoverKey;
              return (
                <path
                  key={l.key}
                  className={cx("dt-draw", hot && "dt-glow")}
                  pathLength={1}
                  d={l.d}
                  fill="none"
                  strokeLinecap="round"
                  stroke={
                    l.on
                      ? "var(--brand-700)"
                      : l.key === hoverKey
                      ? "var(--brand-500)"
                      : "var(--ink-300)"
                  }
                  strokeWidth={hot ? 2 : 1.25}
                  opacity={hot ? 1 : 0.7}
                  style={{
                    transition: "stroke .18s ease, stroke-width .18s ease, opacity .18s ease",
                  }}
                />
              );
            })}
          </svg>

          {/* akar */}
          <div className="dt-rise relative z-[1] w-[244px] flex-none">
            <div
              className={cx(
                "mb-3 flex h-9 items-center rounded-lg border bg-[var(--ink-50)] px-2.5",
                LINE
              )}
            >
              <span className="truncate text-xs font-semibold text-[var(--ink-800)]">
                {measure.label}
              </span>
            </div>

            <div className="group relative">
              <div
                className={cx(
                  CARD,
                  "dt-shadow relative overflow-hidden border-[var(--brand-200)] px-3 py-2.5 pr-7"
                )}
                ref={setNodeRef("root")}
              >
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--brand-700)]" />
                <div className="text-xs text-[var(--ink-600)]">
                  {compare ? "Selisih P1 − P2" : "Seluruh data"}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  {compare ? (
                    <Signed v={grandTotal} format={measure.format} className="text-[16px] font-semibold tracking-[-.015em]" />
                  ) : (
                    <span className="text-[16px] font-semibold tracking-[-.015em] text-[var(--brand-700)]">{fmt(grandTotal, measure.format, true)}</span>
                  )}
                  {compare && <Delta g={grandTotals.pct} p1={grandTotals.p1} p2={grandTotals.p2} variant="chip" size="xs" />}
                </div>
                {compare && (
                  <div className={cx("mt-1.5 grid grid-cols-2 gap-x-2 border-t pt-1.5 text-[11px]", LINE)}>
                    <div>
                      <div className="text-[var(--ink-500)]">P1</div>
                      <div className="font-medium text-[var(--ink-900)]">{fmt(grandTotals.p1, measure.format, true)}</div>
                    </div>
                    <div>
                      <div className="text-[var(--ink-500)]">P2</div>
                      <div className="font-medium text-[var(--ink-600)]">{fmt(grandTotals.p2, measure.format, true)}</div>
                    </div>
                  </div>
                )}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
                  <div className="dt-fill h-full w-full rounded-full" />
                </div>
                <div className="mt-1.5 text-[11px] text-[var(--ink-500)]">
                  {rows.length.toLocaleString("id-ID")} baris
                  {anySlicer ? ", tersaring" : ""}
                </div>
              </div>

              <button
                className={cx(
                  PLUS_BASE,
                  menuAt === "root"
                    ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white"
                    : "border-[var(--ink-300)] bg-[var(--paper)] text-[var(--ink-500)] hover:border-[var(--brand-600)] hover:text-[var(--brand-700)]"
                )}
                type="button"
                data-dt-split=""
                aria-label="Uraikan dari akar"
                aria-expanded={menuAt === "root"}
                onClick={() => setMenuAt((m) => (m === "root" ? null : "root"))}
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M6 1.5v9M1.5 6h9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {menuAt === "root" && (
                <SplitMenu
                  anchorEl={nodeRefs.current.get("root")}
                  dims={unusedAt(-1)}
                  onPick={(d) => splitFrom(-1, null, d)}
                  onAi={(mode) => aiSplit(-1, null, mode)}
                  onClose={() => setMenuAt(null)}
                />
              )}
            </div>
          </div>

          {/* ajakan pertama kali: belum ada level sama sekali */}
          {levels.length === 0 && starters.length > 0 && (
            <div className="dt-rise relative z-[1] mt-12 w-[280px] flex-none rounded-xl border border-dashed border-[var(--brand-300)] bg-[var(--paper)]/90 px-4 py-3.5">
              <div className="text-[12.5px] font-semibold text-[var(--ink-900)]">Mulai mengurai</div>
              <p className="mt-1 text-[12px] leading-snug text-[var(--ink-600)]">
                {compare
                  ? "Pilih dimensi untuk melihat dari mana selisih P1 − P2 berasal. Bisa juga tekan ＋ di samping kotak."
                  : "Pilih dimensi untuk memecah angka ini. Bisa juga tekan ＋ di samping kotak."}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {starters.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => splitFrom(-1, null, d)}
                    className={cx(
                      "rounded-full border border-[var(--brand-200)] bg-[var(--brand-50)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--brand-700)] transition-colors hover:border-[var(--brand-400)] hover:bg-[var(--brand-100)]",
                      FOCUS
                    )}
                  >
                    per {labelOf(d)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* level */}
          {levelData.map((level, i) => {
            const showAll = expanded[i];
            // Saat diringkas, simpul yang sedang dipilih tetap tampil walau di luar N teratas.
            const topN = level.nodes.slice(0, nodeLimit);
            const pickedNode = levels[i].selected != null && !topN.some((n) => n.label === levels[i].selected)
              ? level.nodes.filter((n) => n.label === levels[i].selected)
              : [];
            const visible = showAll ? level.nodes : [...topN, ...pickedNode];
            const hidden = level.nodes.length - visible.length;
            const options = [levels[i].dim, ...unusedAt(i)];
            const hasPick = levels[i].selected != null;

            return (
              <div
                className="dt-rise relative z-[1] w-[244px] flex-none"
                key={`${i}-${levels[i].dim}`}
              >
                <div
                  className={cx(
                    "mb-3 flex h-9 items-center gap-0.5 rounded-lg border bg-[var(--ink-50)] pl-1 pr-1",
                    LINE
                  )}
                >
                  <select
                    className={cx(
                      "min-w-0 flex-1 cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-xs font-semibold text-[var(--ink-800)]",
                      FOCUS
                    )}
                    value={levels[i].dim}
                    onChange={(e) => changeDim(i, e.target.value)}
                    aria-label={`Dimensi untuk level ${i + 1}`}
                  >
                    {options.map((d) => (
                      <option key={d} value={d}>
                        {labelOf(d)}
                      </option>
                    ))}
                  </select>
                  <button
                    className={BTN_QUIET}
                    type="button"
                    onClick={() => cycleSort(i)}
                    title="Ganti urutan"
                  >
                    {sortLabel[levels[i].sort] || "Nilai ↓"}
                  </button>
                  <button
                    className={cx(BTN_QUIET, "hover:text-[var(--neg)]")}
                    type="button"
                    onClick={() => removeLevel(i)}
                    aria-label={`Hapus level ${labelOf(levels[i].dim)}`}
                  >
                    <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" aria-hidden="true">
                      <path
                        d="M1 1l8 8M9 1l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {visible.map((node) => {
                    const on = levels[i].selected === node.label;
                    const menuKey = `${i}:${node.label}`;
                    return (
                      <div
                        className="group relative"
                        key={node.label}
                        onMouseEnter={() => setHoverKey(menuKey)}
                        onMouseLeave={() => setHoverKey((k) => (k === menuKey ? null : k))}
                      >
                        <button
                          className={cx(
                            "dt-shadow dt-shadow-lift relative block w-full overflow-hidden rounded-lg border px-3 py-2.5 pr-7 text-left transition-all duration-200 hover:-translate-y-px",
                            FOCUS,
                            on
                              ? "border-[var(--brand-600)] bg-[var(--brand-50)]"
                              : `${LINE} bg-[var(--paper)] hover:border-[var(--brand-300)]`,
                            hasPick && !on ? "opacity-55 hover:opacity-100" : ""
                          )}
                          type="button"
                          ref={setNodeRef(menuKey)}
                          onFocus={() => setHoverKey(menuKey)}
                          onBlur={() => setHoverKey((k) => (k === menuKey ? null : k))}
                          onClick={() => pickNode(i, node.label)}
                          aria-pressed={on}
                          title={`${node.label} — ${fmt(node.value, measure.format)}`}
                        >
                          <span
                            className={cx(
                              "absolute inset-y-2 left-0 w-[3px] rounded-r-full transition-colors",
                              on ? "bg-[var(--brand-700)]" : "bg-transparent"
                            )}
                          />
                          {renderNodeBody({ ...node, __on: on }, level)}
                        </button>

                        <button
                          className={cx(
                            PLUS_BASE,
                            "opacity-70 group-hover:opacity-100 focus-visible:opacity-100",
                            menuAt === menuKey
                              ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white opacity-100"
                              : "border-[var(--ink-300)] bg-[var(--paper)] text-[var(--ink-500)] hover:border-[var(--brand-600)] hover:text-[var(--brand-700)]"
                          )}
                          type="button"
                          data-dt-split=""
                          aria-label={`Uraikan ${node.label}`}
                          aria-expanded={menuAt === menuKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuAt((m) => (m === menuKey ? null : menuKey));
                          }}
                        >
                          <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
                            <path
                              d="M6 1.5v9M1.5 6h9"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>

                        {menuAt === menuKey && (
                          <SplitMenu
                            anchorEl={nodeRefs.current.get(menuKey)}
                            dims={unusedAt(i)}
                            onPick={(d) => splitFrom(i, node.label, d)}
                            onAi={(mode) => aiSplit(i, node.label, mode)}
                            onClose={() => setMenuAt(null)}
                          />
                        )}
                      </div>
                    );
                  })}

                  {hidden > 0 && (
                    <button
                      className={cx(
                        "w-full rounded-lg border border-dashed py-2 text-xs text-[var(--ink-500)] transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)]",
                        LINE,
                        FOCUS
                      )}
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [i]: true }))}
                    >
                      Tampilkan semua — {hidden} lainnya
                    </button>
                  )}
                  {showAll && level.nodes.length > nodeLimit && (
                    <button
                      className={cx(
                        "w-full rounded-lg border border-dashed py-2 text-xs text-[var(--ink-500)] transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-700)]",
                        LINE,
                        FOCUS
                      )}
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [i]: false }))}
                    >
                      Ringkas lagi ({nodeLimit} teratas)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
