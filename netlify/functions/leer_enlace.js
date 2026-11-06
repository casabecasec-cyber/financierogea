// netlify/functions/leer_enlace.js
// Intenta leer el contenido de un enlace público de Google Drive / Google Docs / OneDrive
// para que luego se pueda analizar con IA (como texto, o como PDF nativo).
//
// Limitaciones honestas:
// - Solo funciona con enlaces PÚBLICOS ("cualquiera con el enlace puede ver/descargar").
// - Google Drive casi siempre interpone una página de "confirmación de virus" antes de
//   entregar el archivo real, incluso para archivos pequeños. Esta función intenta
//   resolver ese paso automáticamente (extrayendo el token de confirmación de la propia
//   página), pero si Google cambia el formato de esa página, o exige inicio de sesión,
//   no hay forma de continuar desde aquí.
// - Google y Microsoft también pueden bloquear (HTTP 403) solicitudes automáticas que
//   vienen desde servidores en la nube, incluso cuando el enlace SÍ es público.
// - Formatos binarios que no sean PDF (Word, Excel, imágenes) no se leen automáticamente
//   por esta vía; hay que descargarlos y subirlos como archivo.

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Un User-Agent de navegador real reduce (no elimina) la probabilidad de que
// Google/Microsoft bloqueen la solicitud por parecer tráfico de bot/servidor.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_HEADERS = { "User-Agent": USER_AGENT, "Accept": "*/*" };

function extraerIdGoogleDrive(url) {
  const m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function extraerIdCarpetaDrive(url) {
  const m = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/)
    || url.match(/drive\.google\.com\/(?:embedded)?folderview\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function detectarUrlDirecta(url) {
  const idCarpeta = extraerIdCarpetaDrive(url);
  if (idCarpeta) return { tipoDetectado: "google_drive_carpeta", esCarpetaDrive: true, folderId: idCarpeta };
  if (extraerIdGoogleDrive(url) && /drive\.google\.com/.test(url)) {
    return { tipoDetectado: "google_drive_archivo", esGoogleDrive: true, fileId: extraerIdGoogleDrive(url) };
  }

  // Google Docs -> exportar como texto plano
  let m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { urlDirecta: `https://docs.google.com/document/d/${m[1]}/export?format=txt`, tipoDetectado: "google_doc" };

  // Google Sheets -> exportar como CSV
  m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { urlDirecta: `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`, tipoDetectado: "google_sheet" };

  // Google Slides -> exportar como texto plano
  m = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { urlDirecta: `https://docs.google.com/presentation/d/${m[1]}/export/txt`, tipoDetectado: "google_slides" };

  // OneDrive / SharePoint (enlaces cortos 1drv.ms o completos, personal o de empresa):
  // se maneja aparte con varios intentos (ver descargarDeOneDrive), porque la API
  // pública de Microsoft para esto ya no es confiable sin autenticación.
  if (/1drv\.ms|onedrive\.live\.com|sharepoint\.com/i.test(url)) {
    return { tipoDetectado: "onedrive", esOneDrive: true, urlOriginal: url };
  }

  // Enlace genérico: se intenta tal cual
  return { urlDirecta: url, tipoDetectado: "generico" };
}

// La API pública api.onedrive.com quedó prácticamente cerrada por Microsoft (exige
// autenticación incluso para archivos compartidos públicamente, respondiendo 401).
// Como respaldo, se intenta forzar la descarga añadiendo download=1 al enlace
// original, que en algunos enlaces personales (1drv.ms / onedrive.live.com) todavía
// funciona; en enlaces corporativos de SharePoint casi nunca funciona sin iniciar sesión.
async function descargarDeOneDrive(urlOriginal) {
  const base64 = Buffer.from(urlOriginal, "utf-8").toString("base64");
  const base64Url = "u!" + base64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  let resp = await fetch(`https://api.onedrive.com/v1.0/shares/${base64Url}/root/content`, { redirect: "follow", headers: FETCH_HEADERS });
  if (resp.ok) return { resp };
  const diagnosticoIntento1 = `Intento 1 (api.onedrive.com): HTTP ${resp.status}.`;

  const separador = urlOriginal.includes("?") ? "&" : "?";
  resp = await fetch(`${urlOriginal}${separador}download=1`, { redirect: "follow", headers: FETCH_HEADERS });
  if (resp.ok) {
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/json")) return { resp };
  }
  return { resp: null, agotado: true, diagnostico: `${diagnosticoIntento1} Intento 2 (download=1): HTTP ${resp.status}.` };
}

// Google Drive casi siempre entrega, en el primer intento, una página HTML de
// "no se puede analizar por virus" con un formulario que apunta a la descarga
// real. Aquí se intenta resolver ese paso automáticamente.
async function descargarDeGoogleDrive(fileId) {
  const intento1 = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
  let resp = await fetch(intento1, { redirect: "follow", headers: FETCH_HEADERS });
  let contentType = (resp.headers.get("content-type") || "").toLowerCase();

  if (resp.status === 403) return { resp, diagnostico: "HTTP 403 en el primer intento de descarga directa." };
  if (!contentType.includes("text/html")) return { resp };

  // Es HTML: probablemente la página de confirmación. Buscamos el token real.
  const html = await resp.text();
  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/) || html.match(/[?&]uuid=([a-zA-Z0-9_-]+)/);
  const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/) || html.match(/confirm=([0-9A-Za-z_-]+)/);
  const formActionMatch = html.match(/<form[^>]+action="([^"]+)"/);

  if (formActionMatch) {
    const accion = formActionMatch[1].replace(/&amp;/g, "&");
    const urlFormulario = accion.startsWith("http") ? accion : `https://drive.usercontent.google.com${accion}`;
    resp = await fetch(urlFormulario, { redirect: "follow", headers: FETCH_HEADERS });
    contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return { resp };
  }

  if (uuidMatch) {
    const intento2 = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuidMatch[1]}`;
    resp = await fetch(intento2, { redirect: "follow", headers: FETCH_HEADERS });
    contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return { resp };
  } else if (confirmMatch) {
    const intento2 = `https://drive.google.com/uc?export=download&confirm=${confirmMatch[1]}&id=${fileId}`;
    resp = await fetch(intento2, { redirect: "follow", headers: FETCH_HEADERS });
    contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return { resp };
  }

  // No se pudo resolver: devolvemos la respuesta HTML tal cual, con un fragmento
  // para diagnóstico (para poder mejorar esto si Google vuelve a cambiar el formato).
  return { resp, htmlNoResuelto: html.slice(0, 300) };
}

