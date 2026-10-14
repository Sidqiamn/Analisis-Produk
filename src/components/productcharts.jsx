/* ============================================================================
   Grafik analisis produk
   ----------------------------------------------------------------------------
   LifecycleChart   kurva siklus hidup: kolom bulanan + rata-rata 12 bulan
   QuadrantScatter  kuadran dinamis: sumbu bisa diganti, seret untuk memilih
   HWaterfall       jembatan horizontal dari P2 ke P1
   DeltaBars        perubahan per anggota, berporos di nol
   IndexLines       dua deret berindeks (=100) pada satu sumbu

   Spesifikasi mark mengikuti panduan visualisasi: batang maks 24px dengan
   ujung membulat 4px dan dasar persegi, garis 2px, penanda ≥ 8px bercincin
   warna permukaan, garis kisi tipis dan padat (bukan putus-putus).
   ========================================================================== */

import React, { useState, useMemo, useRef } from "react";
import { niceScale } from "./charts.jsx";
import { ChartTip, ShowAll, TipRow } from "./productui.jsx";
import { useWidth } from "../lib/hooks.js";
import { fmt, monthIndex, nfFull, nfPct, signedPct } from "../lib/format.js";
import { cx, FOCUS, MUTED } from "../lib/theme.jsx";

const AXIS = "var(--ink-400)";
const GRID = "var(--ink-100)";

const MONTH_SHORT = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" });
const MONTH_LONG = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const mDate = (m) => new Date(Math.floor(m / 12), m % 12, 1);
export const monthShort = (m) => MONTH_SHORT.format(mDate(m));
export const monthLong = (m) => MONTH_LONG.format(mDate(m));

const rp = (v) => fmt(v, "currency", true);

