/*
  AGRIMETRIX FESTAFORA 2026 - ESP32 DEMO SERVER
  ------------------------------------------------
  Tujuan: menguji koneksi AGRIMETRIX Web/Android <-> ESP32 tanpa sensor eksternal.
  Data di endpoint /api/status adalah SIMULASI dari ESP32, bukan hasil sensor.

  Wi-Fi AP:
    SSID     : AGRIMETRIX_Hardware
    Password : agrimetrixbisa
  Endpoint:
    http://192.168.4.1/api/status
*/

#include <WiFi.h>
#include <WebServer.h>

const char* AP_SSID = "AGRIMETRIX_Hardware";
const char* AP_PASSWORD = "agrimetrixbisa";
WebServer server(80);

float tempC = 26.5f;
float rh = 72.0f;
float surfaceC = 25.0f;
float hotSideC = 34.0f;
float condensateMl = 0.0f;
float reusedMl = 0.0f;
float energyPeltierWh = 0.0f;
float energyOtherWh = 0.0f;
bool peltierOn = false;
unsigned long lastUpdateMs = 0;

float dewPoint(float t, float humidity) {
  const float a = 17.27f, b = 237.7f;
  float g = ((a * t) / (b + t)) + log(humidity / 100.0f);
  return (b * g) / (a - g);
}

void updateSimulation() {
  unsigned long now = millis();
  if (lastUpdateMs == 0) lastUpdateMs = now;
  float dtHours = (now - lastUpdateMs) / 3600000.0f;
  if (now - lastUpdateMs < 900) return;
  lastUpdateMs = now;

  float sec = now / 1000.0f;
  tempC = 26.5f + 0.25f * sin(sec / 9.0f);

  if (!peltierOn) rh += 0.20f;
  else rh -= 0.16f;
  rh = constrain(rh, 68.0f, 88.0f);

  if (!peltierOn && rh >= 80.0f) peltierOn = true;
  if (peltierOn && rh <= 75.0f) peltierOn = false;

  if (peltierOn) {
    surfaceC += (11.0f - surfaceC) * 0.12f;
    hotSideC += (45.0f - hotSideC) * 0.10f;
  } else {
    surfaceC += ((tempC - 1.0f) - surfaceC) * 0.10f;
    hotSideC += (34.0f - hotSideC) * 0.12f;
  }

  energyOtherWh += 8.0f * dtHours;
  if (peltierOn) energyPeltierWh += 60.0f * dtHours;

  float dp = dewPoint(tempC, rh);
  if (peltierOn && surfaceC < dp) {
    float rateMlPerHour = 420.0f;
    condensateMl += rateMlPerHour * dtHours;
    if (condensateMl > 60.0f && reusedMl < condensateMl * 0.55f) {
      reusedMl += rateMlPerHour * 0.25f * dtHours;
    }
  }
}

void addCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
}

void handleStatus() {
  updateSimulation();
  float tankPercent = constrain(12.0f + condensateMl / 25.0f, 12.0f, 95.0f);
  bool overheat = hotSideC >= 60.0f;
  bool sensorOk = true;

  String json = "{";
  json += "\"mode\":\"esp32_demo_simulation\",";
  json += "\"temperature\":" + String(tempC, 2) + ",";
  json += "\"humidity\":" + String(rh, 2) + ",";
  json += "\"surfaceTemp\":" + String(surfaceC, 2) + ",";
  json += "\"hotSideTemp\":" + String(hotSideC, 2) + ",";
  json += "\"tankPercent\":" + String(tankPercent, 1) + ",";
  json += "\"condensateMl\":" + String(condensateMl, 1) + ",";
  json += "\"reusedMl\":" + String(reusedMl, 1) + ",";
  json += "\"energyPeltierWh\":" + String(energyPeltierWh, 3) + ",";
  json += "\"energyOtherWh\":" + String(energyOtherWh, 3) + ",";
  json += "\"peltierOn\":" + String(peltierOn ? "true" : "false") + ",";
  json += "\"sensorOk\":" + String(sensorOk ? "true" : "false") + ",";
  json += "\"overheat\":" + String(overheat ? "true" : "false") + ",";
  json += "\"tankFull\":false,";
  json += "\"waterQualityStatus\":\"not_tested\",";
  json += "\"uptimeMs\":" + String(millis());
  json += "}";

  addCors();
  server.send(200, "application/json", json);
}

void handleRoot() {
  addCors();
  server.send(200, "text/plain",
    "AGRIMETRIX ESP32 demo server aktif. Buka /api/status untuk JSON. Data adalah simulasi ESP32.");
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.println();
  Serial.println("AGRIMETRIX ESP32 DEMO SERVER");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.onNotFound([](){
    addCors();
    server.send(404, "application/json", "{\"error\":\"not_found\"}");
  });
  server.begin();
}

void loop() {
  server.handleClient();
  updateSimulation();
  delay(5);
}
