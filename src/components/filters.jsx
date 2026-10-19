/* ============================================================================
   Penyaring bersama — rentang tanggal, preset, dan slicer dimensi
   ----------------------------------------------------------------------------
   Dipakai semua halaman. Keadaannya dipegang App.jsx, jadi berpindah menu
   tidak menghapus pilihan yang sudah dibuat.
   ========================================================================== */

import React, { useState, useMemo, useRef, useCallback } from "react";
import { labelOf } from "../lib/config.js";
import {
  PRESETS,
  PRESET_LABEL,
  dLabel,
  daysBetween,
  shiftDays,
  shiftYearSafe,
  toJs,
} from "../lib/format.js";
import { useClickOutside } from "../lib/hooks.js";
import { IconInfo, IconReset } from "./icons.jsx";
import {
  BTN_QUIET,
  FIELD,
  FOCUS,
  LINE,
  MENU,
  MENU_ITEM,
  MUTED,
  SELECT,
  cx,
} from "../lib/theme.jsx";

/* ------------------------------------------------------------- DateRange   */

export function DateRange({ tone, name, tag, value, min, max, onChange }) {
  const days = daysBetween(value.from, value.to);
  const p1 = tone === "p1";
  return (
    <div
      className={cx(
        "flex max-w-full flex-wrap items-center gap-2 rounded-lg border bg-[var(--paper)] px-2.5 py-1.5",
        p1 ? "border-[var(--brand-200)] shadow-[inset_3px_0_0_var(--brand-700)]" : "border-[var(--blue-100)] shadow-[inset_3px_0_0_var(--p2)]"
      )}
    >
      <span className={cx("text-[11.5px] font-semibold", p1 ? "text-[var(--brand-700)]" : "text-[var(--blue-700)]")}>
        {name}
        {tag && (
          <span
            className={cx(
              "ml-1.5 rounded px-1 py-px text-[10px] font-semibold",
              p1 ? "bg-[var(--brand-700)] text-white" : "bg-[var(--blue-100)] text-[var(--blue-700)]"
            )}
          >
            {tag}
          </span>
        )}
      </span>
      <input
        className={FIELD}
        type="date"
        value={value.from || ""}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        aria-label={`${name}, tanggal mulai`}
      />
      <span className="text-[var(--ink-300)]">–</span>
      <input
        className={FIELD}
        type="date"
        value={value.to || ""}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        aria-label={`${name}, tanggal akhir`}
      />
      {days > 0 && (
        <span className="rounded-full bg-[var(--ink-100)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--ink-600)]">{days} hari</span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Slicer   */

export function Slicer({ dim, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const shown = useMemo(() => {
    if (!q.trim()) return options;
    const needle = q.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, q]);

  const active = selected.size > 0;
  const summary = !active
    ? "Semua"
    : selected.size === 1
    ? Array.from(selected)[0]
    : `${selected.size} dipilih`;

  const toggle = (val) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className={cx(
          "flex max-w-[240px] items-center gap-2 rounded-full border px-3 py-1 transition-colors",
          FOCUS,
          active
            ? "border-[var(--brand-600)] bg-[var(--brand-50)]"
            : `${LINE} bg-[var(--paper)] hover:border-[var(--brand-300)]`
        )}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={cx(
            "text-xs font-medium",
            active ? "text-[var(--brand-700)]" : "text-[var(--ink-800)]"
          )}
        >
          {labelOf(dim)}
        </span>
        <span
          className={cx(
            "truncate text-xs",
            active ? "text-[var(--brand-600)]" : "text-[var(--ink-500)]"
          )}
        >
          {summary}
        </span>
        <svg
          className={cx(
            "h-2.5 w-2.5 shrink-0 transition-transform duration-200",
            open && "rotate-180",
            active ? "text-[var(--brand-500)]" : "text-[var(--ink-400)]"
          )}
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className={cx(
            MENU,
            "dt-pop absolute left-0 top-[calc(100%+6px)] z-40 flex max-h-80 w-[260px] origin-top flex-col"
          )}
        >
          <input
            className={cx(
              "m-1 rounded-lg border bg-[var(--ink-50)] px-2.5 py-2 text-xs text-[var(--ink-900)] transition-colors focus:border-[var(--brand-400)] focus:bg-[var(--paper)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
              LINE
            )}
            placeholder={`Cari ${labelOf(dim).toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="dt-scroll overflow-auto px-1 pb-1">
            {shown.map((opt) => {
              const on = selected.has(opt);
              return (
                <button
                  key={opt}
                  className={cx(MENU_ITEM, on && "text-[var(--brand-700)]")}
                  type="button"
                  onClick={() => toggle(opt)}
                >
                  <span
                    className={cx(
                      "grid h-4 w-4 flex-none place-items-center rounded border transition-colors",
                      on
                        ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white"
                        : "border-[var(--ink-300)] bg-[var(--paper)]"
                    )}
                  >
                    {on && (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                        <path
                          d="M1 4l2.5 2.5L9 1"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{opt}</span>
                </button>
              );
            })}
            {!shown.length && (
              <div className={cx("px-2.5 py-3 text-xs", MUTED)}>Tidak ada yang cocok</div>
            )}
          </div>
          <div className={cx("flex gap-1 border-t px-1 py-1", LINE)}>
            <button className={BTN_QUIET} type="button" onClick={() => onChange(new Set(options))}>
              Pilih semua
            </button>
            <button className={BTN_QUIET} type="button" onClick={() => onChange(new Set())}>
              Bersihkan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- PeriodBar   */

/** Sakelar kecil bergaya formal untuk "Bandingkan periode". */
function Switch({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        FOCUS,
        on ? "border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-800)]" : "border-[var(--ink-200)] bg-[var(--paper)] text-[var(--ink-700)] hover:border-[var(--brand-300)]"
      )}
    >
      <span className={cx("relative h-4 w-7 flex-none rounded-full transition-colors", on ? "bg-[var(--brand-700)]" : "bg-[var(--ink-300)]")} aria-hidden="true">
        <span className={cx("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[left]", on ? "left-[14px]" : "left-0.5")} />
      </span>
      {children}
    </button>
  );
}

/* Pembanding cepat: dua pilihan yang paling sering dipakai, satu klik. */
const QUICK_CMP = [
  { key: "keep_yoy", label: "Tahun lalu", hint: "P2 = rentang yang sama setahun sebelumnya (aman dari pola musiman)" },
  { key: "keep_prev", label: "Periode sebelumnya", hint: "P2 = rentang sepanjang P1 tepat sebelum P1" },
];

/** Pilihan pembanding cepat yang sedang berlaku, atau null kalau P2 diatur manual. */
function quickCmpOf(p1, p2) {
  if (!p1.from || !p1.to || !p2.from || !p2.to) return null;
  if (p2.from === shiftYearSafe(p1.from, -1) && p2.to === shiftYearSafe(p1.to, -1)) return "keep_yoy";
  const n = daysBetween(p1.from, p1.to);
  const to = shiftDays(p1.from, -1);
  if (p2.to === to && p2.from === shiftDays(to, -(n - 1))) return "keep_prev";
  return null;
}

export function PeriodBar({ p1, p2, setP1, setP2, cmpOn, onToggleCmp, bounds, lastPreset, onPreset }) {
  const anchor = p1.from || p1.to || bounds.max || null;
  const quick = cmpOn ? quickCmpOf(p1, p2) : null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 pb-1.5 pt-2.5">
      <DateRange tone="p1" name="Periode" tag="P1" value={p1} min={bounds.min} max={bounds.max} onChange={setP1} />

      {onToggleCmp && (
        <Switch on={cmpOn} onClick={onToggleCmp}>
          Bandingkan periode
        </Switch>
      )}

      {cmpOn && <DateRange tone="p2" name="Pembanding" tag="P2" value={p2} onChange={setP2} />}

      {cmpOn && (
        <div
          className={cx("inline-flex flex-wrap items-center rounded-lg border bg-[var(--ink-50)] p-0.5", LINE)}
          role="radiogroup"
          aria-label="Pembanding cepat"
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const cur = Math.max(0, QUICK_CMP.findIndex((o) => o.key === quick));
            const next = (cur + d + QUICK_CMP.length) % QUICK_CMP.length;
            onPreset(QUICK_CMP[next].key);
            const group = e.currentTarget;
            requestAnimationFrame(() => group.querySelector(`[data-i="${next}"]`)?.focus());
          }}
        >
          <span className="px-1.5 text-[11px] text-[var(--ink-500)]" aria-hidden="true">
            vs
          </span>
          {QUICK_CMP.map((o, i) => {
            const on = quick === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                title={o.hint}
                data-i={i}
                tabIndex={on || (!quick && i === 0) ? 0 : -1}
                onClick={() => onPreset(o.key)}
                className={cx(
                  "rounded-md px-2 py-1 text-[11.5px] transition-colors",
                  FOCUS,
                  on
                    ? "bg-[var(--paper)] font-semibold text-[var(--blue-700)] shadow-[0_0_0_1px_var(--blue-100),0_1px_2px_rgba(36,26,31,.08)]"
                    : "text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      <select
        className={SELECT}
        value=""
        onChange={(e) => {
          if (e.target.value) onPreset(e.target.value);
          e.target.value = "";
        }}
        aria-label="Pilih preset periode"
        title={`Preset dihitung dari ${anchor ? dLabel.format(toJs(anchor)) : "–"} (tanggal awal Periode P1)`}
      >
        <option value="">{`Preset… (dari ${anchor ? dLabel.format(toJs(anchor)) : "–"})`}</option>
        {Array.from(new Set(PRESETS.map((p) => p.group))).map((g) => (
          <optgroup key={g} label={g}>
            {PRESETS.filter((p) => p.group === g).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Preset "Pertahankan P1" sudah terlihat di pilihan pembanding cepat. */}
      {lastPreset && !lastPreset.startsWith("keep_") && (
        <span className="rounded-full border border-[var(--brand-200)] bg-[var(--brand-50)] px-2.5 py-1 text-[11px] text-[var(--brand-700)]">
          {PRESET_LABEL[lastPreset]}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- AcuanBar    */

/**
 * Pengganti bilah Periode di halaman Produk dan Eksplorasi (selama Jendela
 * bukan "Ikuti periode di atas"). Di sana hanya TANGGAL AKHIR yang dipakai
 * (tanggal acuan); tanggal awal, Bandingkan periode, dan Preset tidak
 * berpengaruh, jadi tidak ditampilkan supaya tidak membingungkan.
 * Mengubah tanggal di sini menggeser Periode di bilah atas (panjangnya tetap),
 * jadi halaman lain ikut berakhir di tanggal yang sama.
 * `note` = keterangan di sampingnya; bawaannya kalimat untuk Peringatan.
 */
/**
 * Tombol "Reset ke data terbaru": jendela 12 bulan, tanggal acuan = transaksi
 * terakhir di data, Periode/Pembanding kembali mengikuti data terbaru, dan
 * bilah kuning "sedang mengikuti peringatan yang ditelusuri" ditutup.
 * Ambang dan pengaturan Peringatan lain tidak disentuh.
 */
export function ResetLatestButton({ onClick, latest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Kembali ke tampilan bawaan: jendela 12 bulan, dinilai per data terakhir${latest ? ` (${dLabel.format(toJs(latest))})` : ""}, periode mengikuti data terbaru. Ambang peringatan tidak berubah.`}
      className={cx(
        "dt-pop inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--brand-300)] bg-[var(--brand-50)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-800)] transition-colors hover:border-[var(--brand-500)] hover:bg-[var(--brand-100)]",
        FOCUS
      )}
    >
      <IconReset className="h-4 w-4" />
      Reset ke data terbaru
    </button>
  );
}

export function AcuanBar({ value, min, max, onChange, note, label = "Tanggal acuan peringatan", action }) {
  const latest = !!max && value === max;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-1.5 pt-2.5">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-[var(--brand-200)] bg-[var(--paper)] px-2.5 py-1.5 shadow-[inset_3px_0_0_var(--brand-700)]">
        <span className="text-[11.5px] font-semibold text-[var(--brand-700)]">Dinilai per</span>
        <input
          className={FIELD}
          type="date"
          value={value || ""}
          min={min || undefined}
          max={max || undefined}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label={label}
        />
        {latest ? (
          <span className="rounded-full bg-[var(--teal-50)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--teal-700)]">data terbaru</span>
        ) : (
          max &&
          !action && (
            <button type="button" className={BTN_QUIET} onClick={() => onChange(max)}>
              Ke data terbaru ({dLabel.format(toJs(max))})
            </button>
          )
        )}
      </div>
      {action}
      {/* basis 20rem: di layar sempit catatan turun ke baris sendiri, tidak terjepit di samping kotak tanggal */}
      <p className="flex min-w-0 max-w-[92ch] flex-[1_1_20rem] items-start gap-1.5 text-[11.5px] leading-snug text-[var(--ink-600)]">
        <IconInfo className="mt-px h-3.5 w-3.5 flex-none text-[var(--ink-400)]" />
        <span>
          {note ?? (
            <>
              Peringatan dihitung mundur dari tanggal ini. Tanggal awal, <i>Bandingkan periode</i>, dan Preset tidak dipakai di halaman ini — rentang
              yang diperiksa diatur di <b className="font-medium text-[var(--ink-800)]">Periode pantau</b> di bawah.
            </>
          )}
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- SlicerBar   */

export function SlicerBar({ slicerDims, options, slicers, onChange, onClear, right }) {
  const any = Object.values(slicers).some((s) => s.size > 0);
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 pt-1.5">
      <span className={cx("mr-1 text-[11.5px] font-medium", MUTED)}>Saring</span>
      {slicerDims.map((d) => (
        <Slicer key={d} dim={d} options={options[d] || []} selected={slicers[d] || new Set()} onChange={(set) => onChange(d, set)} />
      ))}
      <button className={BTN_QUIET} type="button" onClick={onClear} disabled={!any}>
        Bersihkan semua
      </button>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
