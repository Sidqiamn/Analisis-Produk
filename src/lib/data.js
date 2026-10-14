/* ============================================================================
   Pemuat data
   ----------------------------------------------------------------------------
   Satu sumber, empat keluaran:

   rows    — baris teragregasi per (tanggal × dimensi). Dipakai halaman
             Pohon dekomposisi. Ringan.

   lines   — satu objek ramping per transaksi. Dipakai halaman produk dan
             eksplorasi, karena mereka harus bisa menghitung hal yang tidak
             bisa dijumlah ulang dari data ringkas: berapa cabang yang menjual
             sebuah produk, kapan terakhir terjual, dan seterusnya.

   labels  — nama tampilan untuk kunci yang dinormalisasi. Satu kode barang
             bisa muncul dengan beberapa judul berbeda, jadi yang ditampilkan
             adalah judul yang paling sering dipakai.

   quality — laporan pembacaan: kolom apa yang ditemukan, berapa baris yang
             terbaca, dan hasil pemeriksaan kualitas. Analisis yang
             bergantung pada kolom bermasalah dimatikan otomatis.

   Tidak ada yang terikat pada satu berkas tertentu. Nama kolom dicocokkan
   lewat COLUMN_ALIASES, pemisah CSV dan format angka/tanggal dideteksi
   sendiri, dan Year/Quarter dihitung dari tanggal kalau kolomnya tidak ada.
   ========================================================================== */

import Papa from "papaparse";
import {
  COLUMN_ALIASES,
  CSV_DELIMITER,
  CSV_PATH,
  DATE_CANDIDATES,
  DATE_FIELD,
  DATE_FORMAT,
  DERIVABLE,
  DETECTED,
  DIMENSIONS,
  SCHEMA,
  SUPABASE,
} from "./config.js";
import {
  EMPTY,
  detectDateColumn,
  detectDateFormat,
  detectNumberFormat,
  keyOf,
  monthIndex,
  normHeader,
  parseDate,
  parseNumber,
  quarterOf,
} from "./format.js";

/* ------------------------------------------------------------ utilitas     */

const DOW = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Kelompok ukuran pesanan, dipakai sebagai faktor di halaman Pendorong. */
export function qtyBand(q) {
  if (q <= 1) return "1 unit";
  if (q <= 5) return "2–5 unit";
  if (q <= 20) return "6–20 unit";
  if (q <= 100) return "21–100 unit";
  return "> 100 unit";
}
export const QTY_BAND_ORDER = ["1 unit", "2–5 unit", "6–20 unit", "21–100 unit", "> 100 unit"];
export const DOW_ORDER = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** Kunci nama produk: spasi dirapikan dan huruf diseragamkan. */
export function nameKey(raw) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return s || EMPTY;
}

/* ID yang dirusak Excel: angka panjang (mis. nomor telepon) disimpan sebagai
   notasi ilmiah "6,28527E+12". Digit belakangnya hilang, sehingga banyak
   pelanggan berbeda tergabung ke satu ID. Dideteksi lalu analisis pelanggan
   dimatikan sampai datanya bersih. */
const SCIENTIFIC = /^\s*\d+(?:[.,]\d+)?E\+?\d+\s*$/i;

/** Nilai yang sebenarnya "tidak ada": kosong, NULL, "-", "tidak diketahui", "N/A". */
export const UNKNOWN = /tidak diketahui|^\(kosong\)$|^null$|^-+$|^n\/?a$|^#n\/a$|^unknown$|^none$/i;

/** Kolom angka yang dibaca dari data (nama internal). */
const NUMERIC = ["Revenue", "quantity", "Price_List"];

