/* ============================================================================
   Halaman: Diagnosis produk
   ----------------------------------------------------------------------------
   Satu produk, dibedah sampai bisa diputuskan. Urutannya sengaja:
   kesimpulan dulu (rekomendasi, alasan, dampak kalau dicabut), baru bukti:

   1. Kurva siklus hidup     — di mana posisinya, sudah lewat puncak?
   2. Kenapa berubah         — cabang, frekuensi, nilai/harga (LMDI)
   3. Di mana berubah        — dimensi yang paling menjelaskan, bisa digali
   4. Dibanding induknya     — masalah produk atau masalah pasar?
   5. Produk sejenis         — ada pengganti? pelanggan pindah ke sana?
   6. Pelanggan              — hilang, baru, bertahan (kalau datanya andal)
   ========================================================================== */

import React, { useState, useMemo, useEffect } from "react";

import { hasCol, labelOf } from "../lib/config.js";
import { ACTION_BY_KEY, STAGE_BY_KEY } from "../lib/color.js";
import { dLabel, fmt, nfFull, nfPct, signedPct, toJs } from "../lib/format.js";
import {
  DRIVER_INFO,
  customerBridge,
  explainDims,
  lmdiDrivers,
  mainDriver,
  monthlySeries,
  sharePct,
  stageSentence,
  switchingSignal,
  unitLines,
  windowStats,
} from "../lib/product.js";
import { BTN_QUIET, CARD, FOCUS, LINE, MUTED, cx } from "../lib/theme.jsx";
import {
  AbcBadge,
  ActionBadge,
  Dot,
  FilterChip,
  Notice,
  PatternText,
  ProductPicker,
  ScoreBreakdown,
  Section,
  StageBadge,
  Segmented,
  ShowAll,
  Stat,
  Tile,
  WindowBar,
} from "../components/productui.jsx";
import { DeltaBars, GrowthSlope, HWaterfall, LifecycleChart, ShareTrend, monthShort } from "../components/productcharts.jsx";
import { IconBack, IconCompare, IconCycle, IconPin, IconTable, IconUsers, IconWaterfall } from "../components/icons.jsx";
import { ChangeText, CountChange, Delta, Signed, signedText } from "../components/delta.jsx";

const rp = (v) => fmt(v, "currency", true);
const dateText = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");

/** Dimensi "di mana" yang masuk akal untuk tiap tingkat produk. */
function whereDims(unitKey) {
  const base = ["Branch", "branch_area", "Channel", "Payment_Method"];
  const extra =
    unitKey === "Lini_Produk" ? ["Category", "Item_Code"] : unitKey === "Category" || unitKey === "__name" ? ["Item_Code"] : [];
  return [...base, ...extra].filter((d) => hasCol(d));
}

