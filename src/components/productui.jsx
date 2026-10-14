/* ============================================================================
   Komponen bersama halaman produk dan eksplorasi
   ----------------------------------------------------------------------------
   Kartu bagian, catatan, lencana tahap/rekomendasi, pita konteks analisis
   (tingkat, jendela, garis waktu data, peringatan), panel kriteria,
   pemilih produk, kotak keterangan grafik, dan ubin angka.
   ========================================================================== */

import React, { useState, useMemo, useRef, useCallback, useContext, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

import { CRITERIA_DEFAULTS, WINDOW_OPTIONS, activeUnits, hasCol } from "../lib/config.js";
import { ACTION_BY_KEY, PATTERNS, STAGE_BY_KEY } from "../lib/color.js";
import { dLabel, daysBetween, fmt, toJs } from "../lib/format.js";
import { useClickOutside } from "../lib/hooks.js";
import {
  BTN,
  BTN_QUIET,
  CARD,
  FOCUS,
  LINE,
  MENU,
  MENU_ITEM,
  MUTED,
  ROOT_CLASS,
  ROOT_FONT,
  SELECT,
  TONES,
  cx,
} from "../lib/theme.jsx";
import { GlossaryDrawer, InfoButton } from "./glossary.jsx";
import { IconAlert, IconInfo, IconSliders } from "./icons.jsx";
import { Delta } from "./delta.jsx";
import { Tip } from "./tip.jsx";
import { LiveControls } from "./busy.jsx";

const dateText = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");

/* ------------------------------------------------------------------ bagian */

/**
 * Kartu bagian dengan judul, keterangan, ikon bertinta, dan aksi di kanan.
 * `tone` menentukan warna ikon: brand · teal · blue · amber · red · violet · mauve.
 */
export function Section({ title, sub, actions, children, className, bodyClass, id, icon: Icon, tone = "brand" }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <section className={cx(CARD, "dt-shadow min-w-0", className)} id={id}>
      {(title || actions) && (
        // Judul kartu berlatar warna nadanya. Sudut atas mengikuti kartu
        // (12px − 1px garis) supaya latarnya tidak menembus tepi membulat.
        <header
          className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-t-[11px] border-b px-4 py-3"
          style={{ background: t.head, borderColor: t.line }}
        >
          {/* Ikon + judul satu blok dengan lebar dasar 18rem: di kartu sempit (ponsel)
              tombol aksi turun ke baris berikutnya, bukan menjepit keterangan jadi sekata per baris. */}
          <div className={cx("flex min-w-0 items-start gap-3", title || sub || Icon ? "flex-[1_1_18rem]" : "flex-1")}>
            {Icon && (
              <span
                className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-[var(--paper)]"
                style={{ color: t.ink, boxShadow: `inset 0 0 0 1px ${t.line}, 0 1px 2px rgba(36,26,31,.06)` }}
                aria-hidden="true"
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
            )}
            <div className="min-w-0 flex-1 self-center">
              {title && <h2 className="text-[14px] font-semibold leading-snug text-[var(--ink-900)]">{title}</h2>}
              {sub && <p className="mt-0.5 max-w-[82ch] text-[12px] leading-snug text-[var(--ink-600)]">{sub}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 self-center">{actions}</div>}
        </header>
      )}
      <div className={cx("min-w-0", bodyClass ?? "p-4")}>{children}</div>
    </section>
  );
}

const NOTICE_TONE = { info: TONES.blue, warn: TONES.amber, danger: TONES.red, neutral: TONES.mauve };

/** Kotak catatan. tone: info | warn | danger | neutral */
export function Notice({ tone = "info", title, children, className, action }) {
  const t = NOTICE_TONE[tone] || TONES.blue;
  const Icon = tone === "info" || tone === "neutral" ? IconInfo : IconAlert;
  return (
    <div
      className={cx("flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-800)]", className)}
      style={{ background: t.tint, borderColor: t.line }}
    >
      <span className="mt-[2px] flex-none" style={{ color: t.ink }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {title && (
          <div className="mb-0.5 font-semibold" style={{ color: t.ink }}>
            {title}
          </div>
        )}
        {children}
      </div>
      {action && <div className="flex-none self-center">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- lencana  */

/** Titik penanda. `hollow` = cincin kosong, penanda kedua untuk "tidak aktif". */
export function Dot({ color, hollow, size = 8, className }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block flex-none rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: hollow ? "transparent" : color,
        boxShadow: hollow ? `inset 0 0 0 1.5px ${color === "#cfc2c8" ? "#a8949c" : color}` : undefined,
      }}
    />
  );
}

/** Tahap: pil bertinta, teks tetap tinta (warna hanya di titik dan latar). */
export function StageBadge({ stage, className }) {
  const s = STAGE_BY_KEY[stage];
  if (!s) return null;
  const t = TONES[s.tone] || TONES.mauve;
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium text-[var(--ink-800)]", className)}
      style={{ background: t.tint }}
      title={s.hint}
    >
      <Dot color={s.color} hollow={s.hollow} size={7} />
      {s.label}
    </span>
  );
}

export function ActionBadge({ action, size = "sm", className }) {
  const a = ACTION_BY_KEY[action];
  if (!a) return null;
  const t = TONES[a.tone] || TONES.mauve;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium text-[var(--ink-900)]",
        size === "lg" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[11px]",
        className
      )}
      style={{ background: t.tint, borderColor: t.line }}
      title={a.hint}
    >
      <Dot color={a.color} hollow={a.hollow} size={size === "lg" ? 10 : 8} />
      {a.label}
    </span>
  );
}

