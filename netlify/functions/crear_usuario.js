// Gestión de usuarios secundarios (admin / solo lectura) para Control
// Documental, usando el SDK de administración de Firebase — esto es
// necesario porque crear un usuario nuevo desde el navegador con el SDK de
// cliente cerraría la sesión del administrador que lo está creando (Firebase
// inicia sesión automáticamente como el usuario recién creado). Haciéndolo
// desde el servidor con credenciales de administrador se evita ese problema.
//
// Requiere estas variables de entorno en Netlify (Site settings → Environment
// variables), tomadas del archivo JSON de la cuenta de servicio de Firebase
// (Firebase Console → Configuración del proyecto → Cuentas de servicio →
// Generar nueva clave privada):
//   FIREBASE_PROJECT_ID     -> campo "project_id" del JSON
//   FIREBASE_CLIENT_EMAIL   -> campo "client_email" del JSON
//   FIREBASE_PRIVATE_KEY    -> campo "private_key" del JSON (con los \n tal cual, entre comillas)
//   FIREBASE_DATABASE_URL   -> la URL de tu Realtime Database, ej. https://financierogea-ec95d-default-rtdb.firebaseio.com

// El dueño original de los datos (definido también en el frontend como
// DATOS_UID) siempre es administrador, sin necesidad de una entrada en
// "roles_control_documental".
const DATOS_UID_OWNER = "s51EqDX0m9hWmo9C4Hy00dFqD0C3";

function inicializarAdmin() {
  // Carga "firebase-admin" aquí (no al inicio del archivo) y dentro del
  // try/catch del handler — así, si el paquete no está disponible en el
  // entorno de la función, devolvemos un JSON con el error real en vez de
  // que la función se caiga en silencio antes de poder generar una respuesta.
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido." }) };
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_DATABASE_URL) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: "Esta función todavía no está configurada: faltan las variables de entorno de la cuenta de servicio de Firebase (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL) en Netlify." }),
    };
  }

  let admin;
  try {
    admin = inicializarAdmin();
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: "No se pudo inicializar Firebase Admin: " + (err.message || String(err)) + " — revisa que FIREBASE_PRIVATE_KEY se haya pegado completo (con las comillas y los \\n tal cual) y que las otras 3 variables estén bien escritas." }),
    };
  }

  try {
    const { idToken, accion, email, password, uid, rol } = JSON.parse(event.body || "{}");
    if (!idToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Falta la sesión del administrador." }) };
    }

    // Verifica que quien llama esté autenticado y sea administrador —
    // sin esto, cualquiera podría llamar directamente a esta función.
    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;
    let callerEsAdmin = callerUid === DATOS_UID_OWNER;
    if (!callerEsAdmin) {
      const snap = await admin.database().ref(`roles_control_documental/${callerUid}`).once("value");
      callerEsAdmin = snap.val() === "admin";
    }
    if (!callerEsAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "No tienes permisos de administrador para gestionar usuarios." }) };
    }

    if (accion === "crear") {
      if (!email || !password || !rol) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan datos (correo, contraseña o rol)." }) };
      }
      if (password.length < 6) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres." }) };
      }
      if (rol !== "admin" && rol !== "lectura") {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Rol inválido." }) };
      }
      const nuevoUsuario = await admin.auth().createUser({ email, password });
      await admin.database().ref(`roles_control_documental/${nuevoUsuario.uid}`).set(rol);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, uid: nuevoUsuario.uid }) };
    }

    if (accion === "cambiarRol") {
      if (!uid || (rol !== "admin" && rol !== "lectura")) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan datos o el rol es inválido." }) };
      }
      if (uid === DATOS_UID_OWNER) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "El usuario dueño original de los datos siempre es administrador; no se puede cambiar." }) };
      }
      await admin.database().ref(`roles_control_documental/${uid}`).set(rol);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === "eliminar") {
      if (!uid) return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el uid del usuario." }) };
      if (uid === DATOS_UID_OWNER) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "No se puede eliminar al usuario dueño original de los datos." }) };
      }
      await admin.auth().deleteUser(uid);
      await admin.database().ref(`roles_control_documental/${uid}`).remove();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (accion === "listar") {
      const snap = await admin.database().ref("roles_control_documental").once("value");
      const roles = snap.val() || {};
      const uids = Object.keys(roles);
      const usuarios = [];
      for (const u of uids) {
        try {
          const userRecord = await admin.auth().getUser(u);
          usuarios.push({ uid: u, email: userRecord.email, rol: roles[u] });
        } catch (e) {
          // Usuario borrado de Auth pero con rol residual en la base — se ignora.
        }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, usuarios }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Acción no reconocida." }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
