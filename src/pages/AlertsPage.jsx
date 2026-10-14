/* ============================================================================
   Halaman: Peringatan
   ----------------------------------------------------------------------------
   Satu tempat untuk melihat apa yang perlu diperhatikan SEKARANG: produk
   andalan yang berhenti terjual, cabang yang anjlok, produk baru yang
   melonjak, perubahan tahap siklus hidup, harga yang tergerus, dan catatan
   data. Tidak mengirim apa pun ke luar — hanya daftar untuk dianalisis.

   Mesinnya ada di lib/alerts.js (ALERT_RULES = semua aturan dan kalimat
   syaratnya). Ambang bawaannya di lib/config.js (ALERT_DEFAULTS) dan bisa
   diubah dari panel "Atur ambang"; jenis yang tidak dipakai bisa dimatikan
   di "Jenis & cara kerja". Setiap peringatan bisa dibuka untuk melihat
   angka, langkah hitung, dan penyebab terbesarnya.

   Hanya pengaturan yang benar-benar dipakai yang tampil: di bilah atas
   tinggal "Dinilai per" (lihat AcuanBar), ambang untuk jenis yang mati
   disembunyikan, dan panduan singkat bisa ditutup/dibuka lagi.
   ========================================================================== */

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ALERT_DEFAULTS, DIM_FAMILY, EXPLORE_DIMS, dimOk } from "../lib/config.js";
import {
  ALERT_GROUPS,
  ALERT_RULES,
  ALERT_THRESHOLD_KEYS,
  SEVERITIES,
  SEVERITY_BY_KEY,
  THRESHOLD_RULES,
  alertsCsvRows,
  buildAlerts,
  normalizeAlertCfg,
  previousPortfolio,
} from "../lib/alerts.js";
import { downloadCsv } from "../lib/data.js";
import { dLabel, fmt, fromJs, monthIndex, nfFull, nfPct, toJs } from "../lib/format.js";
import { explainDims, switchingSignal, valueLabel } from "../lib/product.js";
import { readStore, useClickOutside, useSettled, writeStore } from "../lib/hooks.js";
import { BTN, BTN_QUIET, FOCUS, LINE, MENU, MUTED, ROOT_CLASS, ROOT_FONT, TONES, cx } from "../lib/theme.jsx";
import { Field, Notice, Section, Segmented, ShowAll, WindowBar } from "../components/productui.jsx";
import { Arrow } from "../components/delta.jsx";
import { BusyOverlay } from "../components/busy.jsx";
import {
  IconAlert,
  IconBell,
  IconCash,
  IconChecklist,
  IconCycle,
  IconDatabase,
  IconDownload,
  IconInfo,
  IconLayers,
  IconSearch,
  IconSliders,
  IconStore,
  IconTrendDown,
  IconTrendUp,
} from "../components/icons.jsx";