/** Untuk apa setiap kolom dipakai — ditampilkan di layar Sumber data. */
export const COLUMN_PURPOSE = {
  Revenue: { label: "Pendapatan", need: "wajib", use: "Semua angka pendapatan" },
  quantity: { label: "Qty", need: "disarankan", use: "Ukuran pesanan, harga per unit" },
  Price_List: { label: "Harga daftar", need: "opsional", use: "Deteksi diskon" },
  Item_Code: { label: "Kode barang", need: "disarankan", use: "Tingkat kode barang, efek harga/volume" },
  product_name: { label: "Nama produk", need: "disarankan", use: "Tingkat nama produk" },
  Category: { label: "Kategori", need: "disarankan", use: "Tingkat kategori (bawaan analisis produk)" },
  Lini_Produk: { label: "Lini produk", need: "disarankan", use: "Tingkat lini dan induk kategori" },
  Branch: { label: "Cabang", need: "disarankan", use: "Jangkauan cabang, peringkat, penyebab" },
  branch_area: { label: "Wilayah", need: "opsional", use: "Penyaring dan eksplorasi" },
  Channel: { label: "Kanal", need: "opsional", use: "Penyaring dan eksplorasi" },
  Payment_Method: { label: "Metode bayar", need: "opsional", use: "Penyaring dan eksplorasi" },
  id_customer: { label: "ID pelanggan", need: "opsional", use: "Analisis pelanggan hilang/baru" },
  Transaction_ID: { label: "Nomor transaksi", need: "opsional", use: "Informasi saja" },
  Year: { label: "Tahun", need: "opsional", use: "Pohon dekomposisi (dihitung dari tanggal bila tidak ada)" },
  Quarter_Name: { label: "Kuartal", need: "opsional", use: "Pohon dan eksplorasi (dihitung dari tanggal bila tidak ada)" },
};

/**
 * Cocokkan header data dengan nama internal. Setiap header hanya boleh
 * dipakai satu nama internal; nama yang didaftarkan lebih dulu menang.
 */
export function resolveColumns(headers) {
  const byNorm = new Map();
  for (const h of headers) {
    const n = normHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const used = new Set();
  const map = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const a of [key, ...aliases]) {
      const h = byNorm.get(normHeader(a));
      if (h != null && !used.has(h)) {
        map[key] = h;
        used.add(h);
        break;
      }
    }
  }
  return map;
}

/* ------------------------------------------------------------- pengolah    */

/**
 * Ubah baris mentah (dari CSV, unggahan, atau Supabase) menjadi rows, lines,
 * labels, dan quality. Semua sumber lewat fungsi ini supaya hasilnya identik.
 *
 * @param data     array objek, satu per baris
 * @param headers  nama kolom sesuai urutan di sumber
 * @param meta     keterangan sumber untuk layar Sumber data
 */
