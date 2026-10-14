/* ============================================================================
   Grafik — tren, kontribusi, dan jembatan selisih
   ========================================================================== */

import React, { useState, useMemo, useRef } from "react";
import { labelOf } from "../lib/config.js";
import {
  aggregate,
  clip,
  dLabel,
  daysBetween,
  fmt,
  inRange,
  monthStart,
  shiftDays,
  toJs,
  topWithRest,
  totalsOf,
  ym,
} from "../lib/format.js";
import { useWidth } from "../lib/hooks.js";
import { BTN_QUIET, MUTED, SELECT, cx } from "../lib/theme.jsx";
import { ShowAll } from "./productui.jsx";
import { Delta, Signed } from "./delta.jsx";

export const CHART_KINDS = [
  { key: "line", label: "Tren garis" },
  { key: "cumulative", label: "Tren kumulatif" },
  { key: "bar", label: "Batang per periode" },
  { key: "contribution", label: "Kontribusi per dimensi" },
  { key: "bridge", label: "Jembatan selisih", cmpOnly: true },
];

const GRANS = [
  { key: "auto", label: "Otomatis" },
  { key: "day", label: "Harian" },
  { key: "week", label: "Mingguan" },
  { key: "month", label: "Bulanan" },
];

const GRAN_WORD = { day: "harian", week: "mingguan", month: "bulanan" };

const fmtDayLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const fmtMonthLabel = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" });

const AXIS = "var(--ink-400)";
const GRID = "var(--ink-100)";

/* ------------------------------------------------------------ ember waktu  */

/** Berapa ember (hari, minggu, atau bulan) yang menutupi sebuah rentang. */
export function bucketCount(range, gran) {
  if (!range || !range.from || !range.to) return 0;
  if (gran === "month") {
    const a = ym(range.from);
    const b = ym(range.to);
    return (b.y - a.y) * 12 + (b.m - a.m) + 1;
  }
  const n = daysBetween(range.from, range.to);
  return gran === "week" ? Math.ceil(n / 7) : n;
}

/** Ember ke berapa sebuah tanggal jatuh, dihitung dari awal rentang. */
export function bucketIndex(iso, range, gran) {
  if (gran === "month") {
    const a = ym(range.from);
    const b = ym(iso);
    return (b.y - a.y) * 12 + (b.m - a.m);
  }
  const days = Math.round((toJs(iso) - toJs(range.from)) / 86400000);
  return gran === "week" ? Math.floor(days / 7) : days;
}

/** Tanggal awal ember ke-i. */
export function bucketStart(range, gran, i) {
  if (gran === "month") {
    const a = ym(range.from);
    const total = a.m - 1 + i;
    return monthStart(a.y + Math.floor(total / 12), (((total % 12) + 12) % 12) + 1);
  }
  return shiftDays(range.from, gran === "week" ? i * 7 : i);
}

function bucketText(iso, gran) {
  if (!iso) return "";
  return gran === "month" ? fmtMonthLabel.format(toJs(iso)) : fmtDayLabel.format(toJs(iso));
}

/** Nama panjang satu ember, dipakai di tooltip. */
function bucketFull(range, gran, i) {
  const from = bucketStart(range, gran, i);
  if (!from) return "";
  if (gran === "day") return dLabel.format(toJs(from));
  if (gran === "month")
    return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
      toJs(from)
    );
  const to = shiftDays(from, 6);
  return `${fmtDayLabel.format(toJs(from))} – ${dLabel.format(toJs(to))}`;
}