const rp = (v) => fmt(v, "currency", true);
const plusRp = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${rp(Math.abs(v))}`;
const dateText = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");
const rangeText = (r) => `${dateText(r.from)} – ${dateText(r.to)}`;

const SEV_ICON = { kritis: IconAlert, cek: IconSearch, peluang: IconTrendUp, info: IconInfo };
const GROUP_ICON = {
  andalan: IconTrendDown,
  wilayah: IconStore,
  peluang: IconTrendUp,
  siklus: IconCycle,
  kelompok: IconLayers,
  risiko: IconCash,
  data: IconDatabase,
};
const WATCH_OPTIONS = [30, 60, 90, 180];
const GROUP_LIMIT = 8;
const GUIDE_STORE = "dt-peringatan-panduan";
const RULE_TITLE = Object.fromEntries(ALERT_RULES.map((r) => [r.key, r.title]));

/* Kedalaman dimensi dalam satu keluarga: penjelasan "di mana" hanya boleh
   memakai dimensi yang lebih halus dari subjeknya — wilayah untuk sebuah
   cabang, atau lini untuk sebuah kategori, pasti cocok dan tidak berarti. */
const DEPTH = { branch_area: 0, Branch: 1, Lini_Produk: 0, Category: 1, __name: 2, Item_Code: 2 };

export default function AlertsPage({
  lines,
  labels,
  quality,
  portfolio,
  win,
  winMode,
  setWinMode,
  unitKey,
  setUnitKey,
  crit,
  setCrit,
  openProduct,
  explainPeriod,
  onMatchLength,
  alertCfg,
  setAlertCfg,
  resetAlertView,
}) {
  const [today] = useState(() => fromJs(new Date()));
  const [localCfg, setLocalCfg] = useState(() => normalizeAlertCfg(null));
  const settings = alertCfg || localCfg;
  const setSettings = setAlertCfg || setLocalCfg;
  // Kontrol (periode pantau, pembanding, jenis, ambang) memakai pengaturan
  // langsung; daftar peringatan dihitung dari salinan "tenang" yang baru
  // menyusul sesudah logo memuat tergambar.
  const [calm, recalculating] = useSettled(settings);
  // Panduan singkat: tampil sampai ditutup; pilihan itu diingat peramban.
  const [guide, setGuideState] = useState(() => readStore(GUIDE_STORE, true) !== false);
  const setGuide = (v) => {
    setGuideState(v);
    writeStore(GUIDE_STORE, v);
  };
  const [sevOn, setSevOn] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  // Panel ambang menempel pada tombol yang membukanya (di judul atau di bagian
  // Jenis & cara kerja), jadi selalu muncul di dekat tempat pengguna mengeklik.
  const [panel, setPanel] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesRef = useRef(null);

  // Penilaian "dulu" hanya bergantung pada panjang periode pantau, bukan ambang lain,
  // dan tidak dihitung sama sekali kalau kedua jenis "perubahan tahap" dimatikan.
  const watchDays = calm.watchDays ?? ALERT_DEFAULTS.watchDays;
  const offList = calm.off || [];
  const stageOn = !(offList.includes("stageNeg") && offList.includes("stagePos"));
  const prev = useMemo(
    () => (stageOn ? previousPortfolio({ lines, portfolio, win, crit, labels, watchDays }) : null),
    [stageOn, lines, portfolio, win, crit, labels, watchDays]
  );
  const res = useMemo(
    () => buildAlerts({ lines, portfolio, win, crit, settings: calm, labels, quality, today, prev }),
    [lines, portfolio, win, crit, calm, labels, quality, today, prev]
  );
  const W = res.windows;
  const U = res.unitDef;
  const changed = ALERT_THRESHOLD_KEYS.some((k) => settings[k] !== ALERT_DEFAULTS[k]);
  const unav = res.context.unavailable || {};
  const offRules = (res.context.off || []).filter((k) => !unav[k]);
  const isDefault =
    winMode === "12" && JSON.stringify(normalizeAlertCfg(settings)) === JSON.stringify(normalizeAlertCfg(null)) && win.asOf === win.dataTo;

  /* --- penyaring: tingkat + kata kunci --- */
  const needle = q.trim().toLowerCase();
  const visible = useMemo(
    () =>
      res.items.filter(
        (it) =>
          (sevOn.size === 0 || sevOn.has(it.severity)) &&
          (!needle || `${it.subject.label} ${it.subject.sub} ${it.headline} ${it.text}`.toLowerCase().includes(needle))
      ),
    [res.items, sevOn, needle]
  );
  const groups = ALERT_GROUPS.map((g) => ({ ...g, items: visible.filter((it) => it.group === g.key) }));
  const filled = groups.filter((g) => g.items.length);
  const empty = groups.filter((g) => !g.items.length && g.key !== "data");

  const toggleSev = (k) =>
    setSevOn((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleOpen = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jump = (key) => document.getElementById(`al-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const showRules = () => {
    setRulesOpen(true);
    requestAnimationFrame(() => rulesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const exportCsv = () => downloadCsv(alertsCsvRows(visible), `peringatan-${W.ref}.csv`);

  const setCfg = (patch) => setSettings((c) => normalizeAlertCfg({ ...c, ...patch }));

  const watchOptions = [
    ...WATCH_OPTIONS.map((d) => ({ key: d, label: `${d} hari` })),
    ...(WATCH_OPTIONS.includes(W.N) ? [] : [{ key: W.N, label: `${W.N} hari` }]),
  ];

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <BusyOverlay show={recalculating} label="Menghitung ulang peringatan…" sub="Sebentar, daftar peringatan sedang disusun ulang." />
      <WindowBar
        unitKey={unitKey}
        setUnitKey={setUnitKey}
        winMode={winMode}
        setWinMode={setWinMode}
        win={win}
        crit={crit}
        setCrit={setCrit}
        portfolio={portfolio}
        onMatchLength={onMatchLength}
        note={
          <>
            <b className="font-medium text-[var(--ink-800)]">Tingkat</b> = satuan produk yang dinilai.{" "}
            <b className="font-medium text-[var(--ink-800)]">Jendela</b> = periode panjang untuk menentukan kelas ABC dan tahap (disarankan 12 bulan) —
            bukan untuk mencari perubahan terbaru; itu diatur di <b className="font-medium text-[var(--ink-800)]">Periode pantau</b> di bawah.
          </>
        }
      />

      <div className="space-y-4 p-4">
        {/* ============================================ panduan singkat */}
        {guide && <Guide onHide={() => setGuide(false)} onRules={showRules} isDefault={isDefault} onReset={resetAlertView} />}

        {/* ============================================ kepala & penyaring */}
        <Section
          title={`Peringatan per ${dateText(W.ref)}`}
          icon={IconBell}
          tone="brand"
          sub={`Pantau ${rangeText(W.R)} dibanding ${W.cmpLabel} (${rangeText(W.B)}) · tingkat ${U.label.toLowerCase()}.`}
          bodyClass="p-0"
          actions={
            <>
              {!guide && (
                <button type="button" className={cx(BTN, "flex items-center gap-1.5")} onClick={() => setGuide(true)}>
                  <IconInfo className="h-4 w-4" />
                  Panduan
                </button>
              )}
              <button type="button" className={cx(BTN, "flex items-center gap-1.5")} onClick={showRules}>
                <IconChecklist className="h-4 w-4" />
                Jenis & cara kerja
              </button>
              <button
                type="button"
                className={cx(BTN, "flex items-center gap-1.5", changed && "border-[var(--brand-400)] text-[var(--brand-700)]")}
                onClick={(e) => {
                  const el = e.currentTarget;
                  setPanel((v) => (v === el ? null : el));
                }}
                aria-expanded={!!panel}
                data-dt-alertcfg=""
              >
                <IconSliders className="h-4 w-4" />
                Atur ambang{changed ? " (diubah)" : ""}
              </button>
              <button type="button" className={cx(BTN, "flex items-center gap-1.5")} onClick={exportCsv} disabled={!visible.length}>
                <IconDownload className="h-4 w-4" />
                Unduh CSV
              </button>
            </>
          }
        >
          <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b px-4 py-3", LINE)}>
            <Field label="Periode pantau">
              <Segmented
                label="Periode pantau"
                value={recalculating && settings.watchDays ? settings.watchDays : W.N}
                onChange={(v) => setCfg({ watchDays: v })}
                options={watchOptions}
              />
            </Field>
            <Field label="Pembanding">
              <Segmented
                label="Pembanding"
                value={settings.compare === "prev" ? "prev" : "yoy"}
                onChange={(v) => setCfg({ compare: v })}
                options={[
                  { key: "yoy", label: "Tahun lalu", hint: "Periode yang sama tahun lalu — aman dari pola musiman" },
                  { key: "prev", label: "Periode sebelumnya", hint: "N hari tepat sebelum periode pantau" },
                ]}
              />
            </Field>
            <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-[320px]">
              <span className="sr-only">Cari peringatan</span>
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-400)]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Cari ${U.plural}, cabang, kata…`}
                className={cx(
                  "w-full rounded-md border bg-[var(--paper)] py-1.5 pl-8 pr-2 text-xs text-[var(--ink-900)] placeholder:text-[var(--ink-400)] hover:border-[var(--brand-300)] focus:border-[var(--brand-400)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
                  LINE
                )}
              />
            </label>
            <p className="flex basis-full items-start gap-1.5 text-[11.5px] leading-snug text-[var(--ink-600)]">
              <IconInfo className="mt-px h-3.5 w-3.5 flex-none text-[var(--ink-400)]" />
              <span>
                <b className="font-medium text-[var(--ink-800)]">Periode pantau</b> = rentang terbaru yang diperiksa (30 hari cek cepat, 90 rutin, 180
                tren). <b className="font-medium text-[var(--ink-800)]">Pembanding</b> = patokan untuk menilai naik/turun; <i>Tahun lalu</i> aman dari
                pola musiman. Sekarang: {rangeText(W.R)} dibanding {rangeText(W.B)}.
              </span>
            </p>
          </div>

          {W.notes.length > 0 && (
            <div className={cx("space-y-1.5 border-b px-4 py-3", LINE)}>
              {W.notes.map((n) => (
                <Notice key={n.key} tone={n.level === "warn" ? "warn" : "info"} className="py-2">
                  {n.text}
                </Notice>
              ))}
            </div>
          )}

          {/* ---------------- ubin tingkat ---------------- */}
          <div className="grid grid-cols-2 gap-2.5 px-4 py-3 lg:grid-cols-4">
            {SEVERITIES.map((sv) => (
              <SeverityTile
                key={sv.key}
                sev={sv}
                count={res.counts[sv.key]}
                top={res.items.find((it) => it.severity === sv.key)}
                active={sevOn.has(sv.key)}
                dimmed={sevOn.size > 0 && !sevOn.has(sv.key)}
                onClick={() => toggleSev(sv.key)}
              />
            ))}
          </div>

          <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 text-[11.5px]", LINE)}>
            <span className={MUTED}>
              {visible.length === res.items.length
                ? `${nfFull.format(res.items.length)} peringatan`
                : `${nfFull.format(visible.length)} dari ${nfFull.format(res.items.length)} peringatan`}
            </span>
            {filled.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => jump(g.key)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border border-[var(--ink-200)] bg-[var(--paper)] px-2.5 py-0.5 text-[11.5px] text-[var(--ink-700)] transition-colors hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]",
                  FOCUS
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: TONES[g.tone].solid }} aria-hidden="true" />
                {g.title}
                <b className="font-semibold tabular-nums">{g.items.length}</b>
              </button>
            ))}
            {(sevOn.size > 0 || needle) && (
              <button
                type="button"
                className={BTN_QUIET}
                onClick={() => {
                  setSevOn(new Set());
                  setQ("");
                }}
              >
                Hapus penyaring
              </button>
            )}
            {offRules.length > 0 && (
              <button type="button" className={BTN_QUIET} onClick={showRules} title={offRules.map((k) => RULE_TITLE[k]).join(", ")}>
                {nfFull.format(offRules.length)} jenis peringatan dimatikan
              </button>
            )}
            <span className={cx("ml-auto inline-flex items-center gap-2", MUTED)}>
              Grafik mini 15 bulan:
              <Swatch color="var(--p1)" /> periode pantau
              <Swatch color="var(--p2)" /> pembanding
            </span>
          </div>
        </Section>

        {/* ============================================ kelompok */}
        {res.items.length === 0 ? (
          <Section title="Tidak ada peringatan" icon={IconBell} tone="teal">
            <p className="max-w-[80ch] text-[12.5px] leading-relaxed text-[var(--ink-700)]">
              Dengan ambang yang berlaku, tidak ada {U.plural}, cabang, atau kanal yang perlu diperhatikan untuk {rangeText(W.R)}. Kalau
              terasa terlalu sepi, longgarkan ambangnya di <b>Atur ambang</b> — misalnya turunkan batas penurunan atau hari tanpa penjualan.
            </p>
            {offRules.length > 0 && (
              <p className="mt-2 flex max-w-[80ch] flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                <span>
                  {nfFull.format(offRules.length)} dari {nfFull.format(ALERT_RULES.length)} jenis peringatan sedang dimatikan, jadi temuannya tidak
                  dihitung.
                </span>
                <button type="button" className={BTN} onClick={() => setCfg({ off: [] })}>
                  Aktifkan semua jenis
                </button>
              </p>
            )}
          </Section>
        ) : visible.length === 0 ? (
          <Notice tone="neutral">Tidak ada peringatan yang cocok dengan penyaring. Hapus penyaring untuk melihat semuanya.</Notice>
        ) : (
          filled.map((g) => (
            <AlertGroup
              key={g.key}
              group={g}
              items={g.items}
              openIds={openIds}
              onToggle={toggleOpen}
              res={res}
              lines={lines}
              labels={labels}
              win={win}
              portfolio={portfolio}
              openProduct={openProduct}
              explainPeriod={explainPeriod}
            />
          ))
        )}

        {res.items.length > 0 && empty.length > 0 && (
          <div className={cx("flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--paper)] px-4 py-2.5 text-[12px]", LINE)}>
            <span className="text-[var(--pos)]" aria-hidden="true">
              ✓
            </span>
            <span className="text-[var(--ink-700)]">Tidak ada temuan{sevOn.size || needle ? " yang cocok dengan penyaring" : ""} di:</span>
            {empty.map((g) => (
              <span key={g.key} className="rounded-full bg-[var(--ink-50)] px-2 py-0.5 text-[11.5px] text-[var(--ink-600)]">
                {g.title}
              </span>
            ))}
          </div>
        )}

        {/* ============================================ cara kerja */}
        <div ref={rulesRef}>
          <RulesSection
            open={rulesOpen}
            setOpen={setRulesOpen}
            res={res}
            crit={crit}
            setCfg={setCfg}
            live={settings}
            panelOpen={!!panel}
            onSettings={(e) => {
              const el = e.currentTarget;
              setPanel((v) => (v === el ? null : el));
            }}
          />
        </div>
      </div>

      {panel && <ThresholdPanel anchor={panel} settings={settings} setCfg={setCfg} unavailable={unav} onClose={() => setPanel(null)} />}
    </div>
  );
}

/* ================================================================ potongan */

function Swatch({ color }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} aria-hidden="true" />;
}

/** Panduan singkat empat langkah — urutan kerja yang disarankan di halaman ini. */
function Guide({ onHide, onRules, isDefault, onReset }) {
  const steps = [
    {
      t: "Pilih tanggal acuan",
      d: (
        <>
          Kotak <b className="font-medium text-[var(--ink-800)]">Dinilai per</b> di bilah atas. Biarkan di data terbaru, kecuali ingin melihat kondisi
          pada tanggal lain.
        </>
      ),
    },
    {
      t: "Atur periode pantau",
      d: (
        <>
          Rentang terbaru yang diperiksa, dibanding <b className="font-medium text-[var(--ink-800)]">tahun lalu</b> supaya musim ramai/sepi tidak
          mengecoh. 90 hari cocok untuk pemantauan rutin.
        </>
      ),
    },
    {
      t: "Baca dari yang Kritis",
      d: (
        <>
          Klik ubin untuk menyaring per tingkat. Klik sebuah baris untuk melihat angka, <b className="font-medium text-[var(--ink-800)]">Cara hitung</b>,
          dan penyebab terbesarnya.
        </>
      ),
    },
    {
      t: "Tindak lanjuti",
      d: (
        <>
          <b className="font-medium text-[var(--ink-800)]">Buka diagnosis</b> untuk konteks produk;{" "}
          <b className="font-medium text-[var(--ink-800)]">Telusuri</b> untuk mengurai angka penurunannya. Periode yang terganti bisa dikembalikan dari
          bilah kuning di atas.
        </>
      ),
    },
  ];
  return (
    <Section
      title="Cara pakai halaman ini"
      icon={IconInfo}
      tone="blue"
      bodyClass="p-0"
      actions={
        <button type="button" className={BTN_QUIET} onClick={onHide}>
          Sembunyikan panduan
        </button>
      }
    >
      <ol className="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.t} className="flex min-w-0 gap-2.5">
            <span
              className="mt-px grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: TONES.blue.solid }}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-[var(--ink-900)]">{st.t}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ink-600)]">{st.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-2.5 text-[11.5px] leading-snug text-[var(--ink-600)]", LINE)}>
        {/* basis 18rem: di ponsel teks memakai lebar penuh dan tombolnya turun ke bawah, bukan teks yang terjepit */}
        <span className="min-w-0 flex-[1_1_18rem]">
          Jenis peringatan yang tidak kamu pakai bisa dimatikan di{" "}
          <button
            type="button"
            className="whitespace-nowrap font-medium text-[var(--brand-700)] underline decoration-[var(--brand-200)] underline-offset-2 hover:decoration-[var(--brand-500)]"
            onClick={onRules}
          >
            Jenis & cara kerja
          </button>
          ; ambangnya diatur di <b className="font-medium text-[var(--ink-800)]">Atur ambang</b>.
        </span>
        {onReset && (
          <button
            type="button"
            className={BTN}
            onClick={onReset}
            disabled={isDefault}
            title="Jendela 12 bulan, periode pantau 90 hari vs tahun lalu, semua ambang dan jenis peringatan bawaan, tanggal acuan = data terbaru. Kriteria tidak diubah."
          >
            {isDefault ? "Sudah memakai pengaturan bawaan" : "Kembalikan semua ke bawaan"}
          </button>
        )}
      </div>
    </Section>
  );
}

/** Lencana tingkat: ikon + label, warna hanya penegas. */
function SevChip({ sev, className }) {
  const S = SEVERITY_BY_KEY[sev];
  const t = TONES[S.tone];
  const Icon = SEV_ICON[sev];
  return (
    <span
      className={cx("inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}
      style={{ background: t.tint, color: t.ink, boxShadow: `inset 0 0 0 1px ${t.line}` }}
      title={S.hint}
    >
      <Icon className="h-3.5 w-3.5" />
      {S.label}
    </span>
  );
}

/** Ubin jumlah per tingkat; klik untuk menyaring. */
function SeverityTile({ sev, count, top, active, dimmed, onClick }) {
  const t = TONES[sev.tone];
  const Icon = SEV_ICON[sev.key];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${sev.hint} Klik untuk ${active ? "berhenti menyaring" : "hanya menampilkan tingkat ini"}.`}
      className={cx(
        "min-w-0 rounded-lg border px-3 py-2.5 text-left transition-[box-shadow,opacity] hover:shadow-[0_2px_8px_-4px_rgba(36,26,31,.25)]",
        FOCUS,
        dimmed && "opacity-55"
      )}
      style={{
        background: t.tint,
        borderColor: active ? t.solid : t.line,
        boxShadow: active ? `inset 0 0 0 1px ${t.solid}` : undefined,
      }}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: t.ink }}>
        <Icon className="h-4 w-4" />
        {sev.label}
        {active && <span className="ml-auto text-[10.5px] font-medium">disaring</span>}
      </span>
      <span className="dt-display mt-0.5 block text-[24px] font-semibold leading-tight text-[var(--ink-900)]">{nfFull.format(count)}</span>
      <span className="block truncate text-[11px] font-medium text-[var(--ink-700)]">{sev.brief}</span>
      <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-500)]">
        {top ? `teratas: ${top.subject.label}` : sev.key === "kritis" ? "tidak ada yang mendesak" : "—"}
      </span>
    </button>
  );
}