export function processRaw(data, headers, meta = {}) {
  headers = (headers || []).map((h) => String(h ?? "").replace(/^﻿/, ""));
  if (data.length && headers.length && !(headers[0] in data[0])) {
    // Header ber-BOM dibersihkan; samakan juga kunci di setiap baris.
    data = data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).replace(/^﻿/, ""), v])));
  }

  /* --- kolom --- */
  const map = resolveColumns(headers);
  const sample = data.slice(0, 400);

  let dateField = null;
  if (DATE_FIELD !== "auto") {
    dateField = headers.find((h) => normHeader(h) === normHeader(DATE_FIELD)) || null;
  } else {
    dateField = detectDateColumn(sample, headers.filter((h) => !Object.values(map).includes(h) || /date|tanggal|tgl/i.test(h)));
  }
  const dateFormat =
    DATE_FORMAT !== "auto" ? DATE_FORMAT : detectDateFormat(dateField ? sample.map((r) => r[dateField]) : []);

  /* Gaya tanggal untuk ditampilkan di layar Sumber data, dari contoh pertama. */
  const dateSample = dateField
    ? String(sample.map((r) => r[dateField]).find((v) => v != null && String(v).trim() !== "") ?? "").trim()
    : "";
  const dateStyle = !dateField
    ? null
    : /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(dateSample)
    ? "iso"
    : /^\d{1,2}[/\-.]\d{1,2}[/\-.](\d{4}|\d{2})(?!\d)/.test(dateSample)
    ? dateFormat
    : /^\d{5}(?:[.,]\d+)?$/.test(dateSample)
    ? "serial"
    : /[A-Za-z]/.test(dateSample)
    ? "name"
    : "other";

  const numFmt = {};
  for (const k of NUMERIC) {
    const h = map[k];
    numFmt[k] = h ? detectNumberFormat(sample.map((r) => r[h])) : "en";
  }

  // Untuk layar Sumber data: angka polos (tanpa pemisah) dibedakan dari gaya id/en.
  const numStyle = {};
  for (const k of NUMERIC) {
    const h = map[k];
    if (!h) continue;
    const vals = sample.map((r) => r[h]).filter((v) => v != null && v !== "");
    numStyle[k] = vals.every((v) => typeof v === "number" || !/[.,]/.test(String(v))) ? "plain" : numFmt[k];
  }

  const get = (row, k) => {
    const h = map[k];
    return h == null ? undefined : row[h];
  };

  /* --- skema: diumumkan ke aplikasi lewat applySchema() saat data dipakai --- */
  const present = new Set(Object.keys(map));
  const derived = new Set();
  if (dateField) {
    for (const k of DERIVABLE) {
      if (!present.has(k)) {
        present.add(k);
        derived.add(k);
      }
    }
  }

  const hasRevenue = !!map.Revenue;
  const hasLini = !!map.Lini_Produk;
  const hasProduct = !!(map.Item_Code || map.product_name || map.Category || map.Lini_Produk);

  /* --- baca baris --- */
  const acc = new Map();
  const lines = [];
  const nameVotes = new Map();
  const codeVotes = new Map();

  let noDate = 0;
  let zeroRev = 0;
  let negRev = 0;
  let custBroken = 0;
  let custMissing = 0;
  let custSample = null;
  let discounted = 0;
  let unknownLini = 0;
  let unknownLiniRev = 0;
  let minD = null;
  let maxD = null;
  const dowCache = new Map();

  for (const raw of data) {
    const d = dateField ? parseDate(raw[dateField], dateFormat) : null;
    if (dateField && !d) {
      noDate++;
      continue; // tanpa tanggal, baris tidak bisa ditempatkan di periode mana pun
    }
    if (d) {
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }

    /* dimensi, dengan Year/Quarter dari tanggal bila kolomnya tidak ada */
    const dims = {};
    for (const k of DIMENSIONS) {
      let v = get(raw, k);
      if ((v == null || v === "") && d) {
        if (k === "Year") v = d.slice(0, 4);
        else if (k === "Quarter_Name") v = `Q${quarterOf(+d.slice(5, 7))}`;
      }
      dims[k] = keyOf({ v }, "v");
    }

    const rev = hasRevenue ? parseNumber(get(raw, "Revenue"), numFmt.Revenue) : 0;
    if (hasRevenue) {
      if (rev === 0) zeroRev++;
      else if (rev < 0) negRev++;
    }

    /* --- baris teragregasi untuk halaman Penjualan --- */
    const key = `${d || ""}\u0001${DIMENSIONS.map((k) => dims[k]).join("\u0001")}`;
    let rec = acc.get(key);
    if (!rec) {
      rec = { __d: d, ...dims, Revenue: 0, __n: 0 };
      acc.set(key, rec);
    }
    rec.Revenue += rev;
    rec.__n += 1;

    /* --- baris transaksi untuk analisis produk --- */
    if (!d || !hasRevenue) continue;

    const qty = parseNumber(get(raw, "quantity"), numFmt.quantity) || 0;
    const pl = parseNumber(get(raw, "Price_List"), numFmt.Price_List);
    const rawName = get(raw, "product_name");
    const code = keyOf({ v: get(raw, "Item_Code") }, "v");
    const nk = map.product_name ? nameKey(rawName) : code;

    const ln = {
      __d: d,
      __m: monthIndex(d),
      Revenue: rev,
      quantity: qty,
      Price_List: pl,
      Item_Code: code,
      __name: nk,
      id_customer: String(get(raw, "id_customer") ?? "").trim(),
      Transaction_ID: get(raw, "Transaction_ID"),
      ...dims,
    };

    let dow = dowCache.get(d);
    if (!dow) {
      dow = DOW[new Date(`${d}T00:00:00`).getDay()];
      dowCache.set(d, dow);
    }
    ln.__dow = dow;
    ln.__qtyband = qtyBand(qty);
    lines.push(ln);

    // Nama tampilan: judul yang paling sering muncul untuk kunci yang sama.
    if (hasProduct) {
      const rawTitle = String(rawName ?? "").replace(/\s+/g, " ").trim();
      if (rawTitle) {
        let v = nameVotes.get(nk);
        if (!v) nameVotes.set(nk, (v = new Map()));
        v.set(rawTitle, (v.get(rawTitle) || 0) + 1);
        let c = codeVotes.get(code);
        if (!c) codeVotes.set(code, (c = new Map()));
        c.set(rawTitle, (c.get(rawTitle) || 0) + 1);
      }
    }

    // Pemeriksaan kualitas.
    if (map.id_customer) {
      const cid = ln.id_customer;
      if (!cid || UNKNOWN.test(cid)) custMissing++;
      else if (SCIENTIFIC.test(cid)) {
        custBroken++;
        if (!custSample) custSample = cid;
      }
    }
    if (qty > 0 && pl > 0 && rev / qty < pl * 0.98) discounted++;
    if (hasLini && UNKNOWN.test(ln.Lini_Produk)) {
      unknownLini++;
      unknownLiniRev += rev;
    }
  }

  // Judul terbanyak; kalau seri, menurut abjad — tidak bergantung urutan baris.
  const pickTop = (votes) => {
    const out = new Map();
    for (const [k, v] of votes) {
      let best = null;
      let bestN = -1;
      for (const [title, n] of v) {
        if (n > bestN || (n === bestN && title < best)) {
          best = title;
          bestN = n;
        }
      }
      out.set(k, best);
    }
    return out;
  };

  const n = lines.length || 1;
  const quality = {
    // sumber
    source: meta.source || "csv",
    name: meta.name || "",
    delimiter: meta.delimiter || null,
    loadedAt: new Date().toISOString(),
    // skema
    headers,
    map,
    present: Array.from(present),
    derived: Array.from(derived),
    dateField,
    dateFormat,
    dateStyle,
    dateSample: dateSample.slice(0, 40),
    numberFormats: numFmt,
    numberStyles: numStyle,
    // hitungan
    rowsRead: data.length,
    rowsNoDate: noDate,
    rowsZeroRevenue: zeroRev,
    rowsNegRevenue: negRev,
    lines: lines.length,
    dateFrom: minD,
    dateTo: maxD,
    // kualitas
    hasCustomer: !!map.id_customer,
    customerBrokenShare: custBroken / n,
    customerMissingShare: custMissing / n,
    customerBrokenSample: custSample,
    // Di atas 5% ID rusak, hitungan pelanggan sudah tidak bisa dipercaya.
    customersReliable: !!map.id_customer && lines.length > 0 && custBroken / n < 0.05 && custMissing / n < 0.2,
    discountShare: discounted / n,
    unknownLini,
    unknownLiniRev,
  };

  return {
    rows: Array.from(acc.values()),
    lines,
    labels: { __name: pickTop(nameVotes), Item_Code: pickTop(codeVotes) },
    quality,
  };
}