export default function ProductDossier({
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
  focusKey,
  openProduct,
  explainInVariance,
  onMatchLength,
  backLabel,
  onBack,
}) {
  const pf = portfolio;
  const U = pf.unitDef;
  const u = focusKey != null ? pf.byKey.get(focusKey) : null;

  // Panel Keterangan dikendalikan di sini supaya tombol "Cara hitung skor"
  // bisa langsung membuka tab Skor kesehatan untuk produk yang sedang dibuka.
  const [gOpen, setGOpen] = useState(false);
  const [gTab, setGTab] = useState("tahap");
  const explainScore = () => {
    setGTab("skor");
    setGOpen(true);
  };

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <WindowBar
        unitKey={unitKey}
        setUnitKey={setUnitKey}
        winMode={winMode}
        setWinMode={setWinMode}
        win={win}
        crit={crit}
        setCrit={setCrit}
        portfolio={pf}
        onMatchLength={onMatchLength}
        glossary={{ open: gOpen, setOpen: setGOpen, tab: gTab, setTab: setGTab, focus: u || null }}
      />
      <div className="space-y-4 p-4">
        {onBack && backLabel && (
          <button type="button" onClick={onBack} className={cx(BTN_QUIET, "-mb-1 -ml-1.5 inline-flex items-center gap-1.5 font-medium text-[var(--brand-700)]")}>
            <IconBack className="h-3.5 w-3.5" />
            Kembali ke {backLabel}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <ProductPicker
            units={pf.units}
            value={focusKey}
            onPick={openProduct}
            placeholder={`Cari ${U.label.toLowerCase()} untuk didiagnosis…`}
            autoFocus={!u}
          />
          {u && (
            <span className={cx("text-[11px]", MUTED)}>
              Peringkat {nfFull.format(pf.units.indexOf(u) + 1)} dari {nfFull.format(pf.units.length)} {U.plural} menurut pendapatan P1
            </span>
          )}
        </div>

        {!u ? (
          <EmptyState pf={pf} openProduct={openProduct} />
        ) : (
          <Dossier
            key={`${unitKey}|${focusKey}`}
            u={u}
            pf={pf}
            lines={lines}
            labels={labels}
            quality={quality}
            win={win}
            crit={crit}
            unitKey={unitKey}
            openProduct={openProduct}
            explainInVariance={explainInVariance}
            explainScore={explainScore}
          />
        )}
      </div>
    </div>
  );
}

/* ================================================================ isi    */

function Dossier({ u, pf, lines, labels, quality, win, crit, unitKey, openProduct, explainInVariance, explainScore }) {
  const U = pf.unitDef;
  const action = ACTION_BY_KEY[u.rec.action];
  const split = unitKey === "Item_Code";
  const byBranch = hasCol("Branch");

  /* --- data produk --- */
  const ul = useMemo(() => unitLines(lines, unitKey, u.key, win.asOf), [lines, unitKey, u.key, win.asOf]);
  const ms = useMemo(() => monthlySeries(ul, u.firstM, win.asOfM), [ul, u.firstM, win.asOfM]);
  const stats = useMemo(() => windowStats(ul, win), [ul, win]);
  const drivers = useMemo(() => lmdiDrivers(stats, split), [stats, split]);
  const delta = stats.r1 - stats.r2;

  /* --- di mana berubah, dengan penggalian --- */
  const [drill, setDrill] = useState([]);
  const [dimSel, setDimSel] = useState(null);
  const drilled = useMemo(() => {
    let out = ul;
    for (const f of drill) out = out.filter((ln) => ln[f.dim] === f.key);
    return out;
  }, [ul, drill]);
  const explained = useMemo(() => {
    const used = new Set(drill.map((f) => f.dim));
    const dims = whereDims(unitKey).filter((d) => !used.has(d));
    return explainDims(drilled, dims, win, labels).filter((e) => e.n > 1);
  }, [drilled, drill, unitKey, win, labels]);
  const activeDim = explained.find((e) => e.dim === dimSel) || explained[0];
  useEffect(() => setDimSel(null), [drill.length]);

  /* --- induk --- */
  const parentField = U.parent;
  // Tanpa induk (tingkat lini, atau data tanpa kolom kategori/lini), pembandingnya
  // adalah semua unit lain di tingkat yang sama.
  const isLine = U.key === "Lini_Produk";
  const parentName = parentField ? u.parent : isLine ? "semua lini" : `semua ${U.plural}`;
  const othersText = parentField ? `produk lain di ${u.parent}` : `${U.plural} lain`;
  const othersLabel = parentField ? "Produk lain" : `${U.plural.charAt(0).toUpperCase()}${U.plural.slice(1)} lain`;
  const parentEntry = pf.parents.get(parentField ? u.parent : "__all");
  /* Porsi produk di induknya, bulan demi bulan. "Induk" = produk ini +
     saudara-saudaranya (produk lain dengan induk yang sama), persis definisi
     yang dipakai portofolio — jadi angkanya sama dengan kalimat di bawah. */
  const WS = win.months || 12; // panjang jumlah bergulir porsi
  const shareTrend = useMemo(() => {
    const A = win.asOfM;
    const start = Math.max(A - 23, u.firstM);
    const pre = start - (WS - 1);
    const n = A - pre + 1;
    if (n <= 0) return null;
    const sib = new Set((parentEntry?.units || []).filter((x) => x !== u).map((x) => x.key));
    const mine = new Array(n).fill(0);
    const others = new Array(n).fill(0);
    for (const ln of lines) {
      if (ln.__d > win.asOf) continue;
      const i = ln.__m - pre;
      if (i < 0 || i >= n) continue;
      const k = ln[unitKey];
      if (k === u.key) mine[i] += ln.Revenue;
      else if (sib.has(k)) others[i] += ln.Revenue;
    }
    const months = [];
    const share = [];
    let sm = 0;
    let so = 0;
    for (let i = 0; i < n; i++) {
      sm += mine[i];
      so += others[i];
      if (i >= WS) {
        sm -= mine[i - WS];
        so -= others[i - WS];
      }
      const m = pre + i;
      if (m >= start) {
        months.push(m);
        share.push(sm + so > 0 ? sm / (sm + so) : null);
      }
    }
    return { months, share };
  }, [lines, unitKey, u, parentEntry, win.asOf, win.asOfM, WS]);

  const share1 = u.r1 + (u.othersR1 || 0) > 0 ? u.r1 / (u.r1 + (u.othersR1 || 0)) : null;
  const share2 = u.r2 + (u.othersR2 || 0) > 0 ? u.r2 / (u.r2 + (u.othersR2 || 0)) : null;
  const rankInParent = (parentEntry?.units || []).filter((x) => !x.unknown).indexOf(u) + 1;
  const [cmpView, setCmpView] = useState("growth");

  // Pindah pelanggan dibaca per cabang, jadi butuh kolom cabang.
  const switching = useMemo(
    () =>
      delta < 0 && byBranch
        ? switchingSignal(lines, { unit: unitKey, key: u.key, parentField, parentValue: u.parent, win })
        : null,
    [delta, byBranch, lines, unitKey, u.key, parentField, u.parent, win]
  );

  // Produk lain di induk yang sama: 8 teratas (+ produk ini), atau semuanya.
  const SIB_LIMIT = 8;
  const [sibAll, setSibAll] = useState(false);
  const sibList = useMemo(() => (parentEntry?.units || []).filter((s) => !s.unknown), [parentEntry]);
  const siblings = useMemo(() => {
    const top = sibAll ? sibList.slice() : sibList.slice(0, SIB_LIMIT);
    if (!top.includes(u)) top.push(u);
    return top;
  }, [sibList, sibAll, u]);

  const cust = useMemo(() => (quality.customersReliable ? customerBridge(ul, win) : null), [quality.customersReliable, ul, win]);

  /* --- angka ringkas --- */
  const peakVal = ms.ma[ms.peakI];
  const nowVal = ms.ma[ms.ma.length - 1];
  const sincePeak = ms.ma.length - 1 - ms.peakI;
  const W = win.months;
  const perYear = W && W !== 12 ? (u.r1 * 12) / W : null;
  const main = mainDriver(drivers, delta);

  return (
    <>
      {/* ---------------- kepala ---------------- */}
      <section className={cx(CARD, "dt-shadow overflow-hidden")}>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-5 py-4">
          <div className="min-w-0 flex-1 basis-[360px]">
            <div className={cx("text-[11px]", MUTED)}>
              {U.label}
              {u.sub ? ` · ${u.sub}` : ""}
            </div>
            <h2 className="mt-0.5 text-[20px] font-semibold leading-tight tracking-[-.015em] text-[var(--ink-900)]">{u.label}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <StageBadge stage={u.stage} />
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-600)]">
                Pola <PatternText pattern={u.pattern} />
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-600)]">
                <AbcBadge abc={u.abc} /> {sharePct(u.share)} pendapatan
              </span>
              <span className="text-xs text-[var(--ink-600)]">Skor {u.score}</span>
            </div>
            <p className="mt-2.5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--ink-700)]">
              <ChangeText>{stageSentence(u, crit, win)}</ChangeText>
            </p>
          </div>

          <div className="grid w-full flex-none grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            <Tile
              label="Pendapatan P1"
              value={rp(u.r1)}
              delta={<Delta g={u.g} p1={u.r1} p2={u.r2} variant="chip" size="xs" />}
              sub={u.r2 > 0 ? `P2 ${rp(u.r2)} · ${signedText(u.r1 - u.r2)}` : u.r1 > 0 ? "tidak terjual di P2" : "–"}
              tone={u.g == null ? (u.r1 > 0 ? "blue" : "mauve") : u.g < 0 ? "red" : "teal"}
            />
            <Tile
              label="Transaksi P1"
              value={nfFull.format(u.n1)}
              delta={<Delta g={u.n2 ? u.n1 / u.n2 - 1 : null} p1={u.n1} p2={u.n2} variant="chip" size="xs" />}
              sub={`P2: ${nfFull.format(u.n2)}`}
              tone={u.n1 < u.n2 ? "red" : u.n1 > u.n2 ? "teal" : "mauve"}
            />
            {byBranch ? (
              <Tile
                label="Cabang yang menjual"
                value={nfFull.format(u.b1)}
                delta={<Delta g={u.b2 ? u.b1 / u.b2 - 1 : null} p1={u.b1} p2={u.b2} label={u.b1 === u.b2 ? "0" : signedText(u.b1 - u.b2, "number")} variant="chip" size="xs" />}
                sub={`P2: ${nfFull.format(u.b2)} cabang`}
                tone={u.b1 < u.b2 ? "red" : u.b1 > u.b2 ? "teal" : "mauve"}
              />
            ) : (
              <Tile label="Bulan berpenjualan" value={`${u.act12} dari 12`} sub="12 bulan sampai tanggal acuan" tone="blue" />
            )}
            <Tile
              label="Terakhir terjual"
              value={dateText(u.last)}
              sub={u.dsl === 0 ? "pada tanggal acuan" : `${nfFull.format(u.dsl)} hari sebelum tanggal acuan`}
              tone={u.dsl > crit.dormantDays || u.overdue ? "amber" : "blue"}
            />
          </div>
        </div>

        {/* ---------------- keputusan ---------------- */}
        <div className={cx("grid gap-x-8 gap-y-5 border-t bg-[var(--canvas)] px-5 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.9fr)]", LINE)}>
          <div className="min-w-0">
            <div className={cx("mb-1.5 text-[11px]", MUTED)}>Rekomendasi</div>
            <ActionBadge action={u.rec.action} size="lg" />
            <p className={cx("mt-1.5 text-[11.5px] leading-snug", MUTED)}>{action.hint}</p>
            <ul className="mt-3 space-y-1.5">
              {u.rec.why.map((w, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-[var(--ink-800)]">
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-[3px] flex-none text-[10px]",
                      w.tone === "neg" ? "text-[var(--neg)]" : w.tone === "pos" ? "text-[var(--pos)]" : "text-[var(--ink-400)]"
                    )}
                  >
                    {w.tone === "neg" ? "▼" : w.tone === "pos" ? "▲" : "●"}
                  </span>
                  <span>
                    <ChangeText>{w.t}</ChangeText>
                  </span>
                </li>
              ))}
            </ul>
            {u.rec.watch.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-[var(--note)]">Periksa sebelum memutuskan</div>
                <ul className="mt-1 space-y-1">
                  {u.rec.watch.map((w, i) => (
                    <li key={i} className="flex gap-2 text-[12px] leading-snug text-[var(--ink-700)]">
                      <span aria-hidden="true" className="mt-[1px] flex-none text-[var(--note)]">
                        !
                      </span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className={cx("mb-1.5 text-[11px]", MUTED)}>Kalau produk ini dicabut</div>
            <dl className="space-y-2 text-[12.5px]">
              <ImpactRow
                label="Pendapatan yang dipertaruhkan"
                value={rp(u.r1)}
                note={`${W ? `per ${W} bulan` : "di P1"}${perYear ? ` (≈ ${rp(perYear)} setahun)` : ""} · ${sharePct(u.share)} total${parentField ? ` · ${sharePct(u.shareParent)} dari ${parentName}` : ""}`}
              />
              {byBranch ? (
                <ImpactRow label="Cabang yang terdampak" value={nfFull.format(u.b1)} note={`dengan ${nfFull.format(u.n1)} transaksi di P1`} />
              ) : (
                <ImpactRow label="Transaksi yang terdampak" value={nfFull.format(u.n1)} note="di P1" />
              )}
              <ImpactRow
                label="Pengganti terdekat"
                value={u.substitute ? u.substitute.label : "Tidak ada"}
                note={
                  u.substitute
                    ? <>
                        {rp(u.substitute.r1)} · <Delta g={u.substitute.g} p1={u.substitute.r1} p2={u.substitute.g == null ? 0 : undefined} size="xs" /> ·{" "}
                        {STAGE_BY_KEY[u.substitute.stage].label.toLowerCase()}
                      </>
                    : parentField
                    ? `Tidak ada produk sehat lain di ${parentName}.`
                    : isLine
                    ? "Di tingkat lini, pengganti tidak dicari."
                    : "Data tidak punya kolom kategori atau lini, jadi produk sejenis tidak bisa ditentukan."
                }
                onClick={u.substitute ? () => openProduct(u.substitute.key) : null}
              />
              {switching && switching.ratio != null && (
                <ImpactRow
                  label="Indikasi pelanggan pindah"
                  value={nfPct.format(switching.ratio)}
                  note={`dari penurunan di ${switching.nLossBranches} cabang tertutup kenaikan produk sejenis di cabang yang sama`}
                />
              )}
              {cust && (
                <ImpactRow
                  label="Pelanggan terdampak"
                  value={nfFull.format(cust.n1)}
                  note={`pelanggan teratas menyumbang ${nfPct.format(cust.top1)} pendapatan produk ini`}
                />
              )}
            </dl>
          </div>

          <div className="min-w-0">
            <div className={cx("mb-1.5 text-[11px]", MUTED)}>Skor kesehatan</div>
            <ScoreBreakdown parts={u.scoreParts} weights={pf.weights || crit.weights} score={u.score} onExplain={explainScore} />
          </div>
        </div>
      </section>

      {/* ---------------- kurva siklus hidup ---------------- */}
      <Section
        title="Kurva siklus hidup"
        icon={IconCycle}
        tone="teal"
        sub={
          ms.months.length >= 2
            ? `Garis = rata-rata 12 bulan bergulir. Puncaknya ${monthShort(ms.months[ms.peakI])}${
                sincePeak > 0 ? `, ${sincePeak} bulan lalu; sekarang ${nfPct.format(peakVal ? nowVal / peakVal : 0)} dari puncak` : " — saat ini sedang di puncaknya"
              }. Kolom = pendapatan per bulan.`
            : "Baru satu bulan berpenjualan."
        }
      >
        <LifecycleChart ms={ms} win={win} />
      </Section>

      {/* ---------------- kenapa & di mana ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Kenapa berubah"
          icon={IconWaterfall}
          tone="amber"
          sub={`Pendapatan = ${byBranch ? "cabang aktif × transaksi per cabang" : "jumlah transaksi"} × ${
            split && stats.q1 > 0 && stats.q2 > 0 ? "unit per transaksi × harga." : "nilai per transaksi."
          }${
            !split
              ? " Qty dan harga tidak dipisah karena satuannya bercampur."
              : !(stats.q1 > 0 && stats.q2 > 0)
              ? " Qty tidak tersedia di kedua periode, jadi cukup nilai per transaksi."
              : ""
          }`}
        >
          {drivers ? (
            <>
              <HWaterfall
                steps={[
                  { key: "p2", label: "Pendapatan P2", sub: `${dateText(win.p2.from)} – ${dateText(win.p2.to)}`, value: stats.r2, kind: "start" },
                  ...drivers.map((d) => ({
                    key: d.key,
                    label: DRIVER_INFO[d.key].label,
                    sub: `${DRIVER_INFO[d.key].fmt(d.x0)} → ${DRIVER_INFO[d.key].fmt(d.x1)}`,
                    value: d.effect,
                    kind: "step",
                  })),
                  { key: "p1", label: "Pendapatan P1", sub: `${dateText(win.p1.from)} – ${dateText(win.p1.to)}`, value: stats.r1, kind: "end" },
                ]}
              />
              <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                {main ? (
                  <>
                    <b className="font-semibold text-[var(--ink-900)]">{DRIVER_INFO[main.key].label}</b> paling menentukan:{" "}
                    {DRIVER_INFO[main.key].long} {DRIVER_INFO[main.key].fmt(main.x0)} → {DRIVER_INFO[main.key].fmt(main.x1)}, setara{" "}
                    <Signed v={main.effect} className="font-semibold" /> dari {delta >= 0 ? "kenaikan" : "penurunan"} {rp(Math.abs(delta))}.
                  </>
                ) : (
                  "Faktor-faktornya saling mengimbangi."
                )}
              </p>
              <p className={cx("mt-1.5 text-[11px] leading-snug", MUTED)}>
                Tiap langkah = dampak satu faktor seandainya faktor lain tetap. Jumlah semua langkah persis sama dengan selisih P1 − P2
                (dekomposisi LMDI, tanpa sisa yang tak terjelaskan).
              </p>
            </>
          ) : (
            <Notice>
              {stats.r1 > 0 && stats.r2 === 0
                ? `Tidak terjual di P2, jadi seluruh ${rp(stats.r1)} di P1 adalah tambahan baru. Penguraian butuh penjualan di kedua periode.`
                : stats.r2 > 0 && stats.r1 === 0
                ? `Tidak terjual sama sekali di P1 — seluruh ${rp(stats.r2)} dari P2 hilang. Lihat "Di mana berubah" untuk tahu cabang dan kanal mana yang berhenti.`
                : "Tidak ada penjualan di kedua periode."}
            </Notice>
          )}
        </Section>

        <Section
          title="Di mana berubah"
          icon={IconPin}
          tone="blue"
          sub="Dimensi diurut dari yang paling menjelaskan: perubahannya terpusat di sedikit anggota, bukan merata. Klik anggota untuk menggali."
          actions={
            explainInVariance && (
              <button type="button" className={BTN_QUIET} onClick={() => explainInVariance([{ dim: unitKey, key: u.key, label: u.label }, ...drill])}>
                Buka di Penjelasan perubahan →
              </button>
            )
          }
        >
          {drill.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className={cx("text-[11px]", MUTED)}>Digali ke</span>
              {drill.map((f, i) => (
                <FilterChip key={`${f.dim}${f.key}`} onClear={() => setDrill(drill.slice(0, i))}>
                  {labelOf(f.dim)}: {f.label}
                </FilterChip>
              ))}
            </div>
          )}

          {explained.length === 0 ? (
            <Notice>Tidak ada dimensi lain yang bisa dipecah di titik ini.</Notice>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
                {explained.map((e) => {
                  const on = e === activeDim;
                  return (
                    <button
                      key={e.dim}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setDimSel(e.dim)}
                      className={cx(
                        "rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                        FOCUS,
                        on ? "border-[var(--brand-600)] bg-[var(--brand-50)]" : `${LINE} hover:border-[var(--brand-300)]`
                      )}
                      title={`Daya jelaskan ${nfPct.format(e.power)}`}
                    >
                      <span className={cx("block text-xs", on ? "font-medium text-[var(--brand-800)]" : "text-[var(--ink-800)]")}>{e.label}</span>
                      <span className="mt-1 block h-1 w-16 overflow-hidden rounded-full bg-[var(--ink-100)]">
                        <span className="block h-full rounded-full bg-[var(--brand-600)]" style={{ width: `${Math.round(e.power * 100)}%` }} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeDim && (
                <>
                  <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
                    <ChangeText>{activeDim.sentence}</ChangeText>
                  </p>
                  <DeltaBars
                    members={activeDim.members}
                    limit={9}
                    onPick={(m) => setDrill([...drill, { dim: activeDim.dim, key: m.key, label: m.label }])}
                  />
                </>
              )}
            </>
          )}
        </Section>
      </div>

      {/* ---------------- induk & saudara ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title={`Dibanding produk lain di ${parentField ? parentName : "portofolio"}`}
          icon={IconCompare}
          tone="violet"
          sub={`Dibanding ${othersText}, tanpa produk ini sendiri. Kalau mereka ikut turun, masalahnya di pasar; kalau mereka naik, masalahnya di produk ini.`}
          actions={
            <Segmented
              label="Tampilan perbandingan"
              size="xs"
              value={cmpView}
              onChange={setCmpView}
              options={[
                { key: "growth", label: "Pertumbuhan P2 → P1" },
                { key: "share", label: `Porsi di ${parentField ? parentName : "portofolio"}` },
              ]}
            />
          }
        >
          <div className="grid grid-cols-3 gap-2">
            <Tile
              label="Produk ini"
              value={<Delta g={u.g} p1={u.r1} p2={u.r2} size="xl" />}
              sub={`${rp(u.r2)} → ${rp(u.r1)}`}
              tone={u.g == null ? "mauve" : u.g < 0 ? "red" : "teal"}
            />
            <Tile
              label={othersLabel}
              value={<Delta g={u.parentG} p1={u.othersR1 || 0} p2={u.othersR2 || 0} size="xl" />}
              sub={`${rp(u.othersR2 || 0)} → ${rp(u.othersR1 || 0)}`}
              tone={u.parentG == null ? "mauve" : u.parentG < 0 ? "red" : "teal"}
            />
            <Tile
              label={`Porsi di ${parentField ? parentName : "portofolio"}`}
              value={share1 == null ? "–" : sharePct(share1)}
              sub={share2 == null ? "P2 tanpa penjualan" : `P2: ${sharePct(share2)}`}
              tone={share1 == null || share2 == null ? "mauve" : share1 < share2 - 0.0005 ? "red" : share1 > share2 + 0.0005 ? "teal" : "mauve"}
            />
          </div>

          <div className="mt-3">
            {cmpView === "growth" ? (
              <GrowthSlope
                p2Label={`${monthShort(monthIndexOf(win.p2.from))} – ${monthShort(monthIndexOf(win.p2.to))}`}
                p1Label={`${monthShort(monthIndexOf(win.p1.from))} – ${monthShort(monthIndexOf(win.p1.to))}`}
                series={[
                  { key: "others", label: othersLabel, g: u.parentG, color: "#8e7a9b" },
                  { key: "me", label: u.label, g: u.g, color: "var(--brand-700)", strong: true },
                ]}
              />
            ) : shareTrend && shareTrend.months.length > 1 ? (
              <ShareTrend months={shareTrend.months} share={shareTrend.share} W={WS} p1FromM={monthIndexOf(win.p1.from)} label={u.label} />
            ) : (
              <p className={cx("py-6 text-center text-xs", MUTED)}>Belum cukup bulan untuk menggambar porsi dari waktu ke waktu.</p>
            )}
            <p className={cx("mt-1 text-[11px] leading-snug", MUTED)}>
              {cmpView === "growth"
                ? "Kedua garis mulai dari 100 di P2. Ujung kanan = 100 × (1 + pertumbuhan), jadi garis yang lebih curam tumbuh lebih cepat."
                : `Porsi = pendapatan produk ini ÷ pendapatan ${parentField ? parentName : "seluruh portofolio"}, dijumlah ${WS} bulan terakhir di setiap titik. Garis turun berarti produk ini tumbuh lebih lambat dari saudaranya, walaupun penjualannya sendiri naik.`}
            </p>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-800)]">
            <ChangeText>{compareSentence({ u, othersText, parentName: parentField ? parentName : "portofolio", share1, share2, rankInParent })}</ChangeText>
          </p>
          {switching && switching.loss > 0 && (
            <div className={cx("mt-3 rounded-lg border px-3 py-2.5", LINE)}>
              <div className="text-[11px] font-semibold text-[var(--ink-800)]">Indikasi perpindahan ke produk sejenis</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-700)]">
                Di {switching.nLossBranches} cabang tempat produk ini turun (total −{rp(switching.loss)}), produk lain di{" "}
                {parentField ? parentName : "portofolio"} naik dan menutup <b className="font-semibold">{rp(switching.caught)}</b> —{" "}
                {nfPct.format(switching.ratio || 0)} dari penurunannya.{" "}
                {switching.ratio >= 0.5
                  ? "Pembeli kemungkinan besar pindah ke produk sejenis; mencabut produk ini relatif aman."
                  : switching.ratio >= 0.2
                  ? "Sebagian pembeli mungkin pindah, sebagian lagi hilang."
                  : "Penurunannya hampir tidak tertutup produk lain — pembelinya kemungkinan hilang, bukan pindah."}
              </p>
              <p className={cx("mt-1 text-[10.5px]", MUTED)}>
                Indikasi, bukan bukti: tanpa data pelanggan yang andal, tidak bisa dipastikan pembelinya orang yang sama.
              </p>
            </div>
          )}
        </Section>

        <Section
          title={parentField ? `Produk lain di ${parentName}` : othersLabel}
          icon={IconTable}
          tone="mauve"
          sub="Diurut dari pendapatan P1. Klik untuk membandingkan."
          bodyClass="p-0"
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
                <th className="px-4 py-2 text-left font-medium">{U.label}</th>
                <th className="px-2 py-2 text-left font-medium">Tahap</th>
                <th className="px-2 py-2 text-right font-medium">P1</th>
                <th className="px-2 py-2 text-right font-medium">Δ</th>
                {byBranch && <th className="px-4 py-2 text-right font-medium">Cabang</th>}
              </tr>
            </thead>
            <tbody>
              {siblings.map((s) => {
                const me = s === u;
                return (
                  <tr
                    key={s.key}
                    onClick={me ? undefined : () => openProduct(s.key)}
                    className={cx(
                      "border-b border-[var(--ink-100)]",
                      me ? "bg-[var(--brand-50)]" : "cursor-pointer transition-colors hover:bg-[var(--ink-50)]"
                    )}
                  >
                    <td className="max-w-[240px] px-4 py-1.5">
                      <span className={cx("block truncate", me ? "font-semibold text-[var(--brand-800)]" : "text-[var(--ink-900)]")} title={s.label}>
                        {s.label}
                        {me ? " (produk ini)" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <StageBadge stage={s.stage} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{rp(s.r1)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Delta g={s.g} p1={s.r1} p2={s.r2} size="xs" />
                    </td>
                    {byBranch && (
                      <td className="px-4 py-1.5 text-right">
                        <CountChange from={s.b2} to={s.b1} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sibList.length > SIB_LIMIT && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className={cx("text-[11px]", MUTED)}>
                {sibAll
                  ? `Semua ${nfFull.format(sibList.length)} ${U.plural} ditampilkan.`
                  : `${nfFull.format(sibList.length - Math.min(SIB_LIMIT, sibList.length))} ${U.plural} lain belum ditampilkan.`}
              </span>
              <ShowAll total={sibList.length} limit={SIB_LIMIT} open={sibAll} onToggle={() => setSibAll((v) => !v)} noun={U.plural} />
            </div>
          )}
        </Section>
      </div>

      {/* ---------------- pelanggan ---------------- */}
      <Section
        title="Pelanggan"
        icon={IconUsers}
        tone="brand"
        sub="Apakah perubahan datang dari pelanggan yang hilang, pelanggan baru, atau pelanggan lama yang membeli lebih banyak/sedikit?"
      >
        {cust ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <HWaterfall
              steps={[
                { key: "p2", label: "Pendapatan P2", value: stats.r2, kind: "start" },
                { key: "lost", label: "Pelanggan hilang", sub: `${nfFull.format(cust.lost.n)} pelanggan berhenti membeli`, value: -cust.lost.r, kind: "step" },
                { key: "added", label: "Pelanggan baru", sub: `${nfFull.format(cust.added.n)} pelanggan baru`, value: cust.added.r, kind: "step" },
                { key: "kept", label: "Pelanggan bertahan", sub: `${nfFull.format(cust.kept.n)} pelanggan membeli di kedua periode`, value: cust.kept.r1 - cust.kept.r2, kind: "step" },
                { key: "p1", label: "Pendapatan P1", value: stats.r1, kind: "end" },
              ]}
            />
            <div className="grid grid-cols-2 content-start gap-4">
              <Stat label="Pelanggan P1" value={nfFull.format(cust.n1)} />
              <Stat label="Pelanggan teratas" value={nfPct.format(cust.top1)} sub="dari pendapatan P1 produk ini" />
              <Stat label="Bertahan" value={nfFull.format(cust.kept.n)} sub={`dari ${nfFull.format(cust.kept.n + cust.lost.n)} pelanggan P2`} />
              <Stat label="Hilang" value={nfFull.format(cust.lost.n)} sub={rp(cust.lost.r)} tone={cust.lost.n ? "neg" : undefined} />
            </div>
          </div>
        ) : (
          <Notice tone="warn" title="Analisis pelanggan dimatikan">
            {!quality.hasCustomer ? (
              <>Data ini tidak punya kolom ID pelanggan, jadi pelanggan hilang, baru, dan bertahan tidak bisa dihitung.</>
            ) : (
              <>
                {nfPct.format(quality.customerBrokenShare || 0)} ID pelanggan di data ini rusak
                {quality.customerBrokenSample ? (
                  <>
                    {" "}
                    (mis. <code className="rounded bg-white/70 px-1 font-mono">{quality.customerBrokenSample}</code>)
                  </>
                ) : null}{" "}
                dan {nfPct.format(quality.customerMissingShare || 0)} kosong. ID yang tersimpan sebagai notasi ilmiah kehilangan digit belakangnya,
                sehingga banyak pelanggan berbeda tergabung ke satu ID dan angka pelanggan hilang/baru jadi menyesatkan. Perbaikannya: ambil
                data langsung dari database, atau format kolom ID pelanggan sebagai Teks sebelum menyimpan dari Excel. Bagian ini menyala
                sendiri begitu datanya bersih.
              </>
            )}
          </Notice>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ pendukung  */

const monthIndexOf = (iso) => +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1);
const pctAbs = (x) => nfPct.format(Math.abs(x));

/**
 * Kalimat perbandingan dengan produk sejenis. Selalu menyebut kedua angka
 * pertumbuhan DAN perubahan porsi, supaya "tumbuh tapi porsinya turun" tidak
 * terbaca sebagai "melemah".
 */
function compareSentence({ u, othersText, parentName, share1, share2, rankInParent }) {
  const g = u.g;
  const go = u.parentG;
  const shareText =
    share1 != null && share2 != null ? `porsinya di ${parentName} ${share1 < share2 ? "turun" : share1 > share2 ? "naik" : "tetap"} dari ${sharePct(share2)} ke ${sharePct(share1)}` : null;
  const lead = rankInParent === 1 ? ` Secara nilai, produk ini masih yang terbesar di ${parentName}.` : "";
  if (g == null) return `Produk ini tidak terjual di P2, jadi pertumbuhannya tidak bisa dibandingkan.${share1 != null ? ` Porsinya di ${parentName} sekarang ${sharePct(share1)}.` : ""}`;
  if (go == null) return `Produk ini ${signedPct(g)}; ${othersText} tidak punya penjualan di P2, jadi tidak ada pembanding.`;
  if (g < 0 && go > 0) {
    return `Produk ini turun ${pctAbs(g)}, padahal ${othersText} naik ${pctAbs(go)}. Penurunannya khas produk ini, bukan karena pasarnya melemah${shareText ? ` — ${shareText}` : ""}.`;
  }
  if (g < 0 && go <= 0) {
    const deeper = -g > -go * 1.5;
    return `Produk ini turun ${pctAbs(g)}, dan ${othersText} juga turun ${pctAbs(go)}. Sebagian penurunan kemungkinan karena pasarnya melemah${deeper ? ", tetapi produk ini turun jauh lebih dalam" : ""}${shareText ? `; ${shareText}` : ""}.`;
  }
  if (go > g) {
    return `Produk ini tetap tumbuh ${pctAbs(g)}, tetapi ${othersText} tumbuh lebih cepat (${signedPct(go)}). Akibatnya ${shareText || "porsinya menyusut"}. Penjualannya tidak melemah — hanya tertinggal dari pertumbuhan produk sejenis.${lead}`;
  }
  return `Produk ini tumbuh ${pctAbs(g)}, lebih cepat dari ${othersText} (${signedPct(go)})${shareText ? `, sehingga ${shareText}` : ""}.${lead}`;
}

function ImpactRow({ label, value, note, onClick }) {
  return (
    <div>
      <dt className={cx("text-[11px]", MUTED)}>{label}</dt>
      <dd className="mt-0.5">
        {onClick ? (
          <button type="button" onClick={onClick} className={cx("text-left font-semibold text-[var(--brand-700)] underline decoration-[var(--brand-200)] underline-offset-2 hover:decoration-[var(--brand-500)]", FOCUS)}>
            {value}
          </button>
        ) : (
          <span className="font-semibold text-[var(--ink-900)]">{value}</span>
        )}
        {note && <span className="block text-[11px] leading-snug text-[var(--ink-500)]">{note}</span>}
      </dd>
    </div>
  );
}

const EMPTY_LIMIT = 6;

function EmptyState({ pf, openProduct }) {
  const [open, setOpen] = useState({});
  const groups = [
    { key: "perbaiki", title: "Penting tapi turun", sort: (a, b) => b.r2 - b.r1 - (a.r2 - a.r1) },
    { key: "cabut", title: "Kandidat dicabut", sort: (a, b) => b.r2 + b.r1 - (a.r2 + a.r1) },
    { key: "kembangkan", title: "Sedang naik", sort: (a, b) => b.r1 - b.r2 - (a.r1 - a.r2) },
  ];
  return (
    <div className="space-y-3">
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-[var(--ink-700)]">
        Pilih produk untuk melihat posisinya di siklus hidup, apa yang menyebabkan perubahannya, di mana perubahan itu terjadi, dan apa
        akibatnya kalau dicabut. Mulai dari yang paling membutuhkan perhatian:
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => {
          const all = pf.units.filter((u) => u.rec.action === g.key).sort(g.sort);
          const items = open[g.key] ? all : all.slice(0, EMPTY_LIMIT);
          return (
            <Section key={g.key} title={`${g.title} · ${nfFull.format(all.length)}`} bodyClass="p-2">
              {items.length === 0 ? (
                <p className={cx("px-2 py-2 text-xs", MUTED)}>Tidak ada.</p>
              ) : (
                items.map((u) => (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => openProduct(u.key)}
                    className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--brand-50)]", FOCUS)}
                  >
                    <Dot color={ACTION_BY_KEY[u.rec.action].color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-[var(--ink-900)]">{u.label}</span>
                      <span className="block truncate text-[11px] text-[var(--ink-500)]">{u.rec.why[0]?.t}</span>
                    </span>
                    <span className="flex flex-none flex-col items-end gap-0.5">
                      <span className="text-[11px] tabular-nums text-[var(--ink-700)]">{rp(u.r1)}</span>
                      <Delta g={u.g} p1={u.r1} p2={u.r2} size="xs" />
                    </span>
                  </button>
                ))
              )}
              {all.length > EMPTY_LIMIT && (
                <div className="px-2 pb-1 pt-2">
                  <ShowAll
                    total={all.length}
                    limit={EMPTY_LIMIT}
                    open={!!open[g.key]}
                    onToggle={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                    noun={pf.unitDef.plural}
                  />
                </div>
              )}
            </Section>
          );
        })}
      </div>
    </div>
  );
}
