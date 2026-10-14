/* ============================================================================
   Panel Keterangan
   ----------------------------------------------------------------------------
   Menjelaskan arti setiap tahap, rekomendasi, dan istilah — lengkap dengan
   batas angka dan tanggal yang SEDANG berlaku. Isinya dibangun dari
   lib/glossary.js, yang mengambil aturan langsung dari mesin penilai,
   jadi penjelasan selalu sama dengan hitungan walau Kriteria atau data
   berubah.
   ========================================================================== */

import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import { ACTIONS, STAGES } from "../lib/color.js";
import { dLabel, nfFull, toJs } from "../lib/format.js";
import {
  STAGE_ORDER_NOTE,
  actionDefinitions,
  basisRows,
  fmtPoints,
  scoreBreakdown,
  scoreDefinitions,
  stageActionMatrix,
  stageDefinitions,
  termDefinitions,
  weightNote,
} from "../lib/glossary.js";
import { FOCUS, LINE, MUTED, ROOT_CLASS, ROOT_FONT, TONES, cx } from "../lib/theme.jsx";
import { IconClose, IconInfo } from "./icons.jsx";

const SHORT_ACTION = {
  kembangkan: "Kembangkan",
  pertahankan: "Pertahankan",
  perbaiki: "Perbaiki",
  pantau: "Pantau",
  cabut: "Dicabut",
  bersihkan: "Bersihkan",
};

const TABS = [
  { key: "tahap", label: "Tahap siklus hidup" },
  { key: "rekomendasi", label: "Rekomendasi" },
  { key: "skor", label: "Skor kesehatan" },
  { key: "istilah", label: "Istilah & dasar data" },
];

const pctText = (x) => `${Math.round(x * 100)}%`;

function Swatch({ color, hollow, size = 10 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block flex-none rounded-full"
      style={{
        width: size,
        height: size,
        background: hollow ? "transparent" : color,
        boxShadow: hollow ? `inset 0 0 0 2px ${color === "#cfc2c8" ? "#a8949c" : color}` : undefined,
      }}
    />
  );
}

/**
 * @param open       tampil atau tidak
 * @param tab        tab aktif ("tahap" | "rekomendasi" | "istilah")
 * @param setTab     ganti tab
 * @param onClose    tutup panel
 * @param crit, win  pengaturan yang berlaku
 * @param units      produk di portofolio aktif (untuk hitungan dan tabel silang)
 * @param unitPlural mis. "kategori"
 * @param onPickCell (stage, action) => void — kalau ada, sel tabel silang bisa diklik untuk menyaring
 * @param focus      produk yang sedang dibuka di Diagnosis (untuk hitungan skor satu per satu)
 * @param weights    bobot skor yang benar-benar dipakai (portfolio.weights)
 */