// Lista una carpeta PÚBLICA de Google Drive ("cualquiera con el enlace") usando
// la vista incrustada de Google (embeddedfolderview), que no requiere API key.
// Devuelve [{ nombre, url, esCarpeta }]. Solo lista: cada archivo se lee
// después con una llamada aparte (así no se pasa el límite de tiempo).
function decodificarHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}
async function listarCarpetaDrive(folderId) {
  const resp = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}`, { redirect: "follow", headers: FETCH_HEADERS });
  if (resp.status === 403 || resp.status === 404) return { estado: resp.status };
  if (!resp.ok) return { estado: resp.status };
  const html = await resp.text();
  const archivos = [];
  const vistos = new Set();
  // Cada elemento viene como <div class="flip-entry" id="entry-ID"> ... <a href="..."> ... <div class="flip-entry-title">Nombre</div>
  const bloques = html.split(/<div[^>]+class="flip-entry"/).slice(1);
  for (const b of bloques) {
    const href = (b.match(/<a[^>]+href="([^"]+)"/) || [])[1];
    const titulo = (b.match(/class="flip-entry-title"[^>]*>([^<]*)</) || [])[1];
    const idEntrada = (b.match(/id="entry-([a-zA-Z0-9_-]+)"/) || [])[1];
    let url = href ? decodificarHtml(href) : (idEntrada ? `https://drive.google.com/file/d/${idEntrada}/view` : null);
    if (!url) continue;
    if (url.startsWith("/")) url = "https://drive.google.com" + url;
    const esCarpeta = /\/folders\//.test(url) || /folderview/.test(url);
    const clave = url.split("?")[0];
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    archivos.push({ nombre: decodificarHtml(titulo) || "(sin nombre)", url, esCarpeta });
  }
  // Respaldo si Google cambió el formato: buscar enlaces a archivos sueltos.
  if (!archivos.length) {
    const re = /https:\/\/(?:drive\.google\.com\/file\/d|docs\.google\.com\/(?:document|spreadsheets|presentation)\/d)\/([a-zA-Z0-9_-]{20,})/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[0] + (m[0].includes("drive.google.com") ? "/view" : "/edit");
      if (vistos.has(m[1])) continue;
      vistos.add(m[1]);
      archivos.push({ nombre: `Archivo ${archivos.length + 1}`, url, esCarpeta: false });
    }
  }
  const requiereLogin = /accounts\.google\.com\/(?:ServiceLogin|signin)/i.test(html) && !archivos.length;
  return { estado: 200, archivos, requiereLogin, muestra: archivos.length ? "" : html.slice(0, 300) };
}

