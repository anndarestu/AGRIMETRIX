/*
  AGRIMETRIX FESTAFORA 2026 - REAL SENSOR TEMPLATE
  -------------------------------------------------
  Template awal untuk ESP32 + DHT22 + 2x DS18B20 + relay/MOSFET driver.
  WAJIB sesuaikan pin, rangkaian driver, pendinginan sisi panas, kalibrasi,
  sensor tandon, pengukuran energi, dan fail-safe dengan perangkat nyata.

  Library eksternal Arduino IDE:
    - DHT sensor library (Adafruit)
    - Adafruit Unified Sensor
    - OneWire
    - DallasTemperature

  PENTING: jangan menghubungkan Peltier langsung ke pin ESP32. Gunakan
  driver/relay/MOSFET dan catu daya yang sesuai serta proteksi kelistrikan.
*/

#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* AP_SSID = "AGRIMETRIX_Hardware";
const char* AP_PASSWORD = "agrimetrixbisa";

#define DHT_PIN 4
#define DHT_TYPE DHT22
#define SURFACE_ONEWIRE_PIN 18
#define HOTSIDE_ONEWIRE_PIN 19
#define TANK_FULL_PIN 27
#define PELTIER_RELAY_PIN 23

// Sesuaikan logika relay dengan modul Anda.
const int RELAY_ON = LOW;
const int RELAY_OFF = HIGH;
const float RH_ON = 80.0f;
const float RH_OFF = 75.0f;
const float HOTSIDE_LIMIT_C = 60.0f;

DHT dht(DHT_PIN, DHT_TYPE);
OneWire surfaceBus(SURFACE_ONEWIRE_PIN);
OneWire hotSideBus(HOTSIDE_ONEWIRE_PIN);
DallasTemperature surfaceSensor(&surfaceBus);
DallasTemperature hotSideSensor(&hotSideBus);
WebServer server(80);

float airTempC = NAN;
float humidity = NAN;
float surfaceTempC = NAN;
float hotSideTempC = NAN;
bool peltierOn = false;
bool sensorOk = false;
bool overheat = false;
bool tankFull = false;
unsigned long lastReadMs = 0;

void updateSensorsAndControl() {
  unsigned long now = millis();
  if (now - lastReadMs < 2000) return;
  lastReadMs = now;

  airTempC = dht.readTemperature();
  humidity = dht.readHumidity();
  surfaceSensor.requestTemperatures();
  hotSideSensor.requestTemperatures();
  surfaceTempC = surfaceSensor.getTempCByIndex(0);
  hotSideTempC = hotSideSensor.getTempCByIndex(0);
  tankFull = digitalRead(TANK_FULL_PIN) == LOW; // sesuaikan dengan sensor Anda

  bool dhtValid = !isnan(airTempC) && !isnan(humidity);
  bool surfaceValid = surfaceTempC > -100.0f && surfaceTempC < 100.0f;
  bool hotSideValid = hotSideTempC > -100.0f && hotSideTempC < 120.0f;
  sensorOk = dhtValid && surfaceValid && hotSideValid;
  overheat = hotSideValid && hotSideTempC >= HOTSIDE_LIMIT_C;

  // Fail-safe utama: sensor gagal, overheat, atau tandon penuh => Peltier OFF.
  if (!sensorOk || overheat || tankFull) {
    peltierOn = false;
  } else {
    // Kendali awal rule-based + histeresis.
    if (!peltierOn && humidity >= RH_ON) peltierOn = true;
    if (peltierOn && humidity <= RH_OFF) peltierOn = false;
  }

  digitalWrite(PELTIER_RELAY_PIN, peltierOn ? RELAY_ON : RELAY_OFF);
}

String numberOrNull(float value, int digits = 2) {
  return isnan(value) ? "null" : String(value, digits);
}

void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
}

void handleStatus() {
  updateSensorsAndControl();

  String json = "{";
  json += "\"mode\":\"sensor\",";
  json += "\"temperature\":" + numberOrNull(airTempC) + ",";
  json += "\"humidity\":" + numberOrNull(humidity) + ",";
  json += "\"surfaceTemp\":" + numberOrNull(surfaceTempC) + ",";
  json += "\"hotSideTemp\":" + numberOrNull(hotSideTempC) + ",";

  // Hubungkan sensor level/flow/energy meter nyata sebelum mengganti null berikut.
  json += "\"tankPercent\":null,";
  json += "\"condensateMl\":null,";
  json += "\"reusedMl\":null,";
  json += "\"energyPeltierWh\":null,";
  json += "\"energyOtherWh\":null,";

  json += "\"peltierOn\":" + String(peltierOn ? "true" : "false") + ",";
  json += "\"sensorOk\":" + String(sensorOk ? "true" : "false") + ",";
  json += "\"overheat\":" + String(overheat ? "true" : "false") + ",";
  json += "\"tankFull\":" + String(tankFull ? "true" : "false") + ",";
  json += "\"waterQualityStatus\":\"not_tested\",";
  json += "\"uptimeMs\":" + String(millis());
  json += "}";

  addCors();
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  pinMode(TANK_FULL_PIN, INPUT_PULLUP);
  pinMode(PELTIER_RELAY_PIN, OUTPUT);
  digitalWrite(PELTIER_RELAY_PIN, RELAY_OFF);

  dht.begin();
  surfaceSensor.begin();
  hotSideSensor.begin();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.print("AGRIMETRIX AP IP: ");
  Serial.println(WiFi.softAPIP());

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/", HTTP_GET, [](){
    addCors();
    server.send(200, "text/plain", "AGRIMETRIX sensor template aktif. Gunakan /api/status");
  });
  server.begin();
}

void loop() {
  server.handleClient();
  updateSensorsAndControl();
  delay(5);
}