/** Batang: ujung atas membulat, dasar persegi. */
function topBar(x, y, w, h, r = 4) {
  if (!(h > 0) || !(w > 0)) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/* ======================================================= kurva siklus hidup */

/** Kotak kecil legenda. */
function LegendKey({ color, line, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {line ? (
        <span className="inline-block h-[2px] w-4 rounded-full" style={{ background: color }} aria-hidden="true" />
      ) : (
        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

/**
 * Kolom = pendapatan per bulan, diwarnai menurut periodenya:
 *   anggur = P1 (dinilai) · biru = P2 (pembanding) · merah muda = bulan lain.
 * Garis = rata-rata 12 bulan bergulir (cerita utama: arah siklus hidup).
 * Latar P1/P2 menandai jendela yang dibandingkan.
 */
export function LifecycleChart({ ms, win, height = 250 }) {
  const ref = useRef(null);
  const width = useWidth(ref, 800);
  const [at, setAt] = useState(null);

  const M = { top: 24, right: 18, bottom: 30, left: 72 };
  const n = ms.months.length;
  const iw = Math.max(80, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const max = Math.max(1, ...ms.r, ...ms.ma);
  const sc = niceScale(0, max, 4);
  const bandW = iw / n;
  const bw = Math.min(24, Math.max(1, bandW * 0.7));
  const cxAt = (i) => M.left + bandW * (i + 0.5);
  const y = (v) => M.top + ih - (v / sc.hi) * ih;

  const band = (from, to) => {
    const i0 = Math.max(0, monthIndex(from) - ms.fromM);
    const i1 = Math.min(n - 1, monthIndex(to) - ms.fromM);
    return i1 < i0 ? null : { x: M.left + bandW * i0, w: bandW * (i1 - i0 + 1), i0, i1 };
  };
  const b1 = band(win.p1.from, win.p1.to);
  const b2 = band(win.p2.from, win.p2.to);
  const inBand = (b, i) => b && i >= b.i0 && i <= b.i1;
  const periodOf = (i) => (inBand(b1, i) ? "p1" : inBand(b2, i) ? "p2" : "hist");
  const COLOR = { p1: "var(--p1)", p2: "var(--p2)", hist: "var(--hist)" };
  const PERIOD_TEXT = { p1: "P1 (dinilai)", p2: "P2 (pembanding)", hist: "Di luar P1 dan P2" };
  const hasHist = ms.r.some((v, i) => v > 0 && periodOf(i) === "hist");

  const ticks = useMemo(() => {
    const out = [];
    const every = n <= 15 ? 2 : n <= 30 ? 3 : n <= 60 ? 6 : 12;
    ms.months.forEach((m, i) => {
      if (m % every === 0) out.push(i);
    });
    return out;
  }, [ms.months, n]);

  const line = ms.ma.map((v, i) => `${i ? "L" : "M"}${cxAt(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const pk = ms.peakI;
  const last = n - 1;

  /* Lapisan penangkap kursor sudah dimulai di M.left, jadi posisi dihitung
     dari tepi kirinya sendiri — TIDAK dikurangi M.left lagi (dulu begitu, dan
     kursor jadi meleset ±2 bulan ke kiri). Dibagi lebar sebenarnya supaya
     tetap tepat walau halaman di-zoom. */
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / (r.width || 1)) * iw;
    const i = Math.floor(px / bandW);
    setAt(i >= 0 && i < n ? i : null);
  };

  return (
    <div ref={ref}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-700)]">
        {b1 && <LegendKey color={COLOR.p1} label="P1, periode dinilai" />}
        {b2 && <LegendKey color={COLOR.p2} label="P2, pembanding" />}
        {hasHist && <LegendKey color={COLOR.hist} label="Bulan lain" />}
        <LegendKey line color="var(--brand-900)" label="Rata-rata 12 bulan" />
      </div>
      <div className="relative">
      <svg width={width} height={height} role="img" aria-label="Kurva siklus hidup: pendapatan bulanan dan rata-rata 12 bulan bergulir">
        {b2 && <rect x={b2.x} y={M.top} width={b2.w} height={ih} fill="var(--blue-50)" />}
        {b1 && <rect x={b1.x} y={M.top} width={b1.w} height={ih} fill="var(--brand-50)" />}
        {b2 && (
          <text x={b2.x + 6} y={M.top - 8} fontSize="10.5" fontWeight="600" fill="var(--blue-700)">
            P2
          </text>
        )}
        {b1 && (
          <text x={b1.x + 6} y={M.top - 8} fontSize="10.5" fontWeight="600" fill="var(--brand-700)">
            P1
          </text>
        )}

        {sc.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--ink-300)" : GRID} />
            <text x={M.left - 10} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {rp(t)}
            </text>
          </g>
        ))}

        {ms.r.map((v, i) => {
          if (!(v > 0)) return null;
          return (
            <path
              key={i}
              d={topBar(cxAt(i) - bw / 2, y(v), bw, y(0) - y(v))}
              fill={COLOR[periodOf(i)]}
              opacity={at == null || at === i ? 1 : 0.45}
            />
          );
        })}

        {/* garis rata-rata dengan halo warna permukaan, supaya terbaca di atas batang */}
        <path d={line} fill="none" stroke="var(--paper)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" opacity=".9" />
        <path d={line} fill="none" stroke="var(--brand-900)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* puncak dan titik terakhir, bercincin warna permukaan */}
        <circle cx={cxAt(pk)} cy={y(ms.ma[pk])} r="4.5" fill="var(--brand-900)" stroke="var(--paper)" strokeWidth="2" />
        <text
          x={Math.min(Math.max(cxAt(pk), M.left + 40), M.left + iw - 40)}
          y={Math.max(M.top + 10, y(ms.ma[pk]) - 10)}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--ink-700)"
          stroke="var(--paper)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          Puncak {monthShort(ms.months[pk])}
        </text>
        {last !== pk && <circle cx={cxAt(last)} cy={y(ms.ma[last])} r="4" fill="var(--paper)" stroke="var(--brand-900)" strokeWidth="2" />}

        {ticks.map((i) => (
          <text key={i} x={cxAt(i)} y={height - 10} textAnchor="middle" fontSize="10" fill={AXIS}>
            {monthShort(ms.months[i])}
          </text>
        ))}

        {at != null && (
          <rect x={M.left + bandW * at} y={M.top} width={bandW} height={ih} fill="var(--ink-900)" opacity=".05" pointerEvents="none" />
        )}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setAt(null)}
          data-hover-layer=""
        />
      </svg>

      {at != null && (
        <ChartTip x={cxAt(at)} y={y(Math.max(ms.r[at], ms.ma[at]))} width={width} height={height}>
          <div className="font-medium text-[var(--ink-900)]">{monthLong(ms.months[at])}</div>
          <TipRow name="Periode" value={PERIOD_TEXT[periodOf(at)]} swatch={COLOR[periodOf(at)]} />
          <TipRow name="Pendapatan" value={rp(ms.r[at])} />
          <TipRow name="Rata-rata 12 bln" value={rp(ms.ma[at])} swatch="var(--brand-900)" />
          <TipRow name="Transaksi" value={nfFull.format(ms.tx[at])} />
          <TipRow name="Cabang aktif" value={nfFull.format(ms.br[at])} />
        </ChartTip>
      )}
      </div>
    </div>
  );
}

/* ========================================================= kuadran dinamis */

function logTicks(lo, hi) {
  // 1-2-5 per dekade, dalam rentang log10 [lo, hi]
  const out = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      const l = Math.log10(v);
      if (l >= lo - 1e-9 && l <= hi + 1e-9) out.push(v);
    }
  }
  // Terlalu rapat → hanya kelipatan 10.
  return out.length > 8 ? out.filter((v) => Math.abs(Math.log10(v) % 1) < 1e-9) : out;
}

/**
 * Titik = produk. Sumbu, ukuran, dan warna ditentukan halaman.
 * Arahkan kursor → keterangan (target sentuh ±24px, bukan titiknya saja).
 * Klik titik → buka diagnosis. Seret di area kosong → pilih sekelompok
 * produk; tabel di bawah ikut tersaring.
 */
export function QuadrantScatter({
  units,
  xAxis,
  yAxis,
  sizeGet,
  colorOf,
  quadrants,
  dimmed,
  labelKeys,
  onPick,
  onBrush,
  brushRect,
  height = 400,
  tipExtra,
}) {
  const ref = useRef(null);
  const svgRef = useRef(null);
  const width = useWidth(ref, 760);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);

  const M = { top: 18, right: 22, bottom: 42, left: 70 };
  const iw = Math.max(120, width - M.left - M.right);
  const ih = height - M.top - M.bottom;

  const geo = useMemo(() => {
    const raw = [];
    for (const u of units) {
      const xv = xAxis.get(u);
      const yv = yAxis.get(u);
      if (xv == null || yv == null || Number.isNaN(xv) || Number.isNaN(yv)) continue;
      if (xAxis.log && !(xv > 0)) continue;
      raw.push({ u, xv, yv, sv: sizeGet ? sizeGet(u) : 1 });
    }
    const tx = (v) => (xAxis.log ? Math.log10(v) : v);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let smax = 0;
    for (const p of raw) {
      const xv = tx(p.xv);
      x0 = Math.min(x0, xv);
      x1 = Math.max(x1, xv);
      const yv = Math.max(yAxis.min ?? -Infinity, Math.min(yAxis.max ?? Infinity, p.yv));
      y0 = Math.min(y0, yv);
      y1 = Math.max(y1, yv);
      smax = Math.max(smax, p.sv || 0);
    }
    if (!raw.length) return { pts: [], xd: [0, 1], yd: [0, 1], tx };
    /* Sumbu log: satu transaksi Rp 1 bisa menarik sumbu sampai Rp 1 dan
       menjepit semua titik lain ke sepertiga kanan. Batas bawah diambil dari
       persentil ke-3 dan paling jauh 4,5 dekade di bawah nilai terbesar;
       titik di bawahnya ditempel di tepi kiri dengan tanda ‹. */
    let xFloor = -Infinity;
    if (xAxis.log) {
      const lv = raw.map((p) => Math.log10(p.xv)).sort((a, b) => a - b);
      xFloor = Math.max(lv[Math.floor(lv.length * 0.03)], lv[lv.length - 1] - 4.5);
      x0 = Math.max(x0, xFloor);
    }
    if (yAxis.includeZero) {
      y0 = Math.min(y0, 0);
      y1 = Math.max(y1, 0);
    }
    if (x0 === x1) {
      x0 -= 1;
      x1 += 1;
    }
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const px = (x1 - x0) * 0.04;
    const py = (y1 - y0) * 0.06;
    const xd = [x0 - px, x1 + px];
    const yd = [y0 - py, y1 + py];
    const sx = (v) => M.left + ((Math.max(tx(v), xFloor) - xd[0]) / (xd[1] - xd[0])) * iw;
    const sy = (v) => M.top + ih - ((v - yd[0]) / (yd[1] - yd[0])) * ih;
    const pts = raw
      .map((p) => {
        const clipped = (yAxis.max != null && p.yv > yAxis.max) || (yAxis.min != null && p.yv < yAxis.min);
        const yv = Math.max(yAxis.min ?? -Infinity, Math.min(yAxis.max ?? Infinity, p.yv));
        return {
          ...p,
          x: sx(p.xv),
          y: sy(yv),
          r: sizeGet && smax ? 3.5 + 13 * Math.sqrt(Math.max(0, p.sv) / smax) : 5,
          clipped,
          xClipped: xAxis.log && Math.log10(p.xv) < xFloor,
        };
      })
      .sort((a, b) => b.r - a.r);
    return { pts, xd, yd, sx, sy, tx };
  }, [units, xAxis, yAxis, sizeGet, iw, ih]);

  const { pts, xd, yd } = geo;
  const sxv = (v) => M.left + ((v - xd[0]) / (xd[1] - xd[0])) * iw; // v sudah dalam ruang tx
  const syv = (v) => M.top + ih - ((v - yd[0]) / (yd[1] - yd[0])) * ih;

  const xTicks = xAxis.log ? logTicks(xd[0], xd[1]).map((v) => ({ v, at: Math.log10(v) })) : niceScale(xd[0], xd[1], 5).ticks.filter((t) => t >= xd[0] && t <= xd[1]).map((v) => ({ v, at: v }));
  const yTicks = niceScale(yd[0], yd[1], 5).ticks.filter((t) => t >= yd[0] && t <= yd[1]);

  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const nearest = (p) => {
    let best = null;
    let bd = Infinity;
    for (const q of pts) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      const reach = Math.max(12, q.r + 8); // target sentuh ≥ 24px
      if (d <= reach && d < bd) {
        best = q;
        bd = d;
      }
    }
    return best;
  };

  const onDown = (e) => {
    const p = local(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e) => {
    const p = local(e);
    if (drag) setDrag((d) => ({ ...d, x1: p.x, y1: p.y }));
    else setHover(nearest(p));
  };
  const onUp = (e) => {
    if (!drag) return;
    const p = local(e);
    const moved = Math.hypot(p.x - drag.x0, p.y - drag.y0) > 5;
    if (moved) {
      const xa = Math.min(drag.x0, p.x);
      const xb = Math.max(drag.x0, p.x);
      const ya = Math.min(drag.y0, p.y);
      const yb = Math.max(drag.y0, p.y);
      const keys = new Set(pts.filter((q) => q.x >= xa && q.x <= xb && q.y >= ya && q.y <= yb).map((q) => q.u.key));
      onBrush?.(keys.size ? keys : null, { xa, xb, ya, yb });
    } else {
      const q = nearest(p);
      if (q) onPick?.(q.u);
      else onBrush?.(null, null);
    }
    setDrag(null);
  };

  // Garis acuan kuadran.
  const xRef = xAxis.ref != null ? (xAxis.log ? Math.log10(xAxis.ref) : xAxis.ref) : null;
  const yRef = yAxis.ref != null ? yAxis.ref : null;
  const xr = xRef != null && xRef > xd[0] && xRef < xd[1] ? sxv(xRef) : null;
  const yr = yRef != null && yRef > yd[0] && yRef < yd[1] ? syv(yRef) : null;

  // Label selektif dengan cegah-tabrakan sederhana.
  const labels = useMemo(() => {
    if (!labelKeys || !labelKeys.size) return [];
    const placed = [];
    const out = [];
    for (const q of pts.filter((q) => labelKeys.has(q.u.key)).sort((a, b) => b.r - a.r)) {
      const text = q.u.label.length > 26 ? `${q.u.label.slice(0, 25)}…` : q.u.label;
      const w = text.length * 5.6;
      const right = q.x + q.r + 4 + w < M.left + iw;
      const bx = right ? q.x + q.r + 4 : q.x - q.r - 4 - w;
      const box = { x: bx, y: q.y - 7, w, h: 14 };
      if (placed.some((b) => !(box.x + box.w < b.x || b.x + b.w < box.x || box.y + box.h < b.y || b.y + b.h < box.y))) continue;
      placed.push(box);
      out.push({ q, text, x: right ? bx : bx + w, anchor: right ? "start" : "end" });
    }
    return out;
  }, [pts, labelKeys, iw]);

  const br = drag
    ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) }
    : brushRect
    ? { x: brushRect.xa, y: brushRect.ya, w: brushRect.xb - brushRect.xa, h: brushRect.yb - brushRect.ya }
    : null;

  return (
    <div ref={ref} className="relative select-none">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={`Sebaran produk: ${xAxis.label} terhadap ${yAxis.label}`}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => {
          setHover(null);
          setDrag(null);
        }}
        style={{ cursor: drag ? "crosshair" : hover ? "pointer" : "crosshair" }}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={M.left + iw} y1={syv(t)} y2={syv(t)} stroke={GRID} />
            <text x={M.left - 10} y={syv(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {yAxis.fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t.v}`}>
            <line x1={sxv(t.at)} x2={sxv(t.at)} y1={M.top} y2={M.top + ih} stroke={GRID} />
            <text x={sxv(t.at)} y={M.top + ih + 16} textAnchor="middle" fontSize="10" fill={AXIS}>
              {xAxis.fmt(t.v)}
            </text>
          </g>
        ))}

        {xr != null && <line x1={xr} x2={xr} y1={M.top} y2={M.top + ih} stroke="var(--ink-300)" />}
        {yr != null && <line x1={M.left} x2={M.left + iw} y1={yr} y2={yr} stroke="var(--ink-300)" />}

        {quadrants && xr != null && yr != null && (
          <g fontSize="11" fill="var(--ink-400)" fontWeight="500" stroke="var(--paper)" strokeWidth="3" paintOrder="stroke">
            <text x={M.left + iw - 8} y={M.top + 14} textAnchor="end">{quadrants.tr}</text>
            <text x={M.left + 8} y={M.top + 14}>{quadrants.tl}</text>
            <text x={M.left + iw - 8} y={M.top + ih - 8} textAnchor="end">{quadrants.br}</text>
            <text x={M.left + 8} y={M.top + ih - 8}>{quadrants.bl}</text>
          </g>
        )}

        {pts.map((q) => {
          const c = colorOf(q.u);
          const dim = dimmed ? dimmed(q.u) : false;
          const hot = hover && hover.u.key === q.u.key;
          return (
            <g key={q.u.key} opacity={dim ? 0.18 : 1}>
              <circle
                cx={q.x}
                cy={q.y}
                r={q.r}
                fill={c.hollow ? "var(--paper)" : c.fill}
                fillOpacity={c.hollow ? 1 : 0.82}
                stroke={c.hollow ? "#a8949c" : "var(--paper)"}
                strokeWidth={c.hollow ? 1.5 : 1.5}
              />
              {hot && <circle cx={q.x} cy={q.y} r={q.r + 3} fill="none" stroke="var(--ink-900)" strokeWidth="1.5" />}
              {q.clipped && (
                <path d={`M${q.x - 3},${q.y - q.r - 2} l3,-4 l3,4`} fill="none" stroke="var(--ink-500)" strokeWidth="1.2" />
              )}
              {q.xClipped && (
                <path d={`M${q.x - q.r - 2},${q.y - 3} l-4,3 l4,3`} fill="none" stroke="var(--ink-500)" strokeWidth="1.2" />
              )}
            </g>
          );
        })}

        {labels.map((l) => (
          <text
            key={`l${l.q.u.key}`}
            x={l.x}
            y={l.q.y + 3.5}
            textAnchor={l.anchor}
            fontSize="10.5"
            fill="var(--ink-800)"
            stroke="var(--paper)"
            strokeWidth="3"
            paintOrder="stroke"
            pointerEvents="none"
          >
            {l.text}
          </text>
        ))}

        {br && br.w > 0 && (
          <rect x={br.x} y={br.y} width={br.w} height={br.h} fill="var(--brand-700)" fillOpacity="0.06" stroke="var(--brand-500)" strokeWidth="1" />
        )}

        <text x={M.left + iw / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="var(--ink-600)">
          {xAxis.label}
          {xAxis.log ? " (skala log)" : ""}
        </text>
        <text transform={`translate(14 ${M.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="var(--ink-600)">
          {yAxis.label}
        </text>
      </svg>

      {hover && !drag && (
        <ChartTip x={hover.x} y={hover.y} width={width} height={height} w={230}>
          <div className="font-semibold leading-snug text-[var(--ink-900)]">{hover.u.label}</div>
          {hover.u.sub && <div className="text-[var(--ink-500)]">{hover.u.sub}</div>}
          <TipRow name={xAxis.label} value={xAxis.fmtFull ? xAxis.fmtFull(hover.xv) : xAxis.fmt(hover.xv)} />
          <TipRow name={yAxis.label} value={yAxis.fmtFull ? yAxis.fmtFull(hover.yv) : yAxis.fmt(hover.yv)} />
          {tipExtra && tipExtra(hover.u)}
          <div className="mt-1.5 border-t border-[var(--ink-100)] pt-1 text-[var(--ink-500)]">Klik untuk diagnosis</div>
        </ChartTip>
      )}
    </div>
  );
}

/* ====================================================== waterfall horizontal */

/**
 * Jembatan dari P2 ke P1. Setiap baris satu langkah; batang langkah
 * mengambang dari total sebelumnya ke total sesudahnya. Baris yang bisa
 * diklik (onStep) dipakai untuk menggali lebih dalam.
 *
 * steps: [{ key, label, sub, value, kind: "start" | "step" | "end", clickable }]
 */
export function HWaterfall({ steps, onStep, activeKey, valueFmt = rp, labelCol = "minmax(9rem, 38%)" }) {
  const rows = useMemo(() => {
    let run = 0;
    return steps.map((s) => {
      if (s.kind === "start") {
        run = s.value;
        return { ...s, a: 0, b: s.value };
      }
      if (s.kind === "end") return { ...s, a: 0, b: s.value };
      const a = run;
      run += s.value;
      return { ...s, a, b: run };
    });
  }, [steps]);

  let lo = 0;
  let hi = 0;
  for (const r of rows) {
    lo = Math.min(lo, r.a, r.b);
    hi = Math.max(hi, r.a, r.b);
  }
  const span = hi - lo || 1;
  const pct = (v) => ((v - lo) / span) * 100;

  return (
    <div className="text-xs" role="table">
      {rows.map((r) => {
        const isTotal = r.kind !== "step";
        const neg = !isTotal && r.value < 0;
        const left = pct(Math.min(r.a, r.b));
        const w = Math.max(0.4, Math.abs(pct(r.b) - pct(r.a)));
        const fill = isTotal
          ? r.kind === "end"
            ? "var(--brand-700)"
            : "var(--p2)"
          : neg
          ? "var(--neg-soft)"
          : "var(--pos-soft)";
        const Tag = r.clickable && onStep ? "button" : "div";
        return (
          <Tag
            key={r.key}
            type={Tag === "button" ? "button" : undefined}
            onClick={Tag === "button" ? () => onStep(r) : undefined}
            className={cx(
              "grid w-full items-center gap-3 rounded-md px-2 py-1.5 text-left",
              Tag === "button" && "transition-colors hover:bg-[var(--brand-50)]",
              Tag === "button" && FOCUS,
              activeKey === r.key && "bg-[var(--brand-50)]"
            )}
            style={{ gridTemplateColumns: `${labelCol} 1fr 6.5rem` }}
            role="row"
            title={r.title}
          >
            <span className="min-w-0" role="cell">
              <span className={cx("block truncate", isTotal ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-800)]")}>
                {r.label}
              </span>
              {r.sub && <span className={cx("block truncate text-[10.5px]", MUTED)}>{r.sub}</span>}
            </span>
            <span className="relative block h-4" role="cell" aria-hidden="true">
              <span className="absolute inset-y-0 w-px bg-[var(--ink-200)]" style={{ left: `${pct(0)}%` }} />
              <span
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px]"
                style={{ left: `${left}%`, width: `${w}%`, background: fill }}
              />
            </span>
            <span
              className={cx(
                "text-right tabular-nums",
                isTotal ? "font-semibold text-[var(--ink-900)]" : neg ? "text-[var(--neg)]" : "text-[var(--pos)]"
              )}
              role="cell"
            >
              {isTotal ? valueFmt(r.value) : `${r.value >= 0 ? "+" : "−"}${valueFmt(Math.abs(r.value))}`}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/* ============================================================== bilah delta */

const DELTA_COLS = "minmax(6.5rem, 1.1fr) 10.5rem minmax(5rem, 1fr) 5.75rem";

/**
 * Perubahan tiap anggota, berporos di tengah. Arah terbaca dari posisi
 * bilah (kiri = turun, kanan = naik), bukan dari warna saja.
 */
export function DeltaBars({ members, onPick, limit = 10, valueFmt = rp, activeKey }) {
  // Diringkas ke `limit` anggota dengan perubahan terbesar + satu baris "n lainnya";
  // tombol "Tampilkan semua" membuka setiap anggota.
  const [all, setAll] = useState(false);
  const lim = all ? Infinity : limit;
  const shown = useMemo(() => {
    const byMag = members.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = byMag.slice(0, lim);
    const rest = byMag.slice(lim);
    const out = top.sort((a, b) => b.d - a.d);
    if (rest.length) {
      out.push({
        key: "__rest",
        label: `${rest.length} lainnya`,
        r1: rest.reduce((t, m) => t + m.r1, 0),
        r2: rest.reduce((t, m) => t + m.r2, 0),
        d: rest.reduce((t, m) => t + m.d, 0),
        rest: true,
      });
    }
    return out;
  }, [members, lim]);
  const max = Math.max(1, ...shown.map((m) => Math.abs(m.d)));

  return (
    <div className="text-xs">
      <div className={cx("grid gap-3 px-2 pb-1 text-[10.5px]", MUTED)} style={{ gridTemplateColumns: DELTA_COLS }}>
        <span />
        <span className="text-right">P2 → P1</span>
        <span className="text-center">turun · naik</span>
        <span className="text-right">Selisih</span>
      </div>
      {shown.map((m) => {
        const neg = m.d < 0;
        const w = (Math.abs(m.d) / max) * 50;
        const Tag = onPick && !m.rest ? "button" : "div";
        return (
          <Tag
            key={m.key}
            type={Tag === "button" ? "button" : undefined}
            onClick={Tag === "button" ? () => onPick(m) : undefined}
            className={cx(
              "grid w-full items-center gap-3 rounded-md px-2 py-1.5 text-left",
              Tag === "button" && "transition-colors hover:bg-[var(--brand-50)]",
              Tag === "button" && FOCUS,
              activeKey === m.key && "bg-[var(--brand-50)]"
            )}
            style={{ gridTemplateColumns: DELTA_COLS }}
            title={`${m.label}: ${rp(m.r2)} → ${rp(m.r1)}`}
          >
            <span className={cx("truncate", m.rest ? "text-[var(--ink-500)]" : "text-[var(--ink-800)]")}>{m.label}</span>
            <span className="truncate text-right tabular-nums text-[11px] text-[var(--ink-500)]">
              {rp(m.r2)} → <span className="text-[var(--ink-800)]">{rp(m.r1)}</span>
            </span>
            <span className="relative block h-3.5" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink-300)]" />
              <span
                className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[3px]"
                style={{
                  left: neg ? `${50 - w}%` : "50%",
                  width: `${Math.max(w, 0.4)}%`,
                  background: neg ? "var(--neg-soft)" : "var(--pos-soft)",
                }}
              />
            </span>
            <span className={cx("text-right tabular-nums font-medium", neg ? "text-[var(--neg)]" : m.d > 0 ? "text-[var(--pos)]" : "text-[var(--ink-500)]")}>
              {m.d >= 0 ? "+" : "−"}
              {valueFmt(Math.abs(m.d))}
            </span>
          </Tag>
        );
      })}
      {members.length > limit && (
        <div className="px-2 pt-2">
          <ShowAll total={members.length} limit={limit} open={all} onToggle={() => setAll((v) => !v)} />
        </div>
      )}
    </div>
  );
}

/* =========================================================== garis indeks */

/**
 * Dua deret pada satu sumbu, masing-masing diindeks = 100 di titik awal.
 * Inilah cara jujur membandingkan tren produk kecil dengan induknya yang
 * puluhan kali lebih besar — bukan dua sumbu Y.
 */
export function IndexLines({ months, a, b, aLabel, bLabel, height = 190 }) {
  const ref = useRef(null);
  const width = useWidth(ref, 520);
  const [at, setAt] = useState(null);

  const base = (arr) => {
    const i = arr.findIndex((v) => v > 0);
    return i === -1 ? null : arr[i];
  };
  const ia = base(a);
  const ib = base(b);
  const A = a.map((v) => (ia ? (v / ia) * 100 : null));
  const B = b.map((v) => (ib ? (v / ib) * 100 : null));

  const M = { top: 14, right: 88, bottom: 26, left: 44 };
  const n = months.length;
  const iw = Math.max(80, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const vals = [...A, ...B].filter((v) => v != null);
  const sc = niceScale(Math.min(0, ...vals), Math.max(100, ...vals), 4);
  const x = (i) => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => M.top + ih - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ih;
  const path = (arr) => arr.map((v, i) => (v == null ? "" : `${i && arr[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");

  const ticks = [];
  const every = n <= 15 ? 3 : n <= 30 ? 6 : 12;
  months.forEach((m, i) => m % every === 0 && ticks.push(i));
  const last = n - 1;

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Indeks tren ${aLabel} dibanding ${bLabel}`}>
        {sc.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={t === 100 ? "var(--ink-300)" : GRID} />
            <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {nfFull.format(t)}
            </text>
          </g>
        ))}
        <path d={path(B)} fill="none" stroke="var(--ink-400)" strokeWidth="2" strokeLinejoin="round" />
        <path d={path(A)} fill="none" stroke="var(--brand-700)" strokeWidth="2" strokeLinejoin="round" />
        {B[last] != null && (
          <text x={x(last) + 8} y={y(B[last]) + 3.5} fontSize="10.5" fill="var(--ink-600)">
            {bLabel.length > 13 ? `${bLabel.slice(0, 12)}…` : bLabel}
          </text>
        )}
        {A[last] != null && (
          <text x={x(last) + 8} y={y(A[last]) + 3.5} fontSize="10.5" fontWeight="600" fill="var(--ink-900)">
            {aLabel.length > 13 ? `${aLabel.slice(0, 12)}…` : aLabel}
          </text>
        )}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={AXIS}>
            {monthShort(months[i])}
          </text>
        ))}
        {at != null && <line x1={x(at)} x2={x(at)} y1={M.top} y2={M.top + ih} stroke="var(--brand-300)" />}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / iw) * (n - 1));
            setAt(Math.max(0, Math.min(n - 1, i)));
          }}
          onMouseLeave={() => setAt(null)}
        />
      </svg>
      {at != null && (
        <ChartTip x={x(at)} y={y(Math.max(A[at] ?? 0, B[at] ?? 0))} width={width} height={height}>
          <div className="font-medium text-[var(--ink-900)]">{monthLong(months[at])}</div>
          <TipRow name={aLabel} value={A[at] == null ? "–" : nfFull.format(A[at])} swatch="var(--brand-700)" />
          <TipRow name={bLabel} value={B[at] == null ? "–" : nfFull.format(B[at])} swatch="var(--ink-400)" />
        </ChartTip>
      )}
    </div>
  );
}

export { signedPct, nfPct };

/* ============================================================ GrowthSlope */

/**
 * Dua pertumbuhan P2 → P1 sebagai garis miring. Setiap deret mulai dari 100
 * di P2, jadi ujung kanannya = 100 × (1 + pertumbuhan) — persis angka yang
 * ditulis di kalimat penjelasannya. Tidak ada "titik awal" lain yang bisa
 * membuat garis tampak lebih tinggi atau rendah dari kenyataan periode ini.
 *
 * series: [{ key, label, g, from, to, color, strong }]
 */
export function GrowthSlope({ series, p2Label, p1Label, height = 220 }) {
  const ref = useRef(null);
  const width = useWidth(ref, 480);
  const ok = series.filter((s) => s.g != null && Number.isFinite(s.g));
  const ends = ok.map((s) => 100 * (1 + s.g));
  const lo = Math.min(100, ...ends);
  const hi = Math.max(100, ...ends);
  const sc = niceScale(Math.min(0, lo), hi * 1.06, 4);
  const M = { top: 16, right: 178, bottom: 38, left: 40 };
  const iw = Math.max(120, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x0 = M.left + 26;
  const x1 = M.left + iw - 6;
  const y = (v) => M.top + ih - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ih;

  // Label kanan disusun supaya tidak bertumpuk (jarak minimum 30px, dua baris).
  const labels = ok
    .map((s) => ({ s, y: y(100 * (1 + s.g)) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 30) labels[i].y = labels[i - 1].y + 30;
  }

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Pertumbuhan ${ok.map((s) => `${s.label} ${signedPct(s.g)}`).join(", ")}`}>
        {sc.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={t === 100 ? "var(--ink-300)" : GRID} />
            <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {nfFull.format(t)}
            </text>
          </g>
        ))}
        <line x1={x0} x2={x0} y1={M.top} y2={M.top + ih} stroke="var(--ink-200)" />
        <line x1={x1} x2={x1} y1={M.top} y2={M.top + ih} stroke="var(--ink-200)" />
        <text x={x0} y={height - 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-700)">
          P2
        </text>
        <text x={x0} y={height - 7} textAnchor="middle" fontSize="10" fill={AXIS}>
          {p2Label}
        </text>
        <text x={x1} y={height - 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--brand-700)">
          P1
        </text>
        <text x={x1} y={height - 7} textAnchor="middle" fontSize="10" fill={AXIS}>
          {p1Label}
        </text>
        {ok.map((s) => (
          <g key={s.key}>
            <line
              x1={x0}
              x2={x1}
              y1={y(100)}
              y2={y(100 * (1 + s.g))}
              stroke={s.color}
              strokeWidth={s.strong ? 3 : 2}
              strokeLinecap="round"
            />
            <circle cx={x0} cy={y(100)} r="4.5" fill={s.color} stroke="var(--paper)" strokeWidth="2" />
            <circle cx={x1} cy={y(100 * (1 + s.g))} r="5" fill={s.color} stroke="var(--paper)" strokeWidth="2" />
          </g>
        ))}
        {labels.map(({ s, y: ly }) => (
          <g key={s.key}>
            <text x={x1 + 12} y={ly - 2} fontSize="11.5" fontWeight={s.strong ? 700 : 600} fill={s.g < 0 ? "var(--neg)" : "var(--pos)"}>
              {signedPct(s.g)}
            </text>
            <text x={x1 + 12} y={ly + 12} fontSize="10.5" fill="var(--ink-600)">
              {s.label.length > 24 ? `${s.label.slice(0, 23)}…` : s.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ============================================================= ShareTrend */

/**
 * Porsi produk di induknya dari bulan ke bulan, memakai jumlah bergulir W
 * bulan (sama dengan panjang jendela analisis). Garis yang turun berarti
 * produk tumbuh lebih lambat dari saudaranya — walaupun penjualannya sendiri
 * naik. Wilayah P1 diberi latar.
 */
export function ShareTrend({ months, share, W, p1FromM, height = 220, label }) {
  const ref = useRef(null);
  const width = useWidth(ref, 480);
  const [at, setAt] = useState(null);
  const n = months.length;
  const vals = share.filter((v) => v != null);
  const sc = niceScale(0, Math.max(0.01, ...vals) * 1.15, 4);
  const M = { top: 16, right: 16, bottom: 26, left: 46 };
  const iw = Math.max(80, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const x = (i) => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => M.top + ih - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ih;
  let d = "";
  share.forEach((v, i) => {
    if (v == null) return;
    d += `${d && share[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const p1i = months.findIndex((m) => m >= p1FromM);
  const ticks = [];
  const every = n <= 15 ? 3 : n <= 30 ? 6 : 12;
  months.forEach((m, i) => m % every === 0 && ticks.push(i));
  const last = n - 1;

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={`Porsi ${label} di induknya per bulan`}>
        {p1i >= 0 && (
          <g>
            <rect x={x(p1i) - (n > 1 ? iw / (n - 1) / 2 : 0)} y={M.top} width={M.left + iw - x(p1i) + (n > 1 ? iw / (n - 1) / 2 : 0)} height={ih} fill="var(--brand-50)" />
            <text x={x(p1i) + 4} y={M.top + 11} fontSize="10" fontWeight="600" fill="var(--brand-700)">
              P1
            </text>
          </g>
        )}
        {sc.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {nfPct.format(t)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--brand-700)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {share[last] != null && <circle cx={x(last)} cy={y(share[last])} r="4.5" fill="var(--brand-700)" stroke="var(--paper)" strokeWidth="2" />}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={AXIS}>
            {monthShort(months[i])}
          </text>
        ))}
        {at != null && <line x1={x(at)} x2={x(at)} y1={M.top} y2={M.top + ih} stroke="var(--brand-300)" />}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / iw) * (n - 1));
            setAt(Math.max(0, Math.min(n - 1, i)));
          }}
          onMouseLeave={() => setAt(null)}
        />
      </svg>
      {at != null && (
        <ChartTip x={x(at)} y={share[at] == null ? M.top : y(share[at])} width={width} height={height} w={210}>
          <div className="font-medium text-[var(--ink-900)]">{monthLong(months[at])}</div>
          <TipRow name={`Porsi, ${W} bulan terakhir`} value={share[at] == null ? "–" : nfPct.format(share[at])} swatch="var(--brand-700)" />
        </ChartTip>
      )}
    </div>
  );
}
