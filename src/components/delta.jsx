/* ============================================================================
   Perubahan naik/turun — satu bahasa visual di seluruh aplikasi
   ----------------------------------------------------------------------------
   ▲ hijau   naik
   ▼ merah   turun (termasuk "tidak terjual lagi", −100%)
   ▬ abu     praktis tetap (berubah kurang dari 0,05%)
   baru biru tidak ada di pembanding, jadi tidak ada persentase

   Panah SELALU menyertai warna, jadi arah tetap terbaca oleh pembaca yang
   sulit membedakan merah–hijau dan saat halaman dicetak hitam-putih.

   Untuk angka yang "naik = buruk" (mis. hari tanpa penjualan, diskon), beri
   good="down": panahnya tetap jujur (▲ naik), warnanya yang dibalik.
   ========================================================================== */

import React from "react";
import { fmt, nfPct } from "../lib/format.js";
import { BTN, cx } from "../lib/theme.jsx";

const nfPct0 = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 });

/** Persen tanpa tanda. Di atas 100% tanpa desimal supaya mudah dibaca: 391%, bukan 391,2%. */
export const pctText = (x) => (Math.abs(x) >= 1 ? nfPct0 : nfPct).format(Math.abs(x));

/**
 * Arah perubahan.
 * @returns "up" | "down" | "flat" | "new" | "gone" | "none"
 */
export function deltaDir(g, p1, p2) {
  // Persen terhadap pembanding negatif (mis. retur bersih) tidak bermakna.
  if (p2 != null && p2 < 0) return "none";
  if (p2 === 0 && p1 > 0) return "new";
  if (p1 === 0 && p2 > 0) return "gone";
  if (g == null || Number.isNaN(g)) return p1 > 0 && !p2 ? "new" : "none";
  if (!Number.isFinite(g)) return g > 0 ? "new" : "gone";
  if (Math.abs(g) < 0.0005) return "flat";
  return g > 0 ? "up" : "down";
}

/** Nada warna dari arah dan arti "baik": pos | neg | flat | new | none. */
export function deltaTone(dir, good = "up") {
  if (dir === "new") return "new";
  if (dir === "none") return "none";
  if (dir === "flat" || good === "none") return "flat";
  const up = dir === "up";
  return (up ? good === "up" : good === "down") ? "pos" : "neg";
}

/** Kelas teks untuk angka bertanda biasa (selisih rupiah, jumlah). */
export function signTone(v, good = "up") {
  if (v == null || Number.isNaN(v) || v === 0 || good === "none") return "text-[var(--ink-600)]";
  return (v > 0) === (good === "up") ? "text-[var(--pos)]" : "text-[var(--neg)]";
}

const TONE = {
  pos: { text: "text-[var(--pos)]", chip: "bg-[var(--pos-bg)] text-[var(--pos)]", ring: "var(--teal-100)" },
  neg: { text: "text-[var(--neg)]", chip: "bg-[var(--neg-bg)] text-[var(--neg)]", ring: "var(--red-100)" },
  flat: { text: "text-[var(--ink-500)]", chip: "bg-[var(--ink-100)] text-[var(--ink-600)]", ring: "var(--ink-200)" },
  new: { text: "text-[var(--blue-700)]", chip: "bg-[var(--blue-50)] text-[var(--blue-700)]", ring: "var(--blue-100)" },
  none: { text: "text-[var(--ink-400)]", chip: "bg-[var(--ink-50)] text-[var(--ink-400)]", ring: "var(--ink-100)" },
};

const SIZE = {
  xs: "text-[10.5px]",
  sm: "text-[11.5px]",
  md: "text-[12.5px]",
  lg: "text-[14px]",
  xl: "text-[19px]",
};

/** Segitiga kecil yang ikut ukuran huruf. Digambar sendiri supaya sama di semua huruf dan sistem. */
export function Arrow({ dir, className }) {
  const cls = cx("inline-block h-[0.62em] w-[0.62em] flex-none", className);
  if (dir === "up" || dir === "new")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden="true">
        <path d="M5 1.2 9.3 8.6H.7Z" fill="currentColor" />
      </svg>
    );
  if (dir === "down" || dir === "gone")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden="true">
        <path d="M5 8.8 .7 1.4h8.6Z" fill="currentColor" />
      </svg>
    );
  if (dir === "flat")
    return (
      <svg viewBox="0 0 10 10" className={cls} aria-hidden="true">
        <path d="M1.4 5h7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return null;
}

const WORD = { up: "naik", down: "turun", gone: "turun", flat: "tetap" };

/**
 * Perubahan persen dengan panah dan warna.
 *
 * @param g        rasio perubahan (P1 ÷ P2 − 1); null kalau tidak ada pembanding
 * @param p1, p2   opsional, untuk mengenali "baru" (P2 = 0) dan "tidak terjual lagi" (P1 = 0)
 * @param good     "up" (bawaan) | "down" (naik = buruk) | "none" (tanpa baik/buruk)
 * @param variant  "text" | "chip"
 * @param size     "xs" | "sm" | "md" | "lg"
 * @param label    teks pengganti angka persen (mis. "+2" untuk jumlah cabang)
 * @param newText  teks untuk yang tidak ada di pembanding (bawaan "baru")
 */