/** Skala sumbu yang berhenti di angka bulat, bukan di angka hasil bagi. */
export function niceScale(minIn, maxIn, count = 4) {
  let lo = Math.min(0, minIn);
  let hi = Math.max(0, maxIn);
  if (lo === hi) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

/* ------------------------------------------------------------- Sparkline   */

/**
 * Garis tren harian. P1 digambar penuh dengan area tipis di bawahnya,
 * P2 sebagai garis putus-putus abu. Keduanya diskalakan ke puncak yang sama
 * supaya tingginya bisa dibandingkan langsung.
 */
export function Sparkline({ a, b, tone = "brand", width = 172, height = 40 }) {
  const W = width;
  const H = height;
  const P = 4;

  const path = (arr) => {
    if (!arr || arr.length < 2) return null;
    let peak = 0;
    for (const v of arr) if (v > peak) peak = v;
    if (b) for (const v of b) if (v > peak) peak = v;
    if (!peak) peak = 1;
    const x = (i) => P + (i / (arr.length - 1)) * (W - P * 2);
    const y = (v) => H - P - (v / peak) * (H - P * 2);
    let d = `M ${x(0).toFixed(1)} ${y(arr[0]).toFixed(1)}`;
    for (let i = 1; i < arr.length; i++) d += ` L ${x(i).toFixed(1)} ${y(arr[i]).toFixed(1)}`;
    return {
      d,
      area: `${d} L ${x(arr.length - 1).toFixed(1)} ${H - P} L ${x(0).toFixed(1)} ${H - P} Z`,
    };
  };

  const pa = path(a);
  if (!pa) return null;
  const pb = b ? path(b) : null;
  const stroke =
    tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--brand-700)";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
      <path d={pa.area} fill={stroke} opacity=".08" />
      {pb && (
        <path
          d={pb.d}
          fill="none"
          stroke="var(--p2)"
          strokeOpacity=".7"
          strokeWidth="1.25"
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
      )}
      <path
        d={pa.d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- tooltip  */

/** Kotak keterangan yang mengikuti kursor, dibalik kalau mepet tepi kanan. */
function ChartTip({ x, y, width, children }) {
  const flip = x > width - 210;
  return (
    <div
      className="dt-shadow-pop pointer-events-none absolute z-10 w-[196px] rounded-lg border border-[var(--ink-200)] bg-[var(--paper)] px-2.5 py-2 text-[11px]"
      style={{ left: flip ? x - 206 : x + 14, top: Math.max(2, y - 16) }}
    >
      {children}
    </div>
  );
}

function TipRow({ name, value, muted }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <span className="text-[var(--ink-500)]">{name}</span>
      <span
        className={cx("font-medium", muted ? "text-[var(--ink-600)]" : "text-[var(--ink-900)]")}
      >
        {value}
      </span>
    </div>
  );
}

/* --- tren, kumulatif, dan batang ---------------------------------------- */

function TimeChart({ data, measure, compare, kind, width, height }) {
  const [at, setAt] = useState(null);

  const M = { top: 14, right: 16, bottom: 28, left: 74 };
  const n = data.a.length;
  const iw = Math.max(60, width - M.left - M.right);
  const ih = Math.max(60, height - M.top - M.bottom);

  const { a, b } = useMemo(() => {
    if (kind !== "cumulative") return { a: data.a, b: data.b };
    const run = (arr) => {
      if (!arr) return null;
      let t = 0;
      return arr.map((v) => (t += v));
    };
    return { a: run(data.a), b: run(data.b) };
  }, [data, kind]);

  const scale = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const v of a) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (b) {
      for (const v of b) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return niceScale(lo, hi);
  }, [a, b]);

  const isBar = kind === "bar";
  const band = iw / Math.max(1, n);
  const px = (i) =>
    isBar ? M.left + band * (i + 0.5) : M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const py = (v) => M.top + ih - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * ih;

  const linePath = (arr) =>
    arr.map((v, i) => `${i ? "L" : "M"} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");

  const xIdx = useMemo(() => {
    const want = Math.max(2, Math.min(8, Math.floor(iw / 100)));
    const out = new Set();
    for (let k = 0; k < want; k++) out.add(Math.round((k / (want - 1)) * (n - 1)));
    return Array.from(out).sort((x, y) => x - y);
  }, [iw, n]);

  const readAt = (e) => {
    const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
    const rel = e.clientX - svg.getBoundingClientRect().left;
    const i = isBar
      ? Math.floor((rel - M.left) / band)
      : Math.round(((rel - M.left) / iw) * (n - 1));
    setAt(Math.max(0, Math.min(n - 1, i)));
  };

  const barW = Math.max(1, compare ? band * 0.34 : band * 0.66);
  const zeroY = py(0);
  // P1 dan P2 bisa berbeda jumlah titik (mis. Maret vs Februari); titik yang
  // hanya ada di salah satu periode tidak punya pasangan untuk dibandingkan.
  const n1 = bucketCount(data.range1, data.gran);
  const n2 = data.range2 ? bucketCount(data.range2, data.gran) : 0;
  const has1 = at != null && at < n1;
  const has2 = at != null && at < n2;

  return (
    <>
      <svg width={width} height={height} role="img" aria-label={`Grafik ${measure.label}`}>
        <defs>
          <linearGradient id="dtArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-700)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--brand-700)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {scale.ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={M.left + iw}
              y1={py(t)}
              y2={py(t)}
              stroke={t === 0 && scale.lo < 0 ? "var(--ink-300)" : GRID}
              strokeWidth="1"
            />
            <text x={M.left - 10} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {fmt(t, measure.format, true)}
            </text>
          </g>
        ))}

        {xIdx.map((i) => (
          <text key={i} x={px(i)} y={height - 9} textAnchor="middle" fontSize="10" fill={AXIS}>
            {bucketText(data.labels[i], data.gran)}
          </text>
        ))}

        {isBar ? (
          <g>
            {a.map((v, i) => (
              <rect
                key={`a${i}`}
                x={compare ? px(i) - barW - 1 : px(i) - barW / 2}
                y={Math.min(py(v), zeroY)}
                width={barW}
                height={Math.max(1, Math.abs(py(v) - zeroY))}
                rx={Math.min(2, barW / 2)}
                fill="var(--brand-700)"
                opacity={at == null || at === i ? 1 : 0.42}
              />
            ))}
            {b &&
              b.map((v, i) => (
                <rect
                  key={`b${i}`}
                  x={px(i) + 1}
                  y={Math.min(py(v), zeroY)}
                  width={barW}
                  height={Math.max(1, Math.abs(py(v) - zeroY))}
                  rx={Math.min(2, barW / 2)}
                  fill="var(--p2)"
                  opacity={at == null || at === i ? 0.62 : 0.26}
                />
              ))}
          </g>
        ) : (
          <g>
            <path
              d={`${linePath(a)} L ${px(n - 1)} ${zeroY} L ${px(0)} ${zeroY} Z`}
              fill="url(#dtArea)"
              stroke="none"
            />
            {b && (
              <path
                className="dt-draw"
                pathLength={1}
                d={linePath(b)}
                fill="none"
                stroke="var(--p2)"
                strokeOpacity=".8"
                strokeWidth="1.4"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            )}
            <path
              className="dt-draw"
              pathLength={1}
              d={linePath(a)}
              fill="none"
              stroke="var(--brand-700)"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {at != null && (
          <g pointerEvents="none">
            <line
              x1={px(at)}
              x2={px(at)}
              y1={M.top}
              y2={M.top + ih}
              stroke="var(--brand-300)"
              strokeWidth="1"
            />
            {!isBar && (
              <>
                {b && (
                  <circle
                    cx={px(at)}
                    cy={py(b[at])}
                    r="3"
                    fill="var(--paper)"
                    stroke="var(--p2)"
                    strokeWidth="1.4"
                  />
                )}
                <circle
                  cx={px(at)}
                  cy={py(a[at])}
                  r="3.5"
                  fill="var(--brand-700)"
                  stroke="var(--paper)"
                  strokeWidth="1.5"
                />
              </>
            )}
          </g>
        )}

        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={readAt}
          onMouseLeave={() => setAt(null)}
        />
      </svg>

      {at != null && (
        <ChartTip x={px(at)} y={py(Math.max(a[at], b ? b[at] : a[at]))} width={width}>
          <div className="font-medium text-[var(--ink-900)]">
            {has1 ? bucketFull(data.range1, data.gran, at) : "Di luar P1"}
          </div>
          <TipRow name={compare ? "P1" : measure.label} value={has1 ? fmt(a[at], measure.format, true) : "–"} />
          {b && (
            <>
              <TipRow name="P2" value={has2 ? fmt(b[at], measure.format, true) : "–"} muted />
              <div className="mt-1 border-t border-[var(--ink-200)] pt-1 text-[var(--ink-500)]">
                {has2 ? bucketFull(data.range2, data.gran, at) : "P2 lebih pendek — tidak ada titik pembanding"}
              </div>
              {/* Selisih hanya kalau titik ini ada di kedua periode; titik tambahan
                  karena panjang P1 dan P2 berbeda bukan "baru" atau "turun 100%". */}
              {has1 && has2 && (
                <TipRow
                  name="Selisih"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Signed v={a[at] - b[at]} format={measure.format} />
                      <Delta g={b[at] > 0 ? (a[at] - b[at]) / b[at] : null} p1={a[at]} p2={b[at]} size="xs" />
                    </span>
                  }
                />
              )}
            </>
          )}
        </ChartTip>
      )}
    </>
  );
}

/* --- kontribusi per anggota dimensi ------------------------------------- */

function DimChart({ nodes, measure, compare, width, height }) {
  const [at, setAt] = useState(null);

  const M = { top: 6, right: 104, bottom: 6, left: 138 };
  const iw = Math.max(60, width - M.left - M.right);
  const ih = Math.max(40, height - M.top - M.bottom);
  const rowH = Math.max(16, Math.min(34, ih / Math.max(1, nodes.length)));
  const used = rowH * nodes.length;

  const scale = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const nd of nodes) {
      if (nd.value < lo) lo = nd.value;
      if (nd.value > hi) hi = nd.value;
    }
    return niceScale(lo, hi);
  }, [nodes]);

  const x = (v) => M.left + ((v - scale.lo) / (scale.hi - scale.lo || 1)) * iw;
  const x0 = x(0);
  const y = (i) => M.top + (ih - used) / 2 + i * rowH;

  return (
    <>
      <svg width={width} height={height} role="img" aria-label={`Kontribusi ${measure.label}`}>
        <line x1={x0} x2={x0} y1={M.top} y2={M.top + ih} stroke="var(--ink-300)" strokeWidth="1" />

        {nodes.map((nd, i) => {
          const neg = nd.value < 0;
          const bw = Math.max(1.5, Math.abs(x(nd.value) - x0));
          const top = y(i) + rowH * 0.22;
          const bh = rowH * 0.56;
          const dim = at != null && at !== i;
          return (
            <g
              key={nd.label}
              onMouseEnter={() => setAt(i)}
              onMouseLeave={() => setAt((k) => (k === i ? null : k))}
            >
              <rect
                x={0}
                y={y(i)}
                width={width}
                height={rowH}
                fill={at === i ? "var(--brand-50)" : "transparent"}
              />
              <text
                x={M.left - 12}
                y={y(i) + rowH / 2 + 3.5}
                textAnchor="end"
                fontSize="11"
                fill={at === i ? "var(--brand-700)" : "var(--ink-700)"}
              >
                {clip(nd.label, 20)}
              </text>
              <rect
                x={neg ? x0 - bw : x0}
                y={top}
                width={bw}
                height={bh}
                rx="2"
                fill={compare ? (neg ? "var(--neg)" : "var(--pos)") : "var(--brand-700)"}
                opacity={dim ? 0.38 : 1}
                style={{ transition: "opacity .18s ease" }}
              />
              <text
                x={width - 12}
                y={y(i) + rowH / 2 + 3.5}
                textAnchor="end"
                fontSize="11"
                fill={compare ? (neg ? "var(--neg)" : "var(--pos)") : "var(--ink-900)"}
              >
                {compare && nd.value > 0 ? "+" : ""}
                {fmt(nd.value, measure.format, true)}
              </text>
            </g>
          );
        })}
      </svg>

      {at != null && nodes[at] && (
        <ChartTip x={Math.min(x(nodes[at].value), width - 180)} y={y(at) + rowH} width={width}>
          <div className="font-medium text-[var(--ink-900)]">{nodes[at].label}</div>
          {compare ? (
            <>
              <TipRow name="P1" value={fmt(nodes[at].p1, measure.format, true)} />
              <TipRow name="P2" value={fmt(nodes[at].p2, measure.format, true)} muted />
              <TipRow
                name="Selisih"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Signed v={nodes[at].value} format={measure.format} />
                    <Delta g={nodes[at].pct} p1={nodes[at].p1} p2={nodes[at].p2} size="xs" />
                  </span>
                }
              />
            </>
          ) : (
            <TipRow name={measure.label} value={fmt(nodes[at].value, measure.format, true)} />
          )}
        </ChartTip>
      )}
    </>
  );
}

/* --- jembatan: dari total P2 ke total P1 -------------------------------- */

function BridgeChart({ steps, startVal, endVal, measure, width, height }) {
  const [at, setAt] = useState(null);

  const M = { top: 16, right: 16, bottom: 34, left: 74 };
  const iw = Math.max(60, width - M.left - M.right);
  const ih = Math.max(60, height - M.top - M.bottom);

  const cols = useMemo(() => {
    const out = [{ label: "Total P2", kind: "total", from: 0, to: startVal, value: startVal }];
    let run = startVal;
    for (const s of steps) {
      out.push({ label: s.label, kind: "step", from: run, to: run + s.value, value: s.value });
      run += s.value;
    }
    out.push({ label: "Total P1", kind: "total", from: 0, to: endVal, value: endVal });
    return out;
  }, [steps, startVal, endVal]);

  const scale = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const c of cols) {
      lo = Math.min(lo, c.from, c.to);
      hi = Math.max(hi, c.from, c.to);
    }
    return niceScale(lo, hi);
  }, [cols]);

  const band = iw / cols.length;
  const bw = Math.max(6, band * 0.58);
  const cx0 = (i) => M.left + band * (i + 0.5);
  const py = (v) => M.top + ih - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * ih;

  return (
    <>
      <svg width={width} height={height} role="img" aria-label="Jembatan selisih">
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + iw} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth="1" />
            <text x={M.left - 10} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill={AXIS}>
              {fmt(t, measure.format, true)}
            </text>
          </g>
        ))}

        {cols.map((c, i) => {
          if (i === cols.length - 1) return null;
          const yTo = py(c.to);
          return (
            <line
              key={`c${i}`}
              x1={cx0(i) - bw / 2}
              x2={cx0(i + 1) + bw / 2}
              y1={yTo}
              y2={yTo}
              stroke="var(--ink-300)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          );
        })}

        {cols.map((c, i) => {
          const yA = py(c.from);
          const yB = py(c.to);
          const neg = c.kind === "step" && c.value < 0;
          const fill =
            c.kind === "total"
              ? i === 0
                ? "var(--p2)"
                : "var(--brand-700)"
              : neg
              ? "var(--neg)"
              : "var(--pos)";
          return (
            <g
              key={c.label + i}
              onMouseEnter={() => setAt(i)}
              onMouseLeave={() => setAt((k) => (k === i ? null : k))}
            >
              <rect
                x={cx0(i) - bw / 2}
                y={Math.min(yA, yB)}
                width={bw}
                height={Math.max(2, Math.abs(yB - yA))}
                rx="2"
                fill={fill}
                opacity={at == null || at === i ? 1 : 0.42}
                style={{ transition: "opacity .18s ease" }}
              />
              <text
                x={cx0(i)}
                y={height - 20}
                textAnchor="middle"
                fontSize="10"
                fill={at === i ? "var(--brand-700)" : AXIS}
              >
                {clip(c.label, Math.max(4, Math.floor(band / 6.6)))}
              </text>
              <text
                x={cx0(i)}
                y={height - 7}
                textAnchor="middle"
                fontSize="10"
                fill={c.kind === "total" ? "var(--ink-600)" : neg ? "var(--neg)" : "var(--pos)"}
              >
                {c.kind === "step" && c.value > 0 ? "+" : ""}
                {fmt(c.value, measure.format, true)}
              </text>
            </g>
          );
        })}
      </svg>

      {at != null && cols[at] && (
        <ChartTip x={cx0(at)} y={py(Math.max(cols[at].from, cols[at].to))} width={width}>
          <div className="font-medium text-[var(--ink-900)]">{cols[at].label}</div>
          <TipRow
            name={cols[at].kind === "total" ? measure.label : "Sumbangan"}
            value={cols[at].kind === "total" ? fmt(cols[at].value, measure.format, true) : <Signed v={cols[at].value} format={measure.format} />}
          />
          {cols[at].kind === "step" && startVal !== 0 && (
            <TipRow name="Dari total P2" value={<Delta g={cols[at].value / startVal} size="xs" />} muted />
          )}
        </ChartTip>
      )}
    </>
  );
}

/* --- panel: pemilih grafik, granularitas, dan dimensi -------------------- */

export function ChartPanel({
  rows,
  measure,
  compare,
  p1,
  dimensions,
  trailText,
  open,
  onToggle,
}) {
  const [kind, setKind] = useState("line");
  const [granPick, setGranPick] = useState("auto");
  const [dim, setDim] = useState(dimensions[0]);
  const [showAll, setShowAll] = useState(false);

  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const height = 212;

  const range1 = compare ? compare.p1 : { from: p1.from, to: p1.to };
  const range2 = compare ? compare.p2 : null;
  const span = daysBetween(range1.from, range1.to);

  // Harian hanya untuk rentang pendek; lebih dari dua bulan titik harian terlalu
  // bergerigi untuk dibaca, jadi otomatis pindah ke mingguan lalu bulanan.
  const autoGran = span <= 62 ? "day" : span <= 400 ? "week" : "month";
  let gran = granPick === "auto" ? autoGran : granPick;
  if (gran === "day" && span > 1500) gran = "week"; // jaga-jaga, bukan batas keras

  const kinds = CHART_KINDS.filter((k) => !k.cmpOnly || compare);
  const activeKind = kinds.some((k) => k.key === kind) ? kind : "line";
  const isTime = activeKind === "line" || activeKind === "cumulative" || activeKind === "bar";
  const needsDim = activeKind === "contribution" || activeKind === "bridge";

  /* --- deret waktu, kedua periode disejajarkan per nomor ember --- */
  const timeData = useMemo(() => {
    if (!range1.from || !range1.to) return null;
    const n = Math.max(bucketCount(range1, gran), range2 ? bucketCount(range2, gran) : 0);
    if (!n) return null;

    const a = new Array(n).fill(0);
    const b = range2 ? new Array(n).fill(0) : null;

    for (const row of rows) {
      const d = row.__d;
      if (!d) continue;
      const v = Number(row[measure.field]) || 0;
      if (inRange(d, range1)) {
        const i = bucketIndex(d, range1, gran);
        if (i >= 0 && i < n) a[i] += v;
      }
      if (b && inRange(d, range2)) {
        const i = bucketIndex(d, range2, gran);
        if (i >= 0 && i < n) b[i] += v;
      }
    }

    const labels = Array.from({ length: n }, (_, i) => bucketStart(range1, gran, i));
    return { a, b, labels, gran, range1, range2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, measure.field, gran, range1.from, range1.to, range2?.from, range2?.to]);

  /* Bawaannya 10 teratas (jembatan: 7) dan sisanya dilebur "n lainnya";
     tombol "Tampilkan semua" membuka setiap anggota satu per satu. */
  const dimLimit = activeKind === "bridge" ? 7 : 10;
  const dimAll = useMemo(
    () => (needsDim ? aggregate(rows, dim, measure.field, compare) : null),
    [rows, dim, measure.field, compare, needsDim]
  );
  const canShowAll = !!dimAll && dimAll.length > dimLimit + 1;
  const dimNodes = useMemo(() => {
    if (!dimAll) return null;
    return showAll && canShowAll ? dimAll : topWithRest(dimAll, dimLimit);
  }, [dimAll, showAll, canShowAll, dimLimit]);
  // Semua anggota → grafik batang memanjang ke bawah, jembatan melebar (bisa digeser).
  const dimHeight = Math.max(height, (dimNodes?.length || 0) * 22 + 12);
  const bridgeWidth = Math.max(width, ((dimNodes?.length || 0) + 2) * 58 + 90);

  const totals = useMemo(
    () => totalsOf(rows, measure.field, compare),
    [rows, measure.field, compare]
  );

  const spark = open ? null : timeData;

  const legend = compare ? (
    isTime ? (
      <span className={cx("flex items-center gap-3 text-[11px]", MUTED)}>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--brand-700)]" />P1
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-[var(--p2)]" />P2
        </span>
      </span>
    ) : (
      <span className={cx("flex items-center gap-3 text-[11px]", MUTED)}>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--pos)]" />naik
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--neg)]" />turun
        </span>
      </span>
    )
  ) : null;

  const empty = isTime ? !timeData : !dimNodes || !dimNodes.length;

  return (
    <section className="border-b border-[var(--ink-200)] bg-[var(--paper)]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <button
          className={cx(BTN_QUIET, "flex items-center gap-1.5 font-medium")}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
        >
          <svg
            className={cx("h-2.5 w-2.5 transition-transform duration-200", !open && "-rotate-90")}
            viewBox="0 0 10 6"
            fill="none"
            aria-hidden="true"
          >
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Grafik
        </button>

        <select
          className={SELECT}
          value={activeKind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Jenis grafik"
        >
          {kinds.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>

        {isTime && (
          <select
            className={SELECT}
            value={granPick}
            onChange={(e) => setGranPick(e.target.value)}
            aria-label="Rentang tiap titik"
          >
            {GRANS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key === "auto" ? `Otomatis, ${GRAN_WORD[autoGran]}` : g.label}
              </option>
            ))}
          </select>
        )}

        {needsDim && (
          <select
            className={SELECT}
            value={dim}
            onChange={(e) => setDim(e.target.value)}
            aria-label="Dimensi yang dipecah"
          >
            {dimensions.map((d) => (
              <option key={d} value={d}>
                {labelOf(d)}
              </option>
            ))}
          </select>
        )}

        {open && legend}

        {open && needsDim && canShowAll && (
          <ShowAll total={dimAll.length} limit={dimLimit} open={showAll} onToggle={() => setShowAll((v) => !v)} noun={labelOf(dim).toLowerCase()} />
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className={cx("text-[11px]", MUTED)}>{trailText}</span>
          {spark && <Sparkline a={spark.a} b={spark.b} />}
        </div>
      </div>

      {open && (
        <div className="relative pb-2" ref={wrapRef}>
          {empty ? (
            <div className={cx("px-3 py-10 text-center text-xs", MUTED)}>
              Tidak ada baris pada rentang ini.
            </div>
          ) : isTime ? (
            <TimeChart
              data={timeData}
              measure={measure}
              compare={compare}
              kind={activeKind}
              width={width}
              height={height}
            />
          ) : activeKind === "contribution" ? (
            <DimChart
              nodes={dimNodes}
              measure={measure}
              compare={compare}
              width={width}
              height={dimHeight}
            />
          ) : (
            <div className="dt-scroll relative overflow-x-auto">
              <BridgeChart
                steps={dimNodes}
                startVal={totals.p2 || 0}
                endVal={totals.p1 || 0}
                measure={measure}
                width={bridgeWidth}
                height={height}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
