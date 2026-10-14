/* ============================================================================
   Halaman: Penjelasan perubahan
   ----------------------------------------------------------------------------
   Menjawab "kenapa angkanya berubah, dan dari mana?" untuk selisih P1 − P2.

   1. Semua dimensi dinilai otomatis: di mana perubahan paling terpusat?
   2. Jembatan (waterfall) dari P2 ke P1 menurut dimensi terpilih.
   3. Klik satu anggota → lingkup menyempit ke anggota itu, dan semua
      dimensi lain dinilai ulang. Seperti pohon dekomposisi, tapi untuk
      SELISIH, bukan untuk nilai.
   4. Bentuk perubahan: harga · volume · barang baru · barang berhenti.
   ========================================================================== */

import React, { useState, useMemo } from "react";

import { DIM_FAMILY, EXPLORE_DIMS, dimOk, labelOf } from "../lib/config.js";
import { fmt, nfFull } from "../lib/format.js";
import { ChangeText, Delta, Signed } from "../components/delta.jsx";
import { explainDims, priceVolume } from "../lib/product.js";
import { BTN_QUIET, FOCUS, LINE, MUTED, cx } from "../lib/theme.jsx";
import { FilterChip, Notice, Section, Segmented, ShowAll, WindowBar } from "../components/productui.jsx";
import { IconCompare, IconLayers, IconWaterfall } from "../components/icons.jsx";
import { HWaterfall } from "../components/productcharts.jsx";

const rp = (v) => fmt(v, "currency", true);
const MAX_STEPS = 10;

