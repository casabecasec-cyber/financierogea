# Control de Trámites Ecuador — Guía de despliegue

App de un solo archivo (`index.html`) + una función serverless (`netlify/functions/analizar.js`)
para IA, pensada para desplegarse en Netlify con Firebase como backend.

---

## 1. Consigue tu API key de Anthropic (para el módulo de IA)

1. Entra a **https://console.anthropic.com** y crea una cuenta (o inicia sesión).
2. Ve a **Settings → API Keys** (o el apartado de "Billing" primero si te pide cargar saldo;
   la API se cobra por uso, es independiente de una suscripción a Claude.ai).
3. Crea una nueva key, ponle un nombre como `tramites-ecuador` y **cópiala** (solo se muestra una vez).
4. Guárdala en un lugar seguro. La necesitarás en el paso 4 (Netlify), **nunca la pegues dentro
   del index.html** ni la subas a un repositorio público — por eso todo el análisis de IA pasa
   por la función serverless `analizar.js`, que la lee desde una variable de entorno.

## 2. Firebase — proyecto compartido con CasaBecas (`casabecas-8afea`)

Esta app ahora usa el mismo proyecto Firebase de tus otras apps de CasaBecas
(`casabecas-8afea`) y su Realtime Database existente. Los datos se guardan en ramas nuevas:
`/empresas`, `/tramites`, `/checklist_estado`, `/documentos_revision`.

**No es necesario tocar las reglas de seguridad**: ese proyecto ya tiene una regla comodín
`"$other"` que da acceso de lectura/escritura a cualquier ruta no listada explícitamente,
para el UID de la cuenta principal de administrador. Como esta app usa esa misma cuenta,
queda cubierta automáticamente.

**Inicio de sesión**: se quitó la opción de "Crear cuenta" — esta app ahora solo permite
iniciar sesión con la cuenta de administrador existente (mismo correo/contraseña que usas en
las otras apps de CasaBecas). Si necesitaras dar acceso a otra persona con su propia cuenta,
avísame: habría que agregar su UID a un bloque de reglas nuevo, ya que el comodín `$other`
solo cubre al UID de administrador.

**Nota:** esta app **no usa Firebase Storage**, solo Realtime Database.

### ⚠️ Importante: reglas de seguridad de Realtime Database

Ahora mismo tu base de datos tiene las reglas de "modo de prueba" que genera Firebase por
defecto:

```json
{
  "rules": {
    ".read": "now < 1785819600000",
    ".write": "now < 1785819600000"
  }
}
```

Esto significa que **cualquier persona, sin iniciar sesión, puede leer y escribir toda tu base
de datos** hasta el 4 de agosto de 2026, y que después de esa fecha se bloquea por completo
(incluso para ti). Conviene reemplazarlas ahora.

Como `financierogea-ec95d` es un proyecto dedicado a esta app (no compartido con otras), puedes
ir directo a **Realtime Database → pestaña "Rules"** y reemplazar el bloque completo por este,
que exige inicio de sesión y limita a cada usuario a su propia rama de datos:

