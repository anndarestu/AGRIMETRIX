# Checklist Final AGRIMETRIX Web

## Tampilan
- [ ] 360 × 800 atau 360 × 780: tidak ada horizontal scroll.
- [ ] 390 × 844 / 412 × 915: header, logo, kartu, dan bottom navigation tidak terpotong.
- [ ] Tablet 768 × 1024: grid memanfaatkan ruang tanpa terlalu renggang.
- [ ] Desktop ≥ 1280 px: konten tetap terpusat dan mudah dibaca.
- [ ] Landscape: semua tombol utama masih dapat dijangkau.
- [ ] Zoom browser 125% dan 150%: teks tidak saling menimpa.

## Mode Demo
- [ ] Mulai → RH naik → Peltier ON setelah ambang demo.
- [ ] Suhu kondensor turun dan kondensasi baru dihitung saat di bawah titik embun.
- [ ] Jeda menghentikan simulasi.
- [ ] Reset mengembalikan kondisi awal.
- [ ] Uji fail-safe memicu overheat dan menghentikan Peltier.
- [ ] Mode simulasi selalu diberi label sebagai demonstrasi.

## Data & penyimpanan
- [ ] Log bertambah sesuai event.
- [ ] Refresh browser mempertahankan log lokal.
- [ ] Ekspor CSV menghasilkan file dan isi dapat dibuka di Excel/Sheets.
- [ ] Bersihkan catatan meminta konfirmasi.

## PWA / Offline
- [ ] Jalankan melalui HTTP/HTTPS, bukan `file://`.
- [ ] Setelah load pertama, matikan jaringan dan reload: app shell masih dapat dibuka.
- [ ] Bila browser mendukung, tombol Pasang muncul.

## ESP32
- [ ] ESP32 dan perangkat browser berada di jaringan yang sesuai.
- [ ] Endpoint `/api/status` mengembalikan JSON valid.
- [ ] Header CORS tersedia bila origin berbeda.
- [ ] Mode Sensor menampilkan `—` untuk field yang tidak dikirim.
- [ ] Data sensor tidak pernah diganti diam-diam oleh simulasi.
- [ ] Jika website HTTPS dan ESP32 HTTP, pahami bahwa browser bisa memblokir mixed content.

## Sebelum presentasi
- [ ] Demo Mode diuji tanpa internet.
- [ ] Browser cache/PWA sudah dimuat sebelumnya.
- [ ] CSV sudah diuji sekali.
- [ ] Jika membawa ESP32, tetap siapkan Demo Mode sebagai fallback.