export function GlossaryDrawer({ open, tab, setTab, onClose, crit, win, units, unitPlural = "produk", onPickCell, focus, weights }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stages = useMemo(() => (win ? stageDefinitions(crit, win) : []), [crit, win]);
  const actions = useMemo(() => actionDefinitions(crit), [crit]);
  const basis = useMemo(() => basisRows(crit), [crit]);
  const terms = useMemo(() => (win ? termDefinitions(crit, win) : []), [crit, win]);
  const matrix = useMemo(() => (units ? stageActionMatrix(units) : null), [units]);
  const byRule = useMemo(() => {
    const m = {};
    for (const u of units || []) if (u.rec?.rule) m[u.rec.rule] = (m[u.rec.rule] || 0) + 1;
    return m;
  }, [units]);
  const byStage = useMemo(() => {
    const m = {};
    for (const u of units || []) m[u.stage] = (m[u.stage] || 0) + 1;
    return m;
  }, [units]);
  const scoreDefs = useMemo(() => scoreDefinitions(crit, weights, unitPlural), [crit, weights, unitPlural]);
  const calc = useMemo(() => (focus && units ? scoreBreakdown(focus, units, weights) : null), [focus, units, weights]);

  if (!open || !win || typeof document === "undefined") return null;

  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div className="dt-fade fixed inset-0 z-[9990] bg-[rgba(36,26,31,.38)]" onClick={onClose} aria-hidden="true" />
      <aside
        className="dt-slide dt-shadow-pop fixed inset-y-0 right-0 z-[9991] flex w-[min(620px,100vw)] flex-col bg-[var(--paper)]"
        role="dialog"
        aria-modal="true"
        aria-label="Keterangan tahap, rekomendasi, dan istilah"
      >
        <header className={cx("flex items-start gap-3 border-b px-5 pb-3 pt-4", LINE)}>
          <span
            className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-lg"
            style={{ background: TONES.brand.tint, color: TONES.brand.ink, boxShadow: `inset 0 0 0 1px ${TONES.brand.line}` }}
          >
            <IconInfo className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="dt-display text-[19px] font-semibold leading-tight text-[var(--ink-900)]">Keterangan</h2>
            <p className={cx("mt-0.5 text-[12px] leading-snug", MUTED)}>
              Semua batas di bawah mengikuti Kriteria yang sedang dipakai, dinilai per {dLabel.format(toJs(win.asOf))}. Kalau Kriteria
              atau data berubah, penjelasan ini ikut berubah.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cx("grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--ink-500)] hover:bg-[var(--ink-100)] hover:text-[var(--ink-900)]", FOCUS)}
            aria-label="Tutup keterangan"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className={cx("dt-scroll flex gap-1 overflow-x-auto border-b px-5 pt-2", LINE)} role="tablist">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={cx(
                  "-mb-px flex-none whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-[12.5px] transition-colors",
                  FOCUS,
                  on ? "border-[var(--brand-700)] font-semibold text-[var(--brand-700)]" : "border-transparent text-[var(--ink-600)] hover:text-[var(--ink-900)]"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="dt-scroll min-h-0 flex-1 overflow-auto px-5 py-4">
          {tab === "tahap" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-[var(--ink-700)]">{STAGE_ORDER_NOTE}</p>
              {stages.map((s) => {
                const t = TONES[s.tone];
                return (
                  <article key={s.key} className="overflow-hidden rounded-lg border" style={{ borderColor: t.line }}>
                    <div className="flex items-center gap-2 px-3.5 py-2" style={{ background: t.tint }}>
                      <Swatch color={s.color} hollow={s.hollow} />
                      <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">{s.label}</h3>
                      <span className="text-[12px] text-[var(--ink-600)]">{s.short}</span>
                      {units && (
                        <span className="ml-auto text-[11.5px] tabular-nums text-[var(--ink-600)]">
                          {nfFull.format(byStage[s.key] || 0)} {unitPlural}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-800)]">
                      <p>{s.rule}</p>
                      <p className="text-[11.5px] text-[var(--ink-600)]">
                        Dihitung dari: <span className="font-medium text-[var(--ink-800)]">{s.basis}</span>
                      </p>
                      {s.note && <p className="text-[11.5px] text-[var(--ink-600)]">{s.note}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {tab === "rekomendasi" && (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                Rekomendasi ditentukan oleh {nfFull.format(actions.reduce((t, a) => t + a.rules.length, 0))} aturan yang diperiksa berurutan
                dari nomor 1. Aturan pertama yang cocok yang dipakai — nomor menunjukkan urutan itu. Angka di kanan adalah jumlah {unitPlural} yang
                saat ini kena aturan tersebut.
              </p>
              {actions.map((a) => {
                const t = TONES[a.tone];
                return (
                  <article key={a.key} className="overflow-hidden rounded-lg border" style={{ borderColor: t.line }}>
                    <div className="px-3.5 py-2" style={{ background: t.tint }}>
                      <div className="flex items-center gap-2">
                        <Swatch color={a.color} hollow={a.hollow} />
                        <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">{a.label}</h3>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-snug text-[var(--ink-700)]">{a.hint}</p>
                    </div>
                    <ol className="divide-y divide-[var(--ink-100)]">
                      {a.rules.map((r) => (
                        <li key={r.id} className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-baseline gap-2 px-3.5 py-1.5 text-[12.5px]">
                          <span className="tabular-nums text-[11px] text-[var(--ink-500)]">{r.order}.</span>
                          <span className="leading-snug text-[var(--ink-800)]">{r.text}</span>
                          {units && <span className="tabular-nums text-[11.5px] text-[var(--ink-600)]">{nfFull.format(byRule[r.id] || 0)}</span>}
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })}

              {matrix && (
                <section className={cx("rounded-lg border", LINE)}>
                  <div className={cx("border-b px-3.5 py-2", LINE)}>
                    <h3 className="text-[13px] font-semibold text-[var(--ink-900)]">Tahap × rekomendasi saat ini</h3>
                    <p className={cx("text-[11.5px] leading-snug", MUTED)}>
                      Dari tahap mana setiap rekomendasi datang.{onPickCell ? " Klik angka untuk menyaring Portofolio ke kombinasi itu." : ""}
                    </p>
                  </div>
                  <div className="dt-scroll overflow-x-auto p-2">
                    <table className="w-full border-separate border-spacing-[3px] text-[11.5px]">
                      <thead>
                        <tr>
                          <th className="px-1 text-left font-medium text-[var(--ink-500)]">Tahap</th>
                          {ACTIONS.map((a) => (
                            <th key={a.key} className="px-1 text-center font-medium text-[var(--ink-600)]" title={a.label}>
                              {SHORT_ACTION[a.key]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {STAGES.map((s) => (
                          <tr key={s.key}>
                            <th className="whitespace-nowrap px-1 text-left font-normal text-[var(--ink-800)]">
                              <span className="inline-flex items-center gap-1.5">
                                <Swatch color={s.color} hollow={s.hollow} size={8} />
                                {s.label}
                              </span>
                            </th>
                            {ACTIONS.map((a) => {
                              const n = matrix[s.key][a.key] || 0;
                              const t = TONES[a.tone];
                              const can = n > 0 && onPickCell;
                              const Tag = can ? "button" : "span";
                              return (
                                <td key={a.key} className="p-0">
                                  <Tag
                                    type={can ? "button" : undefined}
                                    onClick={can ? () => onPickCell(s.key, a.key) : undefined}
                                    className={cx(
                                      "block h-8 w-full min-w-[3.2rem] rounded-md text-center leading-8 tabular-nums",
                                      n ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-300)]",
                                      can && "transition-shadow hover:ring-2 hover:ring-[var(--brand-300)]",
                                      can && FOCUS
                                    )}
                                    style={n ? { background: t.tint, boxShadow: `inset 0 0 0 1px ${t.line}` } : undefined}
                                    title={`${s.label} → ${a.label}: ${n}`}
                                  >
                                    {n || "·"}
                                  </Tag>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === "skor" && (
            <div className="space-y-4">
              <p className="text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                Skor kesehatan merangkum lima sisi sebuah produk dalam satu angka 0–100. Setiap sisi (komponen) diberi nilai 0–100, lalu
                dirata-rata dengan bobot. Tiga komponen pertama dinilai <b className="font-semibold">relatif</b> terhadap {unitPlural} lain di
                tingkat yang sama; dua terakhir <b className="font-semibold">mutlak</b>.
              </p>

              {calc ? (
                <section className="overflow-hidden rounded-lg border" style={{ borderColor: TONES.brand.line }}>
                  <div className="flex flex-wrap items-baseline gap-x-2 px-3.5 py-2.5" style={{ background: TONES.brand.head }}>
                    <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">Hitungan untuk {focus.label}</h3>
                    <span className="ml-auto text-[12px] text-[var(--ink-700)]">
                      Skor <b className="dt-display text-[18px] font-semibold text-[var(--brand-800)]">{calc.score}</b>
                    </span>
                  </div>
                  <div className="dt-scroll overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-[12px]">
                      <thead>
                        <tr className="text-left text-[11px] text-[var(--ink-500)]">
                          <th className="px-3.5 py-2 font-medium">Komponen</th>
                          <th className="px-2 py-2 font-medium">Data produk ini</th>
                          <th className="px-2 py-2 text-right font-medium">Nilai</th>
                          <th className="px-2 py-2 text-right font-medium">Bobot</th>
                          <th className="px-3.5 py-2 text-right font-medium">Poin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calc.rows.map((r) => (
                          <tr key={r.key} className={cx("border-t border-[var(--ink-100)] align-top", r.weight === 0 && "opacity-50")}>
                            <td className="px-3.5 py-1.5 font-medium text-[var(--ink-900)]">{r.label}</td>
                            <td className="px-2 py-1.5 text-[var(--ink-700)]">
                              {r.data}
                              {r.rankText && <span className="block text-[11px] text-[var(--ink-500)]">{r.rankText}</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-900)]">{r.weight > 0 ? fmtPoints(r.value) : "–"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-700)]">×{nfFull.format(r.weight)}</td>
                            <td className="px-3.5 py-1.5 text-right tabular-nums font-semibold text-[var(--ink-900)]">{fmtPoints(r.points)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--ink-200)]">
                          <td className="px-3.5 py-2 font-semibold text-[var(--ink-900)]" colSpan={3}>
                            Jumlah
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-[var(--ink-700)]">{nfFull.format(calc.sum)}</td>
                          <td className="px-3.5 py-2 text-right tabular-nums font-semibold text-[var(--brand-800)]">
                            {fmtPoints(calc.total)} → {calc.score}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="space-y-1 border-t border-[var(--ink-100)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--ink-700)]">
                    <p>
                      <b className="font-semibold text-[var(--ink-900)]">Rumus:</b> skor = {calc.formula}, dibulatkan menjadi{" "}
                      <b className="font-semibold text-[var(--ink-900)]">{calc.score}</b>.
                    </p>
                    <p className="text-[11.5px] text-[var(--ink-600)]">
                      Poin = nilai × bobot ÷ jumlah bobot. Jumlah semua poin = skor sebelum dibulatkan.
                    </p>
                  </div>
                </section>
              ) : (
                <p className={cx("rounded-lg border px-3.5 py-2.5 text-[12.5px]", LINE, MUTED)}>
                  Buka Diagnosis sebuah produk untuk melihat hitungan skornya satu per satu.
                </p>
              )}

              <section>
                <h3 className="text-[13px] font-semibold text-[var(--ink-900)]">Arti angka ×30, ×25, dan seterusnya</h3>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--ink-700)]">{weightNote(crit, weights)}</p>
              </section>

              <section className="space-y-2.5">
                <h3 className="text-[13px] font-semibold text-[var(--ink-900)]">Lima komponen</h3>
                {scoreDefs.map((d) => {
                  const t = d.kind === "relatif" ? TONES.blue : TONES.teal;
                  return (
                    <article key={d.key} className={cx("overflow-hidden rounded-lg border", d.weight === 0 && "opacity-60")} style={{ borderColor: t.line }}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2" style={{ background: t.head }}>
                        <h4 className="text-[13px] font-semibold text-[var(--ink-900)]">{d.label}</h4>
                        <span className="text-[12px] text-[var(--ink-700)]">{d.question}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10.5px] font-medium" style={{ color: t.ink, boxShadow: `inset 0 0 0 1px ${t.line}` }}>
                            {d.kind}
                          </span>
                          <span className="text-[11.5px] tabular-nums text-[var(--ink-700)]">
                            ×{nfFull.format(d.weight)} · {pctText(d.share)} skor
                          </span>
                        </span>
                      </div>
                      <p className="px-3.5 py-2 text-[12.5px] leading-relaxed text-[var(--ink-800)]">{d.how}</p>
                    </article>
                  );
                })}
              </section>

              <section>
                <h3 className="text-[13px] font-semibold text-[var(--ink-900)]">Yang perlu diingat</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                  <li>
                    Skor <b className="font-semibold">tidak</b> dipakai untuk menentukan rekomendasi. Rekomendasi memakai tahap, kelas ABC, pola, dan
                    jumlah transaksi (lihat tab Rekomendasi). Skor gunanya untuk mengurutkan dan membandingkan.
                  </li>
                  <li>
                    Skor tinggi tidak selalu berarti tumbuh. Produk besar yang sedang menurun bisa tetap berskor tinggi karena kontribusi dan
                    jangkauannya besar — lihat Tren untuk arahnya.
                  </li>
                  <li>
                    Komponen relatif bisa berubah walau produknya tidak berubah: kalau {unitPlural} lain naik atau turun, atau kalau periode,
                    tingkat, atau penyaring diganti.
                  </li>
                </ul>
              </section>
            </div>
          )}

          {tab === "istilah" && (
            <div className="space-y-4">
              <section>
                <h3 className="text-[13px] font-semibold text-[var(--ink-900)]">Setiap penilaian dihitung dari apa?</h3>
                <table className="mt-2 w-full border-collapse text-[12.5px]">
                  <tbody>
                    {basis.map(([k, v]) => (
                      <tr key={k} className="border-b border-[var(--ink-100)] last:border-b-0">
                        <th className="w-[38%] py-1.5 pr-3 text-left align-top font-medium text-[var(--ink-800)]">{k}</th>
                        <td className="py-1.5 text-[var(--ink-700)]">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <dl className="space-y-3">
                {terms.map((t) => (
                  <div key={t.term}>
                    <dt className="text-[13px] font-semibold text-[var(--ink-900)]">{t.term}</dt>
                    <dd className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                      {t.text}
                      {t.items && (
                        <ul className="mt-1.5 space-y-1">
                          {t.items.map((it) => (
                            <li key={it.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                              <span className="font-medium text-[var(--ink-800)]">{it.label}</span>
                              <span>{it.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}

/** Tombol kecil pembuka Keterangan. */
export function InfoButton({ onClick, label = "Keterangan", className, compact, title = "Arti tahap, rekomendasi, skor, dan istilah, lengkap dengan batas angkanya" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--brand-200)] bg-[var(--brand-50)] text-[var(--brand-700)] transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-100)]",
        compact ? "px-1.5 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs font-medium",
        FOCUS,
        className
      )}
      title={title}
    >
      <IconInfo className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </button>
  );
}
