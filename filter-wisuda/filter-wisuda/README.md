# Filter Wajah "Wisuda dan Kampus"

## Deskripsi

Filter wajah AR berbasis web yang menempelkan aksesori 3D bertema kampus (topi toga dan kacamata) pada wajah secara real-time lewat kamera. Dibangun dengan MindAR (face tracking) dan Three.js, tanpa instalasi aplikasi. Seluruh pemrosesan wajah berjalan di perangkat pengguna dan tidak ada video atau foto yang diunggah ke server.

## Cara menjalankan

1. Letakkan `toga.glb` dan `kacamata.glb` di `assets/models/`.
2. Jalankan server statis dari folder proyek:
   ```bash
   npx serve .
   ```
3. Buka `http://localhost:3000` di browser, tekan **Mulai kamera**, lalu izinkan akses kamera.
4. Untuk uji di HP, halaman harus diakses lewat **HTTPS** (Netlify Drop, GitHub Pages, Vercel, atau `ngrok http 3000`).
5. Untuk menyetel posisi aksesori, buka `?debug=1` dan salin hasilnya ke `filters.json`.

Struktur utama: `index.html`, `style.css`, `filters.json`, `src/main.js`, `assets/models/`.

## Daftar fitur

- Dua aksesori 3D (GLB) menempel pada wajah: topi toga dan kacamata
- Animasi aktif: topi toga bergoyang (atau memutar klip animasi dari GLB) dan kacamata berkilau
- Tiga filter (Wisuda, Toga, Kacamata), dikonfigurasi lewat `filters.json`
- Tombol ganti filter (‹ ›, daftar filter, geser layar) dan tombol ambil foto dengan pratinjau sebelum disimpan
- Foto disimpan ke perangkat (unduhan di Android/desktop, lembar bagikan di iPhone)
- Pesan jelas saat izin kamera ditolak, kamera tidak ditemukan, atau kamera sedang dipakai aplikasi lain
- Filter terakhir tersimpan dan dipulihkan saat halaman dibuka lagi
- Efek mulut terbuka (konfeti) dan kepala miring (animasi lebih kencang)
- Kamera depan dan belakang
- Panel penyetelan (`?debug=1`) untuk mengatur posisi, rotasi, dan skala aksesori

## Batasan yang diketahui

- Kamera hanya berfungsi di HTTPS (atau `localhost`).
- Library dan model pelacak wajah dimuat dari CDN, jadi dibutuhkan koneksi internet.
- Dirancang untuk satu wajah dalam satu waktu.
- Posisi, rotasi, dan skala awal aksesori di `filters.json` adalah nilai perkiraan dan perlu disetel untuk setiap model GLB.
- Ambang mulut terbuka (`ambangMulut`) dapat berbeda antar pengguna dan perlu dikalibrasi.
- Occluder hanya menutup area wajah, sehingga bagian aksesori di belakang kepala (area rambut) tidak ikut tertutup.
- Three.js dipatok di versi r160 karena MindAR 1.2.5 belum kompatibel dengan versi yang lebih baru.
- Performa bergantung perangkat; HP lama atau model GLB besar dapat terasa lambat dan panas.
- Perilaku di iPhone (simpan foto, kamera belakang) dan hasil tracking di berbagai kondisi cahaya perlu diuji langsung di perangkat.