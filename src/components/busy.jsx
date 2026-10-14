/* ============================================================================
   Penanda memuat — logo aplikasi dengan cincin berputar
   ----------------------------------------------------------------------------
   Muncul di atas isi halaman selama halaman menghitung ulang: sesudah
   penyaring atau periode diubah, saat berpindah ke halaman yang berat, saat
   tingkat/jendela/kriteria diganti, dan saat data dimuat ulang.

   Cara kerjanya (lihat useSettled di lib/hooks.js): kontrol langsung berubah,
   tirai + logo digambar dulu, baru sesudah itu hitungan berat dijalankan.
   Cincinnya dianimasikan dengan transform, jadi tetap berputar walaupun
   peramban sedang sibuk menghitung.

   Halaman yang punya hitungan berat sendiri (mis. Pendorong) cukup memasang
   <BusyOverlay show={…} label="…" />; tirainya otomatis menutup area halaman.
   ========================================================================== */

import React, { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Mark, cx } from "../lib/theme.jsx";

/** Wadah area halaman tempat tirai dipasang (diisi App). */
export const BusyHost = createContext(null);

/**
 * Nilai kontrol yang LANGSUNG (belum menunggu halaman selesai menghitung) —
 * dipakai WindowBar supaya pilihan Tingkat/Jendela/Kriteria langsung berganti
 * walau isi halamannya masih memakai pilihan sebelumnya.
 */
export const LiveControls = createContext(null);

/** Logo di ubin anggur, dikelilingi cincin yang berputar. */
export function LoaderMark({ size = 56, className }) {
  const tile = Math.round(size * 0.64);
  return (
    <span className={cx("relative grid flex-none place-items-center", className)} style={{ width: size, height: size }} aria-hidden="true">
      <span
        className="dt-spin absolute inset-0 rounded-full"
        style={{
          border: `${size >= 64 ? 3.5 : 3}px solid var(--brand-100)`,
          borderTopColor: "var(--brand-700)",
          borderRightColor: "var(--brand-400)",
        }}
      />
      <span
        className="dt-topbar grid place-items-center text-white"
        style={{ width: tile, height: tile, borderRadius: tile * 0.3, boxShadow: "0 2px 6px -2px rgba(61,0,32,.45), inset 0 0 0 1px rgba(255,255,255,.14)" }}
      >
        <Mark className="h-[58%] w-[58%]" />
      </span>
    </span>
  );
}

/**
 * Tirai tipis + kartu "sedang memuat" di tengah area halaman. Menahan klik
 * ke isi yang sedang diganti, tapi tidak menutup menu, bilah periode, dan
 * penyaring — semua itu tetap bisa diubah.
 */
export function BusyOverlay({ show, label = "Menghitung ulang…", sub = "Sebentar, halaman sedang menghitung ulang." }) {
  const host = useContext(BusyHost);
  if (!show) return null;
  const node = (
    <div className="dt-busy absolute inset-0 z-30 grid place-items-center bg-[rgba(243,238,241,.66)] px-4" aria-hidden="true">
      <div className="dt-shadow-pop flex max-w-[min(420px,100%)] items-center gap-3.5 rounded-2xl border border-[var(--ink-200)] bg-[var(--paper)] py-3 pl-3 pr-5">
        <LoaderMark size={48} />
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-[var(--ink-900)]">{label}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--ink-500)]">{sub}</div>
        </div>
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}
