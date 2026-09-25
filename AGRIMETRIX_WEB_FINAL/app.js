(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nowClock = () => new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  const SIM_SECONDS_PER_REAL_SECOND = 120;
  const APP_VERSION = '1.0.0';
  let deferredInstallPrompt = null;
  const STORAGE = {
    mode: 'agrimetrix_source_mode_v3', endpoint: 'agrimetrix_endpoint_v3', logs: 'agrimetrix_logs_v3', telemetry: 'agrimetrix_telemetry_v3'
  };

  const state = {
    sourceMode: localStorage.getItem(STORAGE.mode) === 'sensor' ? 'sensor' : 'demo',
    endpoint: localStorage.getItem(STORAGE.endpoint) || 'http://192.168.4.1/api/status',
    pendingMode: 'demo',
    running: false, elapsedSec: 0, temp: 26.5, rh: 72, surface: 25, hotSide: 34,
    waterMl: 0, reuseMl: 0, energyPeltier: 0, energyOther: 0, tank: 12,
    peltier: false, failsafe: false, sensorOk: true, overheat: false, tankFull: false,
    waterQualityStatus: 'not_tested', lastSensorAt: 0, sensorError: '', sensorWasStale: false,
    logs: [], telemetry: [], chart: []
  };

  let demoTimer = null;
  let sensorTimer = null;
  let uiTimer = null;
  let toastTimer = null;
  const nativeCallbacks = new Map();

  window.__agrimetrixNativeHttpResult = (callbackId, ok, payload) => {
    const cb = nativeCallbacks.get(String(callbackId));
    if (!cb) return;
    nativeCallbacks.delete(String(callbackId));
    ok ? cb.resolve(payload) : cb.reject(new Error(payload || 'Koneksi gagal'));
  };

  function initSplash() {
    const splash = $('splashScreen');
    if (!splash) return;
    const hide = () => splash.classList.add('hidden');
    window.setTimeout(hide, 1050);
    splash.addEventListener('click', hide, {once:true});
  }

  function saturationVaporPressure(t) { return 0.61078 * Math.exp((17.27 * t) / (t + 237.3)); }
  function vpd(t, rh) { return isNum(t) && isNum(rh) ? saturationVaporPressure(t) * (1 - rh / 100) : null; }
  function dewPoint(t, rh) {
    if (!isNum(t) || !isNum(rh) || rh <= 0 || rh > 100) return null;
    const a = 17.27, b = 237.7, g = ((a * t) / (b + t)) + Math.log(rh / 100);
    return (b * g) / (a - g);
  }
  function fmtClock(sec) {
    const simMin = Math.floor(sec * 2), h = Math.floor(simMin / 60), m = simMin % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} simulasi`;
  }
  function textNum(v, digits = 1) { return isNum(v) ? v.toFixed(digits) : '—'; }
  function boolFrom(v, fallback = false) {
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'on') return true;
    if (v === 0 || v === '0' || String(v).toLowerCase() === 'false' || String(v).toLowerCase() === 'off') return false;
    return fallback;
  }
  function numberFrom(obj, keys) {
    for (const key of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
        const n = Number(obj[key]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function addLog(kind, msg, persist = true) {
    const item = {time: nowClock(), iso: new Date().toISOString(), source: state.sourceMode, kind, msg};
    state.logs.unshift(item);
    state.logs = state.logs.slice(0, 120);
    if (persist) localStorage.setItem(STORAGE.logs, JSON.stringify(state.logs));
    renderLogs();
  }
  function loadLocalData() {
    try { state.logs = JSON.parse(localStorage.getItem(STORAGE.logs) || '[]'); } catch { state.logs = []; }
    try { state.telemetry = JSON.parse(localStorage.getItem(STORAGE.telemetry) || '[]'); } catch { state.telemetry = []; }
    if (!state.logs.length) addLog('SISTEM', 'Purwarupa demonstrasi siap. Sumber data dapat dipilih antara Demo dan ESP32.', true);
  }
  function addTelemetry() {
    const row = {
      iso: new Date().toISOString(), source: state.sourceMode,
      temperature: state.temp, humidity: state.rh, vpd: vpd(state.temp, state.rh),
      surfaceTemp: state.surface, hotSideTemp: state.hotSide, condensateMl: state.waterMl,
      reusedMl: state.reuseMl, energyPeltierKWh: state.energyPeltier, energyOtherKWh: state.energyOther,
      tankPercent: state.tank, peltierOn: state.peltier, sensorOk: state.sensorOk, overheat: state.overheat
    };
    state.telemetry.unshift(row);
    state.telemetry = state.telemetry.slice(0, 500);
    localStorage.setItem(STORAGE.telemetry, JSON.stringify(state.telemetry));
  }
  function renderLogs() {
    const list = $('logList'); if (!list) return;
    if (!state.logs.length) {
      list.innerHTML = '<div class="log-row"><span class="log-message">Belum ada catatan.</span></div>';
      return;
    }
    list.innerHTML = state.logs.slice(0, 40).map(x => `<div class="log-row"><span class="log-time">${escapeHtml(x.time)}</span><span class="log-kind">${escapeHtml(x.kind)}</span><span class="log-message">${escapeHtml(x.msg)}</span></div>`).join('');
  }
  function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function clearSensorMetrics() {
    Object.assign(state, {
      running:false, elapsedSec:0, temp:null, rh:null, surface:null, hotSide:null,
      waterMl:null, reuseMl:null, energyPeltier:null, energyOther:null, tank:null,
      peltier:false, failsafe:false, sensorOk:true, overheat:false, tankFull:false,
      waterQualityStatus:'not_tested', lastSensorAt:0, sensorError:'', sensorWasStale:false, chart:[]
    });
  }

  function resetDemo(log = true) {
    Object.assign(state, {
      running:false, elapsedSec:0, temp:26.5, rh:72, surface:25, hotSide:34,
      waterMl:0, reuseMl:0, energyPeltier:0, energyOther:0, tank:12,
      peltier:false, failsafe:false, sensorOk:true, overheat:false, tankFull:false,
      waterQualityStatus:'not_tested', sensorError:'', chart:[]
    });
    for (let i = 0; i < 20; i++) state.chart.push({temp:26.5, rh:72});
    if (log) addLog('DEMO', 'Skenario direset ke kondisi awal.');
    render();
  }

  function simulateOneSecond() {
    state.elapsedSec++;
    const t = state.elapsedSec;
    state.temp = 26.5 + 0.35 * Math.sin(t / 8) + (t > 18 && t < 48 ? 0.15 : 0);
    if (state.failsafe) {
      state.hotSide += 2.9;
      state.overheat = state.hotSide >= 60;
      if (state.overheat) {
        state.peltier = false; state.running = false;
        addLog('FAIL-SAFE', `Peltier dihentikan: suhu sisi panas ${state.hotSide.toFixed(1)} °C melewati batas demo.`);
      }
    } else {
      if (t < 20) state.rh += 0.47;
      else if (state.peltier) state.rh -= 0.38;
      else if (t < 58) state.rh += 0.12;
      else state.rh -= 0.08;
      state.rh = clamp(state.rh, 68, 90);

      if (!state.peltier && state.rh >= 80 && state.tank < 95) {
        state.peltier = true;
        addLog('KENDALI', `RH ${state.rh.toFixed(1)}% mencapai ambang demo. Peltier diaktifkan (rule-based).`);
      }
      if (state.peltier && state.rh <= 75) {
        state.peltier = false;
        addLog('KENDALI', `RH turun ke ${state.rh.toFixed(1)}%. Peltier dihentikan oleh histeresis demo.`);
      }
      if (state.peltier) {
        state.surface += (10.5 - state.surface) * 0.18;
        state.hotSide += (45 - state.hotSide) * 0.16;
      } else {
        state.surface += (state.temp - 1 - state.surface) * 0.12;
        state.hotSide += (34 - state.hotSide) * 0.16;
      }
      const dp = dewPoint(state.temp, state.rh);
      const condensing = state.peltier && isNum(dp) && state.surface < dp;
      const simHours = SIM_SECONDS_PER_REAL_SECOND / 3600;
      state.energyOther += 0.008 * simHours;
      if (state.peltier) state.energyPeltier += 0.060 * simHours;
      if (condensing) {
        const humidityFactor = clamp((state.rh - 70) / 15, .25, 1.2);
        const coolingFactor = clamp((dp - state.surface) / 8, .15, 1.2);
        const rateMlPerHour = 520 * humidityFactor * coolingFactor;
        state.waterMl += rateMlPerHour * simHours;
        if (state.waterMl > 80) state.reuseMl += Math.min(rateMlPerHour * .55 * simHours, state.waterMl - state.reuseMl);
        state.tank = clamp(12 + state.waterMl / 25, 12, 95);
      }
    }
    state.chart.push({temp:state.temp, rh:state.rh});
    if (state.chart.length > 28) state.chart.shift();
    addTelemetry();
    render();
    if (t === 20) addLog('MIKROKLIMAT', 'RH tinggi memicu evaluasi kendali dan pendinginan kondensor.');
    if (t === 34) addLog('AIR', 'Kondensasi demonstratif mulai tercatat setelah permukaan berada di bawah titik embun.');
  }

  function startDemo() {
    if (state.sourceMode !== 'demo') return;
    if (state.failsafe && state.overheat) { addLog('SISTEM', 'Reset diperlukan setelah uji fail-safe.'); showToast('Reset dulu setelah fail-safe.'); return; }
    state.running = true;
    addLog('DEMO', 'Skenario demonstrasi dimulai.');
    if (!demoTimer) demoTimer = setInterval(() => { if (state.running && state.sourceMode === 'demo') simulateOneSecond(); }, 1000);
    render();
  }
  function pauseDemo() { if (state.sourceMode !== 'demo') return; state.running = false; addLog('DEMO', 'Skenario dijeda.'); render(); }
  function triggerFailsafe() {
    if (state.sourceMode !== 'demo') return;
    state.failsafe = true; state.peltier = true; state.running = true; state.hotSide = Math.max(state.hotSide, 49);
    addLog('UJI', 'Uji fail-safe termal dimulai. Ini adalah skenario demonstrasi, bukan uji perangkat fisik.');
    if (!demoTimer) demoTimer = setInterval(() => { if (state.running && state.sourceMode === 'demo') simulateOneSecond(); }, 1000);
    render();
  }

  function nativeHttpGet(url, timeoutMs = 2600) {
    if (window.AndroidBridge && typeof window.AndroidBridge.httpGet === 'function') {
      return new Promise((resolve, reject) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        nativeCallbacks.set(id, {resolve, reject});
        try { window.AndroidBridge.httpGet(url, id, timeoutMs); }
        catch (e) { nativeCallbacks.delete(id); reject(e); }
        setTimeout(() => {
          if (nativeCallbacks.has(id)) { nativeCallbacks.delete(id); reject(new Error('Waktu koneksi habis')); }
        }, timeoutMs + 900);
      });
    }
    if (window.location.protocol === 'https:' && /^http:\/\//i.test(url)) {
      return Promise.reject(new Error('Browser HTTPS memblokir endpoint HTTP ESP32. Gunakan web melalui HTTP lokal/same-origin, atau bungkus web ini di Android WebView.'));
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    return fetch(url, {cache:'no-store', signal:controller ? controller.signal : undefined})
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  function normalizeEndpoint(value) {
    let url = String(value || '').trim();
    if (!url) throw new Error('Endpoint kosong');
    let parsed;
    if (url.startsWith('/')) {
      if (window.location.protocol === 'file:') throw new Error('Same-origin membutuhkan web dijalankan melalui HTTP/HTTPS, bukan file://');
      parsed = new URL(url, window.location.origin);
    } else {
      if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
      parsed = new URL(url);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Gunakan endpoint HTTP/HTTPS');
    return parsed.toString();
  }

  function applySensorPayload(payload, quiet = false) {
    let data;
    try { data = typeof payload === 'string' ? JSON.parse(payload) : payload; }
    catch { throw new Error('Respons ESP32 bukan JSON yang valid'); }
    if (!data || typeof data !== 'object') throw new Error('JSON ESP32 kosong');

    state.temp = numberFrom(data, ['temperature','temp','suhu']);
    state.rh = numberFrom(data, ['humidity','rh','kelembapan']);
    state.surface = numberFrom(data, ['surfaceTemp','surfaceTemperature','condenserTemp','suhuKondensor']);
    state.hotSide = numberFrom(data, ['hotSideTemp','hotSideTemperature','suhuSisiPanas']);
    state.tank = numberFrom(data, ['tankPercent','tank','tandonPercent']);
    state.waterMl = numberFrom(data, ['condensateMl','waterMl','kondensatMl']);
    state.reuseMl = numberFrom(data, ['reusedMl','reuseMl','usedAgainMl']);

    const pWh = numberFrom(data, ['energyPeltierWh','peltierWh']);
    const pKwh = numberFrom(data, ['energyPeltierKWh','peltierKWh']);
    state.energyPeltier = isNum(pKwh) ? pKwh : (isNum(pWh) ? pWh / 1000 : null);
    const oWh = numberFrom(data, ['energyOtherWh','otherWh']);
    const oKwh = numberFrom(data, ['energyOtherKWh','otherKWh']);
    state.energyOther = isNum(oKwh) ? oKwh : (isNum(oWh) ? oWh / 1000 : null);

    state.peltier = boolFrom(data.peltierOn ?? data.peltier ?? data.cooling, false);
    state.sensorOk = boolFrom(data.sensorOk, true);
    state.overheat = boolFrom(data.overheat, false);
    state.tankFull = boolFrom(data.tankFull, isNum(state.tank) ? state.tank >= 95 : false);
    state.waterQualityStatus = data.waterQualityStatus || 'not_tested';
    state.lastSensorAt = Date.now(); state.sensorError = ''; state.sensorWasStale = false;

    if (isNum(state.temp) && isNum(state.rh)) {
      state.chart.push({temp:state.temp, rh:state.rh});
      if (state.chart.length > 28) state.chart.shift();
    }
    addTelemetry();
    if (!quiet) addLog('SENSOR', 'Data ESP32 berhasil diterima dari endpoint lokal.');
    render();
    return data;
  }

  async function fetchSensor({quiet = true, endpoint = state.endpoint} = {}) {
    if (!endpoint) throw new Error('Endpoint belum diatur');
    const raw = await nativeHttpGet(endpoint);
    return applySensorPayload(raw, quiet);
  }

  async function pollSensorOnce(quiet = true) {
    if (state.sourceMode !== 'sensor') return;
    try {
      await fetchSensor({quiet});
      setConnectionStatus('good', 'Terhubung', `Data diterima ${nowClock()}`);
    } catch (e) {
      state.sensorError = e && e.message ? e.message : 'Koneksi gagal';
      setConnectionStatus('bad', 'Tidak terhubung', state.sensorError);
      if (!quiet) addLog('KONEKSI', `ESP32 gagal dihubungi: ${state.sensorError}`);
      render();
    }
  }

  function startSensorPolling() {
    stopSensorPolling();
    pollSensorOnce(false);
    sensorTimer = setInterval(() => pollSensorOnce(true), 2000);
  }
  function stopSensorPolling() { if (sensorTimer) { clearInterval(sensorTimer); sensorTimer = null; } }

  function setSourceMode(mode, {log = true} = {}) {
    const next = mode === 'sensor' ? 'sensor' : 'demo';
    state.sourceMode = next;
    localStorage.setItem(STORAGE.mode, next);
    state.running = false;
    if (next === 'sensor') {
      stopSensorPolling();
      clearSensorMetrics();
      if (log) addLog('SUMBER DATA', `Mode Sensor dipilih. Endpoint: ${state.endpoint}`);
      startSensorPolling();
    } else {
      stopSensorPolling();
      resetDemo(false);
      if (log) addLog('SUMBER DATA', 'Mode Demo dipilih. Seluruh angka kembali menjadi data simulasi.');
    }
    closeSourceModal();
    renderSourceUi(); render();
  }

  function renderSourceUi() {
    const sensor = state.sourceMode === 'sensor';
    $('demoControls').classList.toggle('hidden', sensor);
    $('sensorControls').classList.toggle('hidden', !sensor);
    $('sourceLabel').textContent = sensor ? 'SENSOR' : 'DEMO';
    $('sourceBtn').classList.toggle('sensor', sensor && !state.sensorError);
    $('sourceBtn').classList.toggle('error', sensor && !!state.sensorError);
    $('dataNotice').className = `notice${sensor ? (state.sensorError ? ' error' : ' sensor') : ''}`;
    $('dataNotice').innerHTML = sensor
      ? (state.sensorError ? `<strong>Mode sensor belum tersambung.</strong> ${escapeHtml(state.sensorError)}. Data tidak diganti dengan simulasi.` : '<strong>Mode sensor.</strong> Nilai berasal dari endpoint ESP32 lokal; parameter yang tidak dikirim ditampilkan sebagai “—”.')
      : '<strong>Mode simulasi.</strong> Angka di layar adalah data demonstrasi, bukan hasil pengujian greenhouse fisik.';
    $('waterPageCaption').textContent = sensor ? 'Nilai berasal dari endpoint ESP32 jika parameter tersedia.' : 'Semua angka di halaman ini mengikuti skenario simulasi.';
    $('sensorEndpointShort').textContent = sensor ? state.endpoint.replace(/^https?:\/\//,'') : 'ESP32 belum terhubung';
    $('sensorPollInfo').textContent = sensor ? 'Polling otomatis setiap 2 detik · read-only' : 'Polling berhenti';
    $('decisionEyebrow').textContent = sensor ? 'STATUS KENDALI DARI ESP32 · READ-ONLY APP' : 'KENDALI TAHAP PERTAMA · RULE-BASED';
    $('decisionCard').classList.toggle('sensor-readonly', sensor && !state.overheat);
    $('energyPeltierNote').textContent = sensor ? 'ditampilkan bila ESP32 mengirim meter energi' : 'simulasi 60 W saat aktif';
    $('energyOtherNote').textContent = sensor ? 'ditampilkan bila ESP32 mengirim meter energi' : 'simulasi 8 W';
    $('sensorStatusNote').textContent = sensor ? 'status dari endpoint' : 'status simulasi';
  }

  function render() {
    renderSourceUi();
    const dp = dewPoint(state.temp, state.rh);
    const delta = isNum(state.surface) && isNum(dp) ? state.surface - dp : null;
    const cond = state.peltier && isNum(state.surface) && isNum(dp) && state.surface < dp;
    const totalEnergy = (isNum(state.energyPeltier) ? state.energyPeltier : 0) + (isNum(state.energyOther) ? state.energyOther : 0);
    const lPerKwh = totalEnergy > .000001 && isNum(state.reuseMl) ? (state.reuseMl / 1000) / totalEnergy : null;

    $('tempVal').textContent = textNum(state.temp,1); $('rhVal').textContent = textNum(state.rh,1); $('vpdVal').textContent = textNum(vpd(state.temp,state.rh),2);
    $('surfaceVal').textContent = textNum(state.surface,1); $('surfaceVal2').textContent = textNum(state.surface,1); $('dewPointVal').textContent = textNum(dp,1);
    $('hotSideVal').textContent = textNum(state.hotSide,1); $('tankVal').textContent = isNum(state.tank) ? Math.round(state.tank) : '—'; $('tankValMetric').textContent = isNum(state.tank) ? Math.round(state.tank) : '—';
    $('simClock').textContent = fmtClock(state.elapsedSec);
    $('waterMl').textContent = isNum(state.waterMl) ? Math.round(state.waterMl) : '—'; $('reuseMl').textContent = isNum(state.reuseMl) ? Math.round(state.reuseMl) : '—';
    $('energyPeltier').textContent = textNum(state.energyPeltier,3); $('energyOther').textContent = textNum(state.energyOther,3); $('literPerKwh').textContent = isNum(lPerKwh) ? lPerKwh.toFixed(2) : '—';
    $('barCond').textContent = isNum(state.waterMl) ? `${Math.round(state.waterMl)} mL` : '—'; $('barReuse').textContent = isNum(state.reuseMl) ? `${Math.round(state.reuseMl)} mL` : '—'; $('barTank').textContent = isNum(state.tank) ? `${Math.round(state.tank)}%` : '—';
    $('barCondFill').style.width = `${isNum(state.waterMl) ? clamp(state.waterMl/5,0,100) : 0}%`; $('barReuseFill').style.width = `${isNum(state.reuseMl) ? clamp(state.reuseMl/5,0,100) : 0}%`; $('barTankFill').style.width = `${isNum(state.tank) ? clamp(state.tank,0,100) : 0}%`;
    $('dewDelta').textContent = isNum(delta) ? `${delta>=0?'+':''}${delta.toFixed(1)} °C` : '—';
    $('dewInfo').textContent = isNum(dp) && isNum(state.surface) ? (cond ? 'di bawah titik embun' : 'di atas titik embun') : 'data belum lengkap';
    $('waterRate').textContent = cond ? (state.sourceMode === 'sensor' ? 'kondisi kondensasi terindikasi' : 'kondensasi demonstratif berlangsung') : 'belum ada kondensasi terindikasi';
    $('condTag').textContent = cond ? 'AKTIF' : 'BELUM AKTIF'; $('condTag').className = `status-tag ${cond?'good':'neutral'}`;
    $('peltierSwitch').className = `switch ${state.peltier?'on':''}`; $('peltierText').textContent = state.peltier ? 'ON' : 'OFF';
    $('sensorStatus').textContent = state.sensorOk ? '✓ Normal' : '⚠ Gangguan';
    $('waterQualityState').textContent = waterQualityLabel(state.waterQualityStatus);

    if (state.sourceMode === 'sensor') {
      const age = state.lastSensorAt ? Date.now() - state.lastSensorAt : Infinity;
      const stale = age > 6500;
      $('sensorFreshness').textContent = state.lastSensorAt ? (stale ? 'DATA LAMA' : 'LIVE') : 'BELUM ADA DATA';
      $('sensorFreshness').className = `scale-badge ${stale ? 'stale' : ''}`;
      $('lastUpdate').textContent = state.lastSensorAt ? `Sensor · ${Math.round(age/1000)} dtk lalu` : 'Menunggu ESP32';
      if ((state.overheat || !state.sensorOk || state.tankFull)) {
        setDecisionAlert(sensorAlertText());
      } else if (state.sensorError && !state.lastSensorAt) {
        $('decisionCard').classList.remove('alert');
        $('decisionTitle').textContent = 'Menunggu koneksi ESP32'; $('decisionText').textContent = 'Pastikan ponsel dan ESP32 berada pada jaringan yang sama, lalu periksa endpoint.'; $('systemState').textContent = 'Sensor · belum tersambung';
      } else if (stale) {
        $('decisionCard').classList.remove('alert'); $('decisionTitle').textContent = 'Data sensor tidak segar'; $('decisionText').textContent = 'Aplikasi mempertahankan nilai terakhir dan tidak menggantinya dengan simulasi.'; $('systemState').textContent = 'Sensor · data lama';
      } else if (state.peltier) {
        $('decisionCard').classList.remove('alert'); $('decisionTitle').textContent = cond ? 'ESP32 melaporkan Peltier aktif · kondensasi terindikasi' : 'ESP32 melaporkan Peltier aktif'; $('decisionText').textContent = cond ? 'Permukaan berada di bawah titik embun berdasarkan data sensor yang diterima.' : 'Status aktuator berasal dari ESP32; aplikasi tidak mengubahnya.'; $('systemState').textContent = 'Sensor · Peltier aktif';
      } else {
        $('decisionCard').classList.remove('alert'); $('decisionTitle').textContent = 'ESP32 terhubung · monitoring'; $('decisionText').textContent = 'Aplikasi membaca telemetri dan menampilkan status kendali dari perangkat.'; $('systemState').textContent = 'Sensor · monitoring';
      }
    } else {
      $('lastUpdate').textContent = 'Sumber: simulasi';
      if (state.failsafe && state.overheat) setDecisionAlert('Suhu sisi panas melewati batas demo. Peltier dihentikan dan reset diperlukan.');
      else if (state.peltier) {
        $('decisionCard').classList.remove('alert'); $('decisionTitle').textContent = cond ? 'Kondensasi demonstratif berlangsung' : 'Mendinginkan permukaan kondensor'; $('decisionText').textContent = cond ? 'Permukaan berada di bawah titik embun. Volume air dan energi dicatat bersama.' : 'Peltier aktif, tetapi air baru dihitung ketika permukaan melewati titik embun.'; $('systemState').textContent = 'Demo · pemulihan air aktif';
      } else {
        $('decisionCard').classList.remove('alert'); $('decisionTitle').textContent = 'Memantau mikroklimat'; $('decisionText').textContent = 'Peltier menunggu. Sistem bekerja ketika kondisi pemicu dan keselamatan terpenuhi.'; $('systemState').textContent = state.running ? 'Demo · monitoring' : 'Standby · kondisi stabil';
      }
    }

    const healthAlert = state.overheat || !state.sensorOk || state.tankFull;
    $('healthTag').textContent = healthAlert ? 'PERINGATAN' : 'NORMAL'; $('healthTag').className = `status-tag ${healthAlert ? 'danger' : 'good'}`;
    $('failSafeState').textContent = healthAlert ? '⚠ Terpicu / perhatian' : '✓ Siap';
    updateLoop(cond);
    drawChart();
  }

  function waterQualityLabel(status) {
    const s = String(status || '').toLowerCase();
    if (['ok','passed','layak'].includes(s)) return '✓ Lulus pemeriksaan';
    if (['failed','not_ok','tidak_layak'].includes(s)) return '⚠ Tidak layak';
    return 'Belum diperiksa';
  }
  function sensorAlertText() {
    if (state.overheat) return 'ESP32 melaporkan kondisi overheat. Status Peltier harus mengikuti fail-safe perangkat.';
    if (!state.sensorOk) return 'ESP32 melaporkan gangguan sensor. Data perlu diperiksa sebelum keputusan operasi.';
    if (state.tankFull) return 'ESP32 melaporkan tandon penuh. Sistem pemulihan air perlu berhenti atau mengalihkan aliran.';
    return 'Periksa perangkat.';
  }
  function setDecisionAlert(text) {
    $('decisionCard').classList.add('alert'); $('decisionTitle').textContent = 'Fail-safe / perhatian perangkat'; $('decisionText').textContent = text; $('systemState').textContent = 'Peringatan · pemeriksaan diperlukan';
  }

  function updateLoop(condensing) {
    const loop = $('loopVisual');
    loop.classList.toggle('running', state.peltier || state.running);
    document.querySelectorAll('.loop-node').forEach(n => n.classList.remove('active'));
    const active = [];
    if ((isNum(state.temp) && isNum(state.rh)) || state.running) active.push('micro');
    if (state.peltier || (state.sourceMode === 'demo' && state.rh >= 80)) active.push('decision');
    if (state.peltier) active.push('cooling');
    if (condensing) active.push('water');
    if ((isNum(state.waterMl) && state.waterMl > 0) || state.telemetry.length) active.push('record');
    active.forEach(k => { const el = document.querySelector(`[data-loop="${k}"]`); if (el) el.classList.add('active'); });
    $('loopTag').textContent = state.overheat ? 'FAIL-SAFE' : (condensing ? 'CONDENSING' : (state.peltier ? 'COOLING' : (state.sourceMode === 'sensor' ? 'SENSOR' : 'STANDBY')));
    $('loopTag').className = `status-tag ${state.overheat ? 'danger' : (state.sourceMode === 'sensor' ? 'sensor' : (state.peltier ? 'good' : 'neutral'))}`;
  }

  function drawChart() {
    const c = $('microChart'); if (!c) return;
    const ctx = c.getContext('2d'), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width * dpr)), h = Math.round(230 * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.clearRect(0,0,w,h); const pad = 28 * dpr;
    ctx.strokeStyle = '#e4ece6'; ctx.lineWidth = 1 * dpr;
    for (let i=0;i<4;i++) { const y=pad+i*(h-2*pad)/3; ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke(); }
    if (!state.chart.length) {
      ctx.fillStyle='#7c8b82';ctx.font=`${11*dpr}px sans-serif`;ctx.textAlign='center';ctx.fillText('Menunggu data sensor…',w/2,h/2);return;
    }
    const draw = (key,min,max,color) => {
      ctx.beginPath(); let started=false;
      state.chart.forEach((p,i) => { if (!isNum(p[key])) return; const x=pad+i*(w-2*pad)/Math.max(1,state.chart.length-1); const y=h-pad-(p[key]-min)/(max-min)*(h-2*pad); if (!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y); });
      if (!started) return; ctx.strokeStyle=color;ctx.lineWidth=2.4*dpr;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    };
    draw('temp',20,35,'#df8a3d'); draw('rh',45,100,'#3f7fa8');
  }

  function csvEscape(v) { if (v === null || v === undefined) return ''; return '"' + String(v).replace(/"/g,'""') + '"'; }
  function exportCsv() {
    const header = ['record_type','timestamp','source','event_kind','message','temperature_C','humidity_RH','vpd_kPa','surface_C','hot_side_C','condensate_mL','reused_mL','energy_peltier_kWh','energy_other_kWh','tank_percent','peltier_on','sensor_ok','overheat'];
    const rows = [header];
    state.logs.slice().reverse().forEach(x => rows.push(['event',x.iso||'',x.source||'',x.kind||'',x.msg||'','','','','','','','','','','','','','']));
    state.telemetry.slice().reverse().forEach(x => rows.push(['telemetry',x.iso||'',x.source||'','','',x.temperature,x.humidity,x.vpd,x.surfaceTemp,x.hotSideTemp,x.condensateMl,x.reusedMl,x.energyPeltierKWh,x.energyOtherKWh,x.tankPercent,x.peltierOn,x.sensorOk,x.overheat]));
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    const name = `AGRIMETRIX_FESTAFORA_${state.sourceMode}_${new Date().toISOString().slice(0,10)}.csv`;
    if (window.AndroidBridge && typeof window.AndroidBridge.exportCsv === 'function') {
      window.AndroidBridge.exportCsv(csv,name); addLog('DATA','Permintaan ekspor CSV dikirim ke Android.');
    } else {
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);addLog('DATA','CSV diekspor dari browser.');
    }
  }

  function clearLocalRecords() {
    if (!window.confirm('Bersihkan log dan snapshot telemetri lokal?')) return;
    state.logs=[];state.telemetry=[];localStorage.removeItem(STORAGE.logs);localStorage.removeItem(STORAGE.telemetry);addLog('SISTEM','Catatan lokal dibersihkan.');showToast('Catatan lokal dibersihkan.');
  }

  function setConnectionStatus(kind, title, subtitle) {
    const box=$('connectionStatus'), dot=box.querySelector('.conn-dot'), texts=box.querySelectorAll('strong,small');
    dot.className=`conn-dot ${kind}`; texts[0].textContent=title; texts[1].textContent=subtitle;
  }
  function openSourceModal() {
    state.pendingMode = state.sourceMode;
    $('endpointInput').value = state.endpoint;
    updateModalMode();
    $('sourceModal').classList.remove('hidden');
    document.body.style.overflow='hidden';
  }
  function closeSourceModal() { $('sourceModal').classList.add('hidden'); document.body.style.overflow=''; }
  function updateModalMode() {
    document.querySelectorAll('.source-option').forEach(el => { const active=el.dataset.mode===state.pendingMode; el.classList.toggle('active',active); el.querySelector('i').textContent=active?'✓':''; });
    $('sensorConnectionFields').classList.toggle('hidden', state.pendingMode !== 'sensor');
    $('testConnectionBtn').classList.toggle('hidden', state.pendingMode !== 'sensor');
  }
  async function testConnection() {
    let endpoint;
    try { endpoint = normalizeEndpoint($('endpointInput').value); $('endpointInput').value=endpoint; }
    catch(e){ setConnectionStatus('bad','Endpoint tidak valid',e.message); return; }
    setConnectionStatus('wait','Menguji koneksi…','Menunggu respons ESP32.');
    try {
      const raw=await nativeHttpGet(endpoint,2800); const data=JSON.parse(raw);
      const t=numberFrom(data,['temperature','temp','suhu']), rh=numberFrom(data,['humidity','rh','kelembapan']);
      if (!isNum(t) && !isNum(rh)) throw new Error('JSON diterima, tetapi suhu/RH tidak ditemukan');
      setConnectionStatus('good','ESP32 merespons',`Suhu ${isNum(t)?t.toFixed(1):'—'} °C · RH ${isNum(rh)?rh.toFixed(1):'—'}%`);showToast('Koneksi ESP32 berhasil.');
    } catch(e){setConnectionStatus('bad','Koneksi gagal',e.message||'Tidak ada respons');}
  }
  function applySourceFromModal() {
    if (state.pendingMode==='sensor') {
      try { state.endpoint=normalizeEndpoint($('endpointInput').value); localStorage.setItem(STORAGE.endpoint,state.endpoint); }
      catch(e){setConnectionStatus('bad','Endpoint tidak valid',e.message);return;}
    }
    setSourceMode(state.pendingMode);
  }

  function updateNetworkState() {
    const el = $('networkState');
    if (!el) return;
    const online = navigator.onLine;
    el.textContent = online ? 'Browser online · data lokal tetap tersimpan' : 'Offline · Demo dan data lokal tetap tersedia';
    el.classList.toggle('offline', !online);
  }

  function initPwa() {
    const version = $('appVersion');
    if (version) version.textContent = `v${APP_VERSION}`;
    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);

    const installBtn = $('installBtn');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installBtn) installBtn.classList.remove('hidden');
    });
    if (installBtn) installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        showToast('Gunakan menu browser “Tambahkan ke layar utama” bila opsi Pasang belum tersedia.');
        return;
      }
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch (_) {}
      deferredInstallPrompt = null;
      installBtn.classList.add('hidden');
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installBtn) installBtn.classList.add('hidden');
      showToast('AGRIMETRIX terpasang di perangkat.');
    });

    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }, {once:true});
    }
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===btn.dataset.target));
    window.scrollTo({top:0,behavior:'smooth'}); setTimeout(drawChart,120);
  }));
  $('startBtn').addEventListener('click',startDemo); $('pauseBtn').addEventListener('click',pauseDemo); $('resetBtn').addEventListener('click',()=>resetDemo(true)); $('failsafeBtn').addEventListener('click',triggerFailsafe);
  $('exportBtn').addEventListener('click',exportCsv); $('clearLogsBtn').addEventListener('click',clearLocalRecords);
  $('sourceBtn').addEventListener('click',openSourceModal); $('openConnectionBtn').addEventListener('click',openSourceModal); $('closeModalBtn').addEventListener('click',closeSourceModal);
  $('sourceModal').addEventListener('click',e=>{if(e.target===$('sourceModal'))closeSourceModal();});
  document.querySelectorAll('.source-option').forEach(el=>el.addEventListener('click',()=>{state.pendingMode=el.dataset.mode;updateModalMode();}));
  document.querySelectorAll('.connection-presets button').forEach(el=>el.addEventListener('click',()=>{$('endpointInput').value=el.dataset.endpoint;}));
  $('testConnectionBtn').addEventListener('click',testConnection); $('applySourceBtn').addEventListener('click',applySourceFromModal); $('refreshSensorBtn').addEventListener('click',()=>pollSensorOnce(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('sourceModal').classList.contains('hidden'))closeSourceModal();});
  window.addEventListener('resize',()=>window.requestAnimationFrame(drawChart)); window.addEventListener('orientationchange',()=>setTimeout(drawChart,180));

  initSplash(); initPwa(); loadLocalData();
  if (state.sourceMode==='sensor') { state.pendingMode='sensor'; clearSensorMetrics(); startSensorPolling(); }
  else resetDemo(false);
  renderLogs();
  renderSourceUi(); render();
  uiTimer=setInterval(()=>{ if(state.sourceMode==='sensor') render(); },1000);
})();