```json
{
  "rules": {
    "empresas": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "tramites": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "checklist_estado": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "documentos_revision": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "documentos_elaborados": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "contadores_documentos": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "documentos_legales": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "actas_reunion": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "equipos_trabajo": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "equipos_pdfs": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "colaboradores": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "auditorias_generales": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "activos_fijos": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "bancos_empresa": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "flujos_caja": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "vacaciones": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "actas_juntas": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "cesiones_acciones": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "log_cambios": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "dividendos_data": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "dividendos_archivos": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

Si más adelante agregas otras apps a este mismo proyecto Firebase, recuerda que estas reglas
son globales para toda la base — cualquier ruta nueva (`/otra-cosa`) necesitará su propio
bloque agregado aquí también.

### Sobre las cuentas de usuario

Crea tu cuenta (por ejemplo `departamentofinancierogea@gmail.com`) desde la pestaña "Crear
cuenta" dentro de la app la primera vez que entres — queda registrada en Authentication de este
proyecto, y todos los datos que generes (empresas, trámites) se guardan bajo tu `uid`.

## 3. Sube el proyecto a Netlify

1. Sube esta carpeta completa (`index.html`, `netlify.toml`, `netlify/functions/analizar.js`)
   a un repositorio de GitHub, o arrastra la carpeta directamente en
   **https://app.netlify.com → Add new site → Deploy manually**.
2. Netlify detectará `netlify.toml` automáticamente y publicará la función en
   `/.netlify/functions/analizar` (accesible desde la app como `/api/analizar`).

## 4. Configura la variable de entorno con tu API key

1. En Netlify: **Site settings → Environment variables → Add a variable**.
2. Nombre: `ANTHROPIC_API_KEY`
   Valor: la key que copiaste en el paso 1.
3. Vuelve a desplegar el sitio (Deploys → Trigger deploy) para que la función la tome.

## 5. Primer uso

1. Abre la URL de Netlify, crea tu cuenta (pestaña "Crear cuenta").
2. Ve a **Empresas y Cumplimiento** → crea tu primera empresa con su RUC y régimen; el
   checklist de obligaciones (SRI, IESS, Superintendencia de Compañías, Municipio, Bomberos)
   se genera automáticamente.
3. En **Trámites Públicos/Privados**, crea un trámite, sube o pega el oficio, y usa
   "Analizar con IA" para obtener el diagnóstico, cómo responder, el borrador de respuesta
   y la revisión de soportes.

## Notas importantes

- **Nuevo: informe de diferencias entre Comparativo SRI y Historial de Dividendos** — botón
  "🔍 Ver informe de diferencias con Comparativo SRI" en "Trabajar con Resúmenes". Muestra, año
  por año, la "Utilidad a Distribuir" del Comparativo SRI contra la fila SUMAN del Historial de
  Dividendos, resalta en rojo los años que no cuadran, y suma la diferencia total al final.
  Útil para detectar rápido dónde se desalinearon ambas tablas (normalmente porque se editó un
  valor a mano después de la última vez que se usó "🔄 Recalcular").
- **Nuevo: Imprimir, Descargar PDF y Descargar Excel en "Trabajar con Resúmenes"** — igual que
  en el Comparativo SRI, genera un informe ejecutivo profesional con: resumen ejecutivo (capital
  actual, utilidad acumulada, total distribuido histórico, diferencia total vs. Comparativo),
  el Historial de Capital Social completo, el Historial de Dividendos completo, y la
  Conciliación año por año con el Comparativo SRI (filas con diferencia resaltadas en rojo). El
  Excel exporta todo en 3 hojas separadas: Capital Social, Historial Dividendos, y Conciliación.

- **Corregido: faltaba el total en la columna "TOTAL ACUMULADO" de las filas SUMAN y TOTAL
  ACUMULADO EMPRESA** — esas celdas quedaban vacías; ahora muestran el gran total (suma de
  todos los años), que debe coincidir con la suma de la columna "TOTAL ACUMULADO" de todos los
  accionistas.

- **Simplificado: Historial de Dividendos por accionista** — se quitaron las columnas
  "IMP. RENTA" y "A PAGAR" (ya no necesarias en esta tabla). La columna "TOTAL" se renombró a
  **"TOTAL ACUMULADO"** por accionista (sigue siendo la suma de todos sus años, editable). La
  fila resumen de toda la empresa se renombró a "TOTAL ACUMULADO EMPRESA" para no confundirla
  con la columna por accionista — sigue comparándose visualmente contra la "Utilidad Acumulada"
  del Comparativo SRI... (✓/⚠ por año).

- **Nuevo: fila "TOTAL ACUMULADO" en Historial de Dividendos** — debajo de SUMAN, muestra la
  suma corrida año por año, y bajo cada celda se compara automáticamente contra la "Utilidad
  Acumulada" del Comparativo SRI... para ese mismo año: ✓ verde si cuadra, ⚠ rojo con el monto
  del Comparativo si no coincide — para verificar visualmente que ambas tablas están alineadas.
- **Reconectado: las 3 tarjetas de "Trabajar con Resúmenes" vuelven a venir del Comparativo
  SRI** (cuando ves la empresa completa, sin filtrar por accionista): "Utilidad Acumulada a la
  fecha", "Impuesto Causado histórico", y "Participación Repartida histórica" (reemplaza a
  "Neto histórico pagado"). Ahora que existe el botón "🔄 Recalcular desde Comparativo SRI + %
  de Capital", tiene sentido que ambas fuentes se mantengan visibles y comparables una junto a
  la otra — se agregó una nota junto a las tarjetas aclarando que para cambiarlas hay que
  editar el Comparativo SRI directamente (o usar el botón de recálculo), no el Historial de
  Dividendos. Cuando filtras por un accionista específico, las tarjetas vuelven a su cálculo
  anterior basado en el historial de ese accionista (el Comparativo SRI es a nivel de empresa,
  no por accionista).

- **Nuevo: recalcular el Historial de Dividendos desde Comparativo SRI + % de Capital** — en
  "Trabajar con Resúmenes", botón "🔄 Recalcular desde Comparativo SRI + % de Capital" sobre la
  tabla de "Historial de dividendos". Para cada año, toma la "Utilidad a Distribuir" del
  Comparativo SRI/Súper Cías/Contable y la reparte entre los accionistas según su % **real** de
  participación ese año específico (capital de cada accionista ese año ÷ capital total de la
  empresa ese año, del Historial de capital social) — reemplazando los valores por accionista y
  año, para que el historial de dividendos quede consistente con esas dos fuentes en vez de
  depender solo de lo que traía el Excel original. Pide confirmación antes de aplicar (porque
  sobrescribe los valores por año existentes); los montos de IMP. RENTA y A PAGAR no se tocan,
  se dejan para ajuste manual.

- **Nuevo: cálculos legales determinísticos (no solo estimados por IA)** en Dividendos:
  - **Valores oficiales agregados**: SBU por año (2021-2026, $400 a $482), franja exenta = 3 SBU
    del año de la distribución, tarifas de retención (12% residente, 10% no residente general,
    12% beneficiario efectivo residente, 14% paraíso fiscal), y la tabla progresiva oficial de
    Impuesto a la Renta de Personas Naturales 2026 (Resolución NAC-DGERCGC25-00000043, tramos
    de 0% a 35%), usada para estimar el pago a cuenta sobre utilidades no distribuidas (Art.
    39.2.1 LRTI).
  - **Escenarios**: la "Utilidad acumulada no distribuida" ahora se puede traer directamente del
    Comparativo SRI/Súper Cías/Contable para el "Año de análisis" elegido (botón "↺ Traer del
    Comparativo SRI"), y se agregó una tarjeta de referencia que muestra el **pago a cuenta
    estimado** aplicando la tabla progresiva oficial sobre esa utilidad acumulada — este valor
    también se envía a la IA como dato ya calculado.
  - **Calculadora de retención por accionista(s) y periodo**: ahora tiene un selector de "Tipo
    de beneficiario" (define la tarifa exacta), calcula en el propio navegador (no depende de
    que la IA "adivine" el número) la franja exenta disponible por accionista, la base
    imponible, la retención y el neto a pagar — todo visible en la tabla en pantalla, en tiempo
    real. Estos valores exactos se le pasan a la IA como "cálculo ya hecho" para que redacte el
    informe sobre ellos sin recalcularlos ni cambiarlos.

- **Movido: "🧠 Recomendación de distribución con IA"** — pasó de "Trabajar con Resúmenes" a
  **"Distribución Accionistas Actuales"**. Ya no tiene la opción de "solo para un accionista"
  (ese filtro no existe en la nueva ubicación); ahora siempre calcula para todos los
  accionistas actuales de la empresa seleccionada, según su % de participación.
- **Corregido: las tarjetas de resumen en "Trabajar con Resúmenes" no se actualizaban con
  los nuevos valores de utilidades por año** — esto fue una consecuencia de un cambio anterior
  que las hacía depender del Comparativo SRI (una tabla de datos completamente separada), así
  que editar el historial de dividendos en esta misma pestaña ya no se reflejaba ahí. Se
  revirtió: las tarjetas "Utilidad/dividendo histórico", "Impuesto de renta histórico" y "Neto
  histórico pagado" vuelven a calcularse a partir del historial de dividendos de esta misma
  pestaña, así que se actualizan de inmediato al editar cualquier valor o agregar un año nuevo.

- **Cambiado: las 3 tarjetas históricas de "Trabajar con Resúmenes" ahora vienen del
  Comparativo SRI/Súper Cías/Contable** (cuando estás viendo la empresa completa, sin filtrar
  por accionista):
  - **"Utilidad acumulada a la fecha"** — antes sumaba el historial de dividendos por
    accionista; ahora toma la "Utilidad Acumulada" del último año con datos en el Comparativo
    SRI... para esta empresa.
  - **"Impuesto Causado histórico"** — ahora es la suma de la columna "Impuesto Causado" del
    Comparativo SRI... de todos los años, en vez del impuesto de renta retenido por accionista.
  - **"Participación Trabajadores Repartida histórica"** (antes "Neto histórico pagado") —
    ahora es la suma de la columna "Participación Trabajadores Repartida" del Comparativo
    SRI... de todos los años.
  Cuando filtras por un accionista específico, estas 3 tarjetas vuelven a su cálculo anterior
  (basado en el historial de dividendos de ese accionista), ya que el Comparativo SRI es a
  nivel de empresa completa, no por accionista.

- **Movido: "Pago a cuenta sobre utilidades no distribuidas"** — pasó de "Trabajar con
  Resúmenes" a **"Distribución Accionistas Actuales"**, donde tiene más sentido (ya se usaba
  ahí para el plan multi-año y en Escenarios). Además, ahora es completamente **editable y
  eliminable**: cada pago registrado (año, monto, observación) tiene campos editables que se
  guardan solos al cambiar, y un botón "Eliminar" por fila — antes solo se podía registrar, no
  corregir ni borrar.

- **Nuevo: traer la Utilidad Acumulada del Comparativo SRI a "Distribución Accionistas
  Actuales"** — arriba del campo "Utilidad acumulada total a repartir" hay un selector de año
  y un botón "↺ Traer valor de ese año". Al presionarlo, trae la "Utilidad Acumulada" ya
  calculada en el Comparativo SRI/Súper Cías/Contable para **la misma empresa** que tienes
  seleccionada aquí, hasta el año elegido, y la usa como base a repartir — sin tener que
  volver a sumarla a mano. Reutiliza exactamente la misma lógica de cálculo que la pestaña
  Comparativo, así que el número siempre coincide con lo que ves ahí. Recuerda presionar
  "💾 Guardar" después para conservarlo.

- **Nuevo: alerta visual cuando "Participación Trabajadores" y "Participación Trabajadores
  Repartida" difieren** (diferencia mayor a 1 centavo), en el Comparativo SRI:
  - **En pantalla**: la celda de "Participación Trabajadores Repartida" de ese año se resalta
    en rojo, con un aviso "⚠️ difiere de Particip. Trabajadores" debajo.
  - **En el informe ejecutivo (Imprimir/PDF)**: la misma celda se resalta en rojo dentro de la
    tabla de detalle, y además aparece una tarjeta roja en el resumen ejecutivo con el conteo de
    años afectados, más un párrafo de alerta listando cuáles años tienen la diferencia.

- **Nuevo: editar los datos importados en Dividendos** — en "Trabajar con Resúmenes", tanto el
  "Historial de capital social" como el "Historial de dividendos" ahora son completamente
  editables: cada celda (por accionista y por año, incluyendo TOTAL, IMP. RENTA y A PAGAR) es
  un campo editable que se guarda solo al salir de él. Útil para corregir algo del Excel
  importado sin tener que volver a subir el archivo completo. La fila "SUMAN" se recalcula
  automáticamente cuando editas cualquier valor de ese año.

- **Corregido: el tab activo en Dividendos se quedaba marcado en "Importar"** — al cambiar de
  pestaña (Auditoría, Escenarios, etc.), el contenido sí cambiaba, pero el resaltado visual del
  botón activo se quedaba pegado en la última pestaña que se pintó desde cero (normalmente
  "Importar", al entrar al módulo), porque la barra de pestañas solo se dibujaba una vez y
  nunca se volvía a actualizar. Ahora, al cambiar de pestaña, se actualiza directamente cuál
  botón tiene la clase "activo", así que el resaltado siempre coincide con la pestaña que
  estás viendo. Se revisaron los demás módulos con pestañas similares (Elaboración, Revisión de
  Documentos, Documentos Legales, Equipos de Trabajo, Área Bancaria) y no tenían este problema.

- **Nuevo: pestaña "📊 Comparativo SRI/Súper Cías/Contable"** en Dividendos — una tabla año por
  año desde **1992** hasta el año actual, por empresa, con estas columnas:
  - **SRI**, **Súper Cías**, **Contable** — tres valores manuales de utilidad, uno por fuente.
  - **Valor Real** — un selector para elegir cuál de los 3 anteriores se considera el valor
    real de ese año; muestra el monto elegido en negrita debajo del selector.
  - **Participación Trabajadores** — se calcula sola como el **15% del Valor Real**, pero es
    editable: si escribes un valor manual queda guardado así ("valor manual"); si borras el
    campo, vuelve a calcularse el 15% automáticamente ("auto 15% del Valor Real").
  - **Impuesto Causado**, **Reserva Legal**, **Otras Reservas** — campos manuales.
  - **Utilidad a Distribuir** — ahora se **calcula sola**: Valor Real − Participación
    Trabajadores Repartida − Impuesto Causado − Reserva Legal − Otras Reservas. Editable: si
    escribes un valor manual, lo respeta ("valor manual"); si lo dejas vacío, vuelve a
    calcularse solo ("auto").
  - **Utilidad Acumulada** — encadenada año a año: arranca en **0 en 1991** (el año anterior
    al inicio de la tabla) y cada año suma su "Utilidad a Distribuir" al acumulado del año
    anterior. Es editable: si sobrescribes el acumulado de un año en particular, **todos los
    años posteriores recalculan automáticamente** tomando ese valor sobrescrito como su nueva
    base (en cascada) — y si vuelves a dejarlo vacío, retoma el cálculo automático desde ahí.
  - **Participación Trabajadores Repartida** — nueva columna, manual (o importable desde
    Excel), independiente de la "Participación Trabajadores" calculada automáticamente — para
    registrar el monto que realmente se repartió, si es distinto al 15% teórico.
  - **Nuevo: importar desde Excel** — dentro de la pestaña, con la empresa seleccionada, hay un
    botón para subir un Excel con una columna de año y columnas tituladas "Impuesto Causado",
    "Participación Trabajadores" y/o "Reserva Legal" (en cualquier posición) — la app detecta
    las columnas por su encabezado y el año automáticamente, y llena esos 3 campos para cada
    año encontrado, dejando lo demás intacto.
  - **Nuevo: Imprimir, Descargar PDF y Descargar Excel** — botones junto al título de la tabla:
    - **🖨️ Imprimir / Informe ejecutivo** y **⬇️ Descargar PDF** generan un informe con diseño
      profesional (no es solo la tabla en crudo): encabezado con línea de color, resumen
      ejecutivo con tarjetas (años con datos, rango de años, utilidad promedio anual, utilidad
      acumulada al año actual), un párrafo introductorio, y la tabla completa con formato de
      moneda y la fuente del "Valor Real" junto a cada monto. En A4 horizontal para que quepan
      todas las columnas.
    - **⬇️ Descargar Excel** exporta la tabla completa a `.xlsx`, incluyendo si cada valor
      calculado (Participación, Utilidad a Distribuir, Utilidad Acumulada) es automático o fue
      sobrescrito manualmente.
  - **Utilidad Acumulada** — se calcula sola, sumando la "Utilidad a Distribuir" de todos los
    años desde 1992 hasta ese punto (no es editable, es un total corrido).
  Cada celda se guarda automáticamente al salir de ella (no hace falta un botón de guardar
  aparte). La tabla tiene scroll horizontal por la cantidad de columnas, y la columna "Año"
  queda fija a la izquierda para ubicarte mejor al desplazarte.

- **Corregido: el "Avance" decía "Sin puntos" aunque sí hubiera puntos** — la causa: al abrir
  "Seguimiento" en un acta antigua (con "Asuntos tratados" en texto plano), la conversión a
  puntos estructurados se hacía **solo en memoria**, nunca se guardaba en Firebase. Por eso esa
  vista SÍ mostraba los puntos (los tenía en memoria), pero la tabla principal —que carga los
  datos frescos de Firebase— nunca los veía, y mostraba "Sin puntos". Ahora esa conversión se
  guarda de inmediato en Firebase apenas ocurre, así que queda reflejada en todos lados
  (tabla, % de Avance, impresión) de forma consistente.
  - **Recomendación**: abre "📌 Seguimiento" en cada acta antigua una vez, para que la
    conversión quede guardada — después ya no hace falta repetirlo.
- **Renombrado**: la sección de puntos tratados ahora se llama "📌 Puntos tratados — Para
  Avance" (y el campo para agregar uno dice "Nuevo punto (Para Avance)"), para dejar claro que
  esos puntos son los que determinan el % de Avance de la reunión.

- **Nuevo: % de avance en Actas de Reunión** — calculado automáticamente según el estado de
  los puntos tratados: **Cerrado = 100%**, **En proceso = 50%**, **Pendiente = 0%**, promediado
  entre todos los puntos de la reunión. Se ve en 3 lugares:
  - Columna "Avance" en la lista de actas (con color: verde 100%, amarillo ≥40%, rojo <40%).
  - Barra de progreso visual dentro de "📌 Seguimiento", con el desglose de cuántos puntos
    están cerrados/en proceso/pendientes — se actualiza sola cada vez que cambias el estado de
    un punto o agregas uno nuevo.
  - En el acta impresa, junto a la fecha.

- **Nuevo: seguimiento de puntos tratados en Actas de Reunión** — nuevo botón "📌 Seguimiento"
  en la lista de actas. Ahí puedes agregar cada punto tratado en la reunión, y a cada punto
  sumarle actualizaciones de seguimiento **las veces que haga falta** (en la misma sesión o en
  cualquier momento posterior, no solo al crear el acta) — queda un historial completo con
  fecha de cada novedad/avance, sin perder las anteriores. Cada punto también tiene un estado
  (Pendiente / En proceso / Cerrado) que puedes cambiar en cualquier momento.
  - **Compatibilidad**: las actas que ya tenías (con "Asuntos tratados" en texto libre) se
    convierten automáticamente a puntos individuales la primera vez que abres su seguimiento,
    sin perder el texto original.
  - El acta impresa ahora muestra "Puntos tratados y seguimiento" con el historial completo de
    cada punto en vez de solo la lista plana de asuntos.

- **Nuevo: selector de tema claro/oscuro** — en el Dashboard, arriba a la derecha, dos botones
  "🌙 Oscuro" / "☀️ Claro" para elegir cómo se ve la app. La preferencia se guarda en el
  navegador (localStorage) y se recuerda la próxima vez que entres, sin necesidad de volver a
  elegirlo. Toda la interfaz usa variables de color, así que el cambio aplica a todos los
  módulos (tablas, tarjetas, píldoras de estado, formularios, etc.), no solo al Dashboard.
  La pantalla de inicio de sesión mantiene su diseño oscuro de bienvenida en ambos casos.

- **Corregido: el número de memo/oficio aparecía dos veces** — el encabezado que agrega la app
  (con el número real, ej. "N° MEMO-2026-0001") es correcto, pero el texto que genera la IA a
  veces incluía su propia línea "MEMORANDO N° ___-2026" (en blanco, porque la IA no conoce el
  número real al momento de redactar). Dos correcciones:
  - El prompt de la IA ahora le indica explícitamente que NO incluya esa línea (el sistema ya
    la agrega aparte), tanto al generar como al revisar/corregir.
  - Para los memos/oficios que ya tenían esa línea en blanco guardada de antes, se limpia
    automáticamente y en silencio la primera vez que abres el documento — no hace falta
    regenerarlo ni hacer nada manual.

- **Corregido de raíz: documentos definitivos sin número, mostraban "DOCUMENTO DEFINITIVO"
  en vez del número** — el problema real: como el botón "Marcar como definitivo" desaparece
  una vez que el documento YA está confirmado, la salvaguarda anterior (que asignaba el número
  al presionar ese botón) nunca llegaba a ejecutarse para los documentos que ya estaban
  confirmados desde antes. Ahora la corrección es automática al **abrir** el documento: si
  detecta que está confirmado pero sin número, se lo asigna al instante y en silencio, sin que
  el usuario tenga que hacer nada — basta con abrir el memo/oficio una vez y ya queda con su
  número correcto para imprimir/descargar de ahí en adelante.

- **Nuevo en Memos y Oficios: número automático, autoguardado, y descarga en PDF**
  - **Numeración automática**: el número interno (ej. `OFICIO-2026-0001`) ahora se asigna
    apenas creas el memo/oficio (incluido al crearlo desde "Responder este trámite") — ya no
    hace falta presionar "Confirmar" para tener un número. El botón "Confirmar" pasó a llamarse
    **"✅ Marcar como definitivo"**, y solo bloquea la edición cuando ya terminaste (el número
    no cambia al hacerlo).
  - **Autoguardado**: el contenido ahora se guarda solo al salir del cuadro de texto (además
    de seguir teniendo el botón "💾 Guardar cambios manuales" por si prefieres guardarlo tú
    mismo). Se ve un aviso "Guardado automáticamente [hora]" para confirmarlo.
  - **Descargar PDF**: nuevo botón "⬇️ Descargar PDF" junto a "🖨️ Imprimir" — abre el diálogo
    de impresión del navegador con "Guardar como PDF" ya disponible (mismo mecanismo que usa el
    resto de la app para generar PDF, ya que no se carga una librería de PDF en el navegador).
  - **Descargar Word**: nuevo botón "⬇️ Descargar Word" junto a Imprimir y Descargar PDF —
    genera un archivo .doc descargable directamente (sin diálogo de impresión), reutilizando
    el mismo mecanismo que ya usan Documentos Legales, Actas de Junta y Cesión de Acciones.

- **Nuevo: Responder trámite con Memo/Oficio (vinculado)** — en la pestaña "Datos" de cada
  trámite (Público o Privado), nueva sección "📝 Responder este trámite" con dos botones:
  "Responder con Oficio" y "Responder con Memo". Al presionarlos:
  - Crea un nuevo documento en "Memos y Oficios", con la institución/asunto/N° de oficio ya
    pasados como contexto de la solicitud.
  - Si ya generaste un Diagnóstico IA con "borrador de oficio de respuesta", ese texto se usa
    directamente como contenido inicial del oficio (sin tener que copiarlo a mano).
  - Te lleva directo al nuevo documento en "Memos y Oficios" para seguir editándolo/revisándolo
    con IA como siempre.
  - El vínculo queda guardado en ambos sentidos: desde el trámite hay un botón "Abrir respuesta
    vinculada", y desde el memo/oficio aparece una nota "🔗 Vinculado al trámite..." con un
    botón "Ver trámite" para regresar.

- **Nuevo: filtros por estado y fecha en Trámites** (Públicos y Privados) — arriba de la
  tabla ahora hay 3 filtros: **Estado** (Pendiente / En proceso / Resuelto / Vencido — este
  último calculado automáticamente si la fecha de vencimiento ya pasó y no está Resuelto) y
  un rango de **fechas de recepción** (Desde/Hasta). Se combinan entre sí, y hay un botón
  "Limpiar filtros" para volver a ver todos los trámites.

- **Nuevo: link de OneDrive/Drive en "Editar trámite"** — en Trámites Públicos y Privados,
  al crear/editar un trámite (botón "Editar datos") ahora hay un campo para pegar el enlace de
  OneDrive/Google Drive directamente ahí, sin tener que ir a la pestaña Soportes. Se guarda en
  el mismo campo que usa la pestaña "Soportes" → "Link general de respaldo", así que aparece
  automáticamente ahí, listo para analizarlo con IA (o subir el ZIP como alternativa) sin tener
  que volver a pegarlo.

- **Nuevo: analizar un ZIP con IA (sin guardarlo)** — tanto en Equipo de Trabajo ("Link general
  de respaldo") como en Trámites (pestaña "Soportes"), ahora se puede subir un archivo **.zip**
  con varios documentos de respaldo (PDF, Excel, Word, TXT) en vez de depender de un enlace.
  El ZIP se procesa **completamente en el navegador** (con JSZip) — se extrae el texto de cada
  archivo interno reutilizando la misma lógica de lectura que ya existía, y solo el contenido
  extraído se envía a la IA para el análisis. **Ni el ZIP ni los archivos que trae adentro se
  guardan en Firebase ni en ningún lado** — solo se persiste el resultado del análisis de la
  IA (igual que con el link general), para no ocupar espacio de almacenamiento.
  Límites: hasta 3 PDF sin texto extraíble por ZIP se envían para lectura nativa de la IA (con
  el límite de 4 MB por PDF ya existente); el resto de archivos no legibles se listan al final
  del análisis para que sepas cuáles no se pudieron procesar.
  Se agregó la librería JSZip (cdnjs) para esto.

- **Actualizado/aclarado: lectura de enlaces de OneDrive/SharePoint** — se confirmó que la API
  `api.onedrive.com` (el método "oficial" documentado por Microsoft) también exige
  autenticación ahora, incluso para archivos compartidos públicamente (responde HTTP 401).
  Microsoft ha ido cerrando progresivamente el acceso programático sin OAuth a OneDrive. La
  función ahora intenta dos caminos (la API, y como respaldo forzar `download=1` en el enlace
  original, que a veces funciona en enlaces personales 1drv.ms) y, si ninguno funciona, lo dice
  claramente: **es una limitación real de Microsoft, no un problema de la app ni de tus
  permisos de enlace**. En ese caso, la única forma confiable es descargar el archivo y subirlo
  directamente con "Adjuntar archivo" (que sí funciona siempre, para cualquier proveedor).
  Google Drive sigue teniendo mejor tasa de éxito porque no requiere una API con OAuth para
  archivos realmente públicos.

- **Mejorado: lectura de enlaces de Google Drive** — Google Drive casi siempre interpone una
  página de "confirmación de virus" antes de entregar el archivo real, incluso para archivos
  pequeños (no es un problema de permisos). La función ahora detecta esa página automáticamente
  y sigue el flujo de confirmación (extrae el token/uuid y vuelve a pedir el archivo) para
  intentar llegar al contenido real, en vez de rendirse en el primer intento.
  Si aun así no se puede resolver (por ejemplo, si Google exige inicio de sesión o cambia el
  formato de esa página), el error ahora incluye un **detalle técnico** que puedes copiar y
  compartir para seguir ajustando la función si hace falta. Mientras tanto, la alternativa que
  **siempre funciona** es descargar el archivo y subirlo directamente con "Adjuntar archivo".

- **Corregido/aclarado: error HTTP 403 al leer un enlace** — no es un problema del permiso del
  enlace (aunque esté en "cualquiera con el enlace puede ver"). Google Drive/Docs y OneDrive
  bloquean con frecuencia, por política antibots, las solicitudes automáticas que llegan desde
  servidores en la nube (como la función de Netlify que lee el enlace) — es distinto a cuando
  tú abres el enlace desde tu navegador. Se agregó un encabezado de navegador a la solicitud
  para reducir (no elimina del todo) estos bloqueos, y ahora el error muestra un mensaje claro
  explicando esto en vez de sugerir revisar el permiso. Cuando ocurra, la única alternativa
  confiable es descargar el archivo y subirlo directamente con "Adjuntar archivo".

- **Nuevo: Link general de respaldo en Trámites (pestaña "Soportes")** — igual que en Equipo de
  Trabajo: un solo campo para pegar UN enlace de OneDrive/Google Drive y un solo checkbox
  ("Analizar este enlace con IA como respaldo de todos los documentos requeridos"). Aplica tanto
  a Trámites Públicos como Privados, ya que comparten la misma pestaña. Al marcarlo, la IA lee
  el enlace y evalúa si ese documento justifica los documentos requeridos listados arriba,
  usando el mismo motor de "Revisar soportes con IA" ya existente (documento por documento:
  completo/incompleto/faltante, con recomendaciones). Si además pegaste texto manualmente o
  subiste un archivo, se combina todo en el mismo análisis.

- **Nuevo: Link general de respaldo (Equipo de Trabajo)** — debajo de "Puntos requeridos del
  proyecto" hay un solo campo para pegar UN enlace de OneDrive/Google Drive y un solo checkbox
  ("Analizar este enlace con IA como respaldo de todos los puntos"). Al marcarlo, la IA lee ese
  enlace y evalúa, **punto por punto**, si ese único documento lo respalda o justifica —
  mostrando el resultado en una tabla (✅ sí / 🟡 parcial / 🔴 no, con comentario) más
  recomendaciones generales. Funciona mejor con enlaces públicos y con PDF, Google Docs o
  Google Sheets.

- **Nuevo: la IA ahora lee los enlaces de OneDrive/Drive en Equipo de Trabajo** — cuando
  adjuntas un link como soporte de un punto y presionas "🧠 IA: ¿los soportes justifican esto?",
  la app ya no se limita a decirle a la IA que "existe un enlace" — intenta leer su contenido
  real (usando la misma función serverless de Trámites) y se lo pasa junto con los demás
  soportes para el análisis. Mismas condiciones que en Trámites: funciona mejor con enlaces
  **públicos** y con PDF, Google Docs, Google Sheets o texto plano; si un enlace no se puede
  leer (privado, muy grande, formato no soportado), la IA lo trata solo como referencia sin su
  contenido, y el análisis continúa igual con lo que sí se pudo leer.

- **Nuevo: Observaciones y Enlaces en Trámites Públicos/Privados** — en la pestaña "Datos" de
  cada trámite ahora hay:
  - Un campo de **Observaciones** (texto libre, editable y guardable).
  - Una sección de **Enlaces** (OneDrive, Google Drive, Google Docs/Sheets, etc.) — pegas el
    enlace con una descripción opcional, y queda ahí para abrirlo con un clic.
  - Botón **"🧠 Leer con IA"** por cada enlace: intenta traer el contenido del documento
    (a través de una función serverless, para evitar problemas de CORS) y lo manda directo al
    mismo análisis de "Diagnóstico IA" que ya existía — el resultado aparece en esa pestaña.
  - **Funciona mejor con**: PDF, Google Docs, Google Sheets, y texto plano.
  - **Limitaciones honestas** (se avisan en la propia app si ocurren): el enlace debe ser
    público ("cualquiera con el enlace puede ver"); los PDF de más de 4 MB no se pueden enviar
    a la IA por esta vía; los archivos de Google Drive de más de ~25 MB muestran una página de
    confirmación de virus que esta función no puede resolver automáticamente; Word, Excel e
    imágenes no se leen por este medio — para esos casos, descarga el archivo y súbelo
    directamente en la pestaña "Soportes" (que sí puede leerlos).
- **Nueva función serverless**: `netlify/functions/leer_enlace.js`, expuesta en
  `/api/leer-enlace` (agregado el redirect correspondiente en `netlify.toml`).

- **Corregido: "No se pudo eliminar el adjunto: Cannot set properties of null"** — el borrado
  en Firebase SÍ funcionaba, pero si el modal del punto ya se había cerrado (o la vista cambió)
  antes de que la operación terminara, la app intentaba actualizar un elemento del DOM que ya no
  existía y eso disparaba el error. Ahora todas las actualizaciones de pantalla en Equipo de
  Trabajo (adjuntar, eliminar, analizar con IA) verifican primero que el elemento siga presente;
  si no, simplemente omiten la actualización visual (el dato ya quedó guardado correctamente) en
  vez de mostrar un error. Para ver el resultado actualizado en ese caso, basta con volver a abrir
  el proyecto.

- **Corregido: no dejaba eliminar adjuntos, y se ponía lento/se quedaba "leyendo archivo"** —
  la causa raíz era que los PDF pesados (en base64) se guardaban DENTRO del mismo array de
  "puntos" del proyecto, que se reescribe completo en Firebase con cada cambio. Es decir, borrar
  o editar un solo punto obligaba a resubir TODOS los PDF pesados de TODOS los puntos del
  proyecto cada vez — de ahí la lentitud y los fallos silenciosos al eliminar.
  - Ahora los PDF pesados se guardan en una ruta separada (`equipos_pdfs`), y el punto solo
    guarda una referencia liviana (`pdfRef`). Editar o eliminar un punto ya no toca los PDF de
    los demás.
  - Al eliminar un soporte con PDF adjunto, también se borra su PDF de esa ruta separada.
  - Al analizar un punto, el PDF se carga bajo demanda justo antes de llamar a la IA (no se
    mantiene cargado en memoria todo el tiempo).
  - Se agregó un **límite de 15 MB** para siquiera intentar leer el texto localmente (evita que
    el navegador se trabe intentando renderizar cada página de un escaneo pesado), y un
    **timeout de 20 segundos** de seguridad para esa lectura.
  - Se agregó un **límite de 4 MB** para el envío del PDF a la IA (Netlify tiene un límite de
    tamaño de solicitud); si el archivo lo supera, se avisa claramente en vez de fallar en
    silencio, sugiriendo comprimirlo o dividirlo.
  - Todas las operaciones ahora muestran un mensaje de error visible (con `alert`) si algo falla,
    en vez de fallar sin avisar.
  - **Ruta nueva en Realtime Database**: `equipos_pdfs`.

- **Corregido: la IA decía "se requiere documento legible" con PDF escaneados** — el bug real
  era que muchos PDF escaneados sí devuelven un poco de texto "basura" al extraerlo (metadatos,
  números de página sueltos, una capa de OCR parcial), y la app lo consideraba "con texto" —
  nunca activaba el envío directo del PDF a la IA, y le mandaba solo ese texto inútil. Ahora hay
  un umbral: si el texto extraído tiene menos de 40 caracteres útiles, se trata igual que "sin
  texto" y se adjunta el PDF para que la IA lo lea de forma nativa. También se reforzó el prompt
  para dejar explícito que los PDF adjuntos SÍ son legibles y deben analizarse directamente,
  sin importar lo que diga el aviso técnico de "no se pudo extraer texto".
  ⚠️ Los soportes que ya subiste ANTES de esta corrección (con solo texto basura guardado, sin
  el PDF en base64) no se pueden recuperar automáticamente — hay que eliminarlos (ya se puede,
  ver mejora anterior) y volver a subir el archivo.

- **Nuevo: eliminar adjuntos en Equipo de Trabajo** — cada soporte/adjunto de un punto (archivo
  o link) ahora tiene un botón "×" para eliminarlo individualmente.
- **Nuevo: lectura nativa de PDF escaneados sin texto** — cuando subes un PDF y no se puede
  extraer texto automáticamente (por ejemplo, es un escaneo o solo contiene imágenes), la app
  ya no se limita a avisar que no pudo leerlo: guarda el PDF y, al presionar "IA: ¿los soportes
  justifican esto?", lo envía directamente a Claude (que sí puede leer PDFs de forma nativa,
  incluyendo imágenes y tablas escaneadas dentro del archivo) para que lo analice visualmente.
  Se ve un ícono 🖼️ junto al adjunto para indicar que se leerá de esta forma.
  ⚠️ Como el PDF viaja completo (en base64) hacia la función serverless, evita adjuntar
  escaneos extremadamente pesados (varias decenas de MB), ya que Netlify tiene un límite de
  tamaño de solicitud.

- **Nuevo: Generar plan multi-año con IA** (en "Distribución Accionistas Actuales" → Plan de
  distribución por año) — en vez de agregar años uno por uno manualmente, puedes pedirle a la
  IA que genere una recomendación de plan completo (ella decide cuántos años, normalmente
  2-5), mostrando el monto de cada año Y el acumulado, con retención estimada y recomendación
  por año. El plan generado reemplaza la tabla de años, y sigue siendo editable a mano después.
- **Escenarios: utilidad acumulada auto-calculada** — al elegir la empresa, el campo "Utilidad
  acumulada no distribuida" ahora se llena automáticamente (suma de todos los años), editable.
- **Escenarios: nuevos campos manuales** — "Anticipos de dividendos ya pagados este año" y
  "Retenciones ya realizadas por distribución" (con nota sobre la ventana de 3 años para
  compensar el pago a cuenta), ambos considerados por la IA al generar los escenarios.
- **Nuevo: agregar año de capital social manualmente** — en "Trabajar con Resúmenes", junto a
  la opción de agregar año de dividendos, ahora también puedes agregar un año nuevo de capital
  social por accionista (útil para aumentos de capital o completar años faltantes).

- **Rediseñado: Calculadora de retención por accionista(s) y periodo** (en "🧭 Escenarios") —
  ahora calcula automáticamente "Le corresponde" por accionista según la modalidad elegida:
  - **Accionistas actuales**: los accionistas actuales (capital > 0 en el último año) son
    dueños de TODA la utilidad acumulada histórica, repartida según su % de participación hoy.
  - **Accionistas de ese año (histórico)**: cada accionista recibe lo que realmente le
    correspondió ese año específico según los datos importados.
  Se agregó un selector de año, y una columna separada "Valor a repartir" (editable, por
  defecto igual a "Le corresponde") — la retención se calcula sobre el valor a repartir, no
  sobre lo que le correspondería en teoría, permitiendo pagar solo una parte si se desea.

- **Nuevo: Calculadora de retención por accionista(s) y periodo** (dentro de la pestaña
  "🧭 Escenarios") — elige la empresa, marca uno o varios accionistas, ingresa el periodo y el
  valor que corresponde pagarle a cada uno; si ya se le entregó un anticipo, indícalo para que
  se reste. La IA calcula la retención de impuestos según la legislación vigente y emite: un
  **informe individual** por cada accionista (con base de cálculo, franja exenta, tarifa,
  retención y neto a pagar) y un **informe conjunto ejecutivo** con los totales agregados
  (suma a pagar, suma a retener, suma neta). Incluye botón de Imprimir/Descargar PDF.

- **Nuevo: pestaña "🧾 Resumen de Capital"** — por empresa, detalle de cada socio: capital
  (USD), acciones equivalentes (1 acción = USD $1), % de participación, y su clasificación
  (Actual/Anterior). Filtro para ver todos, solo actuales, o solo anteriores. Un socio se
  considera "Actual" si tiene capital > 0 en el último año registrado; si ya no tiene saldo
  pero lo tuvo antes, se marca "Anterior" mostrando su último capital con saldo y el año.
- **Mejorado: retención en el Plan por Año** — la IA ahora calcula la retención de cada año
  del plan considerando tanto el monto individual de ese año como el **acumulado del plan**
  hasta ese punto, ya que la franja exenta de 3 SBU se agota una sola vez por sociedad/período
  fiscal (si el acumulado ya la superó en años anteriores del plan, el año actual se calcula
  sobre el 100% sin franja disponible).
- **Nuevo: Imprimir / Descargar PDF** en "Distribución Accionistas Actuales" — genera un
  documento con la tabla de accionistas, el plan por año, y el análisis de la IA, listo para
  imprimir o guardar como PDF desde el diálogo de impresión del navegador.

- **Nuevo: historial de archivos importados en Dividendos** — ahora puedes subir varios
  archivos Excel; cada uno se valida por separado (auditoría propia al momento de subirlo) y
  queda registrado en un historial con fecha y empresas encontradas. Las empresas se van
  sumando; si una empresa se repite entre archivos, el más reciente actualiza su información
  completa. Ruta nueva: `dividendos_archivos`.
- **Nuevo: crear empresa manualmente en Dividendos** — cuando no tengas el Excel de una
  empresa, defínela a mano con sus accionistas y % de participación; luego se pueden agregar
  años de utilidad/dividendos manualmente desde "Trabajar con Resúmenes", igual que las
  empresas importadas.
- **Nuevo: checklist de accionistas actuales en "Distribución Accionistas Actuales"** — marca
  con un check cuáles accionistas son los actuales (sugerido automáticamente según quién tiene
  capital > 0 en el último año, pero editable). El % de participación se recalcula
  automáticamente entre los marcados (según su peso relativo de capital), editable a mano en
  cualquier momento, con un botón para volver a recalcularlo. Se muestra un resumen: cuántos
  accionistas están marcados, la suma de sus %, y la utilidad acumulada asignada entre ellos.

- **Nuevo: pestaña "🧮 Distribución Accionistas Actuales"** — para el caso en que los
  accionistas actuales adquirieron el derecho sobre TODA la utilidad acumulada histórica,
  repartida según su % de participación actual (no según quién era accionista cada año
  históricamente). Por cada accionista puedes registrar: si tuvo anticipos de dividendos (monto
  e impuesto ya pagado en ese anticipo), y cuánto la empresa está dispuesta a pagarle ahora por
  razones de liquidez. Además, puedes armar un plan de distribución en uno o varios años, cada
  uno con su monto y si ya se retuvo impuesto o no. Con el botón "Calcular con IA" se obtiene la
  retención correspondiente según la Ley Orgánica de Transparencia Social vigente y recomendaciones,
  tanto por accionista como por año del plan.

- **Nuevo: Pago a cuenta sobre utilidades no distribuidas** — dentro de "Trabajar con
  Resúmenes" (vista de toda la empresa, no filtrada por accionista), puedes registrar los
  pagos a cuenta que la empresa haya realizado (año y monto). La app calcula automáticamente
  el plazo de compensación (2 ejercicios fiscales posteriores al pago, según el Art. 39.2.1
  LRTI) y marca el estado: 🟢 Vigente / 🟡 Por vencer / 🔴 Crédito perdido.
- **Nuevo: pestaña "🧭 Escenarios"** — selecciona una empresa, ingresa la utilidad acumulada no
  distribuida (y el pago a cuenta ya realizado se autocompleta si lo registraste), y la IA
  genera una comparación de al menos 5 escenarios: (1) distribuir el 100% (incluyendo la
  opción de que los accionistas presten el dinero de vuelta a la empresa vía contrato de mutuo
  a tasa de interés legal), (2) no repartir y seguir pagando el pago a cuenta anual, y 3
  escenarios adicionales (distribución parcial dentro de la franja exenta, capitalización de
  utilidades, distribución escalonada), cada uno con su efecto para accionistas, efecto
  tributario para la empresa, monto estimado de impuesto, y cuándo conviene cada uno.

- **Nuevo: filtro por accionista en Dividendos** — dentro de cada empresa, puedes elegir
  "-- todos los accionistas --" o un accionista específico. Al filtrar por uno:
  - Las tablas de capital y dividendos muestran solo su historial.
  - El resumen general muestra su capital, % de participación en la empresa, y sus totales.
  - La recomendación de IA se ajusta: si filtras por accionista, calcula el impuesto/retención
    solo para esa persona sobre el monto que le corresponde; si no filtras, calcula para todos
    los accionistas según su % de participación.

- **Actualizado: Dividendos** — al escoger una empresa en "Trabajar con Resúmenes" ahora se ve:
  un resumen general (capital social actual, utilidad histórica, impuesto retenido histórico,
  neto pagado histórico), el **historial de capital social por accionista** (todos los años),
  y el **historial de dividendos por accionista** (todos los años + TOTAL/IMPUESTO/A PAGAR).
- **Marco legal de la recomendación de IA actualizado** con el texto oficial de la Ley Orgánica
  de Transparencia Social (Art. 39.2 y 39.2.1 LRTI): tarifa única 12% para residentes (sobre el
  excedente de la franja exenta de 3 SBU), 10% para no residentes en general, 12% si el
  beneficiario efectivo es residente en Ecuador, 14% si además hay un paraíso fiscal en la
  cadena de propiedad o si la sociedad incumple informar su composición societaria, exención
  entre sociedades residentes ecuatorianas, y las reglas de pago a cuenta sobre utilidades no
  distribuidas (Art. 39.2.1, Resolución NAC-DGERCGC26-00000026).

- **Nuevo: Dividendos** (💰). Sube el libro Excel con las hojas "Resumen Capital", "Resumen
  Dividendos" y una hoja por empresa — se procesa localmente en tu navegador (no se sube a la
  nube), y solo se guarda la información ya estructurada.
  - **Auditoría**: cruza automáticamente los totales de los 2 resúmenes contra el detalle de
    cada hoja de empresa, y valida que TOTAL = suma de años y DIVIDENDO A PAGAR = TOTAL −
    IMPUESTO RENTA por cada accionista. Muestra cualquier diferencia encontrada.
  - **Trabajar con Resúmenes**: por empresa, ves el detalle completo por accionista/año, y
    puedes agregar un año nuevo manualmente (monto por accionista, con cálculo automático del
    12% de impuesto, editable).
  - **Recomendación de distribución con IA**: dado un año y una utilidad a distribuir, la IA
    calcula una tabla sugerida de distribución aplicando la Ley Orgánica de Transparencia
    Social, los Arts. 39.2/39.2.1 LRTI (franja exenta de 3 SBU, tarifa única 12%, pago a
    cuenta sobre utilidades no distribuidas si no se reparte antes del 31 de julio) y la
    Resolución NAC-DGERCGC26-00000026 del SRI.
  - Probado directamente contra tu archivo real (Grupo Altaten: Altaten, Acreti, Furchetsa,
    Reprebussines, Imetplasec, Ecuailum) — el parser identifica correctamente las 6 empresas y
    cruza los datos sin inconsistencias.
  - **Ruta nueva en Realtime Database**: `dividendos_data`.

- **Nuevo: Actas de Junta General** (🏛️) — selecciona la empresa (de las creadas en Empresas y
  Cumplimiento), describe la junta (tipo ordinaria/extraordinaria/universal, orden del día,
  asistentes, resoluciones) y la IA redacta el acta con el contenido mínimo exigido por el
  Art. 33 del Reglamento de Juntas Generales y los Arts. 230-243 de la Ley de Compañías.
  Editable, revisable con IA las veces que necesites, y al confirmar se asigna un número
  interno (`ACTA-JGA-2026-0001`). Las actas quedan guardadas por empresa, en orden.
- **Nuevo: Cesión de Acciones / Participaciones** (📜) — mismo esquema: por empresa, elaborado
  con IA conforme los Arts. 113, 189, 192, 196 y 21 de la Ley de Compañías (consentimiento
  unánime, inscripción en libros, notificación a la Superintendencia en 8 días).
- **Nuevo: Historial de Cambios** (📋) — registra automáticamente quién (correo del usuario) y
  cuándo creó, editó, generó/revisó con IA, o confirmó cada Acta de Junta o Cesión de Acciones.
  ⚠️ Solo cubre estos 2 módulos por ahora; se puede extender a otros si lo necesitas.
- **Rutas nuevas en Realtime Database**: `actas_juntas`, `cesiones_acciones`, `log_cambios`.

- **Nuevo: puntos manuales en Equipo de Trabajo** — junto a los generados por IA, ahora puedes
  escribir y agregar puntos/requisitos manualmente.
- **Nuevo: campo "Responsable" en Empresas y Cumplimiento**.
- **Nuevo: Cumpleaños de Colaboradores** (🎂) — registra nombre, cargo y fecha de nacimiento;
  alerta automática de cumpleaños dentro de los próximos 30 días.
- **Nuevo: Auditoría** (🔎, área general, distinta de "Auditoría y Vencimientos" de Equipo de
  Trabajo) — hallazgos con área/proceso, nivel de riesgo, responsable, plazo de corrección,
  estado y recomendación.
- **Nuevo: Control de Activos Fijos** (🏷️) — por empresa (reutiliza las empresas creadas en
  "Empresas y Cumplimiento"): nombre, categoría, fecha de compra, costo, vida útil, valor
  residual, cálculo automático de depreciación y valor en libros, alerta cuando se cumple la
  vida útil, registro de mejoras, reporte imprimible para toma física (con casillas en blanco)
  y reporte completo por empresa.
- **Nuevo: Área Bancaria** (🏦) — por empresa: bancos con líneas de crédito (monto,
  vencimiento, tasa), hipotecas, requisitos documentales de renovación, alertas de líneas por
  vencer (30 días); y una pestaña de Flujo de Caja con proyección a 2 años aplicando un
  porcentaje de crecimiento anual de ingreso manual, imprimible para presentar al banco.
- **Nuevo: Planificación de Vacaciones** (🏖️) — colaborador, fecha de salida/regreso,
  responsable del vehículo mientras está fuera, alertas de quién está actualmente de
  vacaciones o sale en los próximos 7 días.
- **Nuevo: WhatsApp en Actas** — cada asistente ahora tiene campo de WhatsApp; botón "📲
  WhatsApp" genera un mensaje personalizado con las menciones de "Asuntos tratados" que
  correspondan a esa persona.
- **Renombrado**: la app ahora se llama "Control Documental".
- **Rutas nuevas en Realtime Database** (agrégalas a las reglas si tu proyecto no usa la
  regla comodín `$other` de administrador): `colaboradores`, `auditorias_generales`,
  `activos_fijos`, `bancos_empresa`, `flujos_caja`, `vacaciones`.

- **Renombrado**: la app ahora se llama "Control Documental" en vez de "Trámites EC".
- **Nuevo: Auditoría y Vencimientos en Equipo de Trabajo** — pestaña que muestra, de todos los
  proyectos, las tareas de integrantes (y fechas de término de proyecto) vencidas o próximas a
  vencer en los siguientes 7 días, que no estén marcadas como "Terminado".
- **Nuevo: Puntos requeridos con IA en Equipo de Trabajo** — sube el memo/oficio/documento que
  da origen al proyecto (PDF/Excel/Word); la IA genera un punto por cada requisito u obligación
  detectado. Por cada punto puedes: adjuntar soportes (archivo — se lee su texto localmente si
  es PDF/Excel/Word; las imágenes solo quedan registradas por nombre, sin lectura automática —
  o un link de OneDrive/Drive/etc.), escribir una observación, marcarlo como cumplido, y pedirle
  a la IA que analice si los soportes adjuntados justifican ese punto.
  ⚠️ Como la app no usa Firebase Storage, los archivos NO se suben a la nube: solo se guarda el
  texto extraído (para PDF/Excel/Word) o el nombre del archivo (para imágenes). Si necesitas
  guardar el archivo original, usa un link de Drive/OneDrive en vez de subir el archivo.
- **Nuevo: WhatsApp en Actas de Reunión** — cada asistente ahora tiene un campo de WhatsApp.
  Botón "📲 WhatsApp" en la lista de actas: genera un mensaje personalizado por asistente que
  incluye, automáticamente, las líneas de "Asuntos tratados" donde se le menciona por su nombre.
- **Rutas de Firebase**: no se agregaron rutas nuevas en este cambio (todo vive dentro de
  `equipos_trabajo` y `actas_reunion`, ya cubiertas).

- **Nuevo: Documentos Legales** (menú lateral 📜). Genera pagarés, letras de cambio, contrato
  de mutuo, contrato individual de trabajo, contrato de servicios profesionales y contrato de
  arrendamiento — plantillas con respaldo legal (Código de Comercio, Código Civil, Código del
  Trabajo, Ley de Arbitraje y Mediación), campos editables, firmas, y cláusula de mediación en
  los contratos. Pagarés y letras de cambio permiten registrar endosos sucesivos. Al confirmar,
  se asigna un número interno; se puede imprimir o descargar en Word en cualquier momento.
  ⚠️ Son plantillas base — para montos altos o casos particulares, revisión de abogado.
- **Nuevo: Revisión de Contratos con IA** — dentro de "Revisión de Documentos", pestaña
  "Contratos": sube o pega un contrato y la IA señala posibles errores, cláusulas faltantes,
  riesgos legales y recomendaciones (sin generar una versión "corregida" automática, ya que
  modificar cláusulas legales requiere criterio humano).
- **Nuevo: Actas de Reunión** (menú lateral 🗒️). Fecha, hora/lugar, asistentes, asuntos
  tratados, puntos cerrados/pendientes, próxima reunión y firmantes de responsabilidad —
  imprimible con espacios de firma.
- **Nuevo: Equipo de Trabajo** (menú lateral 👥). Proyectos con integrantes, tarea asignada a
  cada uno, fechas de inicio/término, estado (En proceso / Terminado / En problema) y
  observaciones — imprimible como tabla de seguimiento.
- **Rutas nuevas en Realtime Database**: `documentos_legales`, `actas_reunion`,
  `equipos_trabajo` (mismo patrón `$uid` que las demás, ver bloque de reglas más abajo).

- **Nuevo: Elaboración de Memos y Oficios** (menú lateral 📝). Flujo: describes qué necesitas
  → la IA genera el borrador → lo editas manualmente y/o le pides a la IA que lo revise o
  corrija las veces que quieras → al confirmar, se asigna un número interno correlativo
  (ej. `MEMO-2026-0001` / `OFICIO-2026-0001`) y queda bloqueado para edición. Se puede
  imprimir en cualquier momento (como borrador sin número, o ya confirmado con su número).
  **Requiere agregar 2 rutas nuevas a las reglas de Realtime Database**:
  `documentos_elaborados` y `contadores_documentos` (mismo patrón `$uid` que las demás, ver
  el bloque de reglas más abajo).

- **Nuevos anexos agregados**: RDEP (retenciones en relación de dependencia, empleadores),
  APS (Accionistas, Partícipes, Socios) y Anexo de Dividendos — los tres anuales, para
  personas jurídicas (RDEP también aplica a personas naturales con empleados).
- **Observaciones por obligación**: cada ítem del checklist ahora tiene un campo de texto
  opcional para anotar detalles (ej. "presentado el 5 de marzo por el contador X").
- **Editar trámites**: se agregó un botón "Editar" directo en la tabla de Trámites Públicos y
  Privados (antes solo se podía editar entrando a "Abrir" → pestaña Datos).

- **Modelos por área**: Diagnóstico de Oficios y Revisión de Soportes usan **Sonnet 5** (más
  completo). Revisión de Documentos (Órdenes de Compra, Roles de Pago, Avalúos) usa **Haiku**
  (mucho más rápido, evita el límite de 30s de Netlify) — la calidad del análisis sigue siendo
  buena para verificar cálculos e inconsistencias, solo es un modelo más ágil.

- **Corregido: timeout al generar el documento corregido.** Pedirle a la IA que analice Y
  genere el documento corregido en una sola llamada tardaba demasiado y Netlify cortaba la
  función. Ahora es un flujo en 2 pasos: primero "Analizar con IA" (rápido), y luego, solo si
  lo necesitas, el botón separado "📄 Generar documento corregido" (que hace su propia llamada,
  más liviana y rápida). Esto aplica a Órdenes de Compra, Roles de Pago y Avalúos.

- **Nuevo: descargar el documento corregido.** En Órdenes de Compra, Roles de Pago y Avalúos,
  la IA ahora también genera una versión corregida del documento (tabla de comparación
  original vs. corregido, y el texto completo corregido), descargable en **Word**, **PDF** o
  **Excel** con un clic. El borrador de respuesta a oficios también se puede descargar en Word
  o PDF (antes solo se podía copiar).

- **Nuevo: soporte de Excel y Word.** Además de PDF y TXT, ahora se puede subir y leer
  automáticamente Excel (.xlsx/.xls, vía SheetJS) y Word (.docx, vía Mammoth) en oficios,
  soportes, y los 3 tipos de Revisión de Documentos. Los .doc antiguos no se pueden leer
  automáticamente — usa .docx o pega el texto manualmente.
- **Nuevo: veredicto y explicación narrativa.** Los análisis de Órdenes de Compra, Roles de
  Pago y Avalúos ahora muestran un veredicto claro (Correcto / Incorrecto / Con observaciones)
  y un párrafo de explicación de por qué, además del cuadro de comprobación (hallazgos) y la
  tabla de puntos principales.
- **Historial en las 3 áreas de análisis.** Diagnóstico de oficios, Revisión de Soportes, y
  Revisión de Documentos ahora guardan un historial consultable de análisis anteriores, con
  fecha y opción de eliminar entradas individuales.

- **Corregido: obligaciones mensuales de UAFE.** Se agregaron las 2 obligaciones mensuales que
  faltaban (además del informe anual): el reporte RESU/NO-RESU (operaciones desde USD 10,000,
  vence día 15 del mes siguiente) y el registro NO-ROS (confirmación de no haber tenido
  operaciones sospechosas, vence día 10 de cada mes). Ambas solo aplican si marcaste "Reporta a
  la UAFE" en la empresa.
- **Nuevo: reporte mensual de ventas a crédito** ante la Superintendencia de Compañías — nuevo
  checkbox "Realiza ventas a crédito" en el formulario de empresa.

- **Mensual vs Anual**: en Empresas y Cumplimiento, la pestaña "Mensual" solo muestra
  obligaciones que vencen mes a mes (SRI, IESS). UAFE, Ministerio de Trabajo, Superintendencia
  de Compañías, DINARDAP, Bomberos, etc. son anuales — revísalas en la pestaña "Anual".
- **Nuevo: DINARDAP y Superintendencia de Bancos** agregados al catálogo. DINARDAP aplica a
  personas jurídicas (recordatorio de mantener actualizados nombramientos/representante legal).
  Superintendencia de Bancos solo aplica si marcas la empresa como "entidad del sistema
  financiero" en su formulario — sus obligaciones exactas varían mucho según el tipo de
  entidad, así que ese punto es un recordatorio genérico para verificar directamente con el
  regulador, no un calendario exacto.
- **Corregido: Revisión de Documentos** ya no cierra el modal automáticamente al terminar el
  análisis (antes se cerraba solo justo después de mostrar el resultado). También se agregó
  historial de análisis anteriores por documento, igual que en los oficios.

- **Nuevo: Revisión de Documentos** (menú lateral 🧾) — tres categorías: Órdenes de Compra,
  Roles de Pago, y Avalúos/Revalúos. Subes o pegas el texto del documento y la IA identifica
  hallazgos (correctos, inconsistencias, advertencias), una tabla de puntos principales, y
  recomendaciones.
- **Diagnóstico de oficios ampliado**: ahora incluye el "Alcance" del oficio (a quién obliga,
  qué efectos tiene, qué pasa si no se responde) y las "Implicaciones legales por área"
  (Societario, Civil, Penal, Laboral, Tributario, etc., cuando apliquen).
- **Historial de análisis**: cada vez que vuelves a analizar el mismo oficio, el análisis
  anterior queda guardado en un historial consultable (botón "Ver historial de análisis
  anteriores"), con opción de eliminar entradas individuales.

- **Clasificación SRI**: al crear una empresa puedes marcarla como Normal, Contribuyente
  Especial/Gran Contribuyente (día 9 mensual, día 11 en declaraciones anuales), Sector Público
  (día 20) o domicilio en Galápagos (día 28); esto ajusta automáticamente las fechas del checklist.
- **Checklist por periodo**: en cada empresa puedes alternar entre vista "Mensual" (eligiendo
  mes y año) y "Anual" (eligiendo el año), y descargar un CSV o imprimir el checklist del
  periodo mostrado, marcando qué obligaciones están cumplidas y cuáles pendientes.
- **Plazos de trámites**: al crear un trámite puedes elegir si el plazo es en días calendario o
  días hábiles/término (salta automáticamente sábados y domingos); no considera feriados
  nacionales específicos, así que conviene verificar manualmente si el plazo cae cerca de uno.
- El catálogo de obligaciones y sus fechas es una **guía de planificación general** construida
  con la normativa vigente para 2026 (SRI, IESS, Ley de Compañías). Las fechas exactas por
  cantón (permiso de bomberos, patente municipal) y casos particulares deben verificarse con
  tu contador/abogado y los portales oficiales — la app no reemplaza asesoría profesional.
- Puedes editar el arreglo `CATALOGO_OBLIGACIONES` dentro de `index.html` para ajustar,
  agregar o quitar obligaciones según cómo evolucione la normativa.
- Los documentos de oficios NO se suben a la nube: el texto se extrae automáticamente de PDFs
  con `pdf.js` directamente en el navegador (o se puede pegar manualmente), y solo ese texto
  se guarda en Realtime Database junto con el diagnóstico de la IA.