/**
 * Umumkan skema data yang SEDANG DIPAKAI ke seluruh aplikasi (menu tingkat
 * produk, pilihan dimensi, dsb.). Dipanggil App setelah data baru diterima —
 * bukan di processRaw — supaya unggahan yang gagal tidak mengubah apa pun.
 */
export function applySchema(quality) {
  SCHEMA.loaded = true;
  SCHEMA.map = { ...(quality?.map || {}) };
  SCHEMA.present = new Set(quality?.present || []);
  SCHEMA.derived = new Set(quality?.derived || []);
  DETECTED.field = quality?.dateField || null;
  DETECTED.format = quality?.dateFormat || null;
}

/* --------------------------------------------------------------- sumber    */

/** Tebak pemisah kolom dari baris judul: ; , tab atau |. */
export function detectDelimiter(text) {
  const nl = text.indexOf("\n");
  const head = nl === -1 ? text : text.slice(0, nl);
  let best = ",";
  let bestN = 0;
  for (const c of [";", ",", "\t", "|"]) {
    const k = head.split(c).length - 1;
    if (k > bestN) {
      best = c;
      bestN = k;
    }
  }
  return best;
}

/** Urai teks CSV (atau JSON) menjadi hasil processRaw. */
export function parseText(text, meta = {}) {
  const clean = String(text || "").replace(/^﻿/, "");
  const trimmed = clean.trimStart();

  // JSON: array objek, atau { data: [...] } hasil ekspor API.
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) arr = arr.data || arr.rows || arr.result || [];
    if (!Array.isArray(arr)) throw new Error("Berkas JSON harus berisi array baris.");
    const headers = Array.from(new Set(arr.slice(0, 200).flatMap((r) => Object.keys(r || {}))));
    return processRaw(arr, headers, { ...meta, delimiter: "JSON" });
  }

  const delimiter = CSV_DELIMITER === "auto" ? detectDelimiter(clean) : CSV_DELIMITER;
  const parsed = Papa.parse(clean, { header: true, delimiter, skipEmptyLines: "greedy" });
  const data = parsed.data || [];
  const headers = parsed.meta?.fields || Object.keys(data[0] || {});
  return processRaw(data, headers, { ...meta, delimiter });
}

