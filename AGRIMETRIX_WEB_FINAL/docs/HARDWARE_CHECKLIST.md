# Checklist menuju demo perangkat fisik

Gunakan daftar ini sebelum mengubah label aplikasi dari **Demo** menjadi **Sensor** di depan juri.

- [ ] ESP32 dapat diakses stabil dari ponsel selama ≥10 menit.
- [ ] Sensor suhu/RH dibandingkan dengan alat acuan dan hasilnya dicatat.
- [ ] Sensor suhu permukaan kondensor terpasang dengan kontak termal yang benar.
- [ ] Sensor sisi panas Peltier bekerja dan fail-safe mematikan Peltier saat batas terlampaui.
- [ ] Peltier memakai driver dan catu daya yang sesuai; bukan dari pin ESP32.
- [ ] Heat sink/kipas sisi panas terpasang sebelum Peltier dinyalakan.
- [ ] Tandon memiliki proteksi penuh atau prosedur penghentian yang jelas.
- [ ] Volume kondensat diukur dengan metode yang dapat dikalibrasi.
- [ ] Meter energi mengukur **seluruh perangkat yang relevan**, bukan hanya modul Peltier.
- [ ] Kondensat belum disebut layak irigasi sebelum pemeriksaan mutu yang sesuai.
- [ ] Skenario demo memiliki tombol/akses pemutusan daya fisik.
- [ ] Data simulasi dan data sensor selalu diberi label yang berbeda di presentasi.

## Catatan
Template firmware hanya titik awal integrasi. Nilai pin, ambang, rangkaian driver, catu daya, pelepasan panas, dan sensor harus disesuaikan dengan perangkat yang benar-benar dibuat dan diuji.
