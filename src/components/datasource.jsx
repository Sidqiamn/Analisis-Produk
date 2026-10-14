/* ============================================================================
   Layar Sumber data
   ----------------------------------------------------------------------------
   Menjawab tiga pertanyaan setiap kali data diganti:
   1. Data apa yang sedang dipakai?   (sumber, jumlah baris, rentang tanggal)
   2. Kolom apa saja yang dikenali?   (nama di data → arti di aplikasi)
   3. Apakah ada yang perlu dibenahi? (tanggal kosong, ID rusak, dsb.)

   Dari sini pengguna juga bisa memuat ulang data atau mengunggah CSV/JSON
   lain tanpa mengubah kode. Unggahan hanya berlaku di sesi browser itu.
   ========================================================================== */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { COLUMN_PURPOSE } from "../lib/data.js";
import { CSV_PATH, SUPABASE } from "../lib/config.js";
import { dLabel, fmt, nfFull, nfPct, toJs } from "../lib/format.js";
import { BTN, BTN_ON, FOCUS, LINE, MUTED, ROOT_CLASS, ROOT_FONT, TONES, cx } from "../lib/theme.jsx";
import { IconClose, IconDatabase, IconRefresh, IconUpload } from "./icons.jsx";
import { Notice, Tile } from "./productui.jsx";

const date = (iso) => (iso ? dLabel.format(toJs(iso)) : "–");
const time = (iso) =>
  iso ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "–";
const clock = (iso) => (iso ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short" }).format(new Date(iso)) : "–");
const day = (iso) => (iso ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso)) : "–");
const DELIM = { ";": "titik koma (;)", ",": "koma (,)", "\t": "tab", "|": "garis tegak (|)", JSON: "JSON" };
const DATE_STYLE = {
  iso: "tahun-bulan-hari",
  dmy: "hari/bulan/tahun",
  mdy: "bulan/hari/tahun",
  serial: "nomor seri tanggal Excel",
  name: "dengan nama bulan",
  other: "format lain yang dikenali browser",
};
const NUM_STYLE = { id: "gaya Indonesia (1.234.567,89)", en: "gaya Inggris (1,234,567.89)", plain: "angka polos tanpa pemisah ribuan" };
const SOURCE = { csv: "CSV bawaan", upload: "Berkas unggahan", supabase: "Supabase" };

function StatusPill({ kind }) {
  const map = {
    found: ["Ditemukan", TONES.teal],
    derived: ["Dihitung", TONES.blue],
    missing: ["Tidak ada", TONES.mauve],
  };
  const [label, t] = map[kind];
  return (
    <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--ink-800)]" style={{ background: t.tint, boxShadow: `inset 0 0 0 1px ${t.line}` }}>
      {label}
    </span>
  );
}

/** Daftar hasil pemeriksaan data, dari yang paling perlu ditindaklanjuti. */
function checks(q) {
  const out = [];
  if (q.rowsNoDate > 0) {
    out.push({ tone: "warn", text: `${nfFull.format(q.rowsNoDate)} baris tidak punya tanggal yang terbaca, jadi dilewati.` });
  }
  if (!q.hasCustomer) {
    out.push({ tone: "neutral", text: "Kolom ID pelanggan tidak ada, jadi analisis pelanggan hilang/baru dimatikan." });
  } else if (!q.customersReliable) {
    out.push({
      tone: "warn",
      text: `${nfPct.format(q.customerBrokenShare)} ID pelanggan rusak${q.customerBrokenSample ? ` (mis. "${q.customerBrokenSample}")` : ""} dan ${nfPct.format(
        q.customerMissingShare
      )} kosong. Biasanya karena angka panjang tersimpan sebagai notasi ilmiah di Excel. Analisis pelanggan dimatikan sampai datanya bersih: ambil langsung dari database, atau format kolomnya sebagai Teks sebelum menyimpan.`,
    });
  } else {
    out.push({ tone: "ok", text: "ID pelanggan terbaca baik — analisis pelanggan aktif." });
  }
  if (q.unknownLini > 0) {
    out.push({
      tone: "warn",
      text: `${nfFull.format(q.unknownLini)} transaksi (${fmt(q.unknownLiniRev, "currency", true)}) tidak punya lini produk. Ditampilkan sebagai satu baris terpisah dan tidak ikut direkomendasikan; petakan kodenya ke master barang supaya penilaian lengkap.`,
    });
  }
  if (q.rowsNegRevenue > 0) {
    out.push({ tone: "neutral", text: `${nfFull.format(q.rowsNegRevenue)} baris berpendapatan negatif (mis. retur) ikut dijumlahkan apa adanya.` });
  }
  if (q.rowsZeroRevenue > 0) {
    out.push({ tone: "neutral", text: `${nfFull.format(q.rowsZeroRevenue)} baris berpendapatan nol.` });
  }
  if (q.map?.Price_List && q.discountShare != null) {
    out.push({
      tone: "neutral",
      text: `Harga jual di bawah harga daftar pada ${nfPct.format(q.discountShare)} transaksi${q.discountShare < 0.05 ? " — diskon hampir tidak tercatat, jadi efek harga akan kecil." : "."}`,
    });
  }
  return out;
}

