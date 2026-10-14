/* ============================================================================
   Konfigurasi
   ----------------------------------------------------------------------------
   Satu-satunya berkas yang perlu disentuh kalau nama kolom di sumber data
   berubah. Semua berkas lain membaca dari sini.
   ========================================================================== */

/* --- sumber data ---------------------------------------------------------
   "csv"      → baca CSV_PATH dari folder public/
   "supabase" → baca tabel/view Supabase lewat REST (lihat SUPABASE di bawah)
   "auto"     → Supabase kalau VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
                diisi di berkas .env, selain itu CSV
   Apa pun sumbernya, pengguna tetap bisa mengunggah CSV lain dari layar
   "Sumber data" tanpa mengubah kode. */
export const DATA_SOURCE = "auto";

/** Berkas CSV di folder public/. Ganti isinya kapan pun; muat ulang halaman. */
export const CSV_PATH = "/dummy_dataset.csv";

/** Pemisah kolom CSV: "auto" mendeteksi sendiri ; , tab atau |. */
export const CSV_DELIMITER = "auto";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

/** Supabase lewat REST (PostgREST) — tidak butuh paket tambahan. */
export const SUPABASE = {
  url: ENV.VITE_SUPABASE_URL || "",
  key: ENV.VITE_SUPABASE_ANON_KEY || "",
  table: ENV.VITE_SUPABASE_TABLE || "fact_penjualan_baris",
  pageSize: 1000, // batas bawaan Supabase per permintaan
  order: "", // mis. "sale_date.asc" supaya urutan halaman stabil
};

/** Muat ulang otomatis tiap N menit (0 = mati). Berguna kalau data di
    Supabase diperbarui terjadwal, mis. tiap jam dari ERPNext. */
export const REFRESH_MINUTES = 0;

/* --- nama kolom -----------------------------------------------------------
   Kode memakai nama di kiri. Kalau data baru memakai nama lain, kolomnya
   tetap dikenali selama namanya ada di daftar kanan. Pencocokan tidak peka
   huruf besar-kecil, spasi, garis bawah, atau tanda hubung — "Item Code",
   "item_code", dan "ITEM-CODE" dianggap sama. Tambahkan alias di sini kalau
   sumber datamu memakai nama lain. */
export const COLUMN_ALIASES = {
  Revenue: ["Revenue", "Pendapatan", "Penjualan", "Omzet", "Nilai_Penjualan", "Net_Amount", "Base_Net_Amount", "Amount", "Sales", "Total_Penjualan", "Total"],
  quantity: ["quantity", "Qty", "Kuantitas", "Jumlah", "Jumlah_Barang", "Stock_Qty"],
  Price_List: ["Price_List", "Price_List_Rate", "Harga", "Harga_Satuan", "Harga_Jual", "Unit_Price", "Rate", "Price"],
  Item_Code: ["Item_Code", "Kode_Barang", "Kode_Item", "Kode_Produk", "SKU"],
  product_name: ["product_name", "Item_Name", "Nama_Produk", "Nama_Barang", "Nama_Item", "Product"],
  id_customer: ["id_customer", "Customer_ID", "Customer", "Kode_Pelanggan", "ID_Pelanggan", "Pelanggan"],
  Transaction_ID: ["Transaction_ID", "Invoice", "Invoice_No", "No_Faktur", "Nomor_Faktur", "No_Transaksi", "Sales_Invoice"],
  Branch: ["Branch", "Cabang", "Store", "Toko", "Cost_Center"],
  branch_area: ["branch_area", "Wilayah", "Area", "Region", "Territory"],
  Channel: ["Channel", "Kanal", "Sales_Channel", "Saluran"],
  Payment_Method: ["Payment_Method", "Metode_Bayar", "Metode_Pembayaran", "Mode_Of_Payment", "Pembayaran"],
  Lini_Produk: ["Lini_Produk", "Lini", "Product_Line", "Lini_Bisnis"],
  Category: ["Category", "Kategori", "Kategori_Produk", "Item_Group", "Product_Category"],
  Year: ["Year", "Tahun"],
  Quarter_Name: ["Quarter_Name", "Kuartal", "Quarter"],
};

/** Kolom yang boleh tidak ada karena bisa dihitung dari tanggal. */
export const DERIVABLE = new Set(["Year", "Quarter_Name"]);

/**
 * Hasil pembacaan skema data yang sedang dimuat. Diisi pemuat data
 * (lib/data.js) setiap kali data dibaca ulang, lalu dipakai untuk
 * menyembunyikan menu atau pilihan yang kolomnya tidak ada.
 */
export const SCHEMA = {
  loaded: false,
  map: {}, // nama internal → nama kolom di data
  present: new Set(), // nama internal yang tersedia (termasuk yang dihitung)
  derived: new Set(), // nama internal yang dihitung dari tanggal
};

/** Apakah kolom tersedia? Sebelum data dimuat, anggap tersedia. */
export const hasCol = (k) => !SCHEMA.loaded || SCHEMA.present.has(k);

