# Filter Wajah "Wisuda dan Kampus" (MindAR + Three.js)

Filter wajah AR di browser: topi toga + kacamata 3D menempel di wajah, ada animasi, tombol ganti filter, tombol foto, dan pesan jelas jika izin kamera ditolak. Semua pemrosesan wajah berjalan di perangkat.

## Isi proyek

```
filter-wisuda/
├─ index.html          # struktur halaman + importmap (three r160, MindAR 1.2.5)
├─ style.css           # tampilan, tombol ramah jempol, panel debug
├─ filters.json        # daftar aksesori (GLB, titik tempel, animasi) dan daftar filter
├─ src/main.js         # seluruh logika
└─ assets/models/      # taruh toga.glb dan kacamata.glb di sini
```

> three.js sengaja dipatok di **r160**. MindAR 1.2.5 masih memakai `sRGBEncoding` yang dihapus di three r162+, jadi jangan menaikkan versi three tanpa menguji ulang.

---

## Langkah pengerjaan

### Langkah 1 — Siapkan folder dan server lokal

1. Salin folder `filter-wisuda` ke komputermu, buka dengan VS Code.
2. Jalankan server statis dari dalam folder itu, salah satu:
   - `npx serve .`
   - ekstensi **Live Server** di VS Code
3. Buka `http://localhost:3000` (atau port yang muncul) di laptop. `localhost` dianggap aman oleh browser, jadi kamera laptop bisa dipakai untuk uji awal.

> File `.glb` dan `filters.json` dimuat lewat `fetch`, jadi halaman **tidak bisa** dibuka dengan klik dua kali (`file://`).

### Langkah 2 — Siapkan aset 3D (tugas "Aset")

Kamu sudah punya topi toga dan kacamata. Periksa dan rapikan dulu:

| Hal | Target |
|---|---|
| Format | `.glb` |
| Ukuran file | idealnya di bawah 1 MB per aksesori (maks. sekitar 2 MB) |
| Jumlah segitiga | sekitar 20 ribu atau kurang per aksesori |
| Tekstur | maks. 1024 px |
| Orientasi | menghadap sumbu **+Z**, bagian atas **+Y**, lebar ke **X** (bisa dikoreksi lewat rotasi di Langkah 5) |
| Nama material lensa | berisi kata `lens`, `lensa`, `glass` atau `kaca` (agar efek berkilau mengenai lensa) |

Mengecilkan ukuran (pilih satu):

- **Command line:** `npx @gltf-transform/cli optimize toga.glb toga-kecil.glb --compress meshopt --texture-compress webp --texture-size 1024`
  Jika opsi tidak dikenali, lihat `npx @gltf-transform/cli optimize --help`. Kode sudah mendukung GLB hasil Draco maupun Meshopt.