export function Delta({ g, p1, p2, good = "up", variant = "text", size = "sm", label, title, className, newText = "baru", arrow = true }) {
  const dir = deltaDir(g, p1, p2);
  const tone = deltaTone(dir, good);
  const T = TONE[tone];
  const text =
    label ??
    (dir === "new" ? newText : dir === "none" ? "–" : dir === "gone" ? "100%" : dir === "flat" ? "0%" : pctText(g));
  const word = WORD[dir];
  return (
    <span
      className={cx(
        // relative: teks tersembunyi untuk pembaca layar (sr-only) ikut terpotong
        // bersama tabel yang digulir ke samping, bukan melebarkan halaman.
        "relative inline-flex items-center gap-[3px] whitespace-nowrap font-medium tabular-nums leading-none",
        SIZE[size] || SIZE.sm,
        variant === "chip" ? cx("rounded-full px-1.5 py-[3px]", T.chip) : T.text,
        className
      )}
      title={title}
    >
      {arrow && dir !== "new" && <Arrow dir={dir} />}
      {word && <span className="sr-only">{word} </span>}
      <span>{text}</span>
    </span>
  );
}

/**
 * Angka bertanda (selisih rupiah atau jumlah) dengan warna arahnya:
 * "+Rp 4,4 M" hijau, "−Rp 1,2 M" merah, "Rp 0" abu.
 */
export function Signed({ v, format = "currency", compact = true, good = "up", className, title }) {
  if (v == null || Number.isNaN(v)) return <span className={cx("text-[var(--ink-400)]", className)}>–</span>;
  return (
    <span className={cx("whitespace-nowrap tabular-nums", signTone(v, good), className)} title={title}>
      {signedText(v, format, compact)}
    </span>
  );
}

/** Teks bertanda tanpa warna: "+Rp 4,4 M", "−Rp 1,2 M", "+793". */
export const signedText = (v, format = "currency", compact = true) => (v > 0 ? `+${fmt(v, format, compact)}` : fmt(v, format, compact));

/**
 * Perubahan jumlah bulat, mis. cabang 23 → 8: angka lama abu, panah, angka baru
 * berwarna arah perubahannya. `from` dan `to` harus ANGKA (diformat di sini),
 * supaya perbandingannya angka, bukan teks.
 */
const nfCount = new Intl.NumberFormat("id-ID");
export function CountChange({ from, to, good = "up", className }) {
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  const dir = b > a ? "up" : b < a ? "down" : "flat";
  const tone = deltaTone(dir, good);
  return (
    <span className={cx("relative inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums", className)}>
      <span className="text-[var(--ink-400)]">{nfCount.format(a)}</span>
      <span className="text-[var(--ink-300)]" aria-hidden="true">
        →
      </span>
      <span className="sr-only"> menjadi </span>
      <span className={cx("font-medium", tone === "flat" ? "text-[var(--ink-800)]" : TONE[tone].text)}>{nfCount.format(b)}</span>
    </span>
  );
}

/* Tanda di depan angka perubahan di dalam kalimat: +Rp 4,7 M, −Rp 412 jt, +65,1%, -28,5%.
   Hanya yang didahului spasi atau kurung, jadi "P1−P2", "2023-03" atau "23→8" tidak ikut. */
const CHANGE_RE = /([+−-])\s?(Rp\s?\d(?:[\d.,]*\d)?(?:\s?(?:rb|jt|M|T)\b)?|\d(?:[\d.,]*\d)?\s?%)/g;

/**
 * Kalimat biasa yang angka perubahannya diberi warna (hijau untuk +, merah
 * untuk −). Dipakai untuk kalimat penjelasan perubahan; teks lain tidak disentuh.
 */
export function ChangeText({ children }) {
  if (typeof children !== "string") return children ?? null;
  const out = [];
  let last = 0;
  CHANGE_RE.lastIndex = 0;
  let m;
  while ((m = CHANGE_RE.exec(children))) {
    const prev = m.index === 0 ? " " : children[m.index - 1];
    if (!/[\s(]/.test(prev)) continue;
    out.push(children.slice(last, m.index));
    out.push(
      <span key={m.index} className={cx("font-medium", m[1] === "+" ? "text-[var(--pos)]" : "text-[var(--neg)]")}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (!out.length) return children;
  out.push(children.slice(last));
  return <>{out}</>;
}

/**
 * Ajakan menyalakan perbandingan, untuk Pohon dekomposisi saat Bandingkan
 * periode mati — tanpa pembanding, naik/turun tidak bisa dihitung.
 */
export function CompareHint({ onEnable, className }) {
  if (!onEnable) return null;
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed border-[var(--ink-300)] bg-[var(--paper)] px-3 py-2 text-[12px] text-[var(--ink-700)]",
        className
      )}
    >
      <span>
        Naik/turun belum dihitung karena <b className="font-medium">Bandingkan periode</b> mati. Nyalakan untuk melihat perubahan berwarna{" "}
        <span className="whitespace-nowrap">
          (<Delta g={0.1} label="naik" size="xs" /> · <Delta g={-0.1} label="turun" size="xs" />)
        </span>
        .
      </span>
      <button type="button" className={BTN} onClick={onEnable}>
        Bandingkan dengan tahun lalu
      </button>
    </div>
  );
}