export default function VariancePage({ lines, labels, win, winMode, setWinMode, varPath, setVarPath, onMatchLength }) {
  const [dimSel, setDimSel] = useState(null);
  const [view, setView] = useState("chart");
  const [stepsAll, setStepsAll] = useState(false);

  const scope = useMemo(() => {
    let out = lines;
    for (const f of varPath) out = out.filter((ln) => ln[f.dim] === f.key);
    return out;
  }, [lines, varPath]);

  const explained = useMemo(() => {
    const used = new Set(varPath.map((f) => f.dim));
    const dims = EXPLORE_DIMS.filter((d) => dimOk(d) && !used.has(d));
    const all = explainDims(scope, dims, win, labels).filter((e) => e.n > 1);
    // Dimensi waktu (kuartal) menjawab "kapan", bukan "di mana". Tetap
    // ditampilkan, tapi tidak ikut berebut posisi "paling menjelaskan" —
    // dengan hanya empat anggota, perubahannya selalu tampak terpusat.
    const isTime = (e) => DIM_FAMILY[e.dim] === "waktu";
    return [...all.filter((e) => !isTime(e)), ...all.filter(isTime).map((e) => ({ ...e, when: true }))];
  }, [scope, varPath, win, labels]);

  const active = explained.find((e) => e.dim === dimSel) || explained[0];
  const pvm = useMemo(() => priceVolume(scope, win), [scope, win]);

  const T1 = active ? active.T1 : pvm.T1;
  const T2 = active ? active.T2 : pvm.T2;
  const dT = T1 - T2;
  const gT = T2 > 0 ? dT / T2 : null;

  /* --- langkah jembatan: 10 anggota terbesar menurut |Δ|, sisanya dilebur;
         "Tampilkan semua" membuka setiap anggota sebagai langkah sendiri --- */
  const steps = useMemo(() => {
    if (!active) return [];
    const lim = stepsAll ? Infinity : MAX_STEPS;
    const byMag = active.members.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = byMag.slice(0, lim).sort((a, b) => b.d - a.d);
    const rest = byMag.slice(lim);
    const out = [{ key: "__p2", label: "P2", sub: "periode pembanding", value: active.T2, kind: "start" }];
    for (const m of top) {
      out.push({
        key: m.key,
        label: m.label,
        sub: (
          <>
            {rp(m.r2)} → {rp(m.r1)} · <Delta g={m.g} p1={m.r1} p2={m.r2} size="xs" />
          </>
        ),
        value: m.d,
        kind: "step",
        clickable: true,
        member: m,
      });
    }
    if (rest.length) {
      out.push({
        key: "__rest",
        label: `${rest.length} ${labelOf(active.dim).toLowerCase()} lainnya`,
        sub: "digabung",
        value: rest.reduce((t, m) => t + m.d, 0),
        kind: "step",
      });
    }
    out.push({ key: "__p1", label: "P1", sub: "periode dinilai", value: active.T1, kind: "end" });
    return out;
  }, [active, stepsAll]);

  const drill = (step) => {
    if (!step.member) return;
    setVarPath([...varPath, { dim: active.dim, key: step.member.key, label: step.member.label }]);
    setDimSel(null);
  };

  const scopeText = varPath.length ? varPath.map((f) => f.label ?? f.key).join(" › ") : "Seluruh transaksi";

  return (
    <div className="dt-scroll min-h-0 flex-1 overflow-auto">
      <WindowBar winMode={winMode} setWinMode={setWinMode} win={win} showUnit={false} onMatchLength={onMatchLength} />

      <div className="space-y-4 p-4">
        {/* ---------------- lingkup & angka utama ---------------- */}
        <section className={cx("dt-shadow rounded-lg border bg-[var(--paper)] px-5 py-4", LINE)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cx("text-[11px]", MUTED)}>Lingkup</span>
            <button
              type="button"
              onClick={() => setVarPath([])}
              className={cx(
                "rounded-full px-2.5 py-0.5 text-[11px]",
                FOCUS,
                varPath.length ? "text-[var(--brand-700)] hover:bg-[var(--brand-50)]" : "bg-[var(--ink-100)] text-[var(--ink-700)]"
              )}
            >
              Seluruh transaksi
            </button>
            {varPath.map((f, i) => (
              <React.Fragment key={`${f.dim}|${f.key}`}>
                <span className="text-[var(--ink-300)]">›</span>
                <FilterChip onClear={() => setVarPath(varPath.slice(0, i))}>
                  <span className="text-[var(--ink-500)]">{labelOf(f.dim)}:</span> {f.label ?? f.key}
                </FilterChip>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className={cx("text-[11px]", MUTED)}>Selisih P1 − P2</div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Signed v={dT} className="text-[26px] font-semibold tracking-[-.02em]" />
                <Delta g={gT} p1={T1} p2={T2} variant="chip" size="md" />
              </div>
            </div>
            <p className="min-w-0 flex-1 basis-[420px] text-[13px] leading-relaxed text-[var(--ink-700)]">
              {scopeText}: dari {rp(T2)} di P2 menjadi {rp(T1)} di P1.{" "}
              {active && (
                <>
                  Dimensi yang paling menjelaskan: <b className="font-semibold text-[var(--ink-900)]">{active.label.toLowerCase()}</b>.{" "}
                  <ChangeText>{active.sentence}</ChangeText>
                </>
              )}
            </p>
          </div>
        </section>

        {!active ? (
          <Notice>Tidak ada dimensi lain yang bisa dipecah di lingkup ini.</Notice>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            {/* ---------------- peringkat dimensi ---------------- */}
            <Section
              title="Dimensi yang paling menjelaskan"
              icon={IconLayers}
              tone="violet"
              sub="Makin panjang bilahnya, makin terpusat perubahan pada sedikit anggota — makin mudah ditunjuk penyebabnya."
              bodyClass="p-2"
            >
              {explained.map((e) => {
                const on = e === active;
                return (
                  <button
                    key={e.dim}
                    type="button"
                    onClick={() => setDimSel(e.dim)}
                    className={cx(
                      "mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                      FOCUS,
                      on ? "bg-[var(--brand-50)]" : "hover:bg-[var(--ink-50)]"
                    )}
                    aria-pressed={on}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cx("flex-1 text-xs", on ? "font-semibold text-[var(--brand-800)]" : "font-medium text-[var(--ink-900)]")}>
                        {e.label}
                        {e.when && (
                          <span className="ml-1.5 rounded bg-[var(--ink-100)] px-1 py-px text-[10px] font-normal text-[var(--ink-600)]" title="Dimensi waktu: menunjukkan kapan perubahan terjadi, bukan di mana">
                            kapan
                          </span>
                        )}
                      </span>
                      <span className="text-[10.5px] tabular-nums text-[var(--ink-500)]">{nfFull.format(e.n)} anggota</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--ink-100)]">
                      <span className={cx("block h-full rounded-full", e.when ? "bg-[var(--ink-400)]" : "bg-[var(--brand-600)]")} style={{ width: `${Math.round(e.power * 100)}%` }} />
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-[var(--ink-600)]">
                      <ChangeText>{e.sentence}</ChangeText>
                    </span>
                  </button>
                );
              })}
            </Section>

            {/* ---------------- jembatan ---------------- */}
            <Section
              title={`Jembatan menurut ${active.label.toLowerCase()}`}
              icon={IconWaterfall}
              tone="amber"
              sub="Klik satu baris untuk mempersempit lingkup ke anggota itu; semua dimensi lain akan dinilai ulang."
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
              {view === "chart" ? (
                <>
                  <HWaterfall steps={steps} onStep={drill} labelCol="minmax(10rem, 34%)" />
                  {active.members.length > MAX_STEPS && (
                    <div className="mt-2 px-2">
                      <ShowAll
                        total={active.members.length}
                        limit={MAX_STEPS}
                        open={stepsAll}
                        onToggle={() => setStepsAll((v) => !v)}
                        noun={active.label.toLowerCase()}
                      />
                    </div>
                  )}
                </>
              ) : (
                <MemberTable members={active.members} dim={active.dim} onPick={(m) => drill({ member: m })} />
              )}
            </Section>
          </div>
        )}

        {/* ---------------- bentuk perubahan ---------------- */}
        <Section
          title="Bentuk perubahan"
          icon={IconCompare}
          tone="teal"
          sub="Selisih yang sama diurai dengan cara lain, di tingkat kode barang: karena harga berubah, karena jumlah terjual berubah, karena ada barang baru, atau karena ada barang yang berhenti terjual."
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <HWaterfall
              steps={[
                { key: "p2", label: "P2", value: pvm.T2, kind: "start" },
                { key: "price", label: "Harga", sub: `${nfFull.format(pvm.nCont)} kode terjual di kedua periode`, value: pvm.price, kind: "step" },
                { key: "volume", label: "Volume", sub: "jumlah terjual, dihitung dengan harga P2", value: pvm.volume, kind: "step" },
                { key: "added", label: "Barang baru", sub: `${nfFull.format(pvm.nAdded)} kode hanya terjual di P1`, value: pvm.added, kind: "step" },
                { key: "lost", label: "Barang berhenti", sub: `${nfFull.format(pvm.nLost)} kode hanya terjual di P2`, value: pvm.lost, kind: "step" },
                { key: "p1", label: "P1", value: pvm.T1, kind: "end" },
              ]}
              labelCol="minmax(9rem, 40%)"
            />
            <div className="space-y-2 text-[12.5px] leading-relaxed text-[var(--ink-700)]">
              <p>
                <b className="font-semibold text-[var(--ink-900)]">Pergantian barang</b> menyumbang{" "}
                <Signed v={pvm.added + pvm.lost} className="font-medium" />: {nfFull.format(pvm.nAdded)} kode baru membawa {rp(pvm.added)}, sementara{" "}
                {nfFull.format(pvm.nLost)} kode yang berhenti terjual kehilangan {rp(-pvm.lost)}.
              </p>
              <p>
                Dari barang yang terjual di kedua periode, perubahan <b className="font-semibold text-[var(--ink-900)]">volume</b>{" "}
                {pvm.volume >= 0 ? "menambah" : "mengurangi"} {rp(Math.abs(pvm.volume))} dan perubahan{" "}
                <b className="font-semibold text-[var(--ink-900)]">harga</b> {pvm.price >= 0 ? "menambah" : "mengurangi"} {rp(Math.abs(pvm.price))}.
              </p>
              <p className={cx("text-[11px] leading-snug", MUTED)}>
                Keempat komponen berjumlah persis sama dengan selisih. Volume dihitung per kode lalu dirupiahkan, jadi aman walau satuannya berbeda.
                {Math.abs(pvm.added) + Math.abs(pvm.lost) > Math.abs(pvm.T1 - pvm.T2) &&
                  " Pergantian kode yang sangat besar bisa juga berarti kode barang sering diganti (mis. kode listing marketplace baru), bukan produk yang benar-benar baru."}
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- tabel     */

function MemberTable({ members, dim, onPick }) {
  const [limit, setLimit] = useState(40);
  const rows = useMemo(() => members.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)), [members]);
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className={cx("border-b text-[11px] text-[var(--ink-500)]", LINE)}>
            <th className="px-2 py-2 text-left font-medium">{labelOf(dim)}</th>
            <th className="px-2 py-2 text-right font-medium">P2</th>
            <th className="px-2 py-2 text-right font-medium">P1</th>
            <th className="px-2 py-2 text-right font-medium">Selisih</th>
            <th className="px-2 py-2 text-right font-medium">Δ%</th>
            <th className="px-2 py-2 text-right font-medium" title="Selisih dikurangi bagian yang wajar kalau anggota ini tumbuh secepat totalnya">
              Di luar tren
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((m) => (
            <tr key={m.key} onClick={() => onPick(m)} className="cursor-pointer border-b border-[var(--ink-100)] transition-colors hover:bg-[var(--brand-50)]">
              <td className="max-w-[280px] truncate px-2 py-1.5 text-[var(--ink-900)]" title={m.label}>
                {m.label}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-600)]">{rp(m.r2)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[var(--ink-900)]">{rp(m.r1)}</td>
              <td className="px-2 py-1.5 text-right font-medium">
                <Signed v={m.d} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Delta g={m.g} p1={m.r1} p2={m.r2} size="xs" />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Signed v={m.excess} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 40 && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-2">
          {rows.length > limit && (
            <button type="button" className={BTN_QUIET} onClick={() => setLimit((l) => l + 40)}>
              Tampilkan 40 lagi dari {nfFull.format(rows.length - limit)}
            </button>
          )}
          <ShowAll
            total={rows.length}
            limit={40}
            open={limit >= rows.length}
            onToggle={() => setLimit((l) => (l >= rows.length ? 40 : rows.length))}
            noun={labelOf(dim).toLowerCase()}
          />
        </div>
      )}
      <p className={cx("mt-2 text-[11px] leading-snug", MUTED)}>
        "Di luar tren" = selisih dikurangi bagian yang wajar kalau anggota ini tumbuh secepat totalnya. Inilah bagian yang benar-benar
        istimewa dari anggota tersebut.
      </p>
    </div>
  );
}