export function PatternText({ pattern, className }) {
  const p = PATTERNS[pattern];
  if (!p) return null;
  return (
    <span
      className={cx("whitespace-nowrap text-xs text-[var(--ink-600)] underline decoration-dotted decoration-[var(--ink-300)] underline-offset-2", className)}
      title={p.hint}
    >
      {p.label}
    </span>
  );
}

export function AbcBadge({ abc }) {
  const tone =
    abc === "A"
      ? "bg-[var(--brand-700)] text-white"
      : abc === "B"
      ? "bg-[var(--brand-200)] text-[var(--brand-900)]"
      : "bg-[var(--ink-100)] text-[var(--ink-600)]";
  return (
    <span className={cx("inline-grid h-5 w-5 place-items-center rounded text-[10.5px] font-semibold", tone)} title={`Kelas ${abc}`}>
      {abc}
    </span>
  );
}

/* ---------------------------------------------------------- kontrol kecil */

/** Kontrol pilihan bersebelahan (pengganti tombol radio). */
export function Segmented({ options, value, onChange, label, size = "sm" }) {
  // Panah kiri/kanan berpindah pilihan, seperti grup radio biasa; Tab hanya
  // berhenti di pilihan yang aktif (roving tabindex).
  const anyOn = options.some((o) => o.key === value && !o.disabled);
  const firstEnabled = options.findIndex((o) => !o.disabled);
  const onKeyDown = (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const idx = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!idx.length) return;
    const cur = Math.max(0, idx.indexOf(options.findIndex((o) => o.key === value)));
    const nextI = idx[(cur + d + idx.length) % idx.length];
    onChange(options[nextI].key);
    const group = e.currentTarget;
    requestAnimationFrame(() => group.querySelector(`[data-i="${nextI}"]`)?.focus());
  };
  return (
    <div className={cx("inline-flex flex-wrap rounded-lg border bg-[var(--ink-50)] p-0.5", LINE)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            title={o.hint}
            data-i={i}
            tabIndex={on || (!anyOn && i === firstEnabled) ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={cx(
              "rounded-md px-2.5 transition-colors disabled:cursor-default disabled:opacity-40",
              size === "xs" ? "py-0.5 text-[11px]" : "py-1 text-xs",
              FOCUS,
              on
                ? "bg-[var(--paper)] font-semibold text-[var(--brand-700)] shadow-[0_0_0_1px_var(--brand-200),0_1px_2px_rgba(36,26,31,.08)]"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Label kecil + kontrol, dipakai di bilah pengaturan halaman eksplorasi.
 * Untuk satu kontrol bawaan (select/input) dipakai <label> supaya label
 * bisa diklik. Untuk kontrol tombol (Segmented) dipakai grup ber-aria-label:
 * <label> yang membungkus tombol akan "meminjamkan" teksnya ke tombol
 * pertama dan mengekliknya saat label diklik — membingungkan pembaca layar.
 */
export function Field({ label, tip, children, className }) {
  const kids = React.Children.toArray(children);
  const native =
    kids.length === 1 && typeof kids[0].type === "string" && ["select", "input", "textarea"].includes(kids[0].type);
  const Tag = native ? "label" : "div";
  const groupProps = native ? {} : { role: "group", "aria-label": typeof label === "string" ? label : undefined };
  // `tip` = penjelasan singkat label saat kursor diarahkan ke sana. Tidak ikut
  // urutan Tab: isinya pelengkap, kontrolnya sendiri tetap berlabel jelas.
  return (
    <Tag className={cx("flex items-center gap-2", className)} {...groupProps}>
      <span className={cx("text-[11.5px]", MUTED)}>
        {tip ? (
          <Tip tip={tip} focusable={false}>
            {label}
          </Tip>
        ) : (
          label
        )}
      </span>
      {children}
    </Tag>
  );
}

/** Chip penyaring aktif dengan tombol hapus. */
export function FilterChip({ children, onClear, color, hollow }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-200)] bg-[var(--brand-50)] py-0.5 pl-2.5 pr-1 text-[11.5px] text-[var(--brand-800)]">
      {color && <Dot color={color} hollow={hollow} size={7} />}
      {children}
      <button
        type="button"
        onClick={onClear}
        className={cx("grid h-4 w-4 place-items-center rounded-full text-[var(--brand-600)] hover:bg-[var(--brand-100)]", FOCUS)}
        aria-label="Hapus penyaring"
      >
        <svg className="h-2 w-2" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

/* ------------------------------------------------------------- keterangan */

/**
 * Kotak keterangan grafik. Diletakkan di dalam wadah `relative`, dibalik
 * ke kiri/atas kalau mepet tepi supaya tidak terpotong.
 */
export function ChartTip({ x, y, width, height, children, w = 196 }) {
  const flipX = x + w + 18 > width;
  const left = flipX ? Math.max(4, x - w - 12) : x + 14;
  const top = Math.max(4, Math.min(y - 12, (height || 9999) - 40));
  return (
    <div
      className="dt-shadow-pop pointer-events-none absolute z-20 rounded-lg border border-[var(--ink-200)] bg-[var(--paper)] px-2.5 py-2 text-[11px] leading-snug"
      style={{ left, top, width: w }}
      role="status"
    >
      {children}
    </div>
  );
}

/** Baris di dalam keterangan: nilai tebal, nama tipis (nilai dulu yang dicari pembaca). */
export function TipRow({ name, value, swatch, dashed, tone }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[var(--ink-500)]">
        {swatch && <span className="inline-block h-0 w-3" style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${swatch}` }} />}
        {name}
      </span>
      <span className={cx("font-semibold", tone === "pos" ? "text-[var(--pos)]" : tone === "neg" ? "text-[var(--neg)]" : "text-[var(--ink-900)]")}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------- garis waktu jendela    */

/**
 * Garis waktu: seluruh rentang data (abu), P2 (biru), P1 (anggur), dan
 * bagian periode yang jatuh di luar data (arsir merah). Membuat jelas kenapa
 * sebuah perbandingan tidak setara — mis. P2 yang sebagian besar sebelum
 * data dimulai.
 */
function DataTimeline({ win }) {
  const { p1, p2, dataFrom, dataTo } = win;
  if (!dataFrom || !dataTo) return null;
  const lo = [dataFrom, p2.from, p1.from].sort()[0];
  const hi = [dataTo, p2.to, p1.to].sort().slice(-1)[0];
  const span = Math.max(1, daysBetween(lo, hi));
  const pos = (iso) => ((daysBetween(lo, iso) - 1) / span) * 100;
  const seg = (from, to) => ({ left: `${pos(from)}%`, width: `${Math.max(0.6, ((daysBetween(from, to)) / span) * 100)}%` });
  const outside = [];
  for (const r of [p1, p2]) {
    if (r.from < dataFrom) outside.push(seg(r.from, r.to < dataFrom ? r.to : dataFrom));
    if (r.to > dataTo) outside.push(seg(r.from > dataTo ? r.from : dataTo, r.to));
  }
  return (
    <div className="min-w-[260px] max-w-[760px] flex-1" aria-hidden="true">
      <div className="relative h-[14px]">
        <span className="absolute inset-y-[4px] rounded-full bg-[var(--ink-200)]" style={seg(dataFrom, dataTo)} />
        <span className="absolute inset-y-[2px] rounded-[3px] bg-[var(--p2)]" style={seg(p2.from, p2.to)} />
        <span className="absolute inset-y-[1px] rounded-[3px] bg-[var(--brand-700)]" style={seg(p1.from, p1.to)} />
        {outside.map((s, i) => (
          <span key={i} className="dt-hatch absolute inset-y-0 rounded-[3px] bg-[var(--paper)] ring-1 ring-[var(--red-500)]" style={s} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10.5px] text-[var(--ink-500)]">
        <span>data mulai {dateText(dataFrom)}</span>
        <span>data sampai {dateText(dataTo)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- pita konteks     */

/**
 * Pengaturan bersama halaman produk dan eksplorasi: tingkat analisis,
 * jendela waktu, garis waktu data, peringatan, Keterangan, dan Kriteria.
 * Keadaannya disimpan di App, jadi berpindah halaman tidak mengulang
 * pengaturan.
 *
 * glossary — opsional { open, setOpen, tab, setTab, onPickCell, focus } kalau
 *            halaman ingin mengendalikan panel Keterangan sendiri. `focus` =
 *            produk yang sedang dibuka, untuk hitungan skor satu per satu.
 * note     — opsional, satu baris keterangan kegunaan pengaturan di bilah ini.
 */
export function WindowBar({
  unitKey,
  setUnitKey,
  winMode,
  setWinMode,
  win,
  crit,
  setCrit,
  showUnit = true,
  extra,
  portfolio,
  onMatchLength,
  glossary,
  note,
}) {
  const [open, setOpen] = useState(false);
  const [gOpen, setGOpen] = useState(false);
  const [gTab, setGTab] = useState("tahap");
  const btnRef = useRef(null);
  // Pilihan di kontrol mengikuti nilai LANGSUNG (lihat busy.jsx): selagi isi
  // halaman masih menghitung dengan pilihan lama, kontrolnya sudah berganti.
  const liveCtl = useContext(LiveControls);
  const unitShown = liveCtl?.unitKey ?? unitKey;
  const winShown = liveCtl?.winMode ?? winMode;
  const critShown = liveCtl && crit ? liveCtl.crit : crit;
  const changed = critShown && JSON.stringify(critShown) !== JSON.stringify(CRITERIA_DEFAULTS);
  const units = activeUnits();

  const G = glossary || { open: gOpen, setOpen: setGOpen, tab: gTab, setTab: setGTab };
  const fixable = (w) => (w.key === "cover2" || w.key === "cover1") && win.fitMonths && String(win.fitMonths) !== String(winMode);

  return (
    <div className={cx("border-b bg-[var(--paper)]", LINE)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 pb-2 pt-2.5">
        {showUnit && units.length > 0 && (
          <Field label="Tingkat">
            <select className={SELECT} value={unitShown} onChange={(e) => setUnitKey(e.target.value)}>
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Jendela">
          <select className={SELECT} value={winShown} onChange={(e) => setWinMode(e.target.value)}>
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-700)] px-2.5 py-0.5 font-medium text-white">
            P1 {dateText(win.p1.from)} – {dateText(win.p1.to)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--blue-100)] px-2.5 py-0.5 font-medium text-[var(--blue-700)]">
            P2 {dateText(win.p2.from)} – {dateText(win.p2.to)}
          </span>
          <span
            className="text-[var(--ink-600)]"
            title="Tanggal acuan mengikuti tanggal akhir Periode di bilah atas. Transaksi setelah tanggal ini tidak ikut dihitung."
          >
            dinilai per <b className="font-semibold text-[var(--ink-900)]">{dateText(win.asOf)}</b>
          </span>
        </div>

      </div>

      {note && (
        <p className="flex max-w-[110ch] items-start gap-1.5 px-4 pb-2 text-[11.5px] leading-snug text-[var(--ink-600)]">
          <IconInfo className="mt-px h-3.5 w-3.5 flex-none text-[var(--ink-400)]" />
          <span>{note}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2.5">
        <DataTimeline win={win} />
        <div className="ml-auto flex items-center gap-2">
          {extra}
          <InfoButton
            onClick={() => {
              G.setTab?.("tahap");
              G.setOpen(true);
            }}
          />
          {setCrit && (
            <button
              ref={btnRef}
              type="button"
              className={cx(BTN, "flex items-center gap-1.5", changed && "border-[var(--brand-400)] text-[var(--brand-700)]")}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              data-dt-crit=""
            >
              <IconSliders className="h-4 w-4" />
              Kriteria{changed ? " (diubah)" : ""}
            </button>
          )}
        </div>
      </div>

      {win.warnings?.length > 0 && (
        <div className="space-y-1.5 px-4 pb-2.5">
          {win.warnings.map((w) => (
            <Notice
              key={w.key}
              tone={w.level === "warn" ? "warn" : "info"}
              className="py-2"
              action={
                fixable(w) ? (
                  <button type="button" className={BTN} onClick={() => setWinMode(String(win.fitMonths))}>
                    Pakai jendela {win.fitMonths} bulan
                  </button>
                ) : w.key === "length" && onMatchLength ? (
                  <button type="button" className={BTN} onClick={onMatchLength}>
                    Samakan panjang P2
                  </button>
                ) : null
              }
            >
              {w.text}
            </Notice>
          ))}
        </div>
      )}

      {open && setCrit && <CriteriaPanel anchor={btnRef.current} crit={critShown} setCrit={setCrit} onClose={() => setOpen(false)} />}

      <GlossaryDrawer
        open={G.open}
        tab={G.tab}
        setTab={G.setTab}
        onClose={() => G.setOpen(false)}
        crit={crit || CRITERIA_DEFAULTS}
        win={win}
        units={portfolio?.units}
        unitPlural={portfolio?.unitDef?.plural}
        onPickCell={glossary?.onPickCell}
        focus={glossary?.focus}
        weights={portfolio?.weights}
      />
    </div>
  );
}

/* ------------------------------------------------------- panel kriteria   */

export function NumberField({ label, hint, value, onChange, min, max, step = 1, suffix }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-xs text-[var(--ink-800)]">{label}</span>
        {hint && <span className={cx("block text-[10.5px] leading-snug", MUTED)}>{hint}</span>}
      </span>
      <span className="flex flex-none items-center gap-1">
        <input
          type="number"
          className={cx(
            "w-16 rounded-md border bg-[var(--ink-50)] px-2 py-1 text-right text-xs text-[var(--ink-900)] focus:border-[var(--brand-400)] focus:bg-[var(--paper)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
            LINE
          )}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
        {suffix && <span className={cx("w-8 text-[11px]", MUTED)}>{suffix}</span>}
      </span>
    </label>
  );
}

const WEIGHT_LABELS = {
  contrib: ["Kontribusi", "Besarnya pendapatan P1"],
  trend: ["Tren", "Pertumbuhan P1 dibanding P2"],
  reach: ["Jangkauan", "Jumlah cabang yang menjual"],
  consistency: ["Konsistensi", "Bulan berpenjualan dari 12 terakhir"],
  recency: ["Kebaruan", "Seberapa baru penjualan terakhir"],
};

export function CriteriaPanel({ anchor, crit: critIn, setCrit, onClose }) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);
  const crit = { ...CRITERIA_DEFAULTS, ...critIn, weights: { ...CRITERIA_DEFAULTS.weights, ...(critIn?.weights || {}) } };

  useLayoutEffect(() => {
    if (!anchor || !boxRef.current) return;
    const a = anchor.getBoundingClientRect();
    const w = boxRef.current.offsetWidth;
    const h = boxRef.current.offsetHeight;
    let left = Math.min(a.right - w, window.innerWidth - w - 12);
    left = Math.max(12, left);
    let top = a.bottom + 8;
    if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
    setPos({ left, top });
  }, [anchor]);

  useClickOutside(boxRef, onClose, true, "[data-dt-crit]");

  const set = (k, v) => setCrit((c) => ({ ...CRITERIA_DEFAULTS, ...c, [k]: v }));
  const setW = (k, v) => setCrit((c) => ({ ...CRITERIA_DEFAULTS, ...c, weights: { ...CRITERIA_DEFAULTS.weights, ...c.weights, [k]: v } }));

  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div
        ref={boxRef}
        className={cx(MENU, "dt-pop dt-scroll fixed z-[9999] max-h-[82vh] w-[360px] overflow-auto p-0")}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
        role="dialog"
        aria-label="Kriteria penilaian produk"
      >
        <div className={cx("border-b px-4 py-3", LINE)}>
          <div className="text-[13px] font-semibold text-[var(--ink-900)]">Kriteria penilaian</div>
          <p className={cx("mt-0.5 text-[11px] leading-snug", MUTED)}>
            Tahap, rekomendasi, skor, dan isi Keterangan dihitung ulang seketika. Sesuaikan dengan karakter bisnismu.
          </p>
        </div>

        <div className="px-4 py-2">
          <div className="pb-1 pt-1 text-[11px] font-semibold text-[var(--ink-700)]">Tahap siklus hidup</div>
          <NumberField
            label="Ambang tumbuh / menurun"
            hint="Perubahan P1 vs P2 di atas ini dianggap tumbuh atau menurun"
            value={Math.round(crit.growth * 100)}
            onChange={(v) => set("growth", v / 100)}
            min={1}
            max={100}
            suffix="%"
          />
          <NumberField
            label="Produk baru"
            hint="Pertama terjual dalam jangka ini"
            value={crit.newMonths}
            onChange={(v) => set("newMonths", v)}
            min={1}
            max={36}
            suffix="bulan"
          />
          <NumberField
            label="Tidak aktif"
            hint="Tidak terjual lebih lama dari ini"
            value={crit.dormantDays}
            onChange={(v) => {
              set("dormantDays", v);
              if (v > crit.cleanDays) set("cleanDays", v);
            }}
            min={14}
            max={720}
            suffix="hari"
          />

          <div className="pb-1 pt-3 text-[11px] font-semibold text-[var(--ink-700)]">Rekomendasi</div>
          <NumberField
            label="Bersihkan dari katalog"
            hint="Tidak terjual lebih lama dari ini"
            value={crit.cleanDays}
            onChange={(v) => set("cleanDays", Math.max(v, crit.dormantDays))}
            min={30}
            max={1460}
            suffix="hari"
          />
          <NumberField
            label="Minimal transaksi"
            hint="Di bawah ini (P1 + P2), datanya dianggap tipis"
            value={crit.minTx}
            onChange={(v) => set("minTx", v)}
            min={1}
            max={100}
          />
          <NumberField
            label="Umur data tipis"
            hint="Data tipis + kelas C + lebih tua dari ini → kandidat dicabut"
            value={crit.thinAgeMonths}
            onChange={(v) => set("thinAgeMonths", v)}
            min={1}
            max={60}
            suffix="bulan"
          />
          <NumberField
            label="Tenggang produk borongan"
            hint="Produk borongan yang terjual dalam jangka ini hanya dipantau"
            value={crit.projectGraceDays}
            onChange={(v) => set("projectGraceDays", v)}
            min={14}
            max={720}
            suffix="hari"
          />

          <div className="pb-1 pt-3 text-[11px] font-semibold text-[var(--ink-700)]">Kelas ABC</div>
          <NumberField
            label="Batas kelas A"
            hint="Produk teratas yang menyusun porsi ini"
            value={Math.round(crit.abcA * 100)}
            onChange={(v) => set("abcA", Math.min(v / 100, crit.abcB - 0.01))}
            min={10}
            max={98}
            suffix="%"
          />
          <NumberField
            label="Batas kelas B"
            value={Math.round(crit.abcB * 100)}
            onChange={(v) => set("abcB", Math.max(v / 100, crit.abcA + 0.01))}
            min={20}
            max={99}
            suffix="%"
          />

          <div className="pb-1 pt-3 text-[11px] font-semibold text-[var(--ink-700)]">Bobot skor kesehatan</div>
          {Object.keys(WEIGHT_LABELS).map((k) => (
            <NumberField
              key={k}
              label={WEIGHT_LABELS[k][0]}
              hint={k === "reach" && !hasCol("Branch") ? "Tidak dipakai: data tanpa kolom cabang" : WEIGHT_LABELS[k][1]}
              value={crit.weights[k]}
              onChange={(v) => setW(k, v)}
              min={0}
              max={100}
            />
          ))}
        </div>

        <div className={cx("flex justify-between border-t px-4 py-2.5", LINE)}>
          <button type="button" className={BTN_QUIET} onClick={() => setCrit(CRITERIA_DEFAULTS)}>
            Kembalikan bawaan
          </button>
          <button type="button" className={BTN} onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* --------------------------------------------------------- pemilih produk */

/**
 * Kotak cari produk dengan saran. Panah atas/bawah memilih, Enter membuka,
 * Esc menutup. Diurut dari pendapatan P1 terbesar.
 */
export function ProductPicker({ units, value, onPick, placeholder = "Cari produk…", autoFocus }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  // Fokus otomatis saat halaman dibuka tidak langsung membuka daftar, supaya
  // daftar tidak menutupi isi halaman. Daftar terbuka begitu kotak diklik
  // atau diketik.
  const skipOpen = useRef(!!autoFocus);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(boxRef, close, open);

  const [all, setAll] = useState(false);
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? units.filter((u) => u.label.toLowerCase().includes(needle) || String(u.key).toLowerCase().includes(needle)) : units;
  }, [units, q]);
  const PICK_LIMIT = 40;
  const matches = all ? found : found.slice(0, PICK_LIMIT);

  useEffect(() => setHi(0), [q]);

  const pick = (u) => {
    onPick(u.key);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-[520px]" ref={boxRef}>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-400)]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className={cx(
            "w-full rounded-lg border bg-[var(--paper)] py-2 pl-9 pr-3 text-[13px] text-[var(--ink-900)] transition-colors placeholder:text-[var(--ink-400)] hover:border-[var(--brand-300)] focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
            LINE
          )}
          value={q}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onFocus={() => {
            if (skipOpen.current) {
              skipOpen.current = false;
              return;
            }
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHi((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && matches[hi]) {
              e.preventDefault();
              pick(matches[hi]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-label={placeholder.replace(/…$/, "")}
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </div>

      {open && (
        <div className={cx(MENU, "dt-pop dt-scroll absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-[360px] overflow-auto")} role="listbox">
          {matches.map((u, i) => (
            <button
              key={u.key}
              type="button"
              role="option"
              aria-selected={u.key === value}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(u)}
              className={cx(MENU_ITEM, "items-start", i === hi && "bg-[var(--brand-50)]")}
            >
              <Dot color={STAGE_BY_KEY[u.stage]?.color} hollow={STAGE_BY_KEY[u.stage]?.hollow} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-[var(--ink-900)]">{u.label}</span>
                {u.sub && <span className={cx("block truncate text-[11px]", MUTED)}>{u.sub}</span>}
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5">
                <span className="text-[11px] tabular-nums text-[var(--ink-600)]">{fmt(u.r1, "currency", true)}</span>
                <Delta g={u.g} p1={u.r1} p2={u.r2} size="xs" />
              </span>
            </button>
          ))}
          {!matches.length && <div className={cx("px-3 py-3 text-xs", MUTED)}>Tidak ada produk yang cocok.</div>}
          {found.length > PICK_LIMIT && (
            <div className={cx("sticky bottom-0 flex items-center justify-between gap-2 border-t bg-[var(--paper)] px-2.5 py-1.5", LINE)}>
              <span className={cx("text-[11px]", MUTED)}>
                {all ? `Semua ${nfShow.format(found.length)} ditampilkan` : `${PICK_LIMIT} dari ${nfShow.format(found.length)} — ketik untuk menyaring`}
              </span>
              <ShowAll total={found.length} limit={PICK_LIMIT} open={all} onToggle={() => setAll((v) => !v)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------- tren mini       */

/**
 * Kolom mini 24 bulan untuk baris tabel. Untuk penjualan yang "bergumpal"
 * seperti bahan bangunan, kolom lebih jujur daripada garis: bulan kosong
 * terlihat kosong, bukan disambung garis miring yang mengarang tren.
 * Bulan P1 berwarna aksen, bulan sebelumnya abu (penekanan, bukan identitas).
 */
export function RowSpark({ series, split = 12, width = 74, height = 22 }) {
  const n = series.length;
  const max = Math.max(...series, 1);
  const gap = 1;
  const bw = Math.max(1, (width - gap * (n - 1)) / n);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--ink-200)" strokeWidth="1" />
      {series.map((v, i) => {
        if (!(v > 0)) return null;
        const h = Math.max(1.5, (v / max) * (height - 2));
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - 1 - h}
            width={bw}
            height={h}
            rx={Math.min(1, bw / 2)}
            fill={i >= n - split ? "var(--brand-600)" : "var(--ink-300)"}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------- skor        */

const PART_LABELS = {
  contrib: "Kontribusi",
  trend: "Tren",
  reach: "Jangkauan",
  consistency: "Konsistensi",
  recency: "Kebaruan",
};

/**
 * Komponen skor sebagai bilah kecil, supaya angka 0–100 bisa dibongkar.
 * Bobot ditulis sebagai persen dari skor (×30 dari total 100 = 30%).
 * Komponen berbobot 0 tidak ikut dihitung, jadi tidak ditampilkan.
 */
export function ScoreBreakdown({ parts, weights, score, onExplain }) {
  const keys = Object.keys(PART_LABELS).filter((k) => weights[k] > 0);
  const sum = keys.reduce((t, k) => t + weights[k], 0) || 1;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="dt-display text-[30px] font-semibold leading-none text-[var(--ink-900)]">{score}</span>
        <span className={cx("text-[11px]", MUTED)}>dari 100, rata-rata berbobot komponen di bawah</span>
      </div>
      <div className="mt-2.5 grid grid-cols-[6rem_2.6rem_minmax(0,1fr)_2.2rem] items-center gap-x-2 gap-y-1.5 text-[11px]">
        <span className="text-[10.5px] text-[var(--ink-400)]">Komponen</span>
        <span className="text-right text-[10.5px] text-[var(--ink-400)]" title="Bagian dari skor akhir">
          Bobot
        </span>
        <span />
        <span className="text-right text-[10.5px] text-[var(--ink-400)]">Nilai</span>
        {keys.map((k) => (
          <React.Fragment key={k}>
            <span className="text-[var(--ink-700)]">{PART_LABELS[k]}</span>
            <span className="text-right tabular-nums text-[var(--ink-500)]" title={`×${weights[k]} dari total bobot ${sum}`}>
              {Math.round((weights[k] / sum) * 100)}%
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
              <span className="block h-full rounded-full bg-[var(--brand-600)]" style={{ width: `${Math.round(parts[k] * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums text-[var(--ink-800)]">{Math.round(parts[k] * 100)}</span>
          </React.Fragment>
        ))}
      </div>
      {onExplain && (
        <InfoButton
          compact
          label="Cara hitung skor"
          title="Arti setiap komponen dan hitungan lengkap skor produk ini"
          className="mt-3"
          onClick={onExplain}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- lain    */

/** Kotak angka kecil: label, nilai, perbandingan. `delta` = lencana naik/turun di samping nilai. */
export function Stat({ label, value, sub, tone, title, delta }) {
  return (
    <div className="min-w-0" title={title}>
      <div className={cx("text-[11.5px]", MUTED)}>{label}</div>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={cx(
            "dt-display truncate text-[20px] font-semibold leading-tight",
            tone === "pos" ? "text-[var(--pos)]" : tone === "neg" ? "text-[var(--neg)]" : "text-[var(--ink-900)]"
          )}
        >
          {value}
        </span>
        {delta}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">{sub}</div>}
    </div>
  );
}

/**
 * Ubin angka bertinta. Warna latar mengikuti arti angkanya (naik = teal,
 * turun = merah, netral = anggur muda), bukan hiasan. `delta` = lencana
 * naik/turun (komponen Delta) yang tampil di samping nilai.
 */
export function Tile({ label, value, sub, tone = "brand", title, valueTone, delta }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2.5" style={{ background: t.tint, borderColor: t.line }} title={title}>
      <div className="text-[11.5px] text-[var(--ink-600)]">{label}</div>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={cx(
            "dt-display truncate text-[18px] font-semibold leading-tight sm:text-[21px]",
            valueTone === "pos" ? "text-[var(--pos)]" : valueTone === "neg" ? "text-[var(--neg)]" : "text-[var(--ink-900)]"
          )}
        >
          {value}
        </span>
        {delta}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-[var(--ink-600)]">{sub}</div>}
    </div>
  );
}

export const toneOf = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : undefined);

/**
 * Tombol untuk daftar yang diringkas: "Tampilkan semua 41" ↔ "Ringkas lagi".
 * Tidak tampil kalau semuanya sudah kelihatan. Dipakai di semua halaman
 * supaya tidak ada daftar yang terpotong tanpa jalan untuk melihat semuanya.
 *
 * @param total   jumlah seluruh baris
 * @param limit   jumlah yang tampil saat diringkas
 * @param open    sedang menampilkan semua?
 * @param noun    mis. "cabang", "kategori" (opsional)
 * @param openLabel / closedLabel  teks pengganti bila bentuk bawaan tidak pas
 */
export function ShowAll({ total, limit, open, onToggle, noun, className, openLabel, closedLabel }) {
  if (!(total > limit)) return null;
  const text = open
    ? openLabel || `Ringkas lagi (${nfShow.format(limit)} teratas)`
    : closedLabel || `Tampilkan semua ${nfShow.format(total)}${noun ? ` ${noun}` : ""}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--brand-200)] bg-[var(--paper)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--brand-700)] transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)]",
        FOCUS,
        className
      )}
    >
      {text}
      <svg viewBox="0 0 12 12" className={cx("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
const nfShow = new Intl.NumberFormat("id-ID");
