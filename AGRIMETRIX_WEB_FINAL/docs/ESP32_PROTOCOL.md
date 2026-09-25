# Protokol ESP32 ↔ AGRIMETRIX Web

Mode Sensor membaca endpoint JSON lokal. Default contoh:

`http://192.168.4.1/api/status`

Polling dilakukan setiap **2 detik**. Web bersifat **read-only** terhadap aktuator pada versi FESTAFORA ini; keputusan Peltier dan fail-safe sebaiknya tetap dijalankan di ESP32 agar keselamatan tidak bergantung pada browser.

## JSON minimum

```json
{
  "temperature": 26.7,
  "humidity": 78.4
}
```

## JSON lengkap yang didukung

```json
{
  "temperature": 26.7,
  "humidity": 78.4,
  "surfaceTemp": 19.2,
  "hotSideTemp": 41.5,
  "tankPercent": 24,
  "condensateMl": 42,
  "reusedMl": 20,
  "energyPeltierWh": 12.4,
  "energyOtherWh": 2.1,
  "peltierOn": true,
  "sensorOk": true,
  "overheat": false,
  "tankFull": false,
  "waterQualityStatus": "not_tested"
}
```

Field yang belum mempunyai sensor/meter boleh dikirim sebagai `null` atau tidak dikirim. Web akan menampilkan `—`; Mode Sensor **tidak mengisi kekosongan dengan data simulasi**.

## Alias field

Web juga menerima beberapa alias, misalnya `temp`, `suhu`, `rh`, `kelembapan`, `condenserTemp`, `suhuKondensor`, `peltierWh`, dan `otherWh`.

## CORS

Bila web dan ESP32 berada pada origin berbeda, ESP32 perlu mengirim:

`Access-Control-Allow-Origin: *`

Sketch di folder `esp32/` sudah menyertakannya.

## HTTPS vs HTTP lokal

Jika website AGRIMETRIX dibuka dari HTTPS, browser dapat memblokir endpoint ESP32 HTTP sebagai **mixed content**. Untuk uji browser langsung, jalankan web melalui HTTP lokal pada jaringan yang sama, atau sajikan web dari ESP32 sehingga API menjadi same-origin (`/api/status`).