/** Kolom mini bulanan: pantau (anggur), pembanding (biru), lainnya abu. */
function AlertSpark({ series, endM, R, B, width = 96, height = 28 }) {
  if (!series) return null;
  const n = series.length;
  const max = Math.max(...series, 1);
  const gap = 1.5;
  const bw = Math.max(1, (width - gap * (n - 1)) / n);
  const r0 = monthIndex(R.from);
  const b0 = monthIndex(B.from);
  const b1 = monthIndex(B.to);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--ink-200)" strokeWidth="1" />
      {series.map((v, i) => {
        const m = endM - n + 1 + i;
        const fill = m >= r0 ? "var(--p1)" : m >= b0 && m <= b1 ? "var(--p2)" : "var(--ink-300)";
        if (!(v > 0)) return <rect key={i} x={i * (bw + gap)} y={height - 2} width={bw} height={1} fill={fill} opacity=".45" />;
        const h = Math.max(1.5, (v / max) * (height - 3));
        return <rect key={i} x={i * (bw + gap)} y={height - 1 - h} width={bw} height={h} rx={Math.min(1, bw / 2)} fill={fill} />;
      })}
    </svg>
  );
}

/* ================================================================ kelompok */

function AlertGroup({ group, items, openIds, onToggle, res, lines, labels, win, portfolio, openProduct, explainPeriod }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, GROUP_LIMIT);
  const counts = SEVERITIES.map((s) => [s, items.filter((it) => it.severity === s.key).length]).filter(([, n]) => n > 0);
  return (
    <Section
      id={`al-${group.key}`}
      title={`${group.title} · ${nfFull.format(items.length)}`}
      sub={group.sub}
      icon={GROUP_ICON[group.key]}
      tone={group.tone}
      bodyClass="p-2.5"
      actions={
        <span className="hidden flex-wrap items-center gap-1.5 sm:flex">
          {counts.map(([s, n]) => (
            <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-700)]">
              <SevChip sev={s.key} />
              <b className="tabular-nums">{n}</b>
            </span>
          ))}
        </span>
      }
    >
      <ul className="space-y-2">
        {shown.map((it) => (
          <AlertRow
            key={it.id}
            it={it}
            open={openIds.has(it.id)}
            onToggle={() => onToggle(it.id)}
            res={res}
            lines={lines}
            labels={labels}
            win={win}
            portfolio={portfolio}
            openProduct={openProduct}
            explainPeriod={explainPeriod}
          />
        ))}
      </ul>
      {items.length > GROUP_LIMIT && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pb-0.5 pt-2.5 text-[11px] text-[var(--ink-500)]">
          <span>
            Menampilkan {nfFull.format(shown.length)} dari {nfFull.format(items.length)} peringatan
          </span>
          <ShowAll total={items.length} limit={GROUP_LIMIT} open={all} onToggle={() => setAll((v) => !v)} noun="peringatan" />
        </div>
      )}
    </Section>
  );
}

