/* ============================================================================
   Mesin eksplorasi
   ----------------------------------------------------------------------------
   Hierarki (icicle · treemap · sunburst), aliran (parallel sets), matriks
   silang, dan pendorong (key influencers). Fungsi murni tanpa React; tata
   letak piksel dihitung di komponen, di sini hanya struktur dan angka.
   ========================================================================== */

import { DIM_FAMILY, labelOf } from "./config.js";
import { valueLabel } from "./product.js";

const inP = (d, r) => d >= r.from && d <= r.to;
const sizeOf = (ln, size) => (size === "__n" ? 1 : ln[size]);

export const OTHER_KEY = "__other";

/* ================================================================ hierarki */

/**
 * Pohon nilai untuk urutan level yang dipilih pengguna.
 * v1 = nilai P1 (menentukan luas), v2 = nilai P2 (untuk warna pertumbuhan).
 *
 * Anak dibatasi `maxChildren`; sisanya dilebur jadi satu simpul "n lainnya"
 * supaya tetap terbaca. Anggota yang hanya ada di P2 (hilang di P1) tidak
 * punya luas, jadi dicatat terpisah di `vanished` induknya.
 */
export function buildTree(lines, { levels, win, size = "Revenue", maxChildren = 24, labels }) {
  const root = { key: "__root", label: "Semua", dim: null, depth: 0, v1: 0, v2: 0, kids: new Map() };

  for (const ln of lines) {
    const d = ln.__d;
    const in1 = inP(d, win.p1);
    const in2 = inP(d, win.p2);
    if (!in1 && !in2) continue;
    const v = sizeOf(ln, size);
    let node = root;
    if (in1) node.v1 += v;
    if (in2) node.v2 += v;
    for (let i = 0; i < levels.length; i++) {
      const k = ln[levels[i]];
      let c = node.kids.get(k);
      if (!c) {
        c = {
          key: k,
          dim: levels[i],
          depth: i + 1,
          v1: 0,
          v2: 0,
          kids: i + 1 < levels.length ? new Map() : null,
        };
        node.kids.set(k, c);
      }
      if (in1) c.v1 += v;
      if (in2) c.v2 += v;
      node = c;
    }
  }

  let uid = 0;
  const finalize = (node, parent) => {
    node.id = uid++;
    node.parent = parent;
    if (!node.other) node.label = node.dim ? valueLabel(node.dim, node.key, labels) : node.label;
    node.g = node.v2 > 0 ? (node.v1 - node.v2) / node.v2 : node.v1 > 0 ? Infinity : null;
    node.shareParent = parent && parent.v1 ? node.v1 / parent.v1 : 1;
    if (!node.kids) {
      node.children = null;
      return;
    }
    const all = Array.from(node.kids.values());
    node.kids = null;
    const live = all.filter((c) => c.v1 > 0).sort((a, b) => b.v1 - a.v1);
    const gone = all.filter((c) => !(c.v1 > 0));
    node.vanished = {
      n: gone.length,
      v2: gone.reduce((t, c) => t + c.v2, 0),
      // Daftar lengkapnya, supaya tabel bisa menampilkan anggota yang hilang di P1.
      items: gone
        .map((c) => ({ key: c.key, dim: c.dim, label: valueLabel(c.dim, c.key, labels), v2: c.v2 }))
        .sort((a, b) => b.v2 - a.v2 || String(a.label).localeCompare(String(b.label))),
    };
    let kept = live;
    if (live.length > maxChildren) {
      kept = live.slice(0, maxChildren - 1);
      const rest = live.slice(maxChildren - 1);
      kept.push({
        key: OTHER_KEY,
        other: true,
        dim: rest[0].dim,
        depth: node.depth + 1,
        label: `${rest.length} lainnya`,
        members: rest.length,
        v1: rest.reduce((t, c) => t + c.v1, 0),
        v2: rest.reduce((t, c) => t + c.v2, 0),
        kids: null,
      });
    }
    node.children = kept;
    for (const c of kept) finalize(c, node);
  };
  finalize(root, null);
  return root;
}