/* Dimensi turunan dan kolom sumbernya. Hari dihitung dari tanggal, jadi
   selalu ada; ukuran pesanan butuh kolom qty; nama produk butuh kolomnya. */
const DIM_SOURCE = { __name: "product_name", __qtyband: "quantity" };
const DIM_ALWAYS = new Set(["__dow"]);

/** Apakah dimensi ini bisa dipakai dengan data yang dimuat? */
export const dimOk = (d) => DIM_ALWAYS.has(d) || hasCol(DIM_SOURCE[d] || d);

/** Dimensi yang bisa dipakai menguraikan pohon dan memeringkat. */
export const DIMENSIONS = [
  "branch_area",
  "Lini_Produk",
  "Channel",
  "Year",
  "Quarter_Name",
  "Payment_Method",
  "Branch",
  "Category",
];

/** Dimensi yang muncul sebagai penyaring di bilah atas. */
export const SLICERS = ["branch_area", "Branch", "Channel", "Lini_Produk", "Payment_Method"];

/** Kolom angka yang ikut dijumlah saat agregasi. __n adalah cacah baris. */
export const NUMERIC_FIELDS = ["Revenue", "__n"];

export const MEASURES = [
  { key: "Revenue", label: "Pendapatan", field: "Revenue", format: "currency" },
  { key: "__n", label: "Jumlah transaksi", field: "__n", format: "int" },
];

/* --- kolom tanggal --- */

// "auto" = dideteksi dari header. Isi manual kalau tebakannya meleset,
// misalnya DATE_FIELD = "Tanggal_Transaksi".
export const DATE_FIELD = "auto";

// Dicocokkan tanpa peduli huruf besar-kecil, spasi, atau garis bawah.
// posting_date / transaction_date = nama kolom tanggal di ERPNext.
export const DATE_CANDIDATES = [
  "sale_date", "posting_date", "transaction_date", "invoice_date",
  "Date", "Tanggal", "Tanggal_Transaksi", "Tanggal_Faktur", "Tgl", "Tgl_Transaksi",
  "Order_Date", "TransactionDate", "Sales_Date",
];

// "auto" | "iso" | "dmy" | "mdy"
export const DATE_FORMAT = "auto";

/* --- label --- */

export const DIMENSION_LABELS = {
  branch_area: "Wilayah",
  Branch: "Cabang",
  Channel: "Kanal",
  Lini_Produk: "Lini produk",
  Category: "Kategori produk",
  Payment_Method: "Metode bayar",
  Year: "Tahun",
  Quarter_Name: "Kuartal",
  // dimensi yang hanya ada di data tingkat transaksi (analisis produk)
  __name: "Nama produk",
  Item_Code: "Kode barang",
  __dow: "Hari",
  __qtyband: "Ukuran pesanan",
};

export const labelOf = (dim) => DIMENSION_LABELS[dim] || String(dim).replace(/_/g, " ");

/** Berapa node ditampilkan per kolom pohon sebelum tombol "lainnya". */
export const NODE_LIMIT = 10;

/** Diisi loader supaya hasil deteksi tanggal bisa ditampilkan di antarmuka. */
export const DETECTED = { field: null, format: null };

/* ============================================================================
   Analisis produk
   ----------------------------------------------------------------------------
   Halaman produk butuh data per transaksi, bukan data yang sudah diringkas,
   karena harus bisa menghitung jumlah cabang, pelanggan, dan pola bulanan
   tiap produk. Nama kolom sumbernya dipetakan di sini.
   ========================================================================== */

export const LINE_FIELDS = {
  revenue: "Revenue",
  qty: "quantity",
  priceList: "Price_List",
  code: "Item_Code",
  name: "product_name",
  customer: "id_customer",
  transaction: "Transaction_ID",
};

/**
 * Tingkat analisis produk. `parent` menentukan siapa "saudara" sebuah produk:
 * produk pengganti dicari di antara saudara, dan tren produk dibandingkan
 * dengan tren induknya untuk membedakan masalah produk dari masalah pasar.
 */
export const PRODUCT_UNITS = [
  { key: "Lini_Produk", label: "Lini produk", plural: "lini", parent: null },
  { key: "Category", label: "Kategori produk", plural: "kategori", parent: "Lini_Produk" },
  { key: "__name", label: "Nama produk", plural: "produk", parent: "Category" },
  { key: "Item_Code", label: "Kode barang", plural: "kode barang", parent: "Category" },
];

/* Kategori dipakai sebagai bawaan karena biasanya setara keluarga produk dan
   cukup padat untuk dibaca siklus hidupnya; kode barang sering hanya terjual
   sekali-dua kali. Kalau kolom kategori tidak ada, tingkat pertama yang
   tersedia dipakai (lihat activeUnits). */
export const DEFAULT_UNIT = "Category";

/** Kolom sumber untuk setiap tingkat produk. */
const UNIT_SOURCE = { Lini_Produk: "Lini_Produk", Category: "Category", __name: "product_name", Item_Code: "Item_Code" };