export function DataSourceDialog({ open, onClose, quality: q, meta, onReload, onUpload, onReset }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !q || typeof document === "undefined") return null;

  const pick = (files) => {
    const f = files?.[0];
    if (f) onUpload(f);
  };

  const rows = Object.entries(COLUMN_PURPOSE).map(([key, p]) => {
    const header = q.map?.[key];
    const kind = header ? "found" : q.derived?.includes(key) ? "derived" : "missing";
    return { key, ...p, header, kind };
  });

  const sourceName =
    q.source === "supabase" ? `${SUPABASE.table}` : q.source === "upload" ? q.name : q.name || CSV_PATH.split("/").pop();

  return createPortal(
    <div className={ROOT_CLASS} style={ROOT_FONT}>
      <div className="dt-fade fixed inset-0 z-[9990] bg-[rgba(36,26,31,.42)]" onClick={onClose} aria-hidden="true" />
      <div
        className="dt-pop dt-shadow-pop fixed left-1/2 top-1/2 z-[9991] flex max-h-[88vh] w-[min(820px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-[var(--paper)]"
        role="dialog"
        aria-modal="true"
        aria-label="Sumber data"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
      >
        <header className={cx("flex items-start gap-3 border-b px-5 pb-3 pt-4", LINE)}>
          <span
            className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-lg"
            style={{ background: TONES.blue.tint, color: TONES.blue.ink, boxShadow: `inset 0 0 0 1px ${TONES.blue.line}` }}
          >
            <IconDatabase className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="dt-display text-[19px] font-semibold leading-tight text-[var(--ink-900)]">Sumber data</h2>
            <p className={cx("mt-0.5 text-[12px] leading-snug", MUTED)}>
              Semua halaman dihitung ulang dari data ini. Ganti datanya kapan saja; kolom, tanggal, dan format angka dikenali sendiri.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cx("grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--ink-500)] hover:bg-[var(--ink-100)] hover:text-[var(--ink-900)]", FOCUS)}
            aria-label="Tutup sumber data"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="dt-scroll min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={SOURCE[q.source] || "Sumber"} value={sourceName || "–"} tone="blue" title={sourceName} />
            <Tile label="Baris terbaca" value={nfFull.format(q.rowsRead)} sub={`${nfFull.format(q.lines)} transaksi dipakai`} tone="brand" />
            <Tile label="Rentang tanggal" value={q.dateFrom ? `${date(q.dateFrom)}` : "–"} sub={q.dateTo ? `sampai ${date(q.dateTo)}` : "kolom tanggal tidak ada"} tone="teal" />
            <Tile label="Dimuat pukul" value={clock(q.loadedAt)} sub={day(q.loadedAt)} tone="mauve" />
          </div>

          <div
            className={cx(
              "flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-3 transition-colors",
              drag ? "border-[var(--brand-400)] bg-[var(--brand-50)]" : "border-[var(--ink-300)] bg-[var(--band)]"
            )}
          >
            <button type="button" className={cx(BTN_ON, "inline-flex items-center gap-1.5")} onClick={() => fileRef.current?.click()} disabled={meta?.loading}>
              <IconUpload className="h-4 w-4" />
              Unggah CSV atau JSON…
            </button>
            <button type="button" className={cx(BTN, "inline-flex items-center gap-1.5")} onClick={onReload} disabled={meta?.loading}>
              <IconRefresh className="h-4 w-4" />
              {meta?.loading ? "Memuat…" : "Muat ulang data"}
            </button>
            {q.source === "upload" && (
              <button type="button" className={BTN} onClick={onReset} disabled={meta?.loading}>
                Kembali ke data bawaan
              </button>
            )}
            <span className={cx("text-[11.5px]", MUTED)}>atau seret berkas ke kotak ini. Unggahan hanya berlaku di browser ini sampai halaman dimuat ulang.</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {meta?.error && (
            <Notice tone="danger" title="Data baru tidak bisa dipakai">
              {meta.error} Data sebelumnya tetap dipakai.
            </Notice>
          )}

          <section>
            <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">Kolom yang dikenali</h3>
            <p className={cx("mt-0.5 text-[12px] leading-snug", MUTED)}>
              Nama kolom dicocokkan tanpa peduli huruf besar-kecil, spasi, atau garis bawah. Kalau datamu memakai nama lain, tambahkan di
              COLUMN_ALIASES (src/lib/config.js).
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3">
              <div>
                <dt className={MUTED}>Pemisah kolom</dt>
                <dd className="font-medium text-[var(--ink-800)]">{DELIM[q.delimiter] || q.delimiter || (q.source === "supabase" ? "tidak berlaku (Supabase)" : "–")}</dd>
              </div>
              <div>
                <dt className={MUTED}>Kolom tanggal</dt>
                <dd className="font-medium text-[var(--ink-800)]">
                  {q.dateField ? (
                    <>
                      {q.dateField} · {DATE_STYLE[q.dateStyle] || DATE_STYLE[q.dateFormat] || "–"}
                      {q.dateSample && <span className={cx("ml-1 font-normal", MUTED)}>(mis. {q.dateSample})</span>}
                    </>
                  ) : (
                    "tidak ditemukan"
                  )}
                </dd>
              </div>
              <div>
                <dt className={MUTED}>Format angka pendapatan</dt>
                <dd className="font-medium text-[var(--ink-800)]">{NUM_STYLE[q.numberStyles?.Revenue || q.numberFormats?.Revenue] || "–"}</dd>
              </div>
              {q.source === "supabase" && (
                <div className="sm:col-span-3">
                  <dt className={MUTED}>Urutan halaman Supabase</dt>
                  <dd className="font-medium text-[var(--ink-800)]">
                    {q.supabaseOrder ? <code className="font-mono text-[11.5px]">{q.supabaseOrder}</code> : "tanpa urutan — isi SUPABASE.order di config.js dengan kolom unik"}
                    {q.supabaseTotal != null && <span className={cx("ml-1 font-normal", MUTED)}>· {nfFull.format(q.supabaseTotal)} baris di tabel</span>}
                  </dd>
                </div>
              )}
            </dl>
            <div className={cx("mt-2 overflow-hidden rounded-lg border", LINE)}>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[var(--band)] text-left text-[11px] text-[var(--ink-600)]">
                    <th className="px-3 py-2 font-medium">Arti di aplikasi</th>
                    <th className="px-3 py-2 font-medium">Kolom di data</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Dipakai untuk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-[var(--ink-100)]">
                      <td className="px-3 py-1.5 text-[var(--ink-900)]">
                        {r.label}
                        {r.need === "wajib" && <span className="ml-1 text-[10.5px] text-[var(--red-700)]">wajib</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-[var(--ink-700)]">{r.header || (r.kind === "derived" ? "dari tanggal" : "–")}</td>
                      <td className="px-3 py-1.5">
                        <StatusPill kind={r.kind} />
                      </td>
                      <td className="hidden px-3 py-1.5 text-[var(--ink-600)] sm:table-cell">{r.use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">Pemeriksaan data</h3>
            <div className="mt-2 space-y-1.5">
              {checks(q).map((c, i) =>
                c.tone === "ok" ? (
                  <Notice key={i} tone="info" className="py-2">
                    {c.text}
                  </Notice>
                ) : (
                  <Notice key={i} tone={c.tone} className="py-2">
                    {c.text}
                  </Notice>
                )
              )}
            </div>
          </section>

          <section className={cx("rounded-lg border px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ink-700)]", LINE)}>
            <h3 className="text-[13.5px] font-semibold text-[var(--ink-900)]">Cara memperbarui data secara tetap</h3>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                CSV: ganti isi <code className="font-mono text-[11.5px]">public{CSV_PATH}</code> dengan ekspor terbaru (nama dan urutan kolom boleh berbeda selama
                dikenali), lalu tekan Muat ulang data.
              </li>
              <li>
                Supabase: isi <code className="font-mono text-[11.5px]">VITE_SUPABASE_URL</code> dan <code className="font-mono text-[11.5px]">VITE_SUPABASE_ANON_KEY</code> di berkas{" "}
                <code className="font-mono text-[11.5px]">.env</code>. Aplikasi otomatis membaca Supabase, dan bisa memuat ulang sendiri tiap beberapa menit (REFRESH_MINUTES di
                config.js).
              </li>
              <li>Sekali pakai: unggah berkas di atas. Cocok untuk mencoba data dari sumber lain tanpa mengubah apa pun.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Tombol ringkas di kaki menu samping: sumber, rentang tanggal, waktu muat. */
export function DataSourceButton({ quality: q, onClick, loading }) {
  if (!q) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[.08]", FOCUS, "focus-visible:ring-white/60")}
      title="Lihat sumber data, kolom yang dikenali, dan ganti data"
    >
      <span className="mt-px grid h-7 w-7 flex-none place-items-center rounded-md bg-white/[.10] text-white/80 group-hover:text-white">
        {loading ? <IconRefresh className="h-4 w-4 animate-spin" /> : <IconDatabase className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-white/90">{q.name || SOURCE[q.source] || "Sumber data"}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
          {SOURCE[q.source] || "Data"}, {nfFull.format(q.lines)} transaksi
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
          {q.dateFrom ? `${date(q.dateFrom)} – ${date(q.dateTo)}` : "tanpa kolom tanggal"}
        </span>
      </span>
    </button>
  );
}