- **Tanpa instalasi:** unggah ke [gltf.report](https://gltf.report) lalu optimalkan teksturnya dan ekspor lagi.
- **Blender:** pakai modifier *Decimate*, kecilkan tekstur, lalu ekspor `glTF Binary (.glb)`.

Simpan hasilnya sebagai:

```
assets/models/toga.glb
assets/models/kacamata.glb
```

**Klip animasi.** Syarat soal: minimal 1 animasi aktif.

- Jika topi togamu punya animasi (mis. tali/jumbai bergoyang) di Blender, ekspor dengan opsi *Animation* aktif. Kode memutarnya otomatis dan berulang (`"tipe": "klip"`).
- Jika GLB **tidak** punya klip, kode otomatis memakai animasi pengganti `"goyang"` (topi bergoyang), jadi syarat tetap terpenuhi. Kacamata memakai animasi `"berkilau"` (bintang berkedip + lensa berdenyut).
- Tipe lain yang tersedia: `"melayang"`. Ganti di bagian `animasi` pada `filters.json`.

### Langkah 3 — Pasang face tracking dan titik tempel (tugas "Tracking")

Sudah dikerjakan di `src/main.js`:

- `MindARThree` dibuat dengan `addAnchor(nomorLandmark)`.
  - Topi toga → landmark **10** (puncak dahi).
  - Kacamata → landmark **168** (pangkal hidung di antara mata).
- Lebar wajah diukur sekali di awal (dari landmark 127 dan 356), lalu skala dan posisi aksesori dihitung **relatif terhadap lebar wajah**. Jadi model dengan satuan apa pun tetap pas, dan tinggal kamu setel halus.
- Occluder (mesh wajah tak terlihat) menutupi bagian aksesori yang ada di belakang wajah, mis. gagang kacamata.

### Langkah 4 — Jalankan dan lihat hasil awal

Buka halaman → **Mulai kamera** → izinkan kamera. Aksesori akan muncul setelah wajah terdeteksi dan terukur (sekitar sepersekian detik).

### Langkah 5 — Setel titik tempel dengan panel debug

Buka `http://localhost:3000/?debug=1`. Muncul panel di kiri atas:

1. Pilih aksesori di dropdown.
2. Geser slider **posisi X/Y/Z** (satuannya "lebar wajah"), **rotasi** (derajat), dan **skala**.
3. Jika model terlalu lebar/sempit: ubah **skala**. Jika sumbu lebarnya bukan X, ubah `"sumbuLebar"` (`"x"`, `"y"` atau `"z"`) di JSON.
4. Jika sudah pas, tekan **Salin JSON aksesori** lalu tempel nilainya ke `filters.json` (bagian `posisi`, `rotasiDerajat`, `skala`).

Panel juga menampilkan nilai `mulut` dan `miring` secara langsung untuk kalibrasi fitur pilihan (lihat Langkah 8).

> Nilai awal di `filters.json` hanyalah tebakan umum. Setiap model punya pivot dan orientasi berbeda, jadi **pasti perlu disetel** satu kali.

### Langkah 6 — Uji di HP lewat HTTPS

Kamera di HP hanya jalan di **HTTPS**. Pilihan termudah:

- **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)): seret folder `filter-wisuda`, dapat link HTTPS.
- **GitHub Pages** atau **Vercel**: unggah repo, aktifkan hosting.
- **Terowongan sementara:** `ngrok http 3000` lalu buka link `https://…` yang diberikan di HP.

### Langkah 7 — Uji pencahayaan (tugas "Tracking")

Uji tiap kondisi di bawah, catat hasilnya di tabel QA:

- Ruangan terang (siang, dekat jendela)
- Ruangan redup (lampu malam)
- Cahaya dari belakang (membelakangi jendela)
- Cahaya dari samping

Jika aksesori terlihat terlalu gelap/terang, ubah `CAHAYA` di bagian atas `src/main.js` (`hemisphere` dan `arah`). Jika tracking bergetar, isi `OPSI_PELACAK`, misalnya `{ filterMinCF: 0.001, filterBeta: 1000 }`: turunkan `filterMinCF` untuk lebih halus, naikkan `filterBeta` jika terasa tertinggal.

### Langkah 8 — Fitur pilihan (sudah termasuk)

| Fitur | Cara kerja | Yang bisa disetel |
|---|---|---|
| Filter terakhir tersimpan | `localStorage` hanya menyimpan **id filter** | kunci `KUNCI_FILTER` |
| Mulut terbuka | konfeti keluar dari atas kepala | `efek.ambangMulut` di JSON (mulai dari 0.06; lihat nilai `mulut` di panel debug saat mulut tertutup vs terbuka) |
| Kepala miring | goyangan/animasi jadi lebih kencang | `efek.ambangMiringDerajat` |
| Kamera depan dan belakang | tombol 🔄 di kanan atas | – |

Matikan efek dengan `"mulutTerbuka": false` atau `"kepalaMiring": false`.

### Langkah 9 — QA Android dan iPhone, lalu catat hasil

Salin tabel ini ke laporanmu dan isi per perangkat:

