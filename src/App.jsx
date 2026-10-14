/* ============================================================================
   Kerangka aplikasi
   ----------------------------------------------------------------------------
   Satu tempat untuk hal-hal yang dipakai bersama semua halaman:
   · memuat data — dari CSV, Supabase, atau berkas unggahan — dan memuat
     ulang kapan saja tanpa menutup aplikasi
   · rentang tanggal P1/P2 dan preset; selama pengguna belum mengubahnya,
     periode ikut bergeser ke data terbaru setiap kali data diperbarui
   · slicer dimensi
   · metrik yang sedang aktif
   · pengaturan analisis produk (tingkat, jendela, kriteria) dan ambang
     menu Peringatan

   Karena keadaan itu tinggal di sini, berpindah menu tidak menghapus
   penyaring yang sudah diatur — yang berganti hanya cara menyajikannya.

   Penanda memuat: setiap pilihan punya dua salinan. Kontrol (menu,
   periode, penyaring, tingkat, jendela, kriteria) memakai nilai LANGSUNG,
   jadi terasa seketika. Isi halaman memakai nilai TAMPILAN (`view`) yang
   baru menyusul sesudah logo memuat tergambar di atas halaman. Selama
   keduanya berbeda, logo itu tampil — lihat useSettled di lib/hooks.js.
   Tidak ada yang terikat pada satu berkas data: dimensi, tingkat produk,
   dan penyaring yang ditampilkan mengikuti kolom yang benar-benar ada.
   ========================================================================== */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

import {
  CRITERIA_DEFAULTS,
  DATA_SOURCE,
  DEFAULT_UNIT,
  DIMENSIONS,
  MEASURES,
  REFRESH_MINUTES,
  SLICERS,
  activeUnits,
  hasCol,
} from "./lib/config.js";
import { analysisWindow, buildPortfolio } from "./lib/product.js";
import { alertWindows, normalizeAlertCfg } from "./lib/alerts.js";
import {
  computePreset,
  dLabel,
  daysBetween,
  endOfMonth,
  inRange,
  keyOf,
  monthIndex,
  monthIndexEnd,
  monthIndexStart,
  shiftDays,
  shiftMonthsSafe,
  shiftYearSafe,
  shortRange,
  startOfMonth,
  toJs,
} from "./lib/format.js";
import { applySchema, defaultSource, loadFromCsv, loadFromFile, loadFromSupabase } from "./lib/data.js";
import { readStore, useHashRoute, useIsNarrow, useSettled, useStable, writeStore } from "./lib/hooks.js";
import { BTN, BTN_QUIET, Code, FOCUS, Frame, LINE, MUTED, Mark, NOTE_BAR, cx } from "./lib/theme.jsx";

import { GROUP_TONE, MENU, MenuButton, Sidebar, menuText } from "./components/Sidebar.jsx";
import { AcuanBar, PeriodBar, SlicerBar } from "./components/filters.jsx";
import { DataSourceButton, DataSourceDialog } from "./components/datasource.jsx";
import { IconCalendar, IconDatabase, IconUpload } from "./components/icons.jsx";
import { BusyHost, BusyOverlay, LiveControls, LoaderMark } from "./components/busy.jsx";

import DecompositionTree from "./pages/DecompositionTree.jsx";
import ProductPortfolio from "./pages/ProductPortfolio.jsx";
import ProductDossier from "./pages/ProductDossier.jsx";
import VariancePage from "./pages/VariancePage.jsx";
import HierarchyPage from "./pages/HierarchyPage.jsx";
import FlowsPage from "./pages/FlowsPage.jsx";
import MatrixPage from "./pages/MatrixPage.jsx";
import InfluencersPage from "./pages/InfluencersPage.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";

/* Halaman yang dikenal. Tautan lama atau salah ketik (mis. #/ringkasan dari
   versi sebelumnya) diarahkan ke halaman pembuka. */
const ROUTE_KEYS = new Set(MENU.map((m) => m.key));
/* Halaman pembuka: daftar hal yang perlu dilihat sekarang. */
const HOME_ROUTE = "peringatan";

/* Halaman yang memakai data per transaksi dan jendela analisis. */
const LINE_ROUTES = new Set(["peringatan", "portofolio", "diagnosis", "perubahan", "hierarki", "aliran", "matriks", "pendorong"]);
/* Halaman yang butuh penilaian produk (tahap, rekomendasi). */
const PORTFOLIO_ROUTES = new Set(["peringatan", "portofolio", "diagnosis", "pendorong"]);

/* Ambang dan jenis peringatan yang dipilih pengguna disimpan di peramban,
   supaya tidak perlu diatur ulang setiap membuka aplikasi. */
const ALERT_STORE = "dt-peringatan-v1";

const nfInt = new Intl.NumberFormat("id-ID");

/* Bandingkan periode (nyala/mati) dan jenis pembandingnya diingat peramban. */
const CMP_STORE = "dt-pembanding-v1";
const PREV_PRESETS = new Set(["keep_prev", "month_prev", "quarter_prev", "year_prev", "roll30", "roll90"]);
const dayMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

/** Rentang ringkas untuk layar sempit: "1 Mar – 31 Jul 2026" kalau tahunnya sama. */
function compactRange(r) {
  if (!r || !r.from || !r.to) return "–";
  if (r.from.slice(0, 4) !== r.to.slice(0, 4)) return shortRange(r);
  return `${dayMonth.format(toJs(r.from))} – ${dLabel.format(toJs(r.to))}`;
}

/** Nama pembanding untuk ringkasan: "tahun lalu", "periode sebelumnya", atau rentangnya. */
function compareWord(a, b) {
  if (b.from === shiftYearSafe(a.from, -1) && b.to === shiftYearSafe(a.to, -1)) return "tahun lalu";
  const n = daysBetween(a.from, a.to);
  const to = shiftDays(a.from, -1);
  if (b.to === to && b.from === shiftDays(to, -(n - 1))) return "periode sebelumnya";
  return compactRange(b);
}

/* Nama halaman untuk tombol "Kembali ke …" di Diagnosis. */
const BACK_LABEL = {
  pohon: "Pohon dekomposisi",
  peringatan: "Peringatan",
  portofolio: "Portofolio",
  perubahan: "Penjelasan perubahan",
  hierarki: "Peta hierarki",
  aliran: "Aliran",
  matriks: "Matriks silang",
  pendorong: "Pendorong",
};

/**
 * Geser sebuah rentang supaya rentang acuannya (yang dulu berakhir di
 * `oldTo`) kini berakhir di `newTo`. Rentang bulan penuh digeser per bulan
 * (1 Mar–31 Jul → 1 Feb–30 Jun), selain itu per hari — panjangnya tetap.
 */