/** Baca CSV dari folder public/ (CSV_PATH). */
export async function loadFromCsv() {
  // cache: "no-store" supaya berkas yang baru diganti langsung terbaca.
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`${CSV_PATH} tidak ditemukan di folder public/ (HTTP ${res.status}).`);
  const text = await res.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new Error(`${CSV_PATH} tidak ditemukan di folder public/ — server mengembalikan halaman HTML, bukan CSV.`);
  }
  return parseText(text, { source: "csv", name: CSV_PATH.split("/").pop() });
}

/** Baca berkas yang dipilih pengguna (CSV, TXT, TSV, atau JSON). */
export async function loadFromFile(file) {
  if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name)) {
    throw new Error("Berkas Excel belum bisa dibaca langsung. Di Excel pilih File → Save As → CSV UTF-8, lalu unggah berkas CSV-nya.");
  }
  const text = await file.text();
  return parseText(text, { source: "upload", name: file.name });
}

/**
 * Urutan baris yang stabil untuk paginasi Supabase. Tanpa ORDER BY,
 * Postgres boleh mengembalikan baris dalam urutan berbeda di setiap
 * permintaan, sehingga halaman 1 dan 2 bisa saling tumpang tindih — ada
 * baris yang terbaca dua kali dan ada yang terlewat. Kalau SUPABASE.order
 * kosong, urutan dipilih dari kolom yang ada: kolom id unik bila ada,
 * kalau tidak gabungan tanggal + nomor transaksi + kode barang + nilai.
 */
export function stableOrder(headers) {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const find = (names) => names.map((n) => byNorm.get(normHeader(n))).find((h) => h != null) ?? null;
  const quote = (c) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : `"${c.replace(/"/g, '""')}"`);
  const id = find(["id", "row_id", "line_id", "uuid"]);
  if (id) return `${quote(id)}.asc`;
  const cols = [
    find(DATE_CANDIDATES),
    ...["Transaction_ID", "Item_Code", "product_name", "Branch", "Revenue", "quantity"].map((k) => find([k, ...(COLUMN_ALIASES[k] || [])])),
  ].filter((c, i, a) => c != null && a.indexOf(c) === i);
  return cols.map((c) => `${quote(c)}.asc`).join(",");
}

/**
 * Ambil data dari Supabase lewat REST API (PostgREST), per halaman.
 *
 * Halaman produk butuh data PER TRANSAKSI, jadi view-nya tidak boleh
 * diagregasi. Contoh view:
 *
 *   CREATE VIEW fact_penjualan_baris AS
 *   SELECT ROW_NUMBER() OVER (ORDER BY sale_date, Transaction_ID, Item_Code) AS id,
 *          CAST(sale_date AS DATE) AS sale_date,
 *          Branch, branch_area, Channel, Payment_Method,
 *          Lini_Produk, Category, Item_Code, product_name,
 *          Revenue, quantity, Price_List,
 *          id_customer, Transaction_ID
 *   FROM v_sales_enriched;
 *
 * Kolom id membuat urutan halaman pasti stabil (lihat stableOrder).
 * Simpan id_customer sebagai TEXT supaya tidak berubah jadi notasi ilmiah.
 * Kunci yang dipakai adalah anon key; aktifkan Row Level Security dengan
 * kebijakan baca saja untuk view ini.
 */