function AlertRow({ it, open, onToggle, res, lines, labels, win, portfolio, openProduct, explainPeriod }) {
  const S = SEVERITY_BY_KEY[it.severity];
  const t = TONES[S.tone];
  const W = res.windows;
  const endM = monthIndex(W.ref);
  return (
    <li
      className="relative overflow-hidden rounded-lg border bg-[var(--paper)] transition-colors"
      style={{ borderColor: open ? t.line : "var(--ink-200)" }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.solid }} aria-hidden="true" />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cx(
          "grid w-full grid-cols-1 items-start gap-x-4 gap-y-1.5 py-2.5 pl-4 pr-3 text-left transition-colors hover:bg-[var(--ink-50)] md:grid-cols-[minmax(0,1fr)_96px_8.5rem_1rem]",
          FOCUS
        )}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <SevChip sev={it.severity} />
            <span className="min-w-0 max-w-full truncate text-[13px] font-semibold text-[var(--ink-900)]" title={it.subject.label}>
              {it.subject.label}
            </span>
            {it.subject.sub && <span className="truncate text-[11px] text-[var(--ink-500)]">{it.subject.sub}</span>}
          </span>
          <span className="mt-1 block text-[12.5px] font-medium text-[var(--ink-800)]">
            {it.polarity === "neg" || it.polarity === "pos" ? (
              <span className={cx("inline-flex items-center gap-1", it.polarity === "neg" ? "text-[var(--neg)]" : "text-[var(--pos)]")}>
                {/* Warna = baik/buruk; panah = arah angkanya. "Tertinggal dari total"
                    bisa saja naik (hanya lebih lambat), jadi tanpa panah. */}
                {it.rule !== "dimLag" && <Arrow dir={it.polarity === "neg" ? "down" : "up"} />}
                {it.headline}
              </span>
            ) : (
              it.headline
            )}
            <span className="font-normal text-[var(--ink-500)]"> · {it.ruleTitle}</span>
          </span>
          <span className={cx("mt-0.5 block text-[12px] leading-snug text-[var(--ink-600)]", !open && "line-clamp-2")}>{it.text}</span>
          {it.also.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {it.also.map((a) => (
                <span
                  key={a.rule}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--ink-200)] bg-[var(--ink-50)] px-2 py-0.5 text-[11px] text-[var(--ink-700)]"
                  title={a.text}
                >
                  <span className="text-[var(--ink-400)]">juga</span> {a.headline}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="hidden self-center md:block">
          <AlertSpark series={it.spark} endM={endM} R={W.R} B={W.B} />
        </span>
        {/* Di layar sempit dampak turun ke bawah teks, sebaris dengan artinya. */}
        <span className="flex flex-wrap items-baseline gap-x-2 md:block md:self-center md:text-right">
          {it.impact != null ? (
            <>
              <span className={cx("whitespace-nowrap text-[13px] font-semibold tabular-nums md:block", it.impact < 0 ? "text-[var(--neg)]" : "text-[var(--pos)]")}>
                {plusRp(it.impact)}
              </span>
              <span className="text-[10.5px] leading-tight text-[var(--ink-500)] md:block">{it.impactLabel}</span>
            </>
          ) : (
            <span className="hidden text-[11px] text-[var(--ink-400)] md:inline">—</span>
          )}
        </span>
        <span className="hidden self-center md:block" aria-hidden="true">
          <svg viewBox="0 0 12 12" className={cx("h-3 w-3 text-[var(--ink-400)] transition-transform", open && "rotate-180")}>
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <AlertDetail
          it={it}
          res={res}
          lines={lines}
          labels={labels}
          win={win}
          portfolio={portfolio}
          openProduct={openProduct}
          explainPeriod={explainPeriod}
        />
      )}
    </li>
  );
}