/** Posisi relatif 0..1 tiap simpul menurut v1 (dipakai icicle dan sunburst). */
export function partition(node, x0 = 0, x1 = 1) {
  node.x0 = x0;
  node.x1 = x1;
  if (!node.children || !node.children.length) return node;
  const tot = node.children.reduce((t, c) => t + c.v1, 0);
  let x = x0;
  for (const c of node.children) {
    const w = tot ? (c.v1 / tot) * (x1 - x0) : 0;
    partition(c, x, x + w);
    x += w;
  }
  return node;
}

export function ancestors(node) {
  const out = [];
  for (let n = node; n; n = n.parent) out.unshift(n);
  return out;
}

export function maxDepth(node) {
  if (!node.children || !node.children.length) return node.depth;
  return Math.max(...node.children.map(maxDepth));
}

/**
 * Treemap "squarified" (Bruls, Huizing & van Wijk, 2000): memilih baris
 * yang membuat kotak sedekat mungkin ke persegi, supaya luasnya mudah
 * dibandingkan mata.
 */
export function squarify(items, x, y, w, h) {
  const total = items.reduce((t, it) => t + (it.v1 > 0 ? it.v1 : 0), 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const nodes = items
    .filter((it) => it.v1 > 0)
    .map((it) => ({ it, area: it.v1 * scale }))
    .sort((a, b) => b.area - a.area);

  const out = [];
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;

  const worst = (row, side) => {
    let s = 0;
    let max = 0;
    let min = Infinity;
    for (const n of row) {
      s += n.area;
      if (n.area > max) max = n.area;
      if (n.area < min) min = n.area;
    }
    const s2 = s * s;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const place = (row) => {
    const s = row.reduce((t, n) => t + n.area, 0);
    if (rw >= rh) {
      const cw = s / rh;
      let yy = ry;
      for (const n of row) {
        const hh = n.area / cw;
        out.push({ node: n.it, x: rx, y: yy, w: cw, h: hh });
        yy += hh;
      }
      rx += cw;
      rw -= cw;
    } else {
      const rhh = s / rw;
      let xx = rx;
      for (const n of row) {
        const ww = n.area / rhh;
        out.push({ node: n.it, x: xx, y: ry, w: ww, h: rhh });
        xx += ww;
      }
      ry += rhh;
      rh -= rhh;
    }
  };

  let row = [];
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(rw, rh);
    const n = nodes[i];
    if (!row.length || worst([...row, n], side) <= worst(row, side)) {
      row.push(n);
      i++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

/* ================================================================== aliran */

/**
 * Parallel sets. Pendapatan P1 mengalir melewati dimensi yang diurutkan
 * pengguna. Tiap kolom dibatasi `topK` anggota, sisanya "Lainnya".
 * Kolom pertama paling banyak 7 (jumlah warna kategori yang aman), karena
 * pita diwarnai menurut kolom pertama. `topK` = Infinity (pilihan "Semua")
 * menampilkan seluruh anggota di semua kolom tanpa simpul "lainnya";
 * anggota kolom pertama di luar 7 warna digambar abu-abu oleh halaman.
 */
export function buildFlows(lines, { dims, win, size = "Revenue", topK = 7, labels, focus }) {
  // sel = transaksi P1 (menentukan bentuk diagram); sel2 = transaksi P2,
  // hanya untuk menghitung naik/turun tiap simpul, pita, dan jalur.
  const sel = [];
  const sel2 = [];
  for (const ln of lines) {
    if (focus && ln[focus.dim] !== focus.key) continue;
    if (inP(ln.__d, win.p1)) sel.push(ln);
    if (win.p2 && inP(ln.__d, win.p2)) sel2.push(ln);
  }

  const columns = dims.map((dim, ci) => {
    const tot = new Map();
    for (const ln of sel) tot.set(ln[dim], (tot.get(ln[dim]) || 0) + sizeOf(ln, size));
    const sorted = Array.from(tot, ([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
    const k = !Number.isFinite(topK) ? Infinity : ci === 0 ? Math.min(topK, 7) : topK;
    const keep = new Set(sorted.slice(0, sorted.length > k + 1 ? k : sorted.length).map((n) => n.key));
    const nodes = sorted
      .filter((n) => keep.has(n.key))
      .map((n) => ({ key: n.key, label: valueLabel(dim, n.key, labels), value: n.value }));
    const rest = sorted.filter((n) => !keep.has(n.key));
    if (rest.length) {
      nodes.push({
        key: OTHER_KEY,
        other: true,
        label: `${rest.length} lainnya`,
        members: rest.length,
        value: rest.reduce((t, n) => t + n.value, 0),
      });
    }
    return { dim, label: labelOf(dim), nodes, keep };
  });

  const keyAt = (ln, ci) => {
    const v = ln[columns[ci].dim];
    return columns[ci].keep.has(v) ? v : OTHER_KEY;
  };

  // Nilai P2 tiap simpul, dengan pengelompokan yang sama seperti P1.
  columns.forEach((c, ci) => {
    const t2 = new Map();
    for (const ln of sel2) {
      const k = keyAt(ln, ci);
      t2.set(k, (t2.get(k) || 0) + sizeOf(ln, size));
    }
    for (const nd of c.nodes) nd.v2 = t2.get(nd.key) || 0;
  });

  // Aliran antarkolom bertetangga, dikunci juga oleh anggota kolom pertama
  // supaya pita bisa diwarnai menurut asalnya.
  const segments = [];
  for (let ci = 0; ci < columns.length - 1; ci++) {
    const m = new Map();
    for (const ln of sel) {
      const root = keyAt(ln, 0);
      const a = keyAt(ln, ci);
      const b = keyAt(ln, ci + 1);
      const k = `${root}\u0001${a}\u0001${b}`;
      let e = m.get(k);
      if (!e) m.set(k, (e = { root, a, b, value: 0, v2: 0 }));
      e.value += sizeOf(ln, size);
    }
    // P2 hanya ditambahkan ke pita yang juga ada di P1 (pita P2 saja tidak digambar).
    for (const ln of sel2) {
      const e = m.get(`${keyAt(ln, 0)}\u0001${keyAt(ln, ci)}\u0001${keyAt(ln, ci + 1)}`);
      if (e) e.v2 += sizeOf(ln, size);
    }
    segments.push(Array.from(m.values()));
  }

  // Jalur lengkap teratas untuk tampilan tabel.
  const pm = new Map();
  for (const ln of sel) {
    const keys = columns.map((_, ci) => keyAt(ln, ci));
    const k = keys.join("\u0001");
    let e = pm.get(k);
    if (!e) pm.set(k, (e = { keys, value: 0, v2: 0 }));
    e.value += sizeOf(ln, size);
  }
  for (const ln of sel2) {
    const e = pm.get(columns.map((_, ci) => keyAt(ln, ci)).join("\u0001"));
    if (e) e.v2 += sizeOf(ln, size);
  }
  const paths = Array.from(pm.values()).sort((a, b) => b.value - a.value);
  const total = sel.reduce((t, ln) => t + sizeOf(ln, size), 0);
  const total2 = sel2.reduce((t, ln) => t + sizeOf(ln, size), 0);

  for (const c of columns) delete c.keep;
  return { columns, segments, paths, total, total2, n: sel.length };
}

/* ================================================================= matriks */

/**
 * Matriks dua dimensi. Selain nilai dan pertumbuhan, dihitung INDEKS
 * keterwakilan: nilai sel dibagi nilai yang diharapkan kalau baris dan kolom
 * tidak saling terkait (total baris × total kolom ÷ total). Indeks 2× berarti
 * kombinasi itu dua kali lebih besar dari yang wajar — tempat mencari
 * keanehan, misalnya kategori yang laku luar biasa di satu cabang.
 */
export function buildMatrix(lines, { rowDim, colDim, win, size = "Revenue", maxRows = 15, maxCols = 12, labels }) {
  const raw = new Map();
  const rowT = new Map();
  const colT = new Map();
  for (const ln of lines) {
    const d = ln.__d;
    const in1 = inP(d, win.p1);
    const in2 = inP(d, win.p2);
    if (!in1 && !in2) continue;
    const v = sizeOf(ln, size);
    const r = ln[rowDim];
    const c = ln[colDim];
    const k = `${r}\u0001${c}`;
    let e = raw.get(k);
    if (!e) raw.set(k, (e = { r, c, v1: 0, v2: 0 }));
    if (in1) e.v1 += v;
    if (in2) e.v2 += v;
    if (in1) {
      rowT.set(r, (rowT.get(r) || 0) + v);
      colT.set(c, (colT.get(c) || 0) + v);
    } else {
      if (!rowT.has(r)) rowT.set(r, 0);
      if (!colT.has(c)) colT.set(c, 0);
    }
  }

  const cap = (tot, max) => {
    const sorted = Array.from(tot, ([key, v1]) => ({ key, v1 })).sort((a, b) => b.v1 - a.v1);
    if (sorted.length <= max) return { keep: new Set(sorted.map((s) => s.key)), rest: 0 };
    return { keep: new Set(sorted.slice(0, max - 1).map((s) => s.key)), rest: sorted.length - (max - 1) };
  };
  const R = cap(rowT, maxRows);
  const C = cap(colT, maxCols);
  const rk = (r) => (R.keep.has(r) ? r : OTHER_KEY);
  const ck = (c) => (C.keep.has(c) ? c : OTHER_KEY);

  const cells = new Map();
  const rows = new Map();
  const cols = new Map();
  let T1 = 0;
  let T2 = 0;
  for (const e of raw.values()) {
    const r = rk(e.r);
    const c = ck(e.c);
    const k = `${r}\u0001${c}`;
    let x = cells.get(k);
    if (!x) cells.set(k, (x = { r, c, v1: 0, v2: 0 }));
    x.v1 += e.v1;
    x.v2 += e.v2;
    let rr = rows.get(r);
    if (!rr) rows.set(r, (rr = { key: r, v1: 0, v2: 0 }));
    rr.v1 += e.v1;
    rr.v2 += e.v2;
    let cc = cols.get(c);
    if (!cc) cols.set(c, (cc = { key: c, v1: 0, v2: 0 }));
    cc.v1 += e.v1;
    cc.v2 += e.v2;
    T1 += e.v1;
    T2 += e.v2;
  }

  const lab = (dim, key, rest) => (key === OTHER_KEY ? `${rest} lainnya` : valueLabel(dim, key, labels));
  const order = (m, dim, rest) =>
    Array.from(m.values())
      .map((x) => ({ ...x, other: x.key === OTHER_KEY, label: lab(dim, x.key, rest) }))
      .sort((a, b) => (a.other ? 1 : b.other ? -1 : b.v1 - a.v1));

  const rowList = order(rows, rowDim, R.rest);
  const colList = order(cols, colDim, C.rest);
  const rowV = new Map(rowList.map((r) => [r.key, r.v1]));
  const colV = new Map(colList.map((c) => [c.key, c.v1]));

  for (const x of cells.values()) {
    x.g = x.v2 > 0 ? (x.v1 - x.v2) / x.v2 : x.v1 > 0 ? Infinity : null;
    const exp = T1 ? (rowV.get(x.r) * colV.get(x.c)) / T1 : 0;
    x.idx = exp > 0 ? x.v1 / exp : null;
    x.rowShare = rowV.get(x.r) ? x.v1 / rowV.get(x.r) : 0;
    x.colShare = colV.get(x.c) ? x.v1 / colV.get(x.c) : 0;
  }
  for (const r of rowList) r.g = r.v2 > 0 ? (r.v1 - r.v2) / r.v2 : null;
  for (const c of colList) c.g = c.v2 > 0 ? (c.v1 - c.v2) / c.v2 : null;

  // nRows/nCols = jumlah anggota sebenarnya, termasuk yang sedang digabung ke "lainnya".
  return { rows: rowList, cols: colList, cells, T1, T2, rowDim, colDim, nRows: rowT.size, nCols: colT.size };
}

export const cellKey = (r, c) => `${r}\u0001${c}`;

/* =============================================================== pendorong */

/**
 * Key influencers. Untuk sebuah hasil biner (mis. "transaksi bernilai besar"),
 * setiap nilai setiap dimensi dinilai dengan LIFT:
 *
 *   lift = peluang hasil di dalam kelompok ÷ peluang hasil di luar kelompok
 *
 * Lift 2,3× artinya transaksi di kelompok itu 2,3 kali lebih mungkin
 * menghasilkan hasil tersebut dibanding transaksi lain. Kelompok kecil
 * (< minSupport transaksi) diabaikan karena liftnya mudah kebetulan.
 *
 * `weight` (opsional) memberi bobot tiap transaksi. Tanpa bobot, peluang =
 * porsi TRANSAKSI. Dengan bobot pendapatan, peluang = porsi PENDAPATAN —
 * cocok untuk pertanyaan "berapa bagian omzet cabang ini yang bergantung
 * pada produk yang sedang menurun". Dukungan minimum tetap dihitung dalam
 * jumlah transaksi, supaya satu pesanan raksasa tidak dianggap pola.
 *
 * `excess` = kejadian (dalam satuan bobot) yang lebih banyak daripada kalau
 * kelompok itu berperilaku seperti sisanya. Lift mengukur KEKUATAN, excess
 * mengukur DAMPAK: faktor 1,4× yang mencakup separuh transaksi bisa
 * menjelaskan lebih banyak daripada faktor 6× yang hanya 40 transaksi.
 *
 * `z` = uji beda dua proporsi (berbasis jumlah transaksi). |z| < 2 artinya
 * selisihnya masih mungkin kebetulan.
 *
 * Segmen = kombinasi dua nilai dari dua dimensi BERBEDA KELUARGA (cabang ×
 * wilayah tidak dihitung — cabang sudah menentukan wilayah). Segmen hanya
 * disimpan kalau lebih tajam dari kedua faktor penyusunnya; kalau tidak,
 * faktor kedua tidak menambah apa-apa.
 */
export function keyInfluencers(lines, { win, outcome, factorDims, minSupport = 30, labels, weight }) {
  const L = [];
  const Y = [];
  const W = [];
  for (const ln of lines) {
    if (!inP(ln.__d, win.p1)) continue;
    const w = weight ? weight(ln) : 1;
    if (!(w > 0)) continue;
    L.push(ln);
    Y.push(outcome(ln) ? 1 : 0);
    W.push(w);
  }
  const N = L.length;
  let K = 0;
  let WN = 0;
  let WK = 0;
  let W2 = 0;
  for (let i = 0; i < N; i++) {
    K += Y[i];
    WN += W[i];
    WK += W[i] * Y[i];
    W2 += W[i] * W[i];
  }
  const base = WN ? WK / WN : 0;

  /* Ukuran sampel efektif (Kish): (Σw)² ÷ Σw². Tanpa bobot = jumlah transaksi.
     Dengan bobot pendapatan, kelompok yang omzetnya ditopang satu-dua pesanan
     raksasa punya ukuran efektif kecil — jadi tidak dianggap pola. */
  const nEff = (wn, w2) => (w2 > 0 ? (wn * wn) / w2 : 0);

  /** Statistik satu kelompok terhadap sisanya. */
  const judge = (e) => {
    const outN = N - e.n;
    const outW = WN - e.wn;
    const rate = e.wn ? e.wk / e.wn : 0;
    const rateOut = outW > 0 ? (WK - e.wk) / outW : 0;
    const lift = rateOut > 0 ? rate / rateOut : rate > 0 ? Infinity : 1;
    const excess = e.wk - e.wn * rateOut;
    const nIn = nEff(e.wn, e.w2);
    const nOut = nEff(outW, W2 - e.w2);
    const se = Math.sqrt(base * (1 - base) * (1 / Math.max(1, nIn) + 1 / Math.max(1, nOut)));
    const z = se > 0 && outN > 0 ? (rate - rateOut) / se : 0;
    // Uji z hanya sah kalau kejadiannya tidak terlalu sedikit (aturan np ≥ 5):
    // naik → minimal 5 kejadian di dalam kelompok; turun → kelompok itu
    // seharusnya punya ≥ 5 kejadian kalau mengikuti sisanya.
    const expected = outN > 0 ? (e.n * (K - e.k)) / outN : 0;
    const strong = Math.abs(z) >= 2 && (rate > rateOut ? e.k >= 5 : expected >= 5);
    return { outN, rate, rateOut, lift, excess, z, nEff: nIn, strong };
  };

  const tally = (m, key, i, extra) => {
    let e = m.get(key);
    if (!e) m.set(key, (e = { ...extra, n: 0, k: 0, wn: 0, wk: 0, w2: 0 }));
    e.n++;
    e.k += Y[i];
    e.wn += W[i];
    e.wk += W[i] * Y[i];
    e.w2 += W[i] * W[i];
  };

  const factors = [];
  const byDim = {};
  const rateOf = new Map(); // `${dim}\u0001${key}` → rate, untuk menilai segmen
  for (const dim of factorDims) {
    const m = new Map();
    for (let i = 0; i < N; i++) tally(m, L[i][dim], i);
    const list = [];
    for (const [v, e] of m) {
      const s = judge(e);
      const item = {
        dim,
        dimLabel: labelOf(dim),
        key: v,
        label: valueLabel(dim, v, labels),
        n: e.n,
        k: e.k,
        wn: e.wn,
        wk: e.wk,
        share: WN ? e.wn / WN : 0,
        ...s,
        ok: e.n >= minSupport && s.outN >= minSupport,
      };
      list.push(item);
      rateOf.set(`${dim}\u0001${v}`, s.rate);
      if (item.ok) factors.push(item);
    }
    list.sort((a, b) => b.rate - a.rate);
    byDim[dim] = list;
  }

  // Segmen dua faktor.
  const fam = (d) => DIM_FAMILY[d] || d;
  const up = [];
  const down = [];
  for (let a = 0; a < factorDims.length; a++) {
    for (let b = a + 1; b < factorDims.length; b++) {
      const da = factorDims[a];
      const db = factorDims[b];
      if (fam(da) === fam(db)) continue;
      const m = new Map();
      for (let i = 0; i < N; i++) {
        tally(m, `${L[i][da]}\u0001${L[i][db]}`, i, { va: L[i][da], vb: L[i][db] });
      }
      for (const e of m.values()) {
        if (e.n < minSupport || N - e.n < minSupport) continue;
        const s = judge(e);
        if (!s.strong) continue;
        const rate = s.rate;
        const ra = rateOf.get(`${da}\u0001${e.va}`);
        const rb = rateOf.get(`${db}\u0001${e.vb}`);
        const isUp = rate >= base * 1.2 && rate > Math.max(ra, rb) * 1.05;
        const isDown = rate <= base * 0.8 && rate < Math.min(ra, rb) * 0.95;
        if (!isUp && !isDown) continue;
        const seg = {
          parts: [
            { dim: da, dimLabel: labelOf(da), key: e.va, label: valueLabel(da, e.va, labels), rate: ra },
            { dim: db, dimLabel: labelOf(db), key: e.vb, label: valueLabel(db, e.vb, labels), rate: rb },
          ],
          n: e.n,
          k: e.k,
          wn: e.wn,
          wk: e.wk,
          rate,
          z: s.z,
          share: WN ? e.wn / WN : 0,
          lift: base ? rate / base : null,
          excess: e.wk - e.wn * base,
        };
        (isUp ? up : down).push(seg);
      }
    }
  }

  // Buang kembaran: dua segmen yang mencakup transaksi yang persis sama
  // (mis. cabang tunggal di sebuah wilayah) cukup tampil sekali.
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((s) => {
      const sig = `${s.n}|${s.k}|${Math.round(s.wn)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  };
  up.sort((x, y) => y.rate - x.rate || y.n - x.n);
  down.sort((x, y) => x.rate - y.rate || y.n - x.n);

  return {
    N,
    K,
    WN,
    WK,
    base,
    factors,
    byDim,
    // Daftar lengkap; halaman menampilkan 10 teratas dulu dengan tombol "Tampilkan semua".
    segUp: dedupe(up),
    segDown: dedupe(down),
  };
}

/** Kuantil sederhana (interpolasi linear), untuk ambang "bernilai besar". */
export function quantile(values, q) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