function shiftRangeTo(r, oldTo, newTo) {
  if (!r || !r.from || !r.to || !oldTo || !newTo) return r;
  const isEnd = (d) => d === endOfMonth(d);
  if (r.from.slice(8) === "01" && isEnd(r.to) && isEnd(oldTo) && isEnd(newTo)) {
    const md = monthIndex(newTo) - monthIndex(oldTo);
    return { from: monthIndexStart(monthIndex(r.from) + md), to: monthIndexEnd(monthIndex(r.to) + md) };
  }
  const dd = daysBetween(oldTo, newTo) - 1;
  return { from: shiftDays(r.from, dd), to: shiftDays(r.to, dd) };
}

/* ------------------------------------------------------------- memuat      */

/** Layar pembuka selagi data dibaca: logo berputar di atas rangka kolom yang berdenyut. */
function LoadingScreen() {
  return (
    <Frame>
      <header className="dt-topbar flex items-center gap-2.5 px-4 py-3 text-white">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
          <Mark className="h-5 w-5" />
        </span>
        <span className="dt-display text-[16px] font-semibold">Analitik Penjualan</span>
      </header>
      <div className="relative flex flex-1 items-start gap-4 px-5 pt-6">
        {[0, 1, 2].map((col) => (
          <div className="flex-1" key={col} style={{ opacity: 0.55 - col * 0.15 }} aria-hidden="true">
            <div className="dt-skeleton mb-3 h-10 rounded-xl" />
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((n) => (
                <div className="dt-skeleton h-[96px] rounded-xl" key={n} />
              ))}
            </div>
          </div>
        ))}
        <div className="absolute inset-0 grid place-items-center px-4" role="status" aria-live="polite">
          <div className="dt-shadow-pop flex flex-col items-center gap-3 rounded-2xl border border-[var(--ink-200)] bg-[var(--paper)] px-9 py-7 text-center">
            <LoaderMark size={76} />
            <div>
              <div className="text-[14.5px] font-semibold text-[var(--ink-900)]">Membaca data…</div>
              <div className="mt-0.5 text-[12px] text-[var(--ink-500)]">Data yang besar butuh beberapa detik.</div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Tombol "kembali ke atas" di pojok kanan bawah area halaman, muncul setelah halaman digulir. */
function BackToTop({ host, resetKey }) {
  const [el, setEl] = useState(null);
  const [show, setShow] = useState(false);
  // Halaman baru mulai dari atas.
  useEffect(() => {
    setShow(false);
    setEl(null);
  }, [resetKey]);
  useEffect(() => {
    if (!host) return undefined;
    const onScroll = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !host.contains(t)) return;
      // Hanya penggulir utama halaman: akar halaman, atau wadah yang ditandai
      // data-dt-scrollroot (kanvas Pohon dekomposisi). Tabel, matriks, dan
      // daftar yang punya gulirnya sendiri tidak memunculkan tombol ini.
      if (t.parentElement !== host && !t.hasAttribute("data-dt-scrollroot")) return;
      setEl(t);
      setShow(t.scrollTop > 360);
    };
    host.addEventListener("scroll", onScroll, true);
    return () => host.removeEventListener("scroll", onScroll, true);
  }, [host]);
  if (!show || !el) return null;
  const toTop = () => {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  };
  return (
    <button
      type="button"
      onClick={toTop}
      className={cx(
        "dt-rise absolute bottom-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-[var(--brand-700)] text-white transition-colors hover:bg-[var(--brand-600)] active:bg-[var(--brand-800)] sm:bottom-5 sm:right-5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]"
      )}
      style={{ boxShadow: "0 10px 22px -10px rgba(61,0,32,.7), 0 2px 6px rgba(36,26,31,.18)" }}
      aria-label="Kembali ke atas halaman"
      title="Kembali ke atas"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
        <path d="M10 16V4.5M4.8 9.6 10 4.4l5.2 5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Layar ketika data belum bisa dipakai — selalu dengan jalan keluar. */
function ProblemScreen({ title, children, onUpload, onRetry }) {
  const ref = useRef(null);
  return (
    <Frame>
      <header className="dt-topbar flex items-center gap-2.5 px-4 py-3 text-white">
        <span className="dt-display text-[16px] font-semibold">Analitik Penjualan</span>
      </header>
      <div className="max-w-[64ch] p-10">
        <h2 className="dt-display text-[22px] font-semibold text-[var(--ink-900)]">{title}</h2>
        <div className={cx("mt-2 space-y-2 text-[13px] leading-relaxed", MUTED)}>{children}</div>
        <div className="mt-5 flex flex-wrap gap-2">
          {onRetry && (
            <button
              type="button"
              className="rounded-md border border-[var(--ink-200)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink-800)] hover:border-[var(--brand-300)]"
              onClick={onRetry}
            >
              Coba muat lagi
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--brand-700)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--brand-600)]"
            onClick={() => ref.current?.click()}
          >
            <IconUpload className="h-4 w-4" />
            Unggah CSV atau JSON
          </button>
          <input
            ref={ref}
            type="file"
            accept=".csv,.txt,.tsv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------------------- App     */

export default function App() {
  /* --- data --- */
  const [rows, setRows] = useState([]);
  const [lines, setLines] = useState([]);
  const [labels, setLabels] = useState({});
  const [quality, setQuality] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ loading: false, error: null });
  const [dsOpen, setDsOpen] = useState(false);
  const uploadRef = useRef(null); // berkas unggahan terakhir, untuk "Muat ulang"

  /* --- navigasi --- */
  const [route, go] = useHashRoute(HOME_ROUTE, ROUTE_KEYS);
  const narrow = useIsNarrow(1000);
  // Di layar lebar menu terbuka sejak awal; di layar sempit ia menimpa isi
  // halaman, jadi lebih sopan kalau dimulai tertutup.
  const [navOpen, setNavOpen] = useState(() => !narrow);
  const narrowRef = useRef(narrow);
  useEffect(() => {
    if (narrowRef.current !== narrow) {
      narrowRef.current = narrow;
      setNavOpen(!narrow);
    }
  }, [narrow]);
  // Di layar ponsel bilah periode & penyaring diringkas jadi satu baris;
  // "Ubah" membukanya. Berpindah halaman meringkasnya lagi.
  const bandNarrow = useIsNarrow(700);
  const [bandOpen, setBandOpen] = useState(false);
  useEffect(() => setBandOpen(false), [route]);
  // Fokus papan ketik ikut berpindah: "Ubah" → kontrol pertama di bilah,
  // "Selesai" → kembali ke tombol ringkasan (tombol yang ditekan hilang).
  const bandBoxRef = useRef(null);
  const bandBtnRef = useRef(null);
  const bandFocus = useRef(null);
  const toggleBand = useCallback((open) => {
    bandFocus.current = open ? "open" : "close";
    setBandOpen(open);
  }, []);
  useEffect(() => {
    const what = bandFocus.current;
    if (!what) return;
    bandFocus.current = null;
    if (what === "open") bandBoxRef.current?.querySelector("input, select, button")?.focus();
    else bandBtnRef.current?.focus();
  }, [bandOpen]);

  /* --- metrik --- */
  const [measureKey, setMeasureKey] = useState(MEASURES[0].key);

  /* --- rentang tanggal: padanan slicer Date dan Cmp Date di Power BI ---
     Bandingkan periode menyala sejak awal (P2 = periode yang sama tahun lalu),
     supaya naik/turun langsung terlihat berwarna tanpa harus diatur dulu. */
  const [cmpOn, setCmpOn] = useState(() => readStore(CMP_STORE, null)?.on ?? true);
  // Jenis pembanding yang terakhir dipilih: "yoy" (tahun lalu) atau "prev"
  // (periode sebelumnya). Diingat peramban, dipakai saat periode bawaan dihitung.
  const [cmpMode, setCmpMode] = useState(() => (readStore(CMP_STORE, null)?.mode === "prev" ? "prev" : "yoy"));
  useEffect(() => writeStore(CMP_STORE, { on: cmpOn, mode: cmpMode }), [cmpOn, cmpMode]);
  const [p1, setP1] = useState({ from: "", to: "" });
  const [p2, setP2] = useState({ from: "", to: "" });
  const [lastPreset, setLastPreset] = useState(null);
  // Selama pengguna belum menyentuh periode, periode mengikuti data terbaru.
  const [periodTouched, setPeriodTouched] = useState(false);

  /* --- slicer --- */
  const emptySlicers = () => Object.fromEntries(SLICERS.map((d) => [d, new Set()]));
  const [slicers, setSlicers] = useState(emptySlicers);

  /* --- analisis produk: disimpan di sini supaya bertahan saat pindah halaman --- */
  const [unitKey, setUnitKey] = useState(DEFAULT_UNIT);
  const [winMode, setWinMode] = useState("12");
  const [crit, setCrit] = useState(CRITERIA_DEFAULTS);
  const [focusKey, setFocusKey] = useState(null);
  const [varPath, setVarPath] = useState([]);
  const [alertCfg, setAlertCfg] = useState(() => normalizeAlertCfg(readStore(ALERT_STORE, null)));
  useEffect(() => writeStore(ALERT_STORE, alertCfg), [alertCfg]);
  // Keadaan periode sebelum "Telusuri" dari Peringatan, untuk tombol Kembalikan.
  const [restore, setRestore] = useState(null);

  /* --- muat data --- */
  const adopt = useCallback((res) => {
    if (!res || !res.rows?.length) {
      throw new Error("Tidak ada baris yang terbaca. Pastikan berkasnya CSV dengan baris judul, atau JSON berisi array baris.");
    }
    if (!res.quality.map?.Revenue) {
      throw new Error("Kolom pendapatan tidak ditemukan. Beri nama Revenue atau Pendapatan, atau tambahkan namanya di COLUMN_ALIASES (src/lib/config.js).");
    }
    applySchema(res.quality);
    setRows(res.rows);
    setLines(res.lines);
    setLabels(res.labels);
    setQuality(res.quality);
    setStatus("ready");
  }, []);

  const loadDefault = useCallback(() => (defaultSource(DATA_SOURCE) === "supabase" ? loadFromSupabase() : loadFromCsv()), []);

  // Pertama kali dibuka.
  useEffect(() => {
    let alive = true;
    loadDefault()
      .then((res) => alive && adopt(res))
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [loadDefault, adopt]);

  /** Jalankan satu pemuatan; kalau gagal, data lama tetap dipakai.
      `quiet` = muat ulang otomatis di latar belakang: tanpa logo memuat yang
      menutup halaman (tanda kecil di kaki menu tetap muncul). */
  const run = useCallback(
    async (job, { resetFilters = false, quiet = false } = {}) => {
      setMeta({ loading: true, quiet, error: null });
      try {
        const res = await job();
        adopt(res);
        if (resetFilters) {
          // Data dari sumber lain: penyaring, periode, dan produk terpilih
          // milik data lama tidak berlaku lagi. Periode kembali mengikuti
          // tanggal terbaru di data baru.
          setSlicers(emptySlicers());
          setPeriodTouched(false);
          setLastPreset(null);
          setFocusKey(null);
          setVarPath([]);
          setRestore(null);
        }
        setError(null);
        setMeta({ loading: false, error: null });
        return true;
      } catch (err) {
        setMeta({ loading: false, error: err.message });
        if (status !== "ready") {
          setError(err.message);
          setStatus("error");
        }
        return false;
      }
    },
    [adopt, status]
  );

  const reload = useCallback(
    (opts) => run(() => (uploadRef.current ? loadFromFile(uploadRef.current) : loadDefault()), opts?.quiet ? { quiet: true } : undefined),
    [run, loadDefault]
  );

  const upload = useCallback(
    (file) =>
      run(
        async () => {
          const res = await loadFromFile(file);
          uploadRef.current = file;
          return res;
        },
        { resetFilters: true }
      ),
    [run]
  );

  const resetSource = useCallback(() => {
    uploadRef.current = null;
    return run(loadDefault, { resetFilters: true });
  }, [run, loadDefault]);

  // Muat ulang otomatis (mis. data Supabase yang diperbarui tiap jam).
  useEffect(() => {
    if (!(REFRESH_MINUTES > 0) || status !== "ready") return undefined;
    const id = setInterval(() => {
      if (!uploadRef.current) reload({ quiet: true });
    }, REFRESH_MINUTES * 60000);
    return () => clearInterval(id);
  }, [status, reload]);

  /**
   * Filter dari dashboard Metabase lewat query string.
   * Dimensi : ?Branch=Bandung  atau  ?Branch=Bandung,Jakarta
   * Halaman : #/peringatan, #/pohon, #/portofolio, … (lihat MENU di Sidebar.jsx)
   */
  const urlFilters = useMemo(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const out = {};
    for (const dim of DIMENSIONS) {
      const v = params.get(dim);
      if (v) out[dim] = new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
    }
    return out;
  }, []);

  const base = useMemo(() => {
    const entries = Object.entries(urlFilters);
    if (!entries.length) return rows;
    return rows.filter((r) => entries.every(([dim, set]) => set.has(keyOf(r, dim))));
  }, [rows, urlFilters]);

  /* --- batas tanggal yang ada di data --- */
  const bounds = useMemo(() => {
    let min = null;
    let max = null;
    for (const r of base) {
      const d = r.__d;
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min, max };
  }, [base]);

  const hasDates = !!bounds.min;

  /* --- periode bawaan: enam bulan terakhir data. Dihitung ulang setiap kali
         data diperbarui, selama pengguna belum mengubah periode sendiri. --- */
  // Periode bawaan yang PERTAMA (begitu data terbaca) langsung dipakai tanpa
  // penanda memuat — belum ada isi halaman yang perlu ditutupi.
  const autoInstant = useRef(false);
  useEffect(() => {
    if (!bounds.max || periodTouched) return;
    autoInstant.current = !p1.to;
    const to = bounds.max;
    const from0 = startOfMonth(shiftMonthsSafe(to, -5));
    const from = from0 < bounds.min ? bounds.min : from0;
    setP1({ from, to });
    // Pembanding pilihan pengguna (tahun lalu / periode sebelumnya). Kalau data
    // belum mundur sejauh itu, pakai pilihan lain yang lebih tertutup data,
    // supaya angka naik/turun tidak terisi "baru" semua.
    const n = daysBetween(from, to);
    const to2 = shiftDays(from, -1);
    const prev = { from: shiftDays(to2, -(n - 1)), to: to2 };
    const yoy = { from: shiftYearSafe(from, -1), to: shiftYearSafe(to, -1) };
    const want = cmpMode === "prev" ? prev : yoy;
    const other = cmpMode === "prev" ? yoy : prev;
    const cover = (r) => {
      const a = r.from < bounds.min ? bounds.min : r.from;
      return a > r.to ? 0 : daysBetween(a, r.to) / Math.max(1, daysBetween(r.from, r.to));
    };
    setP2(cover(want) >= 0.999 || cover(want) >= cover(other) ? want : other);
  }, [bounds.max, bounds.min, periodTouched, cmpMode]);

  const userSetP1 = useCallback((v) => {
    setPeriodTouched(true);
    setP1(v);
  }, []);
  const userSetP2 = useCallback((v) => {
    setPeriodTouched(true);
    setP2(v);
  }, []);

  const anchor = p1.from || p1.to || bounds.max || null;

  const applyPreset = useCallback(
    (kind) => {
      const res = computePreset(kind, anchor, p1);
      if (!res) return;
      const [a, b] = res;
      setPeriodTouched(true);
      setP1(a);
      setP2(b);
      setLastPreset(kind);
      setCmpOn(true);
      if (kind.endsWith("_yoy")) setCmpMode("yoy");
      else if (PREV_PRESETS.has(kind)) setCmpMode("prev");
    },
    [anchor, p1]
  );

  // Samakan panjang P2 dengan P1, dihitung mundur dari tanggal akhir P2.
  const matchLength = useCallback(() => {
    const n = daysBetween(p1.from, p1.to);
    if (!n || !p2.to) return;
    setPeriodTouched(true);
    setP2((prev) => ({ ...prev, from: shiftDays(prev.to, -(n - 1)) }));
  }, [p1.from, p1.to, p2.to]);

  /* --- objek compare, identitas stabil lewat useMemo (nilai langsung, untuk bilah periode) --- */
  const compare = useMemo(() => {
    if (!cmpOn) return null;
    if (!p1.from || !p1.to || !p2.from || !p2.to) return null;
    return { p1: { from: p1.from, to: p1.to }, p2: { from: p2.from, to: p2.to } };
  }, [cmpOn, p1.from, p1.to, p2.from, p2.to]);

  /* --- nilai tampilan ---
     `live` = pilihan terbaru (dipakai kontrol). `view` = salinannya untuk isi
     halaman, yang baru menyusul sesudah logo memuat tergambar. `busy` = true
     selama keduanya berbeda. */
  const live = useMemo(
    () => ({ route, slicers, p1, p2, cmpOn, measureKey, unitKey, winMode, crit, focusKey, varPath }),
    [route, slicers, p1, p2, cmpOn, measureKey, unitKey, winMode, crit, focusKey, varPath]
  );
  const [view, busy] = useSettled(live, autoInstant.current);
  useEffect(() => {
    autoInstant.current = false;
  }, [live]);
  const vRoute = view.route;
  const vCompare = useMemo(() => {
    const a = view.p1;
    const b = view.p2;
    if (!view.cmpOn || !a.from || !a.to || !b.from || !b.to) return null;
    return { p1: { from: a.from, to: a.to }, p2: { from: b.from, to: b.to } };
  }, [view.cmpOn, view.p1, view.p2]);

  /* --- dimensi & slicer yang benar-benar ada di data --- */
  const dims = useMemo(() => DIMENSIONS.filter((d) => hasCol(d)), [quality]); // eslint-disable-line react-hooks/exhaustive-deps
  const slicerDims = useMemo(() => SLICERS.filter((d) => hasCol(d)), [quality]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- terapkan slicer dimensi lalu filter tanggal --- */
  const scoped = useMemo(() => {
    let out = base;
    const vp1 = view.p1;

    const active = Object.entries(view.slicers).filter(([, set]) => set.size > 0);
    if (active.length) {
      out = out.filter((r) => active.every(([dim, set]) => set.has(keyOf(r, dim))));
    }

    if (vCompare) {
      // Ambil baris yang masuk salah satu rentang; pemisahannya di aggregate().
      out = out.filter((r) => inRange(r.__d, vCompare.p1) || inRange(r.__d, vCompare.p2));
    } else if (hasDates && vp1.from && vp1.to) {
      out = out.filter((r) => inRange(r.__d, vp1));
    }

    return out;
  }, [base, view.slicers, vCompare, view.p1, hasDates]);

  /** Pilihan slicer dihitung dari data mentah, bukan dari yang sudah tersaring. */
  const slicerOptions = useMemo(() => {
    const out = {};
    for (const d of slicerDims) {
      const s = new Set();
      for (const row of base) s.add(keyOf(row, d));
      out[d] = Array.from(s).sort((a, b) => a.localeCompare(b, "id"));
    }
    return out;
  }, [base, slicerDims]);

  const anySlicer = Object.values(slicers).some((s) => s.size > 0);
  const vAnySlicer = Object.values(view.slicers).some((s) => s.size > 0);

  const clearSlicers = useCallback(() => setSlicers(emptySlicers()), []);

  /* --- data per transaksi, tersaring slicer tapi SEMUA tanggal ---
     Halaman produk butuh riwayat penuh untuk membaca siklus hidup; batas
     waktunya diatur oleh jendela analisis, bukan oleh filter tanggal. */
  const needLines = LINE_ROUTES.has(vRoute);
  const linesScoped = useMemo(() => {
    if (!needLines) return [];
    const url = Object.entries(urlFilters);
    const active = Object.entries(view.slicers).filter(([, set]) => set.size > 0);
    if (!url.length && !active.length) return lines;
    return lines.filter((ln) => url.every(([d, set]) => set.has(keyOf(ln, d))) && active.every(([d, set]) => set.has(keyOf(ln, d))));
  }, [needLines, lines, urlFilters, view.slicers]);

  /* --- tingkat produk yang tersedia di data ini --- */
  const units = useMemo(() => activeUnits(), [quality]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitOf = (k) => (units.some((u) => u.key === k) ? k : units.find((u) => u.key === DEFAULT_UNIT)?.key || units[0]?.key || null);
  const effUnit = unitOf(view.unitKey);
  const liveUnit = unitOf(unitKey);

  const win = useMemo(() => {
    const vp1 = view.p1;
    const asOf = vp1.to || bounds.max;
    if (!asOf) return null;
    return analysisWindow({ mode: view.winMode, asOf, p1: vp1, compare: vCompare, dataFrom: bounds.min, dataTo: bounds.max });
  }, [view.winMode, view.p1, bounds.max, bounds.min, vCompare]);

  const portfolio = useMemo(() => {
    if (!PORTFOLIO_ROUTES.has(vRoute) || !win || !linesScoped.length || !effUnit) return null;
    return buildPortfolio(linesScoped, {
      unit: effUnit,
      win,
      crit: view.crit,
      labels,
      customersReliable: !!quality?.customersReliable,
    });
  }, [vRoute, win, linesScoped, effUnit, view.crit, labels, quality]);

  const changeUnit = useCallback((k) => {
    setUnitKey(k);
    setFocusKey(null);
  }, []);

  /* Halaman asal saat Diagnosis dibuka dari halaman lain, untuk tombol
     "Kembali ke …". Berpindah antarproduk di dalam Diagnosis tidak
     mengubahnya; memilih menu dari samping menghapusnya. */
  const [origin, setOrigin] = useState(null);
  const navigate = useCallback(
    (key) => {
      setOrigin(null);
      go(key);
    },
    [go]
  );

  const openProduct = useCallback(
    (key) => {
      setOrigin((prev) => (vRoute === "diagnosis" ? prev : vRoute));
      setFocusKey(key);
      go("diagnosis");
    },
    [go, vRoute]
  );

  /* Buka diagnosis di tingkat lain (mis. dari Matriks: nama produk saat
     tingkat aktifnya kategori). Sengaja tidak lewat changeUnit, karena
     changeUnit mengosongkan produk yang dipilih. */
  const openProductAt = useCallback(
    (unit, key) => {
      setOrigin((prev) => (vRoute === "diagnosis" ? prev : vRoute));
      setUnitKey(unit);
      setFocusKey(key);
      go("diagnosis");
    },
    [go, vRoute]
  );

  const explainInVariance = useCallback(
    (path) => {
      setVarPath(path);
      go("perubahan");
    },
    [go]
  );

  /* Dari Peringatan: buka Penjelasan perubahan dengan periode peringatannya
     (periode pantau vs pembanding). Periode di bilah atas ikut diganti, jadi
     angka di sana sama persis dengan angka di peringatan. */
  const explainPeriod = useCallback(
    ({ path, p1: a, p2: b }) => {
      // Simpan keadaan sebelumnya sekali saja (Telusuri berkali-kali tetap
      // kembali ke keadaan sebelum yang pertama).
      setRestore((prev) => prev || { p1, p2, cmpOn, winMode, periodTouched, lastPreset });
      setPeriodTouched(true);
      setLastPreset(null);
      setP1({ from: a.from, to: a.to });
      setP2({ from: b.from, to: b.to });
      setCmpOn(true);
      setWinMode("global");
      setVarPath(path || []);
      go("perubahan");
    },
    [go, p1, p2, cmpOn, winMode, periodTouched, lastPreset]
  );

  const restorePeriod = useCallback(() => {
    if (!restore) return;
    setP1(restore.p1);
    setP2(restore.p2);
    setCmpOn(restore.cmpOn);
    setWinMode(restore.winMode);
    setPeriodTouched(restore.periodTouched);
    setLastPreset(restore.lastPreset);
    setRestore(null);
  }, [restore]);

  /* Tanggal acuan halaman Peringatan = tanggal akhir Periode. Mengubahnya
     menggeser Periode (dan Pembanding) dengan panjang yang sama, supaya
     halaman lain tetap konsisten berakhir di tanggal yang sama. */
  const moveAcuan = useCallback(
    (to) => {
      if (!to || !bounds.max) return;
      const target = to > bounds.max ? bounds.max : bounds.min && to < bounds.min ? bounds.min : to;
      const oldTo = p1.to || bounds.max;
      if (target === oldTo) return;
      setPeriodTouched(true);
      setLastPreset(null);
      setP1((prev) => (prev.from && prev.to ? shiftRangeTo(prev, oldTo, target) : { from: startOfMonth(shiftMonthsSafe(target, -5)), to: target }));
      setP2((prev) => (prev.from && prev.to ? shiftRangeTo(prev, oldTo, target) : prev));
    },
    [bounds.max, bounds.min, p1.to]
  );

  /* "Kembalikan semua ke bawaan" di Peringatan: jendela 12 bulan, ambang dan
     jenis peringatan bawaan, tanggal acuan = data terbaru. Kriteria tidak
     disentuh karena dipakai bersama halaman Portofolio. */
  const resetAlertView = useCallback(() => {
    setAlertCfg(normalizeAlertCfg(null));
    setWinMode("12");
    if (bounds.max && p1.to !== bounds.max) moveAcuan(bounds.max);
  }, [bounds.max, p1.to, moveAcuan]);

  /* --- catatan peringatan --- */
  const d1 = daysBetween(p1.from, p1.to);
  const d2 = daysBetween(p2.from, p2.to);
  // Selisih tepat satu hari pada rentang bulan yang sama di tahun berbeda
  // (karena 29 Februari) tidak dianggap beda panjang.
  const sameMonths = !!(p1.from && p2.from && p1.to && p2.to) && p1.from.slice(5, 7) === p2.from.slice(5, 7) && p1.to.slice(5, 7) === p2.to.slice(5, 7);
  const lengthMismatch = cmpOn && d1 > 0 && d2 > 0 && d1 !== d2 && !(Math.abs(d1 - d2) === 1 && sameMonths);
  const cmpIncomplete = cmpOn && hasDates && (!p1.from || !p1.to || !p2.from || !p2.to);
  // Di halaman yang memakai bilah "Dinilai per", P1/P2 di bilah atas tidak dipakai,
  // jadi catatan tentang keduanya tidak perlu muncul di sana.
  const periodBarUsed = !(LINE_ROUTES.has(vRoute) && view.winMode !== "global");

  // Peringatkan kalau sebuah periode jatuh sepenuhnya di luar data.
  // Tanpa ini, hasil nol terlihat seperti penurunan drastis, padahal
  // datanya memang tidak ada.
  const offData = (r, name) => (hasDates && r.from && r.to && (r.to < bounds.min || r.from > bounds.max) ? name : null);
  const outOfData = periodBarUsed ? offData(p1, "Periode P1") || (cmpOn ? offData(p2, "Periode pembanding P2") : null) : null;
  // P2 yang hanya sebagian tertutup data membuat kenaikan tampak terlalu besar.
  const p2Partial =
    periodBarUsed && cmpOn && hasDates && !outOfData && p2.from && p2.to && p2.from < bounds.min && p2.to >= bounds.min ? bounds.min : null;

  /* --- halaman: digambar ulang hanya kalau nilai tampilannya berubah ---
     Fungsi yang diteruskan ke halaman dibuat beridentitas tetap (useStable),
     dan elemen halamannya di-memo. Mengubah penyaring atau menu jadi hanya
     menggambar ulang kontrol + logo memuat (ringan); halaman baru dihitung
     sesudah logo itu tergambar. */
  const S = {
    openProduct: useStable(openProduct),
    openProductAt: useStable(openProductAt),
    explainInVariance: useStable(explainInVariance),
    matchLength: useStable(matchLength),
    go: useStable(go),
    explainPeriod: useStable(explainPeriod),
    resetAlertView: useStable(resetAlertView),
    enableCompare: useStable(() => applyPreset("keep_yoy")),
    back: useStable(() => origin && navigate(origin)),
  };
  const vMeasure = MEASURES.find((m) => m.key === view.measureKey) || MEASURES[0];
  const canCompare = hasDates && !!view.p1.from && !!view.p1.to;

  const pageEl = useMemo(() => {
    if (needLines && !win) return <div className={cx("p-10 text-xs", MUTED)}>Kolom tanggal dibutuhkan untuk analisis produk.</div>;
    if (needLines && (!linesScoped.length || (PORTFOLIO_ROUTES.has(vRoute) && !effUnit))) {
      return (
        <div className="max-w-[62ch] p-10">
          <h2 className="dt-display text-[19px] font-semibold text-[var(--ink-900)]">Tidak ada transaksi untuk dianalisis</h2>
          <p className={cx("mt-2 text-[13px] leading-relaxed", MUTED)}>
            {!lines.length
              ? "Data ini tidak punya kolom pendapatan atau tanggal yang terbaca per transaksi."
              : !effUnit
              ? "Data ini tidak punya kolom produk (lini, kategori, nama produk, atau kode barang)."
              : "Penyaring di atas tidak menyisakan transaksi."}{" "}
            Buka <b className="font-semibold">Data</b> di kanan atas untuk melihat kolom yang dikenali.
          </p>
        </div>
      );
    }
    const prod = {
      lines: linesScoped,
      labels,
      quality: quality || {},
      portfolio,
      win,
      winMode: view.winMode,
      setWinMode,
      unitKey: effUnit,
      setUnitKey: changeUnit,
      crit: view.crit,
      setCrit,
      focusKey: view.focusKey,
      openProduct: S.openProduct,
      openProductAt: S.openProductAt,
      explainInVariance: S.explainInVariance,
      onMatchLength: S.matchLength,
      go: S.go,
    };
    if (vRoute === "peringatan" && portfolio)
      return <AlertsPage {...prod} alertCfg={alertCfg} setAlertCfg={setAlertCfg} explainPeriod={S.explainPeriod} resetAlertView={S.resetAlertView} />;
    if (vRoute === "portofolio" && portfolio) return <ProductPortfolio {...prod} />;
    if (vRoute === "diagnosis" && portfolio)
      return <ProductDossier {...prod} backLabel={origin && BACK_LABEL[origin] ? BACK_LABEL[origin] : null} onBack={origin ? S.back : null} />;
    if (vRoute === "perubahan") return <VariancePage {...prod} varPath={view.varPath} setVarPath={setVarPath} />;
    if (vRoute === "hierarki") return <HierarchyPage {...prod} />;
    if (vRoute === "aliran") return <FlowsPage {...prod} />;
    if (vRoute === "matriks") return <MatrixPage {...prod} />;
    if (vRoute === "pendorong" && portfolio) return <InfluencersPage {...prod} />;
    if (vRoute === "pohon")
      return (
        <DecompositionTree
          rows={scoped}
          measure={vMeasure}
          compare={vCompare}
          p1={view.p1}
          dimensions={dims}
          anySlicer={vAnySlicer}
          onEnableCompare={canCompare ? S.enableCompare : null}
        />
      );
    return <div className={cx("p-10 text-xs", MUTED)}>Halaman ini belum bisa ditampilkan untuk data ini.</div>;
    // S.* beridentitas tetap; setter dari useState juga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needLines, win, linesScoped, vRoute, effUnit, lines.length, labels, quality, portfolio, view, alertCfg, origin, scoped, vMeasure, vCompare, dims, vAnySlicer, canCompare, changeUnit]);

  /* Nilai kontrol yang langsung, untuk WindowBar di dalam halaman. */
  const liveCtl = useMemo(() => ({ unitKey: liveUnit, winMode, crit }), [liveUnit, winMode, crit]);
  // Area halaman: tempat logo memuat dan tombol kembali ke atas dipasang.
  const [pageHost, setPageHost] = useState(null);

  /* Kalimat penanda memuat: sebut apa yang sedang dikerjakan. */
  const busyText = meta.loading && !meta.quiet
    ? ["Memuat data…", "Mengambil dan membaca data terbaru."]
    : !busy
    ? null
    : view.route !== route
    ? [`Membuka ${menuText(MENU.find((m) => m.key === route) || MENU[0]).label}…`, "Sebentar, halaman sedang disiapkan."]
    : view.slicers !== slicers
    ? ["Menerapkan penyaring…", "Sebentar, angka sedang dihitung ulang."]
    : view.p1 !== p1 || view.p2 !== p2 || view.cmpOn !== cmpOn
    ? ["Memperbarui periode…", "Sebentar, angka sedang dihitung ulang."]
    : view.unitKey !== unitKey
    ? ["Mengganti tingkat produk…", "Sebentar, penilaian produk sedang dihitung ulang."]
    : view.winMode !== winMode
    ? ["Mengganti jendela analisis…", "Sebentar, penilaian produk sedang dihitung ulang."]
    : view.crit !== crit
    ? ["Menerapkan kriteria…", "Sebentar, penilaian produk sedang dihitung ulang."]
    : view.focusKey !== focusKey
    ? ["Membuka diagnosis produk…", "Sebentar, halaman sedang disiapkan."]
    : view.varPath !== varPath
    ? ["Menguraikan perubahan…", "Sebentar, angka sedang dihitung ulang."]
    : view.measureKey !== measureKey
    ? ["Mengganti metrik…", "Sebentar, angka sedang dihitung ulang."]
    : ["Menghitung ulang…", "Sebentar, halaman sedang menghitung ulang."];

  /* --- layar khusus --- */

  if (status === "loading") return <LoadingScreen />;

  if (status === "error") {
    return (
      <ProblemScreen
        title="Data tidak bisa dimuat"
        onUpload={upload}
        onRetry={() => {
          setStatus("loading");
          loadDefault()
            .then(adopt)
            .catch((err) => {
              setError(err.message);
              setStatus("error");
            });
        }}
      >
        <p>{error}</p>
        {defaultSource(DATA_SOURCE) === "supabase" ? (
          <p>
            Periksa <Code>VITE_SUPABASE_URL</Code>, <Code>VITE_SUPABASE_ANON_KEY</Code>, dan <Code>VITE_SUPABASE_TABLE</Code> di berkas <Code>.env</Code>{" "}
            (setelah mengubahnya, jalankan ulang <Code>npm run dev</Code>), atau unggah berkas CSV/JSON langsung dari sini.
          </p>
        ) : (
          <p>
            Periksa sumbernya di <Code>DATA_SOURCE</Code> dan <Code>CSV_PATH</Code> pada <Code>src/lib/config.js</Code>, atau unggah berkas CSV/JSON
            langsung dari sini.
          </p>
        )}
      </ProblemScreen>
    );
  }

  // Judul mengikuti halaman yang sedang tampil; menu samping langsung menandai pilihan baru.
  const active = MENU.find((m) => m.key === vRoute) || MENU[0];
  const tone = GROUP_TONE[active.group] || GROUP_TONE.Produk;
  const ActiveIcon = active.Icon;

  const countText = needLines
    ? `${linesScoped.length.toLocaleString("id-ID")} transaksi${vAnySlicer ? ", tersaring" : ""}; ${
        vRoute !== "peringatan"
          ? "tanggal diatur oleh jendela analisis"
          : view.winMode === "global"
          ? "rentang diatur oleh akhir Periode dan Periode pantau"
          : "rentang diatur oleh Dinilai per dan Periode pantau"
      }`
    : `${scoped.length.toLocaleString("id-ID")} baris terpilih${vAnySlicer ? ", tersaring" : ""}`;

  /* --- bilah periode: lengkap atau ringkas (mengikuti halaman yang tampil) --- */
  const usesWindow = LINE_ROUTES.has(vRoute);
  const compactBar = usesWindow && view.winMode !== "global";
  const acuanNote = (
    <>
      Halaman ini menilai <b className="font-medium text-[var(--ink-800)]">Jendela</b> di bawah, yang berakhir di tanggal ini. Tanggal awal,{" "}
      <i>Bandingkan periode</i>, dan Preset hanya dipakai di Pohon dekomposisi — atau di sini kalau Jendela diatur ke <i>Ikuti periode di atas</i>.
    </>
  );
  const activeSlicerCount = Object.values(slicers).filter((s) => s.size > 0).length;
  const acuanDate = p1.to || bounds.max;
  const bandSummary = !hasDates
    ? "Tanpa kolom tanggal"
    : compactBar
    ? `Dinilai per ${acuanDate ? dLabel.format(toJs(acuanDate)) : "–"}`
    : compare
    ? `${compactRange(compare.p1)} vs ${compareWord(compare.p1, compare.p2)}`
    : compactRange(p1);

  return (
    <Frame row>
      <Sidebar
        open={navOpen}
        route={route}
        onGo={navigate}
        onClose={() => setNavOpen(false)}
        overlay={narrow}
        footer={<DataSourceButton quality={quality} loading={meta.loading} onClick={() => setDsOpen(true)} />}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---------------- bilah judul ---------------- */}
        <header className="dt-topbar flex items-center gap-3 px-3 py-2.5 text-white">
          <MenuButton open={navOpen} onClick={() => setNavOpen((v) => !v)} />

          <span
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-white"
            style={{ background: tone.solid, boxShadow: "0 1px 3px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.18)" }}
            aria-hidden="true"
          >
            <ActiveIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h1 className="dt-display truncate text-[18px] font-semibold leading-tight tracking-[.005em]">{menuText(active).label}</h1>
            <p className="truncate text-[11.5px] text-white/65">
              <span style={{ color: tone.soft }}>{active.group}</span>
              <span className="text-white/40"> / </span>
              {vRoute === "peringatan" && win
                ? (() => {
                    const aw = alertWindows(win, alertCfg);
                    return `Pantau ${shortRange(aw.R)} dibanding ${shortRange(aw.B)}`;
                  })()
                : needLines && win
                ? `${shortRange(win.p1)} dibanding ${shortRange(win.p2)}`
                : vCompare
                ? `${shortRange(vCompare.p1)} dibanding ${shortRange(vCompare.p2)}`
                : shortRange(view.p1)}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!needLines && (
              <select
                className="max-w-[34vw] cursor-pointer rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:max-w-none"
                value={measureKey}
                onChange={(e) => setMeasureKey(e.target.value)}
                aria-label="Pilih metrik"
              >
                {MEASURES.map((m) => (
                  <option key={m.key} value={m.key} className="text-[var(--ink-900)]">
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setDsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              title="Sumber data: lihat kolom yang dikenali, muat ulang, atau unggah data lain"
              aria-label="Sumber data"
            >
              <IconDatabase className="h-4 w-4" />
              <span className="hidden sm:inline">Data</span>
            </button>
          </div>
        </header>

        {/* ---------------- periode & slicer ----------------
            Halaman Produk & Eksplorasi menilai Jendela analisis yang berakhir di
            tanggal akhir Periode, jadi di sana bilah ini cukup berisi "Dinilai
            per". Bilah lengkap (Periode, Bandingkan, Preset) kembali kalau Jendela
            = Ikuti periode di atas. Di layar ponsel bilah ini diringkas menjadi
            satu baris supaya isi halaman tidak terdorong ke bawah. */}
        <div className={cx("border-b bg-[var(--band)]", LINE)} ref={bandBoxRef}>
          {bandNarrow && !bandOpen ? (
            <button
              type="button"
              ref={bandBtnRef}
              onClick={() => toggleBand(true)}
              aria-expanded={false}
              className={cx("flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--brand-50)]", FOCUS)}
            >
              <IconCalendar className="h-4 w-4 flex-none text-[var(--brand-700)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--ink-900)]">{bandSummary}</span>
                <span className="block truncate text-[11px] text-[var(--ink-500)]">
                  {anySlicer ? `${nfInt.format(activeSlicerCount)} penyaring aktif` : "Tanpa penyaring — semua data"}
                </span>
              </span>
              <span className="flex-none rounded-md border border-[var(--brand-200)] bg-[var(--paper)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--brand-700)]">
                Ubah
              </span>
            </button>
          ) : (
            <>
              {hasDates ? (
                compactBar ? (
                  <AcuanBar
                    value={p1.to || bounds.max}
                    min={bounds.min}
                    max={bounds.max}
                    onChange={moveAcuan}
                    note={vRoute === "peringatan" ? undefined : acuanNote}
                    label={vRoute === "peringatan" ? "Tanggal acuan peringatan" : "Tanggal acuan analisis"}
                  />
                ) : (
                  <>
                    <PeriodBar
                      p1={p1}
                      p2={p2}
                      setP1={userSetP1}
                      setP2={userSetP2}
                      cmpOn={cmpOn}
                      onToggleCmp={() => setCmpOn((v) => !v)}
                      bounds={bounds}
                      lastPreset={lastPreset}
                      onPreset={applyPreset}
                    />
                    {usesWindow && (
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-1.5 text-[11.5px] leading-snug text-[var(--ink-600)]">
                        <span>
                          Jendela <b className="font-medium text-[var(--ink-800)]">Ikuti periode di atas</b> sedang aktif, jadi halaman ini memakai Periode (P1)
                          dan Pembanding (P2) di bilah ini.
                        </span>
                        <button type="button" className={BTN_QUIET} onClick={() => setWinMode("12")}>
                          Pakai jendela 12 bulan
                        </button>
                      </p>
                    )}
                  </>
                )
              ) : (
                <div className="px-4 py-2 text-xs text-[var(--note)]">
                  Kolom tanggal tidak terbaca, jadi perbandingan periode dimatikan. Buka Data untuk melihat kolom yang dikenali, atau isi{" "}
                  <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">DATE_FIELD</code> di{" "}
                  <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">src/lib/config.js</code>.
                </div>
              )}

              {slicerDims.length > 0 && (
                <SlicerBar
                  slicerDims={slicerDims}
                  options={slicerOptions}
                  slicers={slicers}
                  onChange={(d, set) => setSlicers((p) => ({ ...p, [d]: set }))}
                  onClear={clearSlicers}
                  right={<span className={cx("text-[11.5px]", MUTED)}>{countText}</span>}
                />
              )}

              {bandNarrow && (
                <div className="flex justify-end px-4 pb-2">
                  <button type="button" className={BTN} onClick={() => toggleBand(false)} aria-expanded={true}>
                    Selesai
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------------- catatan ---------------- */}
        {restore && (
          <div className={NOTE_BAR}>
            <span>
              Periode di bilah atas sedang mengikuti peringatan yang ditelusuri ({shortRange(p1)}
              {cmpOn ? ` dibanding ${shortRange(p2)}` : ""}).
            </span>
            <button
              className="rounded-md border border-current px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-white/60"
              type="button"
              onClick={restorePeriod}
            >
              Kembalikan periode sebelumnya
            </button>
            <button className="rounded-md px-2 py-0.5 text-[11px] transition-colors hover:bg-white/60" type="button" onClick={() => setRestore(null)}>
              Biarkan
            </button>
          </div>
        )}
        {p2Partial && (
          <div className={NOTE_BAR}>
            <span>
              Data baru mulai {dLabel.format(toJs(p2Partial))}, jadi sebagian Pembanding P2 ({shortRange(p2)}) kosong dan kenaikan tampak lebih besar
              dari sebenarnya.
            </span>
            {compareWord(p1, p2) === "tahun lalu" && (
              <button
                className="rounded-md border border-current px-2 py-0.5 text-[11px] transition-colors hover:bg-white/60"
                type="button"
                onClick={() => applyPreset("keep_prev")}
              >
                Pakai periode sebelumnya
              </button>
            )}
          </div>
        )}
        {lengthMismatch && !needLines && (
          <div className={NOTE_BAR}>
            <span>Panjang periode berbeda — P1 {d1} hari, P2 {d2} hari. Selisihnya jadi tidak setara.</span>
            <button className="rounded-md border border-current px-2 py-0.5 text-[11px] transition-colors hover:bg-white/60" type="button" onClick={matchLength}>
              Samakan jadi {d1} hari
            </button>
          </div>
        )}
        {cmpIncomplete && <div className={NOTE_BAR}>Lengkapi kedua tanggal P1 dan P2 supaya perbandingan aktif.</div>}
        {outOfData && (
          <div className={NOTE_BAR}>
            {outOfData} berada di luar rentang data ({dLabel.format(toJs(bounds.min))} – {dLabel.format(toJs(bounds.max))}), jadi nilainya nol.
          </div>
        )}
        {meta.error && !dsOpen && (
          <div className={NOTE_BAR}>
            <span>Data baru tidak bisa dipakai: {meta.error} Data sebelumnya tetap dipakai.</span>
            <button className="rounded-md border border-current px-2 py-0.5 text-[11px] hover:bg-white/60" type="button" onClick={() => setDsOpen(true)}>
              Buka Sumber data
            </button>
          </div>
        )}

        {/* ---------------- halaman ----------------
            Area halaman berposisi relatif: logo memuat menutup area ini saja
            (menu, bilah periode, dan penyaring tetap bisa dipakai), dan tombol
            kembali ke atas menempel di pojok kanan bawahnya. */}
        <div className="relative flex min-h-0 flex-1 flex-col" ref={setPageHost} data-dt-page="">
          <BusyHost.Provider value={pageHost}>
            <LiveControls.Provider value={liveCtl}>{pageEl}</LiveControls.Provider>
          </BusyHost.Provider>
          <BusyOverlay show={!!busyText} label={busyText?.[0]} sub={busyText?.[1]} />
          <BackToTop host={pageHost} resetKey={vRoute} />
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {busyText ? busyText[0] : ""}
        </span>
      </div>

      <DataSourceDialog
        open={dsOpen}
        onClose={() => setDsOpen(false)}
        quality={quality}
        meta={meta}
        onReload={reload}
        onUpload={upload}
        onReset={resetSource}
      />
    </Frame>
  );
}