/**
 * Tingkat produk yang benar-benar tersedia di data yang dimuat. Induk yang
 * kolomnya tidak ada dilewati ke induk berikutnya (atau tanpa induk), supaya
 * perbandingan "produk lain di induknya" tetap masuk akal.
 */
export function activeUnits() {
  const ok = (k) => hasCol(UNIT_SOURCE[k]);
  const parentOf = (u) => {
    const chain = { Lini_Produk: [], Category: ["Lini_Produk"], __name: ["Category", "Lini_Produk"], Item_Code: ["Category", "Lini_Produk"] }[u.key];
    return chain.find((p) => ok(p)) || null;
  };
  return PRODUCT_UNITS.filter((u) => ok(u.key)).map((u) => ({ ...u, parent: parentOf(u) }));
}

/** Definisi satu tingkat produk sesuai data yang dimuat. */
export function unitDef(key) {
  return activeUnits().find((u) => u.key === key) || PRODUCT_UNITS.find((u) => u.key === key);
}

/** Dimensi yang bisa dipakai di halaman eksplorasi. */
export const EXPLORE_DIMS = [
  "branch_area",
  "Branch",
  "Channel",
  "Payment_Method",
  "Lini_Produk",
  "Category",
  "__name",
  "Item_Code",
  "Quarter_Name",
];

/* Dimensi yang saling menentukan. Saat mencari pendorong untuk "Cabang = X",
   wilayah tidak boleh ikut jadi faktor — ia pasti cocok karena cabang
   menentukan wilayah, dan hasilnya jadi tautologi. */
export const DIM_FAMILY = {
  branch_area: "geo",
  Branch: "geo",
  Lini_Produk: "produk",
  Category: "produk",
  __name: "produk",
  Item_Code: "produk",
  Year: "waktu",
  Quarter_Name: "waktu",
};

/** Ambang bawaan penilaian produk. Semuanya bisa diubah dari layar Kriteria. */
export const CRITERIA_DEFAULTS = {
  growth: 0.15, // berubah lebih dari ±15% → tumbuh / menurun
  newMonths: 6, // pertama terjual dalam 6 bulan terakhir → baru
  dormantDays: 90, // tidak terjual lebih dari 90 hari → tidak aktif
  cleanDays: 365, // tidak terjual lebih dari 365 hari → bersihkan dari katalog
  minTx: 4, // di bawah ini, datanya dianggap terlalu tipis untuk dinilai
  thinAgeMonths: 12, // data tipis + kelas C + sudah beredar lebih lama dari ini → kandidat dicabut
  projectGraceDays: 180, // produk borongan yang terjual dalam jangka ini belum dianggap mati
  abcA: 0.8, // produk teratas yang menyusun 80% pendapatan → kelas A
  abcB: 0.95, // 80–95% → kelas B, sisanya C
  weights: {
    contrib: 30,
    trend: 25,
    reach: 15,
    consistency: 15,
    recency: 15,
  },
};

/**
 * Ambang bawaan menu Peringatan. Semuanya bisa diubah dari panel "Atur
 * ambang" di halaman itu; di sini hanya nilai awalnya.
 */
export const ALERT_DEFAULTS = {
  watchDays: 90, // periode pantau: N hari terakhir sampai tanggal acuan
  compare: "yoy", // pembanding: "yoy" = periode yang sama tahun lalu, "prev" = N hari tepat sebelumnya
  silentDays: 30, // produk kelas A/B (atau cabang) tidak terjual selama ini → peringatan
  silentFactor: 3, // … dan sudah ≥ 3× jeda normalnya, supaya produk yang memang jarang laku tidak ikut
  dropPct: 0.3, // turun lebih dari 30% dibanding pembanding → peringatan
  surgePct: 1, // naik lebih dari 100% (≥ 2×) → lonjakan
  minTx: 5, // transaksi minimal di pembanding, supaya persen tidak dihitung dari 1–2 transaksi
  minShareDim: 0.005, // cabang/kanal/kategori minimal 0,5% dari total pembanding
  minShareProduct: 0.001, // lonjakan produk minimal 0,1% dari total periode pantau
  priceDrop: 0.1, // harga bersih (terhadap harga daftar) turun lebih dari 10%
  concentration: 0.7, // ≥ 70% pendapatan P1 produk kelas A dari satu cabang
  customerShare: 0.5, // ≥ 50% pendapatan P1 produk kelas A dari satu pelanggan
  off: [], // jenis peringatan yang dimatikan, mis. ["customer", "price"] (kunci di ALERT_RULES, lib/alerts.js)
};

/** Pilihan jendela analisis di halaman produk. */
export const WINDOW_OPTIONS = [
  { key: "12", months: 12, label: "12 bulan vs 12 bulan sebelumnya" },
  { key: "6", months: 6, label: "6 bulan vs 6 bulan sebelumnya" },
  { key: "3", months: 3, label: "3 bulan vs 3 bulan sebelumnya" },
  { key: "global", months: null, label: "Ikuti periode di atas" },
];