| Uji | Android (model / OS / browser) | iPhone (model / iOS / Safari) |
|---|---|---|
| Izin kamera diizinkan → filter jalan | | |
| Izin kamera **ditolak** → pesan jelas muncul | | |
| Setelah izin diaktifkan → "Coba lagi" berhasil | | |
| Toga menempel stabil (gerak kepala pelan/cepat) | | |
| Kacamata menempel stabil | | |
| Animasi aktif (toga/kacamata) | | |
| Tombol ganti filter (‹ ›, chip, geser) | | |
| Tombol foto → pratinjau → simpan ke perangkat | | |
| Foto sesuai tampilan layar (tidak terbalik/bergeser) | | |
| Filter terakhir tetap setelah muat ulang | | |
| Kamera belakang berfungsi | | |
| Efek mulut terbuka / kepala miring | | |
| Terang / redup / membelakangi cahaya | | |
| Kelancaran (perkiraan FPS, panas, lag) | | |
| Catatan masalah dan perbaikannya | | |

Perilaku penyimpanan foto:

- **Android/desktop:** file `filter-wisuda-….jpg` terunduh ke folder Unduhan.
- **iPhone:** muncul lembar bagikan; pilih **Simpan Gambar** untuk masuk ke Foto. Jika lembar bagikan tidak muncul, tekan lama gambar di pratinjau.

---

## Pemenuhan fitur wajib

| Syarat soal | Di mana |
|---|---|
| Minimal 2 aksesori GLB menempel stabil | `filters.json` → `aksesori.toga` dan `aksesori.kacamata`; pemasangan di `muatAksesori()` / `terapkanFit()` |
| Minimal 1 animasi aktif | `siapkanAnimasi()` dan `perbaruiAnimasi()` |
| Tombol ganti filter | `bangunDaftarFilter()`, tombol ‹ ›, geser layar, `terapkanFilter()` |
| Tombol ambil foto, simpan ke perangkat | `ambilFoto()` dan `simpanFoto()` |
| Izin kamera ditolak → pesan jelas | `cekIzinKamera()`, `pesanErrorKamera()`, layar `#layar-error` |
| `filters.json` dan penyimpanan foto | `filters.json`; foto lewat unduhan/lembar bagikan |

## Privasi

- Frame kamera diproses di browser dengan MindAR; **tidak ada video atau foto yang diunggah**, dan tidak ada analitik.
- Foto hanya dibuat saat kamu menekan tombol foto dan disimpan ke perangkat lewat unduhan atau lembar bagikan.
- Yang diunduh dari internet hanya file library dan model pelacak/aksesori (bukan data wajahmu). Jika ingin tanpa CDN, simpan three.js dan MindAR sendiri di proyek dan ubah `importmap`.
- Layar awal sudah memuat pemberitahuan privasi singkat.

## Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| Layar error "Halaman harus memakai HTTPS" | Buka lewat `https://` (Langkah 6) |
| "Gagal memulai filter" | Cek koneksi internet; pastikan `toga.glb` dan `kacamata.glb` ada di `assets/models/`; lihat Console browser |
| Aksesori tidak muncul sama sekali | Wajah belum terukur (hadapkan wajah lurus ke kamera); atau skala/posisi tidak cocok, coba panel debug |
| Aksesori terlalu besar/kecil | Ubah `skala` atau `lebarRelatif`; cek `sumbuLebar` |
| Aksesori terbalik/miring | Setel `rotasiDerajat` (mis. `[0, 180, 0]`) |
| Bagian aksesori terpotong aneh | Matikan occluder: `"occluder": false` |
| Aksesori bergetar | Turunkan `filterMinCF` (lihat Langkah 7) |
| Lambat / panas | Kecilkan GLB (Langkah 2), tutup tab lain |
| Foto kosong/hanya video | Pastikan tombol foto ditekan setelah filter tampil; coba browser terbaru |

## Catatan jujur

Kode ini dibuat tanpa bisa dijalankan di browser atau HP, jadi **belum diuji pada perangkat**. Hal yang paling mungkin perlu penyesuaian: posisi/skala/rotasi awal tiap model, ambang mulut terbuka, dan perilaku Safari di iPhone (simpan foto, kamera belakang). Karena itulah tabel QA di Langkah 9 penting diisi dari pengujian nyata.