export async function loadFromSupabase() {
  const { url, key, table, pageSize, order } = SUPABASE;
  if (!url || !key) {
    throw new Error("Supabase belum diatur. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di berkas .env, lalu jalankan ulang npm run dev.");
  }
  const base = `${url.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}`;

  /** Satu permintaan. 416 = rentang di luar data, artinya sudah habis. */
  const get = async (params, from, to, count = false) => {
    let res;
    try {
      res = await fetch(`${base}?${new URLSearchParams(params)}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Range-Unit": "items",
          Range: `${from}-${to}`,
          ...(count ? { Prefer: "count=exact" } : {}),
        },
      });
    } catch (e) {
      throw new Error(`Supabase tidak bisa dihubungi (${e.message}). Periksa VITE_SUPABASE_URL dan koneksi internet.`);
    }
    if (res.status === 416) return { rows: [], total: null };
    if (!res.ok) {
      const body = (await res.text()).slice(0, 240);
      const err = new Error(`Supabase menolak permintaan (HTTP ${res.status}). ${body}`);
      err.status = res.status;
      throw err;
    }
    const m = /\/(\d+)\s*$/.exec(res.headers.get("content-range") || "");
    const rows = await res.json();
    return { rows: Array.isArray(rows) ? rows : [], total: m ? +m[1] : null };
  };

  // 1) Satu baris dulu: nama kolom (untuk memilih urutan) dan jumlah total.
  const head = await get({ select: "*" }, 0, 0, true);
  if (!head.rows.length) return processRaw([], [], { source: "supabase", name: table });
  let orderBy = order || stableOrder(Object.keys(head.rows[0]));
  const total = head.total ?? Infinity;

  // 2) Semua halaman. Kalau jumlahnya diketahui, empat halaman diambil sekaligus.
  const fetchAll = async (orderParam) => {
    const params = { select: "*", ...(orderParam ? { order: orderParam } : {}) };
    const all = [];
    if (Number.isFinite(total)) {
      const starts = [];
      for (let f = 0; f < total; f += pageSize) starts.push(f);
      for (let i = 0; i < starts.length; i += 4) {
        const pages = await Promise.all(starts.slice(i, i + 4).map((f) => get(params, f, f + pageSize - 1)));
        for (const pg of pages) for (const r of pg.rows) all.push(r);
      }
      return all;
    }
    // Jumlah tidak diketahui: berurutan sampai halaman kosong.
    for (let guard = 0; guard < 100000; guard++) {
      const pg = await get(params, all.length, all.length + pageSize - 1);
      if (!pg.rows.length) break;
      for (const r of pg.rows) all.push(r);
    }
    return all;
  };

  let all;
  try {
    all = await fetchAll(orderBy);
  } catch (e) {
    // Urutan pilihan otomatis ditolak (mis. nama kolom tak lazim): ulangi tanpa urutan.
    if (order || e.status !== 400) throw e;
    orderBy = "";
    all = await fetchAll("");
  }
  const headers = Array.from(new Set(all.slice(0, 200).flatMap((r) => Object.keys(r || {}))));
  const res = processRaw(all, headers, { source: "supabase", name: table });
  res.quality.supabaseOrder = orderBy || null;
  res.quality.supabaseTotal = Number.isFinite(total) ? total : null;
  return res;
}

/** Sumber yang dipakai saat aplikasi dibuka, sesuai DATA_SOURCE. */
export function defaultSource(dataSource) {
  if (dataSource === "supabase") return "supabase";
  if (dataSource === "csv") return "csv";
  return SUPABASE.url && SUPABASE.key ? "supabase" : "csv";
}

/* ---------------------------------------------------------------- ekspor   */

/** Unduh array objek sebagai berkas CSV. Dipakai tombol ekspor. */
export function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");

  // BOM supaya Excel membaca huruf beraksen dengan benar.
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