/* ================================================================ rincian  */

function AlertDetail({ it, res, lines, labels, win, portfolio, openProduct, explainPeriod }) {
  const W = res.windows;

  /* Di mana perubahannya paling terpusat (hanya dimensi yang lebih halus). */
  const where = useMemo(() => {
    if (!it.explain || !it.subject.dim || it.subject.kind === "data") return null;
    if (it.impact == null || ["concentration", "customer"].includes(it.rule)) return null;
    const sd = it.subject.dim;
    const fam = DIM_FAMILY[sd];
    const dims = EXPLORE_DIMS.filter(
      (d) => dimOk(d) && d !== sd && DIM_FAMILY[d] !== "waktu" && !(fam && DIM_FAMILY[d] === fam && (DEPTH[d] ?? 9) <= (DEPTH[sd] ?? 9))
    );
    if (!dims.length) return null;
    const scope = lines.filter((ln) => ln[sd] === it.subject.key);
    const ex = explainDims(scope, dims, { p1: it.explain.p1, p2: it.explain.p2 }, labels).filter((e) => e.n > 1 && e.dT !== 0);
    const best = ex[0];
    if (!best || best.power <= 0) return null;
    return { label: best.label, sentence: best.sentence, p1: it.explain.p1, p2: it.explain.p2 };
  }, [it, lines, labels]);

  /* Untuk "tergeser saudara": seberapa banyak penurunan per cabang tertutup saudara. */
  const switching = useMemo(() => {
    if (it.rule !== "cannibal" || !it.unit || !portfolio?.unitDef?.parent) return null;
    return switchingSignal(lines, {
      unit: portfolio.unit,
      key: it.unit.key,
      parentField: portfolio.unitDef.parent,
      parentValue: it.unit.parent,
      win,
    });
  }, [it, lines, portfolio, win]);

  const parentLabel = it.unit && portfolio?.unitDef?.parent ? valueLabel(portfolio.unitDef.parent, it.unit.parent, labels) : null;

  return (
    <div className={cx("grid gap-x-6 gap-y-4 border-t bg-[var(--band)] px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]", LINE)}>
      <div className="min-w-0">
        {it.facts?.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {it.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[10.5px] text-[var(--ink-500)]">{f.label}</dt>
                <dd className="truncate text-[12px] font-semibold text-[var(--ink-900)]" title={String(f.value)}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {where && (
          <div className="mt-3 rounded-md border border-[var(--ink-200)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed">
            <div className="text-[10.5px] font-semibold text-[var(--ink-500)]">
              Paling terpusat di {where.label.toLowerCase()} ({rangeText(where.p1)} vs {rangeText(where.p2)})
            </div>
            <div className="text-[var(--ink-800)]">{where.sentence}</div>
          </div>
        )}
        {switching && switching.ratio != null && (
          <div className="mt-3 rounded-md border border-[var(--ink-200)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-800)]">
            Di {nfFull.format(switching.nLossBranches)} cabang tempat produk ini turun (total {rp(switching.loss)}), {nfPct.format(switching.ratio)} penurunannya
            tertutup kenaikan produk lain di {parentLabel}. Makin mendekati 100%, makin kuat dugaan pembeli beralih — tetap indikasi, bukan bukti.
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {it.unit && openProduct && (
            <button type="button" className={BTN} onClick={() => openProduct(it.unit.key)}>
              Buka diagnosis
            </button>
          )}
          {it.sibling && openProduct && (
            <button type="button" className={BTN} onClick={() => openProduct(it.sibling.key)}>
              Diagnosis {it.sibling.label.length > 28 ? `${it.sibling.label.slice(0, 27)}…` : it.sibling.label}
            </button>
          )}
          {it.explain && explainPeriod && (
            <button
              type="button"
              className={BTN}
              onClick={() => explainPeriod(it.explain)}
              title="Membuka Penjelasan perubahan untuk subjek ini dengan periode yang sama seperti peringatan ini. Periode di bilah atas ikut diganti."
            >
              Telusuri di Penjelasan perubahan
            </button>
          )}
        </div>
        {(it.unit || it.explain) && (
          <p className="mt-2 text-[11px] leading-snug text-[var(--ink-500)]">
            {it.unit && openProduct ? "Buka diagnosis: melihat produk ini utuh (kelas, tahap, rekomendasi, riwayat); periode tidak berubah. " : ""}
            {it.explain && explainPeriod
              ? "Telusuri: mengurai angka peringatan ini; periode di bilah atas ikut diganti dan bisa dikembalikan dari bilah kuning."
              : ""}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <h4 className="text-[11.5px] font-semibold text-[var(--ink-700)]">Cara hitung</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-[var(--ink-700)] marker:text-[var(--ink-400)]">
          {(it.calc || []).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
        {it.also.map((a) => (
          <div key={a.rule} className="mt-3 border-t border-[var(--ink-200)] pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ink-700)]">
              <SevChip sev={a.severity} />
              {a.ruleTitle}: {a.headline}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-700)]">{a.text}</p>
            {a.calc?.length > 0 && (
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-[var(--ink-700)] marker:text-[var(--ink-400)]">
                {a.calc.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <p className="mt-3 text-[11px] text-[var(--ink-500)]">
          Periode pantau {rangeText(W.R)} · pembanding {rangeText(W.B)}.
        </p>
      </div>
    </div>
  );
}

/* ================================================================ aturan   */

function RulesSection({ open, setOpen, res, crit, setCfg, onSettings, panelOpen, live }) {
  // Sakelar jenis peringatan mengikuti pengaturan langsung, supaya langsung berganti saat diklik.
  const s = live ? normalizeAlertCfg(live) : res.settings;
  const W = res.windows;
  const ctx = res.context;
  const unav = ctx.unavailable || {};
  const off = new Set(s.off || []);
  const nUnav = ALERT_RULES.filter((r) => unav[r.key]).length;
  const nOff = ALERT_RULES.filter((r) => !unav[r.key] && off.has(r.key)).length;
  const nOn = ALERT_RULES.length - nUnav - nOff;
  const toggle = (key, on) => {
    const next = new Set(off);
    if (on) next.delete(key);
    else next.add(key);
    setCfg({ off: Array.from(next) });
  };
  const rows = ALERT_RULES.map((r) => {
    const g = ALERT_GROUPS.find((x) => x.key === r.group);
    const na = unav[r.key];
    return {
      r,
      groupText: r.key.startsWith("dim") ? "Cabang, wilayah & kanal · Lini & kategori" : g?.title,
      na,
      on: !na && !off.has(r.key),
    };
  });
  return (
    <Section
      title="Jenis peringatan & cara kerja"
      icon={IconChecklist}
      tone="mauve"
      sub={`${nOn} dari ${ALERT_RULES.length} jenis aktif${nOff ? ` · ${nOff} dimatikan` : ""}${nUnav ? ` · ${nUnav} tidak tersedia untuk data ini` : ""}. Matikan jenis yang tidak kamu pakai — daftar dan jumlahnya langsung menyesuaikan.`}
      bodyClass={open ? "p-4" : "p-0"}
      actions={
        <>
          {nOff > 0 && (
            <button type="button" className={BTN} onClick={() => setCfg({ off: [] })}>
              Aktifkan semua
            </button>
          )}
          <button type="button" className={BTN} onClick={onSettings} aria-expanded={panelOpen} data-dt-alertcfg="">
            Atur ambang
          </button>
          <button type="button" className={BTN} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Sembunyikan" : "Tampilkan"}
          </button>
        </>
      }
    >
      {open && (
        <div className="space-y-5 text-[12.5px] leading-relaxed text-[var(--ink-800)]">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-[12.5px] font-semibold text-[var(--ink-900)]">Periode</h3>
              <p className="mt-1">
                <b>Periode pantau</b> = {nfFull.format(W.N)} hari yang berakhir di tanggal acuan ({rangeText(W.R)}). Tanggal acuan = <b>Dinilai per</b> di
                bilah atas, tetapi tidak pernah melewati transaksi terakhir di data. <b>Pembanding</b> ={" "}
                {W.mode === "yoy" ? "periode yang sama tahun lalu, supaya pola musiman tidak terbaca sebagai naik/turun" : `${nfFull.format(W.N)} hari tepat sebelumnya`} (
                {rangeText(W.B)}).
              </p>
              <p className="mt-1.5">
                <b>Kelas ABC</b> dan <b>tahap siklus hidup</b> dari Jendela P1/P2 di atas, sama dengan halaman Portofolio. Perubahan tahap membandingkan
                tahap sekarang dengan tahap {ctx.shiftText}.
              </p>
            </div>
            <div>
              <h3 className="text-[12.5px] font-semibold text-[var(--ink-900)]">Tingkat</h3>
              <ul className="mt-1 space-y-1.5">
                {SEVERITIES.map((sv) => (
                  <li key={sv.key} className="flex items-start gap-2">
                    <SevChip sev={sv.key} className="mt-px" />
                    <span>{sv.hint}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] text-[var(--ink-600)]">
                Kalau satu {res.unitDef.plural} atau cabang kena beberapa aturan searah, aturan paling atas di daftar bawah ini menjadi judul dan menentukan tingkat;
                sisanya tampil sebagai catatan “juga …”, jadi tidak ada yang muncul dua kali. Dampak rupiah: minus = pendapatan yang hilang atau tertunda,
                plus = tambahan.
              </p>
            </div>
          </div>

          {/* Lebar cukup → tabel; sempit (ponsel, panel sempit) → kartu bertumpuk supaya Syarat tidak perlu digeser ke samping. */}
          <div className="@container">
            <ul className="divide-y divide-[var(--ink-100)] border-y border-[var(--ink-100)] text-[12px] @2xl:hidden">
              {rows.map(({ r, groupText, na, on }) => (
                <li key={r.key} className={cx("px-1 py-2.5", !on && "bg-[var(--ink-50)]")}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={cx("min-w-0", !on && "opacity-60")}>
                      <span className="block font-semibold text-[var(--ink-900)]">{r.title}</span>
                      <span className="block text-[11px] text-[var(--ink-500)]">{groupText}</span>
                    </span>
                    <RuleState r={r} na={na} on={on} toggle={toggle} />
                  </div>
                  <p className={cx("mt-1", !on && "opacity-60")}>{r.when(s, crit, ctx)}</p>
                  {na && <p className="mt-1 text-[11px] font-medium text-[var(--ink-600)]">Tidak tersedia: {na}.</p>}
                  <p className={cx("mt-1 text-[11.5px] text-[var(--ink-600)]", !on && "opacity-60")}>
                    <span className="font-medium text-[var(--ink-700)]">Tingkat:</span> {r.level}
                  </p>
                </li>
              ))}
            </ul>
            <div className="dt-scroll hidden overflow-x-auto @2xl:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
                    <th className="w-[92px] py-2 pr-3 font-medium">Aktif</th>
                    <th className="py-2 pr-3 font-medium">Peringatan</th>
                    <th className="py-2 pr-3 font-medium">Syarat</th>
                    <th className="py-2 font-medium">Tingkat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, groupText, na, on }) => (
                    <tr key={r.key} className={cx("border-b border-[var(--ink-100)] align-top", !on && "bg-[var(--ink-50)]")}>
                      <td className="py-2 pr-3">
                        <RuleState r={r} na={na} on={on} toggle={toggle} />
                      </td>
                      <td className={cx("py-2 pr-3", !on && "opacity-60")}>
                        <span className="block font-semibold text-[var(--ink-900)]">{r.title}</span>
                        <span className="block text-[11px] text-[var(--ink-500)]">{groupText}</span>
                      </td>
                      <td className={cx("py-2 pr-3", !on && "opacity-60")}>
                        {r.when(s, crit, ctx)}
                        {na && <span className="mt-1 block text-[11px] font-medium text-[var(--ink-600)]">Tidak tersedia: {na}.</span>}
                      </td>
                      <td className={cx("py-2 text-[var(--ink-700)]", !on && "opacity-60")}>{r.level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Sakelar + label Aktif/Mati, atau pil "tidak tersedia" bila datanya tidak mendukung. */
function RuleState({ r, na, on, toggle }) {
  if (na) {
    return (
      <span className="inline-block flex-none whitespace-nowrap rounded-full bg-[var(--ink-100)] px-2 py-0.5 text-[10.5px] text-[var(--ink-500)]">
        tidak tersedia
      </span>
    );
  }
  return (
    <span className="inline-flex flex-none items-center gap-2">
      <RuleSwitch on={on} onChange={(v) => toggle(r.key, v)} label={`${on ? "Matikan" : "Nyalakan"} peringatan ${r.title}`} />
      <span className={cx("w-[30px] text-[11px]", on ? "text-[var(--ink-700)]" : "text-[var(--ink-500)]")}>{on ? "Aktif" : "Mati"}</span>
    </span>
  );
}

/** Sakelar kecil untuk menyalakan/mematikan satu jenis peringatan. */
function RuleSwitch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-[18px] w-8 flex-none rounded-full transition-colors", FOCUS, on ? "bg-[var(--brand-700)]" : "bg-[var(--ink-300)]")}
    >
      <span className={cx("absolute top-[3px] h-3 w-3 rounded-full bg-white shadow transition-[left]", on ? "left-[17px]" : "left-[3px]")} />
    </button>
  );
}

/* ================================================================ ambang   */

/** Kolom angka yang menyimpan ketikan sementara — desimal seperti 0,5 bisa diketik. */
function ThresholdField({ label, hint, value, onCommit, min, max, step = 1, suffix }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(value).replace(".", ",");
  const commit = () => {
    if (draft == null) return;
    const v = Number(String(draft).replace(",", "."));
    if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, v)));
    setDraft(null);
  };
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-xs text-[var(--ink-800)]">{label}</span>
        {hint && <span className={cx("block text-[10.5px] leading-snug", MUTED)}>{hint}</span>}
      </span>
      <span className="flex flex-none items-center gap-1">
        <input
          inputMode="decimal"
          className={cx(
            "w-16 rounded-md border bg-[var(--ink-50)] px-2 py-1 text-right text-xs text-[var(--ink-900)] focus:border-[var(--brand-400)] focus:bg-[var(--paper)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]",
            LINE
          )}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const v = Number(String(shown).replace(",", ".")) || 0;
              const next = +(v + (e.key === "ArrowUp" ? step : -step)).toFixed(3);
              onCommit(Math.max(min, Math.min(max, next)));
              setDraft(null);
            }
          }}
          aria-label={label}
        />
        <span className={cx("w-8 text-[11px]", MUTED)}>{suffix}</span>
      </span>
    </label>
  );
}

const PCT = (x) => +(x * 100).toFixed(3);
const FIELD_GROUPS = [
  {
    head: "Berhenti terjual",
    fields: [
      { k: "silentDays", label: "Tidak terjual minimal", hint: "Produk andalan, cabang, kanal", min: 7, max: 365, suffix: "hari" },
      { k: "silentFactor", label: "Kelipatan jeda normal", hint: "Diam harus ≥ sekian kali jeda biasanya", min: 1, max: 20, step: 0.5, suffix: "×" },
    ],
  },
  {
    head: "Turun & naik",
    fields: [
      { k: "dropPct", pct: true, label: "Turun lebih dari", hint: "Produk andalan dan cabang/kategori", min: 5, max: 95, suffix: "%" },
      { k: "surgePct", pct: true, label: "Lonjakan: naik lebih dari", hint: "Juga harus ≥ 1,5× laju total", min: 10, max: 1000, step: 10, suffix: "%" },
      { k: "minTx", label: "Minimal transaksi", hint: "Di periode pembanding", min: 1, max: 100, suffix: "trx" },
      { k: "minShareDim", pct: true, label: "Porsi minimal cabang/kategori", hint: "Dari total pembanding", min: 0, max: 20, step: 0.1, suffix: "%" },
      { k: "minShareProduct", pct: true, label: "Porsi minimal lonjakan produk", hint: "Dari total periode pantau", min: 0, max: 10, step: 0.05, suffix: "%" },
    ],
  },
  {
    head: "Harga & ketergantungan",
    fields: [
      { k: "priceDrop", pct: true, label: "Harga bersih turun lebih dari", min: 1, max: 90, suffix: "%" },
      { k: "concentration", pct: true, label: "Satu cabang menyumbang ≥", hint: "Produk kelas A", min: 30, max: 100, suffix: "%" },
      { k: "customerShare", pct: true, label: "Satu pelanggan menyumbang ≥", hint: "Produk kelas A", min: 20, max: 100, suffix: "%" },
    ],
  },
];

function ThresholdPanel({ anchor, settings, setCfg, unavailable, onClose }) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);
  const s = normalizeAlertCfg(settings);
  const off = new Set(s.off);
  // Ambang hanya ditampilkan kalau masih ada jenis peringatan aktif yang memakainya.
  const used = (k) => (THRESHOLD_RULES[k] || []).some((r) => !off.has(r) && !unavailable?.[r]);
  const groups = FIELD_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => used(f.k)) })).filter((g) => g.fields.length);
  const hidden = FIELD_GROUPS.reduce((t, g) => t + g.fields.filter((f) => !used(f.k)).length, 0);

  useLayoutEffect(() => {
    // Di bawah tombolnya; kalau tidak muat, di atasnya; selalu di dalam layar.
    // Ikut bergeser bersama tombolnya saat halaman digulir atau layar berubah ukuran.
    const place = () => {
      const box = boxRef.current;
      if (!box) return;
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const a = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : { top: 72, right: window.innerWidth - 12, bottom: 72 };
      const left = Math.max(12, Math.min(a.right - w, window.innerWidth - w - 12));
      let top = a.bottom + 8;
      if (top + h > window.innerHeight - 12) top = a.top - h - 8;
      top = Math.max(12, Math.min(top, window.innerHeight - h - 12));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    let raf = 0;
    const later = (e) => {
      // Menggulir isi panel sendiri tidak menggeser panelnya.
      if (e && e.type === "scroll" && e.target instanceof Node && boxRef.current?.contains(e.target)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", later);
      window.removeEventListener("scroll", later, true);
    };
  }, [anchor]);

  useClickOutside(boxRef, onClose, true, "[data-dt-alertcfg]");

  const resetThresholds = () => setCfg(Object.fromEntries(ALERT_THRESHOLD_KEYS.map((k) => [k, ALERT_DEFAULTS[k]])));

  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div
        ref={boxRef}
        className={cx(MENU, "dt-pop dt-scroll fixed z-[9999] max-h-[82vh] w-[380px] max-w-[calc(100vw-24px)] overflow-auto p-0")}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
        role="dialog"
        aria-label="Ambang peringatan"
      >
        <div className={cx("border-b px-4 py-3", LINE)}>
          <div className="text-[13px] font-semibold text-[var(--ink-900)]">Ambang peringatan</div>
          <p className={cx("mt-0.5 text-[11px] leading-snug", MUTED)}>
            Kapan sesuatu dianggap perlu diperingatkan. Daftar dihitung ulang seketika dan pengaturannya diingat peramban ini.
          </p>
        </div>
        <div className="px-4 py-2">
          {groups.length === 0 && <p className={cx("py-3 text-xs", MUTED)}>Semua jenis peringatan yang memakai ambang sedang dimatikan.</p>}
          {groups.map((g) => (
            <div key={g.head}>
              <div className="pb-1 pt-3 text-[11px] font-semibold text-[var(--ink-700)]">{g.head}</div>
              {g.fields.map((f) => (
                <ThresholdField
                  key={f.k}
                  label={f.label}
                  hint={f.hint}
                  value={f.pct ? PCT(s[f.k]) : s[f.k]}
                  onCommit={(v) => setCfg({ [f.k]: f.pct ? v / 100 : v })}
                  min={f.min}
                  max={f.max}
                  step={f.step || 1}
                  suffix={f.suffix}
                />
              ))}
            </div>
          ))}
          {hidden > 0 && (
            <p className={cx("pb-1 pt-3 text-[10.5px] leading-snug", MUTED)}>
              {hidden} ambang disembunyikan karena jenis peringatannya dimatikan atau tidak tersedia untuk data ini.
            </p>
          )}
        </div>
        <div className={cx("flex justify-between border-t px-4 py-2.5", LINE)}>
          <button type="button" className={BTN_QUIET} onClick={resetThresholds}>
            Kembalikan ambang bawaan
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
