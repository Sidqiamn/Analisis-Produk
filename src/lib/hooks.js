import { startTransition, useCallback, useState, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Tutup saat klik di luar. `ignoreSelector` dipakai supaya tombol yang membuka
 * panel tidak ikut menutupnya — tanpa itu, mousedown menutup lalu click
 * membuka lagi, dan tombolnya jadi tidak bisa dipakai untuk menutup.
 */
export function useClickOutside(ref, onOut, active, ignoreSelector) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (ignoreSelector && e.target?.closest?.(ignoreSelector)) return;
      onOut();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onOut();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOut, active, ignoreSelector]);
}

/** Lebar sebuah elemen, diikuti terus lewat ResizeObserver. */
export function useWidth(ref, fallback = 900) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth || fallback);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

/**
 * Posisi gulir dan ukuran sebuah kotak bergulir. Dipakai tabel yang sangat
 * besar (mis. matriks "Semua" dengan ribuan baris) supaya hanya baris dan
 * kolom yang kelihatan yang digambar — layar tetap ringan berapa pun isinya.
 * Saat `active` false, hook ini tidak memasang apa-apa.
 */
export function useScrollBox(ref, active) {
  const [box, setBox] = useState({ top: 0, left: 0, h: 600, w: 900 });
  useLayoutEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      setBox((b) => {
        const n = { top: el.scrollTop, left: el.scrollLeft, h: el.clientHeight || b.h, w: el.clientWidth || b.w };
        return n.top === b.top && n.left === b.left && n.h === b.h && n.w === b.w ? b : n;
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", schedule, { passive: true });
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", schedule);
      if (ro) ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, active]);
  return box;
}

/**
 * Lebar jendela, dipakai untuk memutuskan apakah sisi kiri menimpa isi
 * halaman (layar sempit) atau mendorongnya (layar lebar).
 */
export function useIsNarrow(breakpoint = 900) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`);
    const read = () => setNarrow(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [breakpoint]);
  return narrow;
}

/**
 * Rute sederhana lewat hash, supaya menu bisa ditautkan langsung dari
 * Metabase: …/#/portofolio membuka halaman Portofolio produk.
 *
 * `known` (opsional) = kumpulan rute yang ada. Rute lain — tautan lama yang
 * tersimpan, salah ketik — diarahkan ke `fallback` dan alamatnya dirapikan
 * tanpa menambah langkah riwayat.
 */
export function useHashRoute(fallback, known) {
  const hashOf = () => window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const read = () => {
    if (typeof window === "undefined") return fallback;
    const h = hashOf();
    return h && (!known || known.has(h)) ? h : fallback;
  };
  const [route, setRoute] = useState(read);
  const first = useRef(true);

  useEffect(() => {
    const onHash = () => {
      const next = read();
      setRoute(next);
      if (hashOf() !== next) window.history.replaceState(null, "", `${window.location.search}#/${next}`);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Setiap pindah halaman menambah satu langkah riwayat, jadi tombol Kembali
     di peramban (atau gestur kembali di ponsel) membawa ke halaman sebelumnya. */
  const go = (next, { replace = false } = {}) => {
    setRoute(next);
    if (typeof window !== "undefined") {
      // Pertahankan query string, karena di situlah filter dari Metabase tinggal.
      const qs = window.location.search;
      const url = `${qs}#/${next}`;
      const same = window.location.hash.replace(/^#\/?/, "").split("?")[0] === next;
      if (replace || same) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      go(route, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [route, go];
}

/* ------------------------------------------------------------ simpanan    */

/**
 * Simpanan kecil di peramban untuk preferensi tampilan (ambang peringatan,
 * panduan yang sudah ditutup). Selalu dibungkus try/catch: di jendela
 * privat, iframe Metabase dengan cookie pihak ketiga diblokir, atau saat
 * penyimpanan penuh, aplikasi tetap jalan dengan nilai bawaan.
 */
export function readStore(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* tidak bisa menyimpan — cukup berlaku sampai halaman ditutup */
  }
}

/* ------------------------------------------------------- penanda memuat   */

/**
 * Nilai yang "sudah tenang": mengikuti `value`, tapi baru berpindah SETELAH
 * peramban sempat menggambar satu kali.
 *
 * Pakai begini: kontrol (pilihan penyaring, tingkat, tombol) memakai nilai
 * langsung supaya terasa seketika; hitungan berat memakai nilai tenang.
 * Selama keduanya berbeda, `pending` = true — saat itulah penanda memuat
 * ditampilkan. Karena hitungan berat baru dimulai sesudah penanda tergambar,
 * penanda itu benar-benar terlihat (dan logonya tetap berputar, karena
 * animasi transform berjalan di luar utas utama) selama layar menghitung.
 *
 * `instant` = lewati penundaan (mis. periode bawaan yang diisi otomatis saat
 * data pertama kali terbaca — tidak perlu penanda).
 */
export function useSettled(value, instant = false) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return undefined;
    if (instant) {
      setSettled(value);
      return undefined;
    }
    let done = false;
    let r2 = 0;
    const apply = () => {
      if (done) return;
      done = true;
      startTransition(() => setSettled(value));
    };
    // Dua frame: frame pertama menggambar penanda, frame kedua baru menghitung.
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(apply);
    });
    // Tab di latar belakang tidak menjalankan requestAnimationFrame.
    const t = setTimeout(apply, 250);
    return () => {
      done = true;
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t);
    };
  }, [value, settled, instant]);
  const out = instant ? value : settled;
  return [out, !Object.is(out, value)];
}

/**
 * Fungsi dengan identitas tetap yang selalu memanggil versi terbarunya.
 * Dipakai untuk fungsi yang diteruskan ke halaman, supaya halaman yang
 * di-memo tidak ikut digambar ulang hanya karena fungsinya dibuat ulang.
 */
export function useStable(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}
