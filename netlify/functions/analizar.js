// netlify/functions/analizar.js
// Proxy seguro hacia la API de Anthropic. La API key vive SOLO en las
// variables de entorno de Netlify (ANTHROPIC_API_KEY) y nunca llega al navegador.

// --- Utilidades de parseo tolerante: si la respuesta de la IA se corta antes
// de cerrar el JSON completo (por límite de tokens), rescatamos campo por
// campo con expresiones regulares en vez de perder toda la respuesta. ---
function extraerCampoTexto(texto, campo) {
  const regex = new RegExp(`"${campo}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const m = texto.match(regex);
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch (e) { return m[1]; }
}
function extraerCampoBool(texto, campo) {
  const regex = new RegExp(`"${campo}"\\s*:\\s*(true|false)`);
  const m = texto.match(regex);
  return m ? m[1] === "true" : null;
}
function extraerCampoArray(texto, campo) {
  const regex = new RegExp(`"${campo}"\\s*:\\s*\\[([^\\]]*)\\]`, "s");
  const m = texto.match(regex);
  if (!m) return [];
  const items = [];
  const itemRegex = /"((?:\\.|[^"\\])*)"/g;
  let im;
  while ((im = itemRegex.exec(m[1]))) {
    try { items.push(JSON.parse(`"${im[1]}"`)); } catch (e) { items.push(im[1]); }
  }
  return items;
}

function extraerCampoObjetoArray(texto, campo) {
  // Extrae un array de objetos simples como [{"a":"x","b":"y"}, ...] de forma
  // tolerante: si el array está truncado, rescata los objetos completos que sí cerraron.
  const inicioArr = texto.indexOf(`"${campo}"`);
  if (inicioArr === -1) return [];
  const desdeCampo = texto.slice(inicioArr);
  const inicioCorchete = desdeCampo.indexOf("[");
  if (inicioCorchete === -1) return [];
  const contenido = desdeCampo.slice(inicioCorchete + 1);
  const objetos = [];
  const objRegex = /\{[^{}]*\}/g;
  let m;
  while ((m = objRegex.exec(contenido))) {
    try { objetos.push(JSON.parse(m[0])); } catch (e) { /* objeto incompleto, se descarta */ }
  }
  return objetos;
}

const AUD_STD_ESF = `efectivo = efectivo y equivalentes (caja, bancos, inversiones temporales < 90 días)
actfin = cuentas y documentos por cobrar corrientes: clientes, otras cuentas por cobrar, relacionadas, accionistas, (-) provisión de incobrables, otros activos financieros corrientes
inventarios = inventarios, mercaderías en tránsito, (-) provisión de inventarios
anticipados = gastos pagados por anticipado, anticipos a proveedores, seguros/arriendos prepagados
impcorr = activos por impuestos corrientes, crédito tributario IVA / renta, retenciones, anticipo de impuesto a la renta
otrosac = otros activos corrientes, activos mantenidos para la venta
tac = TOTAL activo corriente
ppe = propiedad, planta y equipo (neto de depreciación), y cada componente o su depreciación acumulada
propinv = propiedades de inversión
biologicos = activos biológicos
intang = activos intangibles, derechos de uso (netos)
impdif = activos por impuestos diferidos
finnc = inversiones no corrientes (en asociadas, subsidiarias, otras), cuentas por cobrar a largo plazo, activos financieros no corrientes
otrosanc = otros activos no corrientes, depósitos en garantía
tanc = TOTAL activo no corriente
ta = TOTAL ACTIVO
cxp = cuentas y documentos por pagar corrientes: proveedores, comerciales, otras cuentas por pagar, relacionadas, accionistas (corto plazo)
oblfin = obligaciones con instituciones financieras corrientes, préstamos bancarios, sobregiros, porción corriente de deuda a largo plazo, obligaciones/papel comercial emitidos
irpagar = impuesto a la renta por pagar del ejercicio
ptpagar = participación trabajadores por pagar (solo si la línea lo dice expresamente)
antcli = anticipos de clientes, ingresos diferidos corrientes
otrospc = otros pasivos corrientes: beneficios a empleados corrientes, IESS, obligaciones laborales, pasivos por impuestos corrientes (IVA y retenciones por pagar), provisiones, dividendos por pagar, otras obligaciones corrientes
tpc = TOTAL pasivo corriente
cxpnc = cuentas y documentos por pagar no corrientes (proveedores, relacionadas, accionistas, otras cuentas por pagar a largo plazo)
oblfinnc = obligaciones financieras / préstamos bancarios / obligaciones emitidas a largo plazo
benemp = jubilación patronal, desahucio, beneficios a empleados no corrientes
antclinc = anticipos de clientes e ingresos diferidos a largo plazo
otrospnc = otros pasivos no corrientes, provisiones no corrientes, pasivo por impuesto diferido
tpnc = TOTAL pasivo no corriente
tp = TOTAL PASIVOS
capital = capital social / suscrito / asignado
aportes = aportes para futuras capitalizaciones
reservas = reserva legal, facultativa, estatutaria, otras reservas
ori = otros resultados integrales, superávit por revaluación
resacum = utilidades o pérdidas acumuladas de ejercicios anteriores, resultados acumulados por adopción NIIF, reserva de capital
resej = utilidad o pérdida del ejercicio (en el patrimonio)
tpat = TOTAL PATRIMONIO
tpyp = TOTAL PASIVO Y PATRIMONIO`;
const AUD_STD_ERI = `ingord = ingresos de actividades ordinarias / ventas / ingresos operacionales (netos de descuentos y devoluciones), y cada uno de sus componentes
costo = costo de ventas, costo de producción, costo de servicios
gastos = TODOS los gastos excepto costo, participación e impuesto: gastos de administración, de ventas, financieros, no operacionales, otros gastos, depreciaciones presentadas aparte
otrosing = otros ingresos, ingresos financieros, ingresos no operacionales
uai = utilidad (pérdida) antes de participación trabajadores e impuesto a la renta
pt = participación trabajadores (15%)
ir = impuesto a la renta (corriente y/o diferido; si el diferido es ingreso, valor negativo)
neta = utilidad / pérdida / resultado NETO del ejercicio (o resultado integral si no hay otro resultado integral)`;


const PARTES_INFORME = {
  resumen: `Responde SOLO con este JSON (conciso):
{
  "opinion": "razonable"|"con_salvedades"|"desfavorable"|"no_concluyente",
  "resumen_ejecutivo": "párrafo ejecutivo de 6-8 líneas: alcance (años y documentos), resultado general de la conciliación, diferencias más importantes con sus montos y conclusión",
  "conclusion_por_anio": [{"anio": 2024, "conclusion": "2-3 líneas con cifras"}]
}`,
  hallazgos: `Responde SOLO con este JSON (máximo 7 hallazgos, de mayor a menor severidad; cada texto máximo 2-3 líneas):
{
  "hallazgos": [{"anio": 2024, "severidad": "alta"|"media"|"baja", "titulo": "título corto", "detalle": "qué se encontró, con montos, casilleros y códigos", "posible_causa": "causa probable", "recomendacion": "acción concreta (cita casillero SRI / código Supercias recomendados si es de clasificación)"}]
}`,
  interanual: `Responde SOLO con este JSON (conciso):
{
  "analisis_interanual": "6-10 líneas: evolución entre años de ventas, utilidad, endeudamiento, liquidez y patrimonio; continuidad de saldos; años faltantes",
  "riesgos_regulatorios": ["máximo 4 riesgos concretos ante la SCVS o el SRI"],
  "recomendaciones": ["máximo 6 recomendaciones concretas y priorizadas"]
}`,
};


function parsearRespuestaIA(textoOriginal, modo) {
  let clean = textoOriginal.replace(/```json|```/g, "").trim();
  const inicio = clean.indexOf("{");
  if (inicio !== -1) clean = clean.slice(inicio);

  // Intento 1: JSON válido y completo
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Intento 2: la respuesta se truncó antes de cerrar el JSON. Rescatamos
    // cada campo individualmente aunque el objeto completo sea inválido.
    if (modo === "diagnostico_oficio") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo o usa un texto más corto)",
        institucion_emisora: extraerCampoTexto(clean, "institucion_emisora"),
        nivel_riesgo: extraerCampoTexto(clean, "nivel_riesgo") || "",
        plazo_detectado: extraerCampoTexto(clean, "plazo_detectado"),
        alcance: extraerCampoTexto(clean, "alcance") || "",
        areas_legales: extraerCampoObjetoArray(clean, "areas_legales"),
        puntos_clave: extraerCampoArray(clean, "puntos_clave"),
        como_responder: extraerCampoTexto(clean, "como_responder") || "",
        requiere_documentos_soporte: extraerCampoBool(clean, "requiere_documentos_soporte") || false,
        documentos_sugeridos: extraerCampoArray(clean, "documentos_sugeridos"),
        borrador_oficio_respuesta: extraerCampoTexto(clean, "borrador_oficio_respuesta") || "",
        solucion_recomendada: extraerCampoTexto(clean, "solucion_recomendada") || "",
      };
    }
    if (modo === "revision_soportes") {
      return {
        completo: extraerCampoBool(clean, "completo") || false,
        documentos_evaluados: extraerCampoObjetoArray(clean, "documentos_evaluados"),
        faltantes: extraerCampoArray(clean, "faltantes"),
        recomendaciones: extraerCampoArray(clean, "recomendaciones"),
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
      };
    }
    if (modo === "auditoria_extraer_estado") {
      return { titulo: extraerCampoTexto(clean, "titulo") || "", unidad: extraerCampoTexto(clean, "unidad") || "dolares",
        anio_actual: +((clean.match(/"anio_actual"\s*:\s*(\d{4})/) || [])[1]) || null, anio_anterior: +((clean.match(/"anio_anterior"\s*:\s*(\d{4})/) || [])[1]) || null,
        lineas: extraerCampoObjetoArray(clean, "lineas"), truncado: true };
    }
    if (modo === "informe_auditoria_externa") {
      return { conclusion: extraerCampoTexto(clean, "conclusion") || "", hallazgos: extraerCampoObjetoArray(clean, "hallazgos"),
        riesgos_regulatorios: extraerCampoArray(clean, "riesgos_regulatorios"), recomendaciones: extraerCampoArray(clean, "recomendaciones") };
    }
    if (modo === "informe_auditoria_supercias") {
      return {
        opinion: extraerCampoTexto(clean, "opinion") || "no_concluyente",
        resumen_ejecutivo: extraerCampoTexto(clean, "resumen_ejecutivo") || "(La respuesta de la IA se cortó antes de completarse; vuelve a intentarlo)",
        conclusion_por_anio: extraerCampoObjetoArray(clean, "conclusion_por_anio"),
        hallazgos: extraerCampoObjetoArray(clean, "hallazgos"),
        analisis_interanual: extraerCampoTexto(clean, "analisis_interanual") || "",
        riesgos_regulatorios: extraerCampoArray(clean, "riesgos_regulatorios"),
        recomendaciones: extraerCampoArray(clean, "recomendaciones"),
      };
    }
    if (modo === "puntos_equipo_oficio") {
      return { puntos: extraerCampoObjetoArray(clean, "puntos") };
    }
    if (modo === "revisar_punto_oficio") {
      return {
        justifica: extraerCampoTexto(clean, "justifica") || "parcial",
        comentario: extraerCampoTexto(clean, "comentario") || "(La respuesta de la IA se cortó antes de completarse)",
        faltantes: extraerCampoTexto(clean, "faltantes") || "",
      };
    }
    if (modo === "generar_puntos_proyecto") {
      return { puntos: extraerCampoArray(clean, "puntos") };
    }
    if (modo === "analizar_punto_proyecto") {
      return {
        justifica: extraerCampoTexto(clean, "justifica") || "parcial",
        comentario: extraerCampoTexto(clean, "comentario") || "(La respuesta de la IA se cortó antes de completarse)",
      };
    }
    if (modo === "analizar_respaldo_general_proyecto") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
        puntos: extraerCampoObjetoArray(clean, "puntos"),
        recomendaciones: extraerCampoArray(clean, "recomendaciones"),
      };
    }
    if (modo === "generar_plan_multianual_dividendos") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
        plan_anios: extraerCampoObjetoArray(clean, "plan_anios"),
        recomendacion_general: extraerCampoTexto(clean, "recomendacion_general") || "",
      };
    }
    if (modo === "calcular_informe_retencion_dividendos") {
      return {
        informes_individuales: extraerCampoObjetoArray(clean, "informes_individuales"),
        informe_conjunto_ejecutivo: extraerCampoTexto(clean, "informe_conjunto_ejecutivo") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
      };
    }
    if (modo === "calcular_distribucion_accionistas_actuales") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
        tabla_accionistas: extraerCampoObjetoArray(clean, "tabla_accionistas"),
        tabla_anios: extraerCampoObjetoArray(clean, "tabla_anios"),
        recomendaciones_generales: extraerCampoArray(clean, "recomendaciones_generales"),
      };
    }
    if (modo === "generar_escenarios_dividendos") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
        escenarios: extraerCampoObjetoArray(clean, "escenarios"),
        recomendacion_general: extraerCampoTexto(clean, "recomendacion_general") || "",
      };
    }
    if (modo === "recomendar_distribucion_dividendos") {
      return {
        resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
        tabla_distribucion: extraerCampoObjetoArray(clean, "tabla_distribucion"),
        alerta_pago_a_cuenta: extraerCampoTexto(clean, "alerta_pago_a_cuenta") || "",
        recomendaciones: extraerCampoArray(clean, "recomendaciones"),
      };
    }
    // Modos genéricos de revisión documental (orden de compra, rol de pago, avalúo)
    return {
      veredicto: extraerCampoTexto(clean, "veredicto") || "",
      resumen: extraerCampoTexto(clean, "resumen") || "(La respuesta de la IA se cortó antes de completarse; intenta de nuevo)",
      explicacion: extraerCampoTexto(clean, "explicacion") || "",
      hallazgos: extraerCampoObjetoArray(clean, "hallazgos"),
      tabla_puntos: extraerCampoObjetoArray(clean, "tabla_puntos"),
      recomendaciones: extraerCampoArray(clean, "recomendaciones"),
      tabla_corregida: extraerCampoObjetoArray(clean, "tabla_corregida"),
      texto_corregido: extraerCampoTexto(clean, "texto_corregido") || "",
    };
  }
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY no está configurada en Netlify (Site settings → Environment variables).",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const { modo, contenido: contenidoOriginal, contexto, pdfs, imagenes } = payload;
  const parteInforme = String(payload.parte || "");
  const listaPdfs = Array.isArray(pdfs) ? pdfs.filter(p => p && p.data) : [];
  // Imágenes de páginas (p. ej. informes de auditoría escaneados): [{data, mime, etiqueta}]
  const listaImgs = Array.isArray(imagenes) ? imagenes.filter(p => p && p.data) : [];
  if (!modo || (!contenidoOriginal && !listaPdfs.length && !listaImgs.length)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan campos: se requiere 'modo' y, al menos, 'contenido' o 'pdfs'" }) };
  }
  // Si no hay texto extraído pero sí hay uno o más PDF adjuntos, se usa un texto
  // de reemplazo solo para armar el prompt; los PDF reales se envían aparte como
  // documentos nativos a Claude (ver más abajo), que sí puede leerlos visualmente
  // (por ejemplo, escaneos o imágenes dentro del PDF sin texto seleccionable).
  const contenido = contenidoOriginal || (listaImgs.length ? "(El documento se adjunta como imágenes de sus páginas, cada una precedida de su número de página.)" : "") || (listaPdfs.length
    ? `(Los siguientes archivos no tienen texto extraíble por software: ${listaPdfs.map(p=>p.nombre||"adjunto").join(", ")}. Se adjuntan los PDF originales para que los leas y analices directamente, incluyendo cualquier imagen, tabla o escaneo que contengan.)`
    : "");

  const prompts = {
    diagnostico_oficio: `Eres un asesor legal-administrativo experto en trámites con instituciones públicas y privadas en Ecuador.
Sé conciso: cada campo de texto debe tener máximo 2-4 líneas, y el borrador de oficio máximo 12 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni introducciones, ni explicaciones, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Analiza el siguiente oficio/documento y responde con este JSON exacto:
{
  "resumen": "resumen breve de 2-4 líneas de qué pide o notifica el oficio",
  "institucion_emisora": "nombre de la institución si se identifica, o null",
  "nivel_riesgo": "bajo" | "medio" | "alto",
  "plazo_detectado": "plazo o fecha límite mencionada en el documento, en texto, o null si no se menciona",
  "alcance": "explica en 2-4 líneas el alcance real del oficio: a quién obliga, qué efectos jurídicos o administrativos tiene, y qué pasa si no se responde",
  "areas_legales": [
    {"area": "Societario"|"Civil"|"Penal"|"Laboral"|"Tributario"|"Administrativo"|"Constitucional"|"Otro", "problema": "descripción breve del problema o implicación legal en esa área"}
  ],
  "puntos_clave": ["punto 1", "punto 2", "punto 3"],
  "como_responder": "explicación clara y práctica en 3-6 líneas de cómo se debe responder o actuar frente a este oficio",
  "requiere_documentos_soporte": true|false,
  "documentos_sugeridos": ["documento 1", "documento 2"],
  "borrador_oficio_respuesta": "texto completo de un oficio de respuesta formal, en español, con estructura ecuatoriana estándar (lugar y fecha, destinatario, asunto, cuerpo, despedida, firma), listo para adaptar",
  "solucion_recomendada": "recomendación concreta de la mejor vía de solución o siguiente paso"
}
Solo incluye en "areas_legales" las áreas que realmente apliquen al contenido del oficio (puede ser una sola, o ninguna si es puramente administrativo/informativo).
Contexto adicional proporcionado por el usuario: ${contexto || "ninguno"}
Documento a analizar:
"""
${contenido}
"""`,

    puntos_equipo_oficio: `Eres un asesor experto en cumplimiento de requerimientos de instituciones públicas y privadas en Ecuador (Superintendencia de Compañías, SRI, IESS, Ministerio del Trabajo, municipios, etc.).
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
${listaPdfs.length ? `El oficio se adjunta como PDF (${listaPdfs.map(p=>p.nombre||"archivo").join(", ")}); es legible: ábrelo y léelo directamente. ` : ""}Lee el oficio y separa CADA requerimiento, observación, pedido de información o acción que la empresa debe cumplir/entregar, como un punto independiente (si el oficio numera sus observaciones o requerimientos, respeta esa numeración y ese orden; no fusiones puntos distintos ni inventes puntos que el oficio no pide). Para cada punto indica qué documentos de respaldo concretos debe preparar y subir el equipo para demostrar el cumplimiento (documentos reales y específicos del contexto ecuatoriano: ej. "Acta de Junta General certificada", "Libro de Accionistas actualizado", "Balance general firmado por representante legal y contador", "Declaración formulario 101", "Planilla de aportes IESS", etc.).
Responde con este JSON exacto:
{
  "puntos": [
    {"punto": "descripción clara y concreta de lo que pide el oficio en este punto (1-3 líneas; si el oficio lo numera, empieza con esa numeración)", "respaldos": "documento de respaldo 1; documento de respaldo 2; documento de respaldo 3", "prioridad": "alta"|"media"|"baja"}
  ]
}
Reglas: "respaldos" es UN solo texto con los documentos separados por punto y coma (;). "prioridad" es "alta" si su incumplimiento puede generar sanción, multa, intervención o disolución, "media" si es información necesaria para cerrar el trámite, "baja" si es formal/complementaria.
Contexto adicional: ${contexto || "ninguno"}
Oficio:
"""
${contenido}
"""`,

    revisar_punto_oficio: `Eres un revisor experto en cumplimiento documental ante instituciones públicas y privadas en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
${listaPdfs.length ? `Se adjuntan ${listaPdfs.length} archivo(s) PDF como documentos (no como texto): ${listaPdfs.map(p=>p.nombre||"archivo").join(", ")}. Son legibles: ábrelos y analiza su contenido directamente (texto, tablas, escaneos, sellos, firmas). Nunca respondas que no son legibles.` : ""}
Punto del oficio que se debe cumplir, y respaldos que se recomendó presentar:
"""
${contexto || ""}
"""
Revisa los documentos de respaldo que subió el responsable y determina si demuestran el cumplimiento de ESE punto: verifica que sean los documentos correctos, que estén completos, vigentes, con firmas/sellos cuando corresponda, y coherentes con lo que pide el oficio (fechas, nombres, montos, RUC). Responde con este JSON exacto:
{
  "justifica": "si"|"no"|"parcial",
  "comentario": "explicación concreta de 2-4 líneas: qué se verificó en los documentos y por qué sí, no o parcialmente respaldan el punto",
  "faltantes": "qué falta o qué hay que corregir para que el punto quede completamente respaldado (1-3 líneas), o cadena vacía si no falta nada"
}
Contenido de los respaldos subidos (texto extraído cuando lo hay; los PDF adjuntos se revisan aparte):
"""
${contenido}
"""`,

    auditoria_localizar: `Eres un auditor financiero en Ecuador. Recibes las páginas de un INFORME DE AUDITORÍA EXTERNA (cada imagen va precedida de su número de página). El formato varía según la firma auditora.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON, sin texto antes ni después ni \`\`\`.
Identifica en qué páginas está cada parte (lista de números de página; vacía si no aparece). No confundas el índice con los estados. Un estado puede ocupar dos páginas (p. ej. activos en una y pasivos/patrimonio en otra).
{
  "empresa": "razón social auditada",
  "anio": 2025,
  "paginas": { "opinion": [3,4,5], "esf": [6], "eri": [7], "patrimonio": [8], "flujos": [9,10] }
}
Contexto: ${contexto || ""}
${contenido}`,

    auditoria_extraer_estado: `Eres un auditor financiero experto en NIIF en Ecuador. Transcribe con EXACTITUD el ${String(contexto||"").startsWith("eri") ? "ESTADO DE RESULTADOS INTEGRAL (estado de resultados / pérdidas y ganancias)" : "ESTADO DE SITUACIÓN FINANCIERA (balance general)"} que aparece en el informe de auditoría adjunto. Cada firma auditora usa un formato distinto: lee la estructura real del documento.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON, sin texto antes ni después ni \`\`\`.
Reglas:
- Incluye TODOS los renglones que tienen valor, en el mismo orden, incluidos subtotales y totales. No inventes renglones ni cifras: copia los números tal como están impresos (revisa dígito por dígito).
- Los valores van como números sin separadores de miles (1,805,923 → 1805923; 1.805.923,45 → 1805923.45). Paréntesis o signo menos = negativo. Guion "-" = 0.
- "a" = valor del año actual (el del informe), "p" = valor del año anterior/comparativo (null si no hay columna comparativa).
- "t": "l" renglón normal, "s" subtotal intermedio (ej. utilidad bruta, utilidad operacional), "T" total de sección (ej. total activo corriente, total activos, total pasivos, total patrimonio).
- "n": número de nota si aparece, si no "".
- "s": código estándar del renglón según esta lista ("" para subtotales que no estén en la lista):
${String(contexto||"").startsWith("eri") ? AUD_STD_ERI : AUD_STD_ESF}
- En el estado de resultados, los gastos y costos van en positivo (como gasto), salvo que el documento muestre un ingreso dentro del grupo.
{
  "titulo": "título del estado tal como aparece",
  "anio_actual": 2025,
  "anio_anterior": 2024,
  "unidad": "dolares" | "miles",
  "lineas": [ {"d": "Efectivo y equivalentes al efectivo", "n": "4", "a": 1777045, "p": 916511, "t": "l", "s": "efectivo"} ]
}
Contexto: ${contexto || ""}
Documento:
${contenido}`,

    auditoria_opinion: `Eres un auditor financiero senior en Ecuador (NIA). Lee el DICTAMEN / INFORME DEL AUDITOR INDEPENDIENTE adjunto (el formato varía según la firma) y extrae su contenido.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON, sin texto antes ni después ni \`\`\`.
{
  "empresa": "razón social auditada",
  "anio": 2025,
  "auditor": "nombre del auditor o firma auditora",
  "registro_scvs": "número de registro en la Superintendencia (SC-RNAE...) o ''",
  "fecha_informe": "fecha del informe en texto",
  "ciudad": "",
  "tipo_opinion": "limpia" | "con_salvedades" | "adversa" | "abstencion",
  "marco_contable": "NIIF para PYMES | NIIF completas | otro",
  "resumen_opinion": "2-3 líneas con lo que dice el párrafo de opinión",
  "salvedades": ["cada asunto que origina la salvedad, opinión adversa o abstención, con montos si los hay"],
  "enfasis": ["párrafos de énfasis / incertidumbre material relacionada con empresa en marcha / otros asuntos"],
  "empresa_en_marcha": "lo que diga sobre empresa en marcha o ''",
  "cumplimiento_tributario": "lo que diga sobre el informe de cumplimiento tributario o ''"
}
Contexto: ${contexto || ""}
Documento:
${contenido}`,
    informe_auditoria_externa: `Eres un auditor financiero senior en Ecuador (NIIF, NIA, Superintendencia de Compañías y SRI).
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON, sin texto antes ni después ni \`\`\`.
Recibes, por año, la comparación YA CALCULADA entre los estados financieros AUDITADOS (informe del auditor independiente) y lo presentado a la Superintendencia (Supercias), lo declarado al SRI (F101) y los estados financieros internos, además del tipo de opinión, salvedades y énfasis. Usa SOLO esas cifras. Explica qué significan las diferencias (ajustes de auditoría no registrados en los formularios, reclasificaciones, reexpresión del año anterior), su gravedad y qué hacer (corrección / reproceso ante la SCVS, declaración sustitutiva al SRI, registro contable de los ajustes).
Responde con este JSON (conciso; cada texto máximo 3 líneas; máximo 6 hallazgos):
{
  "conclusion": "3-5 líneas: coherencia entre la auditoría y lo presentado, con las cifras principales",
  "hallazgos": [{"anio": 2025, "severidad": "alta"|"media"|"baja", "titulo": "título corto", "detalle": "con montos", "posible_causa": "", "recomendacion": "acción concreta"}],
  "riesgos_regulatorios": ["riesgo concreto"],
  "recomendaciones": ["recomendación concreta"]
}
Empresa: ${contexto || ""}
Datos (JSON):
${contenido}`,

    informe_auditoria_supercias: `Eres un auditor financiero senior en Ecuador, experto en NIIF, en el Formulario 101 del SRI (Impuesto a la Renta Sociedades) y en los estados financieros que las compañías presentan a la Superintendencia de Compañías, Valores y Seguros (SCVS).
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas nada antes ni después, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Recibes los RESULTADOS YA CALCULADOS de una conciliación (no recalcules ni inventes cifras: usa SOLO las que vienen en los datos). Los estados internos de la empresa son los declarados al SRI (Formulario 101) y deben cuadrar con los presentados a la Superintendencia del MISMO año. Revisa siempre los años: qué años son conciliables, cuáles están incompletos o faltan, y compara la evolución entre años (variaciones, continuidad de inventarios, capital y utilidades acumuladas, indicadores).
Criterios: "cuadra" = diferencia ≤ USD 1; una diferencia en un subtotal con los totales cuadrados suele ser de CLASIFICACIÓN entre rubros (menos grave, pero debe documentarse); diferencias en totales de activo, pasivo, patrimonio, ingresos, utilidad o impuesto son GRAVES (posible declaración sustitutiva al SRI o reproceso/corrección ante la Superintendencia). Si un año no tiene ambos documentos, dilo como limitación, no como diferencia. La conciliación incluye rubros principales y líneas de DETALLE (ingresos por tipo, costo de ventas por componente y gastos por naturaleza); para cada diferencia vienen los casilleros del Formulario 101 (casillerosSri) y los códigos de la Superintendencia (codigosSupercias) que la forman: en cada hallazgo CITA esos casilleros y códigos con sus valores (ej. "SRI casillero 7203 Seguros 176.241,24 vs. Supercias 5020114 + 5020214 = 6.265,56"), y explica si parece una diferencia de clasificación (el total del grupo cuadra) o de cifras. Además viene "cuadrePorReclasificacion": por grupo (activo corriente, pasivo corriente, gastos, etc.), las reclasificaciones que la app propuso emparejando diferencias opuestas según afinidad contable (con razonabilidad alta/media/baja) y lo que quedó "noExplicado". Evalúa con criterio de auditor la RAZONABILIDAD de cada reclasificación importante (¿es contablemente lógico que esa cuenta esté presentada así en la Superintendencia?), señala las de baja razonabilidad que requieren revisar el auxiliar contable, y concluye por grupo si las filas cuadran tras reclasificar. Lo "noExplicado" en grupos cuyo total no cuadra es diferencia de cifras (grave). Cada reclasificación trae codigoSuperciasActual/codigoSuperciasRecomendado y casilleroSriActual/casilleroSriRecomendado: en cada hallazgo y recomendación sobre clasificación CITA SIEMPRE el número de casillero del SRI y el código de Supercias recomendados (ej.: "mover USD X del código 20205 al 20210 en Supercias, o del casillero 588 al 568 en el F101 mediante sustitutiva") e indica cuál formulario conviene corregir. Si viene "auditoriaExterna" (informe del auditor independiente leído del PDF), compárala con Supercias, el SRI y los estados internos: una utilidad, patrimonio o activo auditado distinto a lo presentado indica que los ajustes de auditoría no se registraron en los formularios (riesgo de sustitutiva al SRI y corrección ante la SCVS); considera el tipo de opinión, salvedades y énfasis en los hallazgos.
${PARTES_INFORME[parteInforme] ? PARTES_INFORME[parteInforme] : `Responde con este JSON exacto (sé completo pero conciso: cada texto máximo 3-4 líneas; máximo 10 hallazgos, ordenados de mayor a menor severidad):
{
  "opinion": "razonable"|"con_salvedades"|"desfavorable"|"no_concluyente",
  "resumen_ejecutivo": "párrafo ejecutivo de 6-10 líneas: alcance (años y documentos), resultado general de la conciliación, diferencias más importantes con sus montos, estado de los cuadres internos, continuidad entre años y conclusión",
  "conclusion_por_anio": [{"anio": 2024, "conclusion": "conclusión de ese año en 2-3 líneas, con cifras"}],
  "hallazgos": [{"anio": 2024, "severidad": "alta"|"media"|"baja", "titulo": "título corto", "detalle": "qué se encontró, con montos y rubros", "posible_causa": "causa probable (clasificación, ajuste posterior, error de transcripción, sustitutiva, etc.)", "recomendacion": "acción concreta"}],
  "analisis_interanual": "análisis de la evolución entre años (8-12 líneas): tendencias de ventas, utilidad, endeudamiento, liquidez y patrimonio; continuidad de saldos entre años; años faltantes que impiden la comparación",
  "riesgos_regulatorios": ["riesgo concreto ante la SCVS o el SRI (multas, observaciones, sustitutivas, etc.)"],
  "recomendaciones": ["recomendación concreta y priorizada"]
}`}
Empresa: ${contexto || "no especificada"}
Datos de la conciliación (JSON):
${contenido}`,

    revision_soportes: `Eres un revisor experto en cumplimiento documental para trámites ante instituciones públicas y privadas en Ecuador.
Sé conciso: cada observación o recomendación debe tener máximo 1-2 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni introducciones, ni explicaciones, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
El usuario debe entregar ciertos documentos de soporte para un trámite. Analiza el listado de documentos requeridos y el contenido/descripción de los documentos que el usuario ya reunió, y responde con este JSON exacto:
{
  "completo": true|false,
  "documentos_evaluados": [
    {"documento": "nombre", "estado": "correcto"|"incompleto"|"faltante"|"no_aplica", "observacion": "detalle breve"}
  ],
  "faltantes": ["documento faltante 1"],
  "recomendaciones": ["recomendación 1", "recomendación 2"],
  "resumen": "resumen de 2-3 líneas del estado general de los soportes"
}
Documentos requeridos: ${contexto || "no especificado"}
Contenido/descripción de los soportes entregados por el usuario:
"""
${contenido}
"""`,

    revision_orden_compra: `Eres un auditor experto en compras y contratación para empresas en Ecuador.
Sé conciso: cada observación máximo 1-2 líneas; la explicación máximo 4-5 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Analiza la siguiente orden de compra y verifica: cálculos aritméticos (cantidad x precio unitario = subtotal, suma de subtotales, IVA, total), coherencia de datos del proveedor (nombre, RUC), fechas, condiciones de pago, y cualquier inconsistencia o dato faltante. Responde con este JSON exacto:
{
  "veredicto": "correcto"|"incorrecto"|"con_observaciones",
  "resumen": "resumen de 2-3 líneas de qué es el documento y su estado general",
  "explicacion": "párrafo de 3-5 líneas explicando en lenguaje claro si el documento está bien o mal y por qué, en base a lo encontrado",
  "hallazgos": [
    {"item": "concepto revisado (ej. Cálculo de subtotales)", "tipo": "correcto"|"inconsistencia"|"advertencia", "detalle": "explicación breve"}
  ],
  "tabla_puntos": [
    {"concepto": "ej. Proveedor / RUC", "valor": "dato encontrado en el documento", "observacion": "correcto o problema detectado"}
  ],
  "recomendaciones": ["recomendación concreta a seguir si algo está mal o podría mejorarse"]
}
Contexto adicional: ${contexto || "ninguno"}
Documento a analizar:
"""
${contenido}
"""`,

    revision_rol_pago: `Eres un auditor experto en nómina y roles de pago en Ecuador (normativa IESS y Código del Trabajo vigente 2026: aporte personal 9.45%, aporte patronal 11.15%, SBU $482).
Sé conciso: cada observación máximo 1-2 líneas; la explicación máximo 4-5 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Analiza el siguiente rol de pago y verifica: cálculo del aporte al IESS (9.45% del ingreso gravable), décimos si aplica, horas extra, otros descuentos, y que el neto a pagar (ingresos - descuentos) sea matemáticamente correcto. Señala cualquier inconsistencia. Responde con este JSON exacto:
{
  "veredicto": "correcto"|"incorrecto"|"con_observaciones",
  "resumen": "resumen de 2-3 líneas del rol de pago y su estado general",
  "explicacion": "párrafo de 3-5 líneas explicando en lenguaje claro si el rol de pago está bien calculado o no y por qué",
  "hallazgos": [
    {"item": "concepto revisado (ej. Aporte IESS 9.45%)", "tipo": "correcto"|"inconsistencia"|"advertencia", "detalle": "explicación breve, incluye el valor esperado vs el encontrado si hay diferencia"}
  ],
  "tabla_puntos": [
    {"concepto": "ej. Ingreso gravable", "valor": "monto encontrado", "observacion": "correcto o problema detectado"}
  ],
  "recomendaciones": ["recomendación concreta a seguir si algo está mal o podría mejorarse"]
}
Contexto adicional: ${contexto || "ninguno"}
Documento a analizar:
"""
${contenido}
"""`,

    revision_avaluo: `Eres un perito valuador experto en avalúos y revalúos de activos e inmuebles en Ecuador.
Sé conciso: cada observación máximo 1-2 líneas; la explicación máximo 4-5 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Analiza el siguiente avalúo/revalúo y extrae sus puntos principales: método de valoración usado, fecha de corte, valor comercial vs valor en libros, vida útil y depreciación si aplica, y cualquier inconsistencia o dato faltante. Responde con este JSON exacto:
{
  "veredicto": "correcto"|"incorrecto"|"con_observaciones",
  "resumen": "resumen de 2-3 líneas del avalúo/revalúo y su estado general",
  "explicacion": "párrafo de 3-5 líneas explicando en lenguaje claro si el avalúo está bien sustentado o no y por qué",
  "hallazgos": [
    {"item": "concepto revisado (ej. Método de valoración)", "tipo": "correcto"|"inconsistencia"|"advertencia", "detalle": "explicación breve"}
  ],
  "tabla_puntos": [
    {"concepto": "ej. Valor comercial", "valor": "dato encontrado en el documento", "observacion": "nota relevante"}
  ],
  "recomendaciones": ["recomendación concreta a seguir si algo está mal o podría mejorarse"]
}
Contexto adicional: ${contexto || "ninguno"}
Documento a analizar:
"""
${contenido}
"""`,

    revision_contrato: `Eres un abogado experto en derecho civil, laboral y mercantil de Ecuador, especializado en revisión de contratos.
Sé conciso: cada observación máximo 1-2 líneas; la explicación máximo 4-5 líneas.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Analiza el siguiente contrato y evalúa: claridad de las partes y objeto, si están claramente definidas las obligaciones de cada parte, si el monto/forma de pago es claro, si existen cláusulas ambiguas o riesgosas, si falta una cláusula de solución de controversias (mediación/arbitraje), si falta cláusula de terminación, si hace falta indicar plazo, y cualquier otro riesgo legal relevante según la legislación ecuatoriana. Responde con este JSON exacto:
{
  "veredicto": "correcto"|"incorrecto"|"con_observaciones",
  "resumen": "resumen de 2-3 líneas de qué tipo de contrato es y su estado general",
  "explicacion": "párrafo de 3-5 líneas explicando los riesgos u observaciones principales encontrados",
  "hallazgos": [
    {"item": "punto revisado (ej. Cláusula de terminación)", "tipo": "correcto"|"inconsistencia"|"advertencia", "detalle": "explicación breve del hallazgo, citando el artículo legal aplicable si es pertinente"}
  ],
  "tabla_puntos": [
    {"concepto": "ej. Objeto del contrato", "valor": "resumen de lo que dice el contrato en ese punto", "observacion": "qué tan claro/completo está"}
  ],
  "recomendaciones": ["recomendación concreta de qué agregar, aclarar o corregir antes de firmar"]
}
Contexto adicional: ${contexto || "ninguno"}
Documento a analizar:
"""
${contenido}
"""`,

    corregir_orden_compra: `Eres un auditor experto en compras y contratación para empresas en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Toma la siguiente orden de compra y genera su versión corregida (cálculos aritméticos correctos: cantidad x precio unitario = subtotal, suma de subtotales, IVA, total). Responde con este JSON exacto:
{
  "tabla_corregida": [
    {"concepto": "ítem/línea de la orden", "valor_original": "valor tal como aparece en el documento", "valor_corregido": "valor correcto (igual al original si ya estaba bien)", "observacion": "qué se corrigió, o 'sin cambios'"}
  ],
  "texto_corregido": "versión completa de la orden de compra con todas las correcciones aplicadas, en texto legible listo para copiar/exportar"
}
Resumen del análisis previo (para contexto): ${contexto || "ninguno"}
Documento original:
"""
${contenido}
"""`,

    corregir_rol_pago: `Eres un auditor experto en nómina y roles de pago en Ecuador (aporte personal 9.45%, aporte patronal 11.15%, SBU $482 en 2026).
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Toma el siguiente rol de pago y genera su versión corregida con todos los cálculos correctos. Responde con este JSON exacto:
{
  "tabla_corregida": [
    {"concepto": "ej. Aporte IESS personal", "valor_original": "valor tal como aparece en el rol", "valor_corregido": "valor matemáticamente correcto (igual al original si ya estaba bien)", "observacion": "qué se corrigió, o 'sin cambios'"}
  ],
  "texto_corregido": "versión completa del rol de pago con todos los valores corregidos, en texto legible listo para copiar/exportar"
}
Resumen del análisis previo (para contexto): ${contexto || "ninguno"}
Documento original:
"""
${contenido}
"""`,

    corregir_avaluo: `Eres un perito valuador experto en avalúos y revalúos de activos e inmuebles en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Toma el siguiente avalúo/revalúo y genera su versión corregida. Responde con este JSON exacto:
{
  "tabla_corregida": [
    {"concepto": "ej. Valor comercial", "valor_original": "valor tal como aparece", "valor_corregido": "valor correcto o ajustado (igual al original si ya estaba bien)", "observacion": "qué se corrigió, o 'sin cambios'"}
  ],
  "texto_corregido": "versión completa del avalúo con las correcciones aplicadas, en texto legible listo para copiar/exportar"
}
Resumen del análisis previo (para contexto): ${contexto || "ninguno"}
Documento original:
"""
${contenido}
"""`,

    generar_memo: `Eres un asistente experto en redacción de memorandos internos para empresas en Ecuador.
Redacta un memorando completo y profesional según la siguiente solicitud del usuario. Usa el formato estándar: encabezado (PARA, DE, FECHA, ASUNTO), cuerpo claro y bien estructurado, y despedida/firma si corresponde.
IMPORTANTE: NO incluyas ninguna línea con "MEMORANDO N°", "MEMORANDO No.", numeración, o un espacio en blanco/subrayado para un número — el sistema que usa este texto ya agrega automáticamente el número oficial en un encabezado aparte, y si tú agregas otra línea de número (aunque quede en blanco) se duplica. Empieza directo con PARA/DE/FECHA/ASUNTO.
Responde EXCLUSIVAMENTE con el texto completo del memo, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Solicitud del usuario sobre qué memo necesita:
"""
${contenido}
"""`,

    generar_memo_rrhh: `Eres un asistente experto en derecho laboral y gestión de talento humano en Ecuador.
Redacta un documento interno (memo o llamado de atención, según se indique) dirigido a un empleado específico por una falta leve, con fundamento general en el Código del Trabajo del Ecuador (régimen disciplinario, reglamento interno de trabajo, y el principio de que solo las faltas graves tipificadas expresamente habilitan la terminación por visto bueno — una falta leve NO es causal de despido, es una llamada de atención dentro del proceso disciplinario interno).
Formato: encabezado (PARA: nombre del empleado y cargo si se indica: DE: Talento Humano; FECHA; ASUNTO), cuerpo que describe los hechos de forma objetiva y respetuosa, cita en términos generales el fundamento (régimen disciplinario interno conforme al Código del Trabajo), indica que se trata de una falta leve y su prevención de futuras reincidencias, y cierre con espacio de firma para el área de Talento Humano y para el empleado (acuse de recibido).
IMPORTANTE: NO incluyas ninguna línea con número de documento ni un espacio en blanco/subrayado para un número — el sistema ya agrega el número oficial aparte. No cites artículos numerados específicos del Código del Trabajo salvo que el usuario los haya dado — refiérete de forma general al "régimen disciplinario interno conforme al Código del Trabajo y el Reglamento Interno de Trabajo" para evitar citar una norma incorrecta; sugiere al final, en una línea aparte tras el documento y antes de nada más, "Nota interna: se recomienda verificar la cita normativa exacta con el reglamento interno de la empresa antes de notificar." — esa nota NO debe ir dentro del cuerpo del documento, va después, en un bloque separado.
Responde con el documento completo seguido de la nota interna en una línea aparte al final, sin explicaciones adicionales, sin comillas envolventes, sin marcado markdown.
Datos del caso:
"""
${contenido}
"""`,

    generar_oficio: `Eres un asistente experto en redacción de oficios formales para instituciones y empresas en Ecuador.
Redacta un oficio completo y profesional según la siguiente solicitud del usuario. Usa el formato estándar ecuatoriano: lugar y fecha, destinatario, asunto, cuerpo formal, despedida y espacio de firma.
IMPORTANTE: NO incluyas ninguna línea con "OFICIO N°", "OFICIO No.", numeración, o un espacio en blanco/subrayado para un número — el sistema que usa este texto ya agrega automáticamente el número oficial en un encabezado aparte, y si tú agregas otra línea de número (aunque quede en blanco) se duplica. Empieza directo con el lugar y fecha.
Responde EXCLUSIVAMENTE con el texto completo del oficio, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Solicitud del usuario sobre qué oficio necesita:
"""
${contenido}
"""`,

    revisar_memo: `Eres un asistente experto en redacción de memorandos internos para empresas en Ecuador.
El usuario tiene el siguiente borrador de memo y quiere que lo revises o corrijas según sus instrucciones. Mejora la redacción, corrige errores, y aplica los cambios solicitados, manteniendo el formato profesional de memo (PARA/DE/FECHA/ASUNTO).
IMPORTANTE: si el borrador trae una línea de "MEMORANDO N°" con un espacio en blanco/subrayado, QUÍTALA — el sistema ya agrega el número oficial en un encabezado aparte y no debe duplicarse.
Responde EXCLUSIVAMENTE con el texto completo del memo corregido, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Instrucciones del usuario para esta revisión: ${contexto || "revisar redacción y corregir errores generales"}
Borrador actual:
"""
${contenido}
"""`,

    revisar_oficio: `Eres un asistente experto en redacción de oficios formales para instituciones y empresas en Ecuador.
El usuario tiene el siguiente borrador de oficio y quiere que lo revises o corrijas según sus instrucciones. Mejora la redacción, corrige errores, y aplica los cambios solicitados, manteniendo el formato formal de oficio.
IMPORTANTE: si el borrador trae una línea de "OFICIO N°" con un espacio en blanco/subrayado, QUÍTALA — el sistema ya agrega el número oficial en un encabezado aparte y no debe duplicarse.
Responde EXCLUSIVAMENTE con el texto completo del oficio corregido, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Instrucciones del usuario para esta revisión: ${contexto || "revisar redacción y corregir errores generales"}
Borrador actual:
"""
${contenido}
"""`,

    revisar_memo_rrhh: `Eres un asistente experto en derecho laboral y gestión de talento humano en Ecuador.
El usuario tiene el siguiente borrador de memo/llamado de atención por falta leve y quiere que lo revises o corrijas según sus instrucciones. Mejora la redacción, corrige errores, y aplica los cambios solicitados, manteniendo el tono objetivo y respetuoso, y sin convertir la falta leve en causal de despido.
IMPORTANTE: si el borrador trae un número de documento con espacio en blanco/subrayado, QUÍTALO — el sistema ya agrega el número oficial aparte. Conserva o repite al final, en línea aparte, la nota interna "Nota interna: se recomienda verificar la cita normativa exacta con el reglamento interno de la empresa antes de notificar."
Responde con el documento corregido seguido de esa nota interna en una línea aparte al final, sin explicaciones adicionales, sin comillas envolventes, sin marcado markdown.
Instrucciones del usuario para esta revisión: ${contexto || "revisar redacción y corregir errores generales"}
Borrador actual:
"""
${contenido}
"""`,

    generar_acta_junta: `Eres un abogado societario experto en la Ley de Compañías del Ecuador y su Reglamento de Juntas Generales de Socios y Accionistas.
Redacta el ACTA de la junta general solicitada, cumpliendo el contenido mínimo exigido por el Art. 33 del Reglamento de Juntas Generales (en concordancia con los Arts. 230 a 243 de la Ley de Compañías): a) tipo de compañía y denominación; b) cantón, dirección del local, fecha y hora de inicio; c) nombre de quienes actúan como Presidente y Secretario; d) transcripción del orden del día y forma de la convocatoria (o mención del Art. 238 si es junta universal, sin necesidad de convocatoria previa por estar presente todo el capital); e) indicación del quórum de instalación; f) relación ordenada de las deliberaciones y resoluciones adoptadas por cada punto; g) proclamación de resultados; y espacio de firmas del Presidente y Secretario (y de todos los asistentes si es junta universal, bajo sanción de nulidad conforme la ley).
Responde EXCLUSIVAMENTE con el texto completo del acta, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Datos y necesidad indicados por el usuario:
"""
${contenido}
"""`,

    revisar_acta_junta: `Eres un abogado societario experto en la Ley de Compañías del Ecuador y su Reglamento de Juntas Generales.
El usuario tiene el siguiente borrador de acta de junta general y quiere que lo revises o corrijas según sus instrucciones, manteniendo el contenido mínimo legal (tipo de junta, quórum, orden del día, deliberaciones, resoluciones, firmas).
Responde EXCLUSIVAMENTE con el texto completo del acta corregida, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Instrucciones del usuario para esta revisión: ${contexto || "revisar redacción y corregir errores generales"}
Borrador actual:
"""
${contenido}
"""`,

    generar_cesion_acciones: `Eres un abogado societario experto en la Ley de Compañías del Ecuador, especializado en cesión de acciones y participaciones.
Redacta el documento de CESIÓN de acciones/participaciones solicitado, considerando: para compañías de responsabilidad limitada, la cesión requiere consentimiento unánime del capital social (Art. 113 Ley de Compañías) y debe formalizarse mediante escritura pública o documento privado según corresponda, con inscripción en el Libro de Participaciones y Socios; para sociedades anónimas, la transferencia de acciones se perfecciona conforme a los Arts. 189, 192 y 196 de la Ley de Compañías, con inscripción en el Libro de Acciones y Accionistas. Incluye identificación completa de cedente y cesionario, número y valor de las acciones/participaciones cedidas, precio y forma de pago, declaración de que se cuenta con el consentimiento unánime del capital social (o referencia al acta de junta que lo aprobó, si aplica), y menciona la obligación de notificar la cesión a la Superintendencia de Compañías, Valores y Seguros dentro de los ocho días posteriores a la inscripción en los libros sociales (Art. 21 Ley de Compañías). Incluye espacio de firmas de cedente y cesionario.
Responde EXCLUSIVAMENTE con el texto completo del documento, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Datos y necesidad indicados por el usuario:
"""
${contenido}
"""`,

    revisar_cesion_acciones: `Eres un abogado societario experto en la Ley de Compañías del Ecuador, especializado en cesión de acciones y participaciones.
El usuario tiene el siguiente borrador de cesión de acciones/participaciones y quiere que lo revises o corrijas según sus instrucciones, manteniendo los elementos legales mínimos (partes, cantidad cedida, precio, consentimiento del capital social, inscripción en libros, notificación a la Superintendencia).
Responde EXCLUSIVAMENTE con el texto completo del documento corregido, sin explicaciones antes o después, sin comillas envolventes, sin marcado markdown.
Instrucciones del usuario para esta revisión: ${contexto || "revisar redacción y corregir errores generales"}
Borrador actual:
"""
${contenido}
"""`,

    recomendar_distribucion_dividendos: `Eres un asesor tributario experto en Ecuador, especializado en distribución de dividendos y utilidades conforme la Ley Orgánica de Transparencia Social (Tercer Suplemento del Registro Oficial No. 112, 28-ago-2025), que sustituyó el Art. 39.2 y agregó el Art. 39.2.1 de la Ley de Régimen Tributario Interno (LRTI), y la Resolución NAC-DGERCGC26-00000026 del SRI sobre pago a cuenta de utilidades no distribuidas.
Marco legal vigente que DEBES aplicar (texto oficial de la ley, Art. 39.2 y 39.2.1 LRTI):
- Impuesto único del 12% sobre el monto distribuido, en el ejercicio fiscal en que se produce la distribución.
- Se considera ingreso gravado toda distribución a cualquier tipo de contribuyente, EXCEPTO cuando se distribuye a otra sociedad residente en Ecuador o a un establecimiento permanente en el país de una sociedad no residente (esos casos están exentos, sin retención).
- La sociedad que distribuye actúa como agente de retención del 100% del impuesto causado, reteniendo al momento de la distribución (fecha del acta de junta que resuelve distribuir), independientemente de cuándo se pague efectivamente.
- Tarifas según el beneficiario:
  · Persona natural residente en Ecuador: tiene derecho a una franja EXENTA de 3 Salarios Básicos Unificados (SBU) por cada sociedad que le distribuye, dentro de un mismo período fiscal; sobre el excedente de esa franja se aplica la tarifa única del 12%.
  · No residente en general (persona o sociedad): tarifa del 10%.
  · No residente pero cuyo beneficiario efectivo es residente fiscal en Ecuador: tarifa del 12%.
  · Si además existe en la cadena de propiedad un residente en paraíso fiscal o jurisdicción de menor imposición Y el beneficiario efectivo es residente en Ecuador: tarifa del 14%.
  · Si la sociedad incumple su deber de informar la composición societaria: retención del 14% sobre los dividendos correspondientes a ese incumplimiento.
  · Dividendos anticipados (donaciones o préstamos no comerciales a beneficiarios de capital o partes relacionadas): se consideran dividendo anticipado y se retiene adicionalmente la tarifa de sociedades sobre el monto de la operación.
- Dividendos percibidos del exterior por residentes en Ecuador: se consolidan con la renta global y tributan según la tabla progresiva, con crédito tributario por el impuesto ya pagado en el exterior (hasta el límite del impuesto causado en Ecuador).
- Vigencia: los Arts. 39.2 y 39.2.1 rigen desde el primer día del mes siguiente a la publicación (es decir, desde el 1 de septiembre de 2025). Los dividendos percibidos por personas naturales residentes entre el 1 de enero de 2025 y el día anterior a esa vigencia se consolidan con la renta global bajo la tabla progresiva anterior (régimen transitorio), no bajo estas nuevas reglas.
- Pago a cuenta sobre utilidades acumuladas NO distribuidas (Art. 39.2.1): si hasta el 31 de julio del ejercicio fiscal corriente la sociedad no distribuye ni capitaliza sus utilidades acumuladas de ejercicios anteriores, debe pagar un anticipo según la tabla de TARIFA ÚNICA que fija la ley (0% hasta $100,000; 0.75% de $100,000 a $1,000,000; 1.25% de $1,000,000 a $10,000,000; 1.75% de $10,000,000 a $100,000,000; 2.25% de $100,000,000 a $500,000,000; 2.5% en adelante), aplicando esa única tarifa sobre el 100% del saldo no distribuido (sin restar el primer tramo de la base — NO es una tabla progresiva/marginal como la del Impuesto a la Renta). Se declara en una sola cuota en agosto, o en 3 cuotas (agosto/septiembre/octubre según noveno dígito del RUC), mediante el Formulario de Pago a Cuenta sobre Utilidades no Distribuidas (código de obligación 1077 o 1078), conforme la Resolución NAC-DGERCGC26-00000026. Este pago a cuenta se puede compensar después con retenciones futuras por distribución o con el impuesto a la renta, en la misma proporción en que se distribuyan/capitalicen las utilidades; si no se distribuye/capitaliza dentro de los 2 ejercicios fiscales siguientes al pago, ya no se puede compensar ni pedir devolución, y se registra como gasto no deducible.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Con los datos de la empresa, accionistas, participación y utilidad a distribuir que se detallan abajo, genera una recomendación de distribución. Responde con este JSON exacto:
{
  "resumen": "resumen de 2-4 líneas de la situación y la recomendación general (distribuir o no antes del 31 de julio, y por qué)",
  "tabla_distribucion": [
    {"accionista": "nombre", "porcentaje_participacion": "ej. 25%", "dividendo_bruto": "monto en USD asignado según su % de participación", "franja_exenta_aplicable": "monto exento (3 SBU o menos si ya usó parte)", "base_imponible": "dividendo_bruto menos franja exenta", "tarifa_aplicada": "ej. 12%, 0%, 10%, o 14% según el caso", "impuesto_retenido": "monto retenido", "valor_neto_a_pagar": "dividendo_bruto menos impuesto_retenido"}
  ],
  "alerta_pago_a_cuenta": "si no se distribuye antes del 31 de julio, explica brevemente que aplica el pago a cuenta sobre utilidades no distribuidas y su forma de pago (código 1077/1078), o indica que no aplica si ya se distribuyó/se va a distribuir a tiempo",
  "recomendaciones": ["recomendación concreta 1", "recomendación concreta 2"]
}
Datos de la empresa, accionistas y utilidad a distribuir:
"""
${contenido}
"""
Instrucciones adicionales del usuario: ${contexto || "ninguna"}`,

    generar_escenarios_dividendos: `Eres un asesor tributario y financiero experto en Ecuador, especializado en planificación de distribución de dividendos conforme la Ley Orgánica de Transparencia Social (Art. 39.2 y 39.2.1 LRTI) y la Resolución NAC-DGERCGC26-00000026 del SRI.
Marco legal a aplicar:
- Impuesto único del 12% sobre dividendos distribuidos a personas naturales residentes, sobre el excedente de la franja exenta de 3 SBU por sociedad/año; 10% a no residentes en general, 12% si el beneficiario efectivo es residente en Ecuador, 14% en casos de paraíso fiscal con beneficiario efectivo residente. Exento entre sociedades residentes ecuatorianas.
- Retención del 100% al momento de la distribución (fecha del acta que resuelve distribuir).
- Pago a cuenta sobre utilidades acumuladas NO distribuidas (Art. 39.2.1): si al 31 de julio no se distribuyen ni capitalizan las utilidades acumuladas, se paga un anticipo anual según la tabla de TARIFA ÚNICA (0% a 2.5% según tramo, aplicada sobre el 100% del saldo — no es progresiva/marginal). Este pago a cuenta se puede compensar con retenciones futuras por distribución o con el impuesto a la renta, EN LOS DOS EJERCICIOS FISCALES POSTERIORES al pago (es decir, contando el año del pago, se dispone de una ventana de aproximadamente 3 años en total); si no se distribuye ni capitaliza dentro de ese plazo, el crédito se pierde y se registra como gasto no deducible.
- Un mutuo (préstamo) de los accionistas de vuelta a la sociedad, tras recibir el dividendo, debe pactarse a una tasa de interés razonable (referencia: la tasa de interés legal/máxima convencional que publica mensualmente el Banco Central del Ecuador / Junta de Política y Regulación Monetaria y Financiera), y documentarse como contrato de mutuo independiente.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Con los datos de la empresa, utilidad acumulada no distribuida, pago(s) a cuenta ya realizados y su plazo de compensación, y accionistas, genera un análisis comparativo de escenarios. Responde con este JSON exacto:
{
  "resumen": "resumen de 3-5 líneas de la situación actual (incluyendo si hay un pago a cuenta con plazo de compensación por vencer) y qué factores son más relevantes para decidir",
  "escenarios": [
    {
      "nombre": "ej. Distribuir el 100% de las utilidades acumuladas",
      "descripcion": "explicación de 2-4 líneas de en qué consiste este escenario",
      "efecto_accionistas": "qué reciben los accionistas en efectivo, y su implicación personal (franja exenta, retención aplicada)",
      "efecto_tributario_empresa": "impuesto que retiene/paga la empresa, y si esto libera o compensa el pago a cuenta ya realizado",
      "monto_estimado_impuesto": "estimación en USD del impuesto total involucrado en este escenario",
      "recomendado_cuando": "en qué circunstancia este escenario es la mejor opción"
    }
  ],
  "recomendacion_general": "cuál escenario recomiendas priorizar y por qué, en 2-4 líneas"
}
Asegúrate de incluir como mínimo estos escenarios, en este orden: 1) Distribuir el 100% de las utilidades (mencionando la opción de que los accionistas presten el dinero de vuelta a la empresa mediante un contrato de mutuo a tasa de interés legal, para no perder liquidez); 2) No repartir y seguir asumiendo el pago a cuenta anual sobre utilidades no distribuidas; y luego 2 o 3 escenarios adicionales que consideres pertinentes (por ejemplo: distribución parcial dentro de la franja exenta de cada accionista, capitalización de utilidades como aumento de capital social, o distribución escalonada en varios ejercicios fiscales).
Datos de la empresa y situación:
"""
${contenido}
"""
Instrucciones adicionales del usuario: ${contexto || "ninguna"}`,

    calcular_distribucion_accionistas_actuales: `Eres un asesor tributario experto en Ecuador, especializado en distribución de utilidades acumuladas conforme la Ley Orgánica de Transparencia Social (Art. 39.2 y 39.2.1 LRTI) y la Resolución NAC-DGERCGC26-00000026 del SRI.
Contexto de este cálculo: los accionistas ACTUALES de la empresa adquirieron los derechos sobre TODA la utilidad acumulada histórica (sin importar quién era accionista cuando se generó cada utilidad), y esta se reparte según el número de acciones/participación que cada uno tiene HOY.
Marco legal a aplicar:
- Impuesto único del 12% sobre dividendos a personas naturales residentes, sobre el excedente de la franja exenta de 3 SBU por sociedad/año (si ya hubo un anticipo de dividendos ese mismo año a ese accionista, la franja exenta y el impuesto ya pagado en ese anticipo DEBEN considerarse/descontarse del cálculo final, para no exceder ni duplicar la franja ni el impuesto).
- 10% para no residentes en general; 12% si el beneficiario efectivo es residente en Ecuador; 14% si hay paraíso fiscal en la cadena de propiedad + beneficiario efectivo residente en Ecuador, o si la sociedad incumple informar su composición societaria.
- Retención del 100% del impuesto causado al momento de la distribución (fecha del acta).
- Si la empresa decide pagar HOY solo una parte del monto que le corresponde a un accionista (por razones de liquidez), igual se calcula y retiene el impuesto sobre el monto que se está distribuyendo/reconociendo como dividendo en ese momento, no sobre el saldo que se pague después.
- Pago a cuenta sobre utilidades no distribuidas (Art. 39.2.1): si un año del plan de distribución no llega a distribuirse antes del 31 de julio, recuerda que puede generar la obligación de pago a cuenta sobre el saldo no distribuido de ese año.
- Al calcular la retención de CADA año del plan, considera tanto el monto individual de ese año como el monto ACUMULADO del plan hasta ese año (dato que se te da explícitamente): la franja exenta de 3 SBU se agota una sola vez por sociedad/período fiscal, así que si el acumulado ya superó la franja en años anteriores del plan, la retención del año actual debe calcularse sobre el 100% de ese año (ya no queda franja disponible); si el acumulado hasta ese año todavía no supera la franja, aplica la parte de franja que quede disponible sobre el monto de ese año específico.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Con los datos que se detallan abajo (empresa, utilidad total a repartir, accionistas actuales con su % de participación, posibles anticipos ya entregados y su impuesto ya pagado, monto que la empresa está dispuesta a pagar ahora a cada uno; y el plan de distribución por año con los montos, el acumulado hasta cada año, y si se retuvo impuesto en cada año), calcula la retención correspondiente según la ley vigente y da recomendaciones. Responde con este JSON exacto:
{
  "resumen": "resumen de 2-4 líneas de la situación general",
  "tabla_accionistas": [
    {"accionista": "nombre", "porcentaje_participacion": "ej. 25%", "monto_que_le_corresponde": "monto total según su % sobre la utilidad acumulada", "anticipo_recibido": "monto de anticipo ya recibido, o 'Ninguno'", "impuesto_ya_pagado_anticipo": "monto ya retenido en el anticipo, o 0", "monto_que_la_empresa_pagara_ahora": "el monto que la empresa está dispuesta a pagar ahora, tal como lo indicó el usuario", "retencion_calculada_sobre_este_pago": "impuesto a retener sobre el monto que se paga ahora, considerando franja exenta ya usada en anticipos", "saldo_pendiente_por_pagar": "monto que le corresponde menos lo ya pagado (anticipo + este pago)", "recomendacion": "recomendación breve para este accionista en particular"}
  ],
  "tabla_anios": [
    {"anio": "año", "monto_a_distribuir_ese_anio": "monto planeado para ese año", "monto_acumulado_hasta_ese_anio": "el acumulado del plan hasta ese año, tal como se indicó", "se_retuvo_impuesto": "sí/no según lo indicado", "retencion_calculada": "impuesto que corresponde retener ese año si aún no se ha retenido (considerando el acumulado y la franja exenta ya usada), o 'Ya retenido' si el usuario indicó que sí", "recomendacion": "recomendación breve para ese año (ej. hacerlo antes del 31 de julio, alerta de pago a cuenta, franja exenta ya agotada, etc.)"}
  ],
  "recomendaciones_generales": ["recomendación general 1", "recomendación general 2"]
}
Datos del cálculo:
"""
${contenido}
"""
Instrucciones adicionales del usuario: ${contexto || "ninguna"}`,

    calcular_informe_retencion_dividendos: `Eres un asesor tributario experto en Ecuador, especializado en el cálculo de retenciones sobre dividendos conforme la Ley Orgánica de Transparencia Social (Art. 39.2 y 39.2.1 LRTI) y la Resolución NAC-DGERCGC26-00000026 del SRI.
Marco legal a aplicar:
- Impuesto único del 12% para personas naturales residentes, sobre el excedente de la franja exenta de 3 SBU por sociedad y por período fiscal (si ya hubo un anticipo de dividendos en el mismo período a ese accionista, se debe restar el anticipo del valor a pagar ahora, y considerar que la franja exenta ya pudo haberse usado parcial o totalmente con ese anticipo).
- 10% para no residentes en general; 12% si el beneficiario efectivo es residente en Ecuador; 14% si hay paraíso fiscal en la cadena de propiedad + beneficiario efectivo residente en Ecuador, o si la sociedad incumple informar su composición societaria.
- Retención del 100% del impuesto causado al momento de la distribución (fecha del acta).
- Exento si el receptor es otra sociedad residente en Ecuador.
IMPORTANTE SOBRE LOS NÚMEROS: si en los datos de abajo aparece una línea que dice "CÁLCULO YA HECHO EN LA APP", esos valores (franja exenta disponible, base imponible, tarifa, retención, neto a pagar) YA fueron calculados correctamente por la aplicación con datos exactos — son la fuente de verdad. NO los recalcules ni los cambies: cópialos tal cual en los campos correspondientes del JSON, y dedica tu razonamiento únicamente a redactar la explicación y las alertas. Si esa línea no aparece para algún accionista, ahí sí calcula tú mismo aplicando el marco legal de arriba.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Con los datos de la empresa, el período, y cada accionista con el valor que corresponde pagarle y el anticipo ya entregado (si lo hay), genera un informe individual por accionista y un informe conjunto ejecutivo. Responde con este JSON exacto:
{
  "informes_individuales": [
    {"accionista": "nombre", "valor_registrado": "el valor que corresponde pagarle, tal como se indicó", "anticipo_restado": "monto del anticipo ya entregado que se resta, o 'Ninguno'", "base_de_calculo": "valor_registrado menos anticipo_restado", "franja_exenta_aplicable": "monto exento aplicable (usa el valor ya calculado por la app si está presente)", "base_imponible": "usa el valor ya calculado por la app si está presente", "tarifa_aplicada": "usa la tarifa ya indicada por la app si está presente (ej. 12%, 10%, 14%)", "retencion_calculada": "usa el valor ya calculado por la app si está presente", "valor_neto_a_pagar": "usa el valor ya calculado por la app si está presente", "texto_informe_individual": "párrafo de 2-4 líneas explicando el cálculo de este accionista en particular, listo para entregarle"}
  ],
  "informe_conjunto_ejecutivo": "informe ejecutivo consolidado de 4-6 líneas: empresa, período, número de accionistas incluidos, suma total de valores a pagar, suma total de retenciones, y suma total neta a pagar; más cualquier alerta relevante (ej. si algún accionista no residente, o si hay riesgo de duplicar franja exenta)"
}
Datos de la empresa, período y accionistas:
"""
${contenido}
"""
Instrucciones adicionales del usuario: ${contexto || "ninguna"}`,

    generar_plan_multianual_dividendos: `Eres un asesor tributario experto en Ecuador, especializado en planificación de distribución de dividendos conforme la Ley Orgánica de Transparencia Social (Art. 39.2 y 39.2.1 LRTI) y la Resolución NAC-DGERCGC26-00000026 del SRI.
Marco legal a aplicar:
- Impuesto único del 12% para personas naturales residentes, sobre el excedente de la franja exenta de 3 SBU por sociedad y por período fiscal (la franja se renueva cada año fiscal).
- 10% para no residentes en general; 12% si el beneficiario efectivo es residente en Ecuador; 14% en casos de paraíso fiscal con beneficiario efectivo residente en Ecuador.
- Retención del 100% al momento de cada distribución.
- Pago a cuenta sobre utilidades no distribuidas (Art. 39.2.1): si al 31 de julio de un ejercicio no se distribuyen ni capitalizan las utilidades acumuladas, se paga un anticipo anual; se puede compensar con retenciones futuras o el impuesto a la renta dentro de los 2 ejercicios fiscales posteriores al pago (3 años en total contando el del pago); si no se compensa a tiempo, se pierde el crédito.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
Con los datos de la empresa (utilidad acumulada total a distribuir, accionistas actuales con su % de participación, y pagos a cuenta ya realizados con su plazo de compensación), genera una RECOMENDACIÓN DE PLAN DE DISTRIBUCIÓN a lo largo de varios años (tú decides cuántos años son razonables, normalmente entre 2 y 5, buscando optimizar el uso de la franja exenta de cada año y respetar los plazos de compensación de pagos a cuenta vigentes). Para cada año del plan, indica el monto a distribuir ESE año específico y el monto ACUMULADO del plan hasta ese año (inclusive). Responde con este JSON exacto:
{
  "resumen": "resumen de 3-5 líneas de la lógica general del plan propuesto y por qué esa cantidad de años",
  "plan_anios": [
    {"anio": "año", "monto_ese_anio": "monto en USD a distribuir ese año específico", "monto_acumulado": "suma acumulada del plan hasta ese año inclusive", "retencion_estimada": "impuesto estimado a retener ese año considerando la franja exenta anual", "recomendacion": "recomendación breve para ese año (ej. hacerlo antes del 31 de julio, aprovecha la franja exenta completa, compensa el pago a cuenta X, etc.)"}
  ],
  "recomendacion_general": "recomendación general de 2-4 líneas sobre el plan completo"
}
Datos de la empresa y situación:
"""
${contenido}
"""
Instrucciones adicionales del usuario: ${contexto || "ninguna"}`,

    analizar_respaldo_general_proyecto: `Eres un asistente experto en verificación de cumplimiento documental en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
El usuario tiene un único documento (adjunto como PDF a este mensaje, o como texto más abajo) que quiere usar como respaldo/evidencia de VARIOS puntos/requisitos de un proyecto a la vez. Los puntos a verificar son:
${contexto || ""}
Analiza el contenido del documento y evalúa, para CADA uno de esos puntos, si el documento lo respalda o justifica. Responde con este JSON exacto:
{
  "resumen": "resumen de 2-4 líneas de qué es el documento y en general qué tanto respalda el conjunto de puntos",
  "puntos": [
    {"descripcion": "el punto tal como se listó arriba", "justifica": "si"|"no"|"parcial", "comentario": "explicación breve de 1-2 líneas"}
  ],
  "recomendaciones": ["recomendación breve 1", "recomendación breve 2"]
}
Contenido del documento (texto extraído, si lo hay; si se adjuntó un PDF a este mensaje, analiza también su contenido visual):
"""
${contenido}
"""`,

    generar_puntos_proyecto: `Eres un asistente experto en gestión de proyectos y cumplimiento documental en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
El siguiente es un memo, oficio o documento que da origen o respalda un proyecto/equipo de trabajo. Léelo con cuidado y extrae cada punto, requisito, entregable u obligación concreta que el documento pide cumplir o entregar. Cada punto debe ser una acción/entregable específico y verificable (no generalidades). Responde con este JSON exacto:
{
  "puntos": ["descripción del punto/requisito 1", "descripción del punto/requisito 2"]
}
Documento:
"""
${contenido}
"""`,

    analizar_punto_proyecto: `Eres un asistente experto en verificación de cumplimiento documental en Ecuador.
IMPORTANTE: responde EXCLUSIVAMENTE con el objeto JSON. No escribas ninguna palabra antes ni después del JSON, ni marques con \`\`\`. La primera letra de tu respuesta debe ser "{" y la última "}".
El punto/requisito a cumplir es: "${contexto || ""}"
${listaPdfs.length ? `Se han adjuntado ${listaPdfs.length} archivo(s) PDF a este mensaje como documentos (no como texto): ${listaPdfs.map(p=>p.nombre||"archivo").join(", ")}. Estos PDF SÍ son legibles — ábrelos y analiza su contenido visual directamente (texto, tablas, escaneos, imágenes, sellos, firmas, etc.), incluso si el bloque de "Contenido de los soportes" de abajo solo trae una nota indicando que no se pudo extraer texto por software: esa nota es solo un aviso técnico de que la extracción automática de texto falló, NO significa que el documento sea ilegible ni que no exista contenido que analizar. Nunca respondas que el documento no es legible o que necesitas un documento legible: los PDF adjuntos a este mensaje son completamente legibles para ti.` : ""}
Analiza si el contenido de los siguientes documentos de soporte (adjuntados por el usuario) justifican o respaldan adecuadamente ese punto. Responde con este JSON exacto:
{
  "justifica": "si"|"no"|"parcial",
  "comentario": "explicación breve de 1-3 líneas de por qué sí, no, o parcialmente, y qué faltaría si aplica"
}
Contenido de los soportes (texto extraído automáticamente, cuando lo hay; puede no incluir el contenido de los PDF adjuntos como documentos, revísalos aparte):
"""
${contenido}
"""`,
  };

  const prompt = prompts[modo];
  if (!prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Modo no soportado" }) };
  }

  // Modelo por modo: los modos de texto largo / extracción usan Haiku (rápido,
  // evita el límite de ~26s de Netlify); el resto usa Sonnet (más razonamiento).
  const MODOS_HAIKU = new Set([
    "revision_orden_compra", "revision_rol_pago", "revision_avaluo",
    "corregir_orden_compra", "corregir_rol_pago", "corregir_avaluo",
    "generar_puntos_proyecto", "analizar_punto_proyecto",
    "puntos_equipo_oficio", "revisar_punto_oficio",
    "generar_memo", "generar_oficio", "revisar_memo", "revisar_oficio",
    "generar_memo_rrhh", "revisar_memo_rrhh",
    "generar_acta_junta", "revisar_acta_junta",
    "generar_cesion_acciones", "revisar_cesion_acciones",
    "auditoria_localizar", "auditoria_extraer_estado", "auditoria_opinion",
    "informe_auditoria_supercias", "informe_auditoria_externa",
  ]);
  const MODELO_HAIKU = "claude-haiku-4-5-20251001";
  const MODELO_SONNET = "claude-sonnet-5";
  const modeloPrincipal = MODOS_HAIKU.has(modo) ? MODELO_HAIKU : MODELO_SONNET;
  const modeloAlterno = modeloPrincipal === MODELO_SONNET ? MODELO_HAIKU : MODELO_SONNET;

  // Resiliencia: ante saturación (529/503), cuota (429) o timeout se reintenta
  // dentro de un presupuesto total que respeta el límite de Netlify.
  const inicio = Date.now();
  const PRESUPUESTO_MS = 25000;
  const restante = () => PRESUPUESTO_MS - (Date.now() - inicio);
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  const ESTADOS_REINTENTABLES = new Set([408, 429, 500, 502, 503, 504, 529]);

  const MODOS_EXTRACCION = new Set(["auditoria_localizar", "auditoria_extraer_estado", "auditoria_opinion"]);
  const maxTokens = MODOS_EXTRACCION.has(modo) ? 8192
    : (modo === "informe_auditoria_supercias" ? (parteInforme ? 2200 : 4500)
    : (modo === "informe_auditoria_externa" ? 4500 : 2800));

  const contenidoMensaje = (listaPdfs.length || listaImgs.length)
    ? [
        ...listaPdfs.map(p => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data } })),
        ...listaImgs.flatMap(im => [
          { type: "text", text: String(im.etiqueta || "Página") + ":" },
          { type: "image", source: { type: "base64", media_type: im.mime || "image/jpeg", data: im.data } },
        ]),
        { type: "text", text: prompt },
      ]
    : prompt;

  async function llamarClaude(modelo, limiteMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), limiteMs);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: maxTokens,
          ...(MODOS_EXTRACCION.has(modo) ? { temperature: 0 } : {}),
          messages: [{ role: "user", content: contenidoMensaje }],
        }),
        signal: controller.signal,
      });
      let data = {};
      try { data = await resp.json(); } catch (e) { /* respuesta no-JSON */ }
      if (!resp.ok) {
        const msg = data.error?.message || `HTTP ${resp.status}`;
        const reintentable = ESTADOS_REINTENTABLES.has(resp.status) || resp.status === 404 || /overload|unavailable|rate|capacity|busy/i.test(msg);
        return { ok: false, status: resp.status, error: msg, reintentable };
      }
      const texto = (data.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
      if (!texto.trim()) return { ok: false, status: 200, error: "Claude devolvió una respuesta vacía", reintentable: true };
      return { ok: true, texto };
    } catch (err) {
      const esTimeout = err.name === "AbortError";
      return { ok: false, status: esTimeout ? 504 : 0, error: esTimeout ? "tiempo de espera agotado" : String(err), reintentable: true };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    const plan = [
      { modelo: modeloPrincipal, esperaAntes: 0 },
      { modelo: modeloAlterno, esperaAntes: 400 },
      { modelo: modeloPrincipal, esperaAntes: 1500 },
    ];
    const errores = [];
    let textoCompleto = "";
    let proveedor = "";
    const sinCuota = new Set();
    for (let i = 0; i < plan.length && !textoCompleto; i++) {
      const { modelo, esperaAntes } = plan[i];
      if (sinCuota.has(modelo)) continue;
      if (esperaAntes) {
        if (restante() < esperaAntes + 4000) break;
        await esperar(esperaAntes);
      }
      const primeraCorta = parteInforme || modo === "informe_auditoria_externa";
      const limite = i === 0
        ? (primeraCorta ? Math.min(16000, restante() - 1500) : Math.max(8000, restante() - 1500))
        : restante() - 300;
      if (limite < 4000) break;
      const r = await llamarClaude(modelo, limite);
      if (r.ok) { textoCompleto = r.texto; proveedor = modelo; break; }
      if (r.status === 429) sinCuota.add(modelo);
      errores.push(`${modelo}: ${r.error}`);
      if (!r.reintentable) break;
    }

    if (!textoCompleto) {
      const todo = errores.join(" ");
      const soloTiempo = errores.length && errores.every(e => /tiempo de espera/i.test(e));
      const porTokens = /token|too long|exceeds|too large|payload|request_too_large/i.test(todo);
      const porCuota = /rate.?limit|429|quota|credit|balance/i.test(todo);
      const saturado = /overload|unavailable|503|529|capacity|busy/i.test(todo);
      let mensaje, codigo;
      if (porTokens) {
        codigo = 413;
        mensaje = "El contenido enviado es demasiado extenso para una sola consulta a la IA. Analiza menos archivos a la vez (por ejemplo, una subcarpeta o un documento).";
      } else if (soloTiempo) {
        codigo = 504;
        mensaje = "La IA tardó demasiado en responder. Vuelve a intentarlo en un momento; si se repite, envía menos contenido a la vez.";
      } else if (porCuota && !saturado) {
        codigo = 429;
        mensaje = "Se alcanzó el límite de uso de la IA (o no hay saldo en la cuenta de Anthropic). Espera 1-2 minutos y vuelve a intentarlo; si persiste, revisa el saldo/límites en console.anthropic.com.";
      } else if (saturado || porCuota) {
        codigo = 503;
        mensaje = "Los servidores de IA están saturados en este momento. Espera 1-2 minutos y vuelve a intentarlo.";
      } else {
        codigo = 500;
        mensaje = "No se pudo obtener respuesta de la IA: " + (errores[errores.length - 1] || "error desconocido") +
          (/api key|permission|unauthori|403|401|invalid x-api-key/i.test(todo) ? " — revisa que ANTHROPIC_API_KEY sea válida en Netlify." : "");
      }
      return { statusCode: codigo, headers, body: JSON.stringify({ error: mensaje, detalle: errores }) };
    }

    const textBlock = { text: textoCompleto };
    const MODOS_TEXTO_PLANO = new Set(["generar_memo", "generar_oficio", "revisar_memo", "revisar_oficio", "generar_memo_rrhh", "revisar_memo_rrhh", "generar_acta_junta", "revisar_acta_junta", "generar_cesion_acciones", "revisar_cesion_acciones"]);
    let parsed = null;
    if (MODOS_TEXTO_PLANO.has(modo)) {
      let texto = textBlock.text.trim();
      texto = texto.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
      if ((texto.startsWith('"') && texto.endsWith('"')) || (texto.startsWith("'") && texto.endsWith("'"))) {
        texto = texto.slice(1, -1);
      }
      parsed = { texto };
    } else {
      parsed = parsearRespuestaIA(textBlock.text, modo);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ resultado: parsed, proveedor }) };
  } catch (err) {
    const mensaje = err.name === "AbortError"
      ? "La IA tardó demasiado en responder (más de 25s). Intenta con un texto más corto o vuelve a intentarlo."
      : String(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: mensaje }) };
  }
};
