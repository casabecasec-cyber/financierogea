// netlify/functions/mercado.js
// Datos de mercado para el Dashboard (GET /api/mercado):
//  - Bolsa de EE.UU. (S&P 500, Dow Jones, Nasdaq, Russell 2000, VIX, bono 10 años) vía Yahoo Finance,
//    con respaldo en Stooq. Son cotizaciones públicas, con el retraso que fije la fuente (normalmente 15 min).
//  - Tasas de interés del Banco Central del Ecuador: se intenta leer la página pública del BCE y extraer
//    los segmentos (productivo, consumo, vivienda, inmobiliario, microcrédito…). Si el BCE cambia su
//    página o bloquea al servidor, la respuesta lo indica con ok:false (nunca inventa valores).
// No requiere claves de API.

const H = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json", "Cache-Control": "public, max-age=30" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const INDICES = [
  ["^GSPC", "S&P 500"], ["^DJI", "Dow Jones"], ["^IXIC", "Nasdaq Composite"],
  ["^RUT", "Russell 2000"], ["^VIX", "VIX (volatilidad)"], ["^TNX", "Bono EE.UU. 10 años (%)"]
];
const STOOQ = { "^GSPC": "^spx", "^DJI": "^dji", "^IXIC": "^ndq" };

async function conTiempo(url, ms = 7000, extra = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, "Accept": "*/*", ...extra } }); }
  finally { clearTimeout(t); }
}

async function yahoo(sym, nombre) {
  const r = await conTiempo(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json(); const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error("sin datos");
  const m = res.meta || {}; const precio = m.regularMarketPrice;
  // cierre anterior: penúltimo cierre diario (más fiable que chartPreviousClose en rangos > 1d)
  const cierres = ((res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || []).filter(x => x != null);
  const prev = cierres.length >= 2 ? cierres[cierres.length - 2] : (m.previousClose || m.chartPreviousClose);
  if (precio == null || prev == null) throw new Error("incompleto");
  return { simbolo: sym, nombre, precio, previo: prev, cambio: precio - prev, pct: (precio - prev) / prev * 100,
    hora: m.regularMarketTime ? m.regularMarketTime * 1000 : null, estado: m.marketState || null, fuente: "Yahoo Finance" };
}

async function stooq(sym, nombre) {
  const s = STOOQ[sym]; if (!s) throw new Error("sin respaldo");
  const r = await conTiempo(`https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = (await r.text()).trim().split(/\r?\n/); const c = (t[1] || "").split(",");
  const open = parseFloat(c[3]), close = parseFloat(c[6]);
  if (!isFinite(close)) throw new Error("incompleto");
  return { simbolo: sym, nombre, precio: close, previo: isFinite(open) ? open : null, cambio: isFinite(open) ? close - open : null,
    pct: isFinite(open) ? (close - open) / open * 100 : null, hora: Date.parse(`${c[1]}T${c[2]}Z`) || null, estado: null, fuente: "Stooq (respaldo, variación vs. apertura)" };
}

async function bolsa() {
  const out = await Promise.all(INDICES.map(async ([sym, nombre]) => {
    try { return await yahoo(sym, nombre); }
    catch (e1) { try { return await stooq(sym, nombre); } catch (e2) { return { simbolo: sym, nombre, error: String(e1.message || e1) }; } }
  }));
  return out;
}

// ── BCE: extracción best-effort de la página pública de tasas ──
const SEGMENTOS = ["Productivo Corporativo", "Productivo Empresarial", "Productivo PYMES", "Consumo", "Educativo", "Vivienda de Interés Público", "Vivienda de Interés Social", "Inmobiliario", "Microcrédito Minorista", "Microcrédito de Acumulación Simple", "Microcrédito de Acumulación Ampliada", "Inversión Pública"];
function limpiar(html) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<\/(tr|p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").replace(/ ?\n ?/g, "\n"); }
async function bce() {
  const urls = [
    "https://contenido.bce.fin.ec/documentos/Estadisticas/SectorMonFin/TasasInteres/Indice.htm",
    "https://www.bce.fin.ec/informacion-estadistica/sector-monetario-y-financiero/tasas-de-interes"
  ];
  let ultimoError = "sin respuesta";
  for (const u of urls) {
    try {
      const r = await conTiempo(u, 9000); if (!r.ok) { ultimoError = u + " → HTTP " + r.status; continue; }
      const txt = limpiar(await r.text()); const filas = [];
      for (const seg of SEGMENTOS) {
        const i = txt.toLowerCase().indexOf(seg.toLowerCase()); if (i < 0) continue;
        const nums = (txt.slice(i + seg.length, i + seg.length + 120).match(/\d{1,2}[.,]\d{1,2}/g) || []).slice(0, 2).map(x => parseFloat(x.replace(",", ".")));
        if (nums.length) filas.push({ segmento: seg, referencial: nums[0], maxima: nums[1] != null ? nums[1] : null });
      }
      const f = (txt.match(/(?:vigente|vigencia|al)\s+(?:del?\s+)?(\d{1,2}\s+de\s+\w+\s+(?:de\s+)?\d{4}|\w+\s+\d{4})/i) || [])[1] || null;
      if (filas.length) return { ok: true, fuente: u, vigencia: f, filas };
      ultimoError = u + " → no se reconoció la tabla de tasas";
    } catch (e) { ultimoError = u + " → " + (e.message || e); }
  }
  return { ok: false, error: ultimoError };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: H, body: "" };
  const q = event.queryStringParameters || {}; const quiere = (q.q || "bolsa,bce").split(",");
  const [b, e] = await Promise.all([quiere.includes("bolsa") ? bolsa() : null, quiere.includes("bce") ? bce() : null]);
  return { statusCode: 200, headers: H, body: JSON.stringify({ ts: Date.now(), bolsa: b, bce: e }) };
};
