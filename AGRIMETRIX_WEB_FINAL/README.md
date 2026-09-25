# AGRIMETRIX Web — FESTAFORA 2026

Versi final web demonstrator AGRIMETRIX. Proyek ini adalah **web app statis/PWA**, bukan APK. Folder yang sama dapat dibungkus ke Android WebView nanti tanpa mengubah logika utama.

## Fitur final

- Tema visual mengikuti logo resmi AGRIMETRIX (hijau–biru).
- Responsif untuk ponsel, tablet, laptop, landscape, dan split-screen.
- PWA/offline-capable setelah pertama kali dibuka dari server HTTP/HTTPS.
- Mode Demo deterministik untuk presentasi tanpa alat fisik.
- Mode Sensor untuk membaca JSON ESP32 setiap 2 detik.
- Dashboard suhu, RH, VPD, suhu kondensor, titik embun, status Peltier, air, energi, dan tandon.
- Fail-safe demonstratif, system health, log operasi, telemetry lokal, dan ekspor CSV.
- Halaman WATER–DATA–POWER, tata kelola komunitas, panduan, serta batas klaim ilmiah.
- Data yang tidak tersedia pada Mode Sensor ditampilkan sebagai `—`, bukan diganti simulasi.
- Nama tim: **Ananda Restu Sarivatunisa** dan **Puthut Bagus Ferdyansyah**.

## Menjalankan di VS Code

Jangan hanya double-click `index.html` bila ingin menguji PWA/sensor. Gunakan server lokal.

### Opsi 1 — Live Server
1. Buka folder ini di VS Code.
2. Install extension **Live Server**.
3. Klik kanan `index.html` → **Open with Live Server**.

### Opsi 2 — Python
```bash
python -m http.server 8080
```
Lalu buka `http://localhost:8080`.

## Deploy sebagai website

Semua file pada folder ini dapat langsung diunggah ke hosting statis seperti Netlify, GitHub Pages, Cloudflare Pages, atau Vercel static hosting. Entry point-nya adalah `index.html` dan tidak memerlukan build framework.

## Catatan penting Mode Sensor di browser

ESP32 contoh memakai endpoint HTTP, misalnya:

`http://192.168.4.1/api/status`

Browser modern yang membuka website melalui **HTTPS** biasanya memblokir request ke endpoint **HTTP** lokal sebagai mixed content. Karena itu ada tiga pola penggunaan:

1. **Presentasi publik / website HTTPS:** gunakan Mode Demo; seluruh fungsi UI, log, CSV, dan offline PWA tetap berjalan.
2. **Uji sensor dari browser:** jalankan web melalui HTTP lokal pada jaringan yang sama dengan ESP32, kemudian gunakan endpoint ESP32.
3. **Web disajikan oleh ESP32 / same-origin:** endpoint `/api/status` dapat dipakai dan tidak terkena masalah mixed content.

Sketch ESP32 yang disertakan sudah mengirim header CORS.

## File utama

- `index.html` — struktur antarmuka.
- `styles.css` — tema visual final responsif.
- `app.js` — simulasi, sensor, chart, log, CSV, PWA.
- `manifest.webmanifest` — metadata instalasi PWA.
- `sw.js` — cache offline untuk app shell.
- `assets/` — logo dan ikon.
- `esp32/` — server demo dan template sensor.
- `docs/ESP32_PROTOCOL.md` — format JSON sensor.
- `WEB_TEST_CHECKLIST.md` — checklist sebelum demonstrasi.

## Posisi ilmiah

Mode Demo harus selalu dipahami sebagai **data simulasi**, bukan bukti performa perangkat fisik. ANFIS belum dinyatakan aktif. Sensor, energi, kondensat, mutu air, dan dampak sosial baru boleh disebut hasil setelah ada pengujian nyata yang memadai.