function mensajeError403(tipoDetectado) {
  const servicio = tipoDetectado?.startsWith("google") ? "Google Drive/Docs" : (tipoDetectado === "onedrive" ? "OneDrive" : "el servicio");
  return `${servicio} devolvió "Acceso denegado" (HTTP 403) a esta lectura automática. Esto casi siempre pasa aunque el enlace SÍ sea público ("cualquiera con el enlace puede ver") — ${servicio.split("/")[0]} bloquea por política las solicitudes automáticas que vienen desde servidores en la nube, no desde un navegador normal. No es un error de tu configuración y, lamentablemente, no se puede forzar desde aquí. Alternativa: descarga el archivo y súbelo directamente en "Adjuntar archivo" — eso sí funciona siempre.`;
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const { url } = payload;
  if (!url || !/^https?:\/\//i.test(url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta un enlace (URL) válido" }) };
  }

  const detectado = detectarUrlDirecta(url);
  const { tipoDetectado } = detectado;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let resp, diagnosticoExtra = "";
    if (detectado.esCarpetaDrive) {
      const lista = await listarCarpetaDrive(detectado.folderId);
      clearTimeout(timeoutId);
      if (lista.estado === 403 || lista.estado === 404 || lista.requiereLogin) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: `No se pudo abrir la carpeta de Google Drive (${lista.requiereLogin ? "pide iniciar sesión" : "HTTP " + lista.estado}). Verifica que la carpeta esté compartida como "Cualquiera con el enlace puede ver" (en Drive: clic derecho en la carpeta → Compartir → Acceso general → Cualquier persona con el enlace).` }) };
      }
      if (lista.estado !== 200) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: `Google Drive no respondió al listar la carpeta (HTTP ${lista.estado}). Intenta de nuevo en un momento.` }) };
      }
      if (!lista.archivos.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: "La carpeta de Google Drive está vacía, o no se pudo leer su lista de archivos. Si tiene archivos, verifica que esté compartida como \"Cualquiera con el enlace puede ver\"; si el problema sigue, comparte los archivos uno por uno o súbelos en un ZIP.", diagnostico: lista.muestra }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ tipo: "carpeta", archivos: lista.archivos.slice(0, 60), total: lista.archivos.length, tipoDetectado }) };
    }
    if (detectado.esGoogleDrive) {
      const resultado = await descargarDeGoogleDrive(detectado.fileId);
      resp = resultado.resp;
      if (resultado.diagnostico) diagnosticoExtra = resultado.diagnostico;
      if (resultado.htmlNoResuelto) {
        clearTimeout(timeoutId);
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            error: `Google Drive no entregó el archivo: interpuso una página de confirmación que esta función no pudo resolver automáticamente (puede pasar si el archivo requiere iniciar sesión, o si Google cambió el formato de esa página). Descarga el archivo manualmente y súbelo con "Adjuntar archivo" — eso funciona siempre.`,
            diagnostico: resultado.htmlNoResuelto,
          }),
        };
      }
    } else if (detectado.esOneDrive) {
      const resultado = await descargarDeOneDrive(detectado.urlOriginal);
      if (resultado.agotado) {
        clearTimeout(timeoutId);
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            error: `No se pudo leer este enlace de OneDrive/SharePoint de forma automática. Microsoft restringe cada vez más el acceso programático a archivos compartidos, incluso cuando el enlace es público — esto es una limitación real del lado de Microsoft, no de esta app ni de tu configuración de permisos. La única forma confiable en este caso es descargar el archivo y subirlo directamente con "Adjuntar archivo".`,
            diagnostico: resultado.diagnostico,
          }),
        };
      }
      resp = resultado.resp;
    } else {
      resp = await fetch(detectado.urlDirecta, { redirect: "follow", signal: controller.signal, headers: FETCH_HEADERS });
    }
    clearTimeout(timeoutId);

    if (resp.status === 403) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: mensajeError403(tipoDetectado) + (diagnosticoExtra ? ` (${diagnosticoExtra})` : "") }) };
    }
    if (!resp.ok) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ error: `No se pudo acceder al enlace (HTTP ${resp.status}). Verifica que el permiso de uso compartido sea "Cualquiera con el enlace puede ver".` }),
      };
    }

    const contentType = (resp.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/pdf")) {
      const buffer = await resp.arrayBuffer();
      if (buffer.byteLength > 4 * 1024 * 1024) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: `El PDF del enlace pesa ${(buffer.byteLength/1024/1024).toFixed(1)} MB, supera el límite de 4 MB para enviarlo a la IA. Descárgalo, comprímelo, o pega el texto manualmente.` }) };
      }
      const base64 = Buffer.from(buffer).toString("base64");
      return { statusCode: 200, headers, body: JSON.stringify({ tipo: "pdf", pdfBase64: base64, tipoDetectado }) };
    }

    if (contentType.includes("text/plain") || contentType.includes("text/csv")) {
      const texto = await resp.text();
      if (!texto.trim()) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: "El enlace respondió, pero el documento está vacío." }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ tipo: "texto", texto, tipoDetectado }) };
    }

    if (contentType.includes("application/json")) {
      const cuerpoJson = await resp.text();
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          error: tipoDetectado === "onedrive"
            ? "OneDrive/SharePoint rechazó la solicitud automática (respondió con un error en vez del archivo). Puede pasar si el enlace no es del tipo \"cualquiera con el enlace\", si pertenece a una organización con restricciones adicionales, o si requiere iniciar sesión. Descarga el archivo manualmente y súbelo con \"Adjuntar archivo\" — eso funciona siempre."
            : "El enlace devolvió un error en vez del archivo.",
          diagnostico: cuerpoJson.slice(0, 300),
        }),
      };
    }

    if (contentType.includes("text/html")) {
      const htmlMuestra = (await resp.text()).slice(0, 300);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          error: "El enlace no entregó el archivo directamente (parece una página de confirmación o de inicio de sesión). Verifica que sea público (\"cualquiera con el enlace\"); si es un archivo de Drive u OneDrive, descárgalo manualmente y súbelo como archivo.",
          diagnostico: htmlMuestra,
        }),
      };
    }

    // Otros tipos binarios (Word, Excel, imágenes, application/octet-stream genérico
    // que a veces usan estos servicios para PDFs mal etiquetados): los devolvemos como
    // PDF solo si el nombre/URL sugiere PDF; si no, avisamos que no se soporta aún.
    // Nombre del archivo según la cabecera de descarga (sirve para saber si
    // es Word/Excel y para mostrarlo en la app).
    const disp = resp.headers.get("content-disposition") || "";
    const nombreArchivo = decodeURIComponent(((disp.match(/filename\*=UTF-8''([^;]+)/i) || [])[1]) || "")
      || ((disp.match(/filename="?([^";]+)"?/i) || [])[1]) || "";
    const esOffice = /officedocument|msword|ms-excel|opendocument/.test(contentType) || /\.(docx?|xlsx?|ods|odt)$/i.test(nombreArchivo);

    if (esOffice || contentType.includes("octet-stream") || contentType === "") {
      const buffer = await resp.arrayBuffer();
      const primerosBytes = Buffer.from(buffer.slice(0, 5)).toString("utf-8");
      // Word/Excel (o binario que empieza como ZIP "PK", típico de .docx/.xlsx):
      // se devuelve en base64 para que el navegador extraiga el texto con las
      // mismas librerías que usa al subir archivos (mammoth / SheetJS).
      if (esOffice || primerosBytes.startsWith("PK") || primerosBytes.startsWith("\u00D0\u00CF")) {
        if (buffer.byteLength > 4 * 1024 * 1024) {
          return { statusCode: 200, headers, body: JSON.stringify({ error: `El archivo ${nombreArchivo || ""} pesa ${(buffer.byteLength/1024/1024).toFixed(1)} MB; supera el límite de 4 MB para leerlo por enlace. Descárgalo y súbelo directamente.` }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ tipo: "binario", base64: Buffer.from(buffer).toString("base64"), nombre: nombreArchivo, contentType, tipoDetectado }) };
      }
      if (primerosBytes.startsWith("%PDF")) {
        if (buffer.byteLength > 4 * 1024 * 1024) {
          return { statusCode: 200, headers, body: JSON.stringify({ error: `El PDF del enlace pesa ${(buffer.byteLength/1024/1024).toFixed(1)} MB, supera el límite de 4 MB. Descárgalo, comprímelo, o pega el texto manualmente.` }) };
        }
        const base64 = Buffer.from(buffer).toString("base64");
        return { statusCode: 200, headers, body: JSON.stringify({ tipo: "pdf", pdfBase64: base64, tipoDetectado }) };
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ error: `Tipo de archivo no soportado para lectura automática (${contentType || "desconocido"}). Por ahora se puede leer: PDF, Google Docs, Google Sheets y texto plano. Para Word/Excel/imágenes, descarga el archivo y súbelo directamente.` }),
    };
  } catch (e) {
    const msg = e.name === "AbortError" ? "El enlace tardó demasiado en responder." : (e.message || String(e));
    return { statusCode: 200, headers, body: JSON.stringify({ error: "No se pudo leer el enlace: " + msg }) };
  }
};
