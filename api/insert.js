import { Pool } from 'pg';

let db;

if (!global.db) {
  global.db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
});
}

db = global.db;

// ---------------- DEBUG ----------------
function debug(req, body, token) {
  console.log("========== DEBUG API ==========");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("AUTH HEADER:", token);
  console.log("BODY:", body);
  console.log("ACTION:", body?.action);
  console.log("================================");
}

// ---------------- SACAS ----------------
async function insertarRegistrosSacas(datos) {
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error("datos vacío en sacas");
  }

  const values = [];
  const placeholders = [];

  await db.query(`
    SELECT setval(
      pg_get_serial_sequence('registro_saca', 'id_saca'),
      (SELECT COALESCE(MAX(id_saca),1) FROM registro_saca)
    );
  `);

  datos.forEach((r, i) => {
    values.push(r.numero_saca);
    placeholders.push(`($${i + 1})`);
  });

  const result = await db.query(
    `
    INSERT INTO registro_saca (numero_saca)
    VALUES ${placeholders.join(', ')}
    RETURNING id_saca, numero_saca
    `,
    values
  );

  return result.rows;
}

// ---------------- TRACKINGS ----------------
async function insertarTrackings(datos) {
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error("datos vacío en trackings");
  }

  const values = [];
  const tuples = [];
  let i = 1;

  await db.query(`
    SELECT setval(
      pg_get_serial_sequence('registro_tracking', 'id_tracking'),
      (SELECT COALESCE(MAX(id_tracking),1) FROM registro_tracking)
    );
  `);

  datos.forEach(t => {
    values.push(t.id_saca, t.numero_tracking, t.ubicacion);
    tuples.push(`($${i}, $${i + 1}, $${i + 2})`);
    i += 3;
  });

  await db.query(
    `
    INSERT INTO registro_tracking (id_saca, numero_tracking, ubicacion)
    VALUES ${tuples.join(', ')}
    `,
    values
  );
}

// ---------------- REPORTE ----------------
async function ConsultarTrackingsReporte(fechaInicio, fechaFinal, estadosString) {
  const estados = (estadosString || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  const result = await db.query(
    `
    SELECT rt.*, rs.numero_saca
    FROM registro_tracking rt
    INNER JOIN registro_saca rs ON rt.id_saca = rs.id_saca
    WHERE rs.fecha_creacion BETWEEN $1 AND $2
    AND rt.estado = ANY($3)
    `,
    [fechaInicio, fechaFinal, estados]
  );

  return result.rows;
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  const { method, body } = req;

  // 🔥 soporta ambos formatos de header (Vercel a veces cambia casing)
  const token =
    req.headers.authorization ||
    req.headers.Authorization;

  debug(req, body, token);

  // ---------------- AUTH ----------------
  if (token !== `Bearer ${process.env.API_SECRET_TOKEN}`) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  try {

    // ---------------- HEALTH CHECK ----------------
    if (method === 'GET') {
      return res.status(200).json({
        status: 'ok',
        message: 'API funcionando correctamente'
      });
    }

    // ---------------- POST ----------------
    if (method === 'POST') {

      const action = body?.action;

      if (!action) {
        return res.status(400).json({
          error: 'Falta action en el body',
          received: body
        });
      }

      if (action === 'InsertarSacas') {
        const result = await insertarRegistrosSacas(body.datos);
        return res.status(200).json({
          message: 'Sacas OK',
          data: result
        });
      }

      if (action === 'InsertarTracking') {
        await insertarTrackings(body.datos);
        return res.status(200).json({
          message: 'Tracking OK'
        });
      }

      if (action === 'ConsultarTrackingsReporte') {
        const result = await ConsultarTrackingsReporte(
          body.fechaInicio,
          body.fechaFinal,
          body.estadosString
        );

        return res.status(200).json({
          message: 'Reporte OK',
          data: result
        });
      }

      return res.status(400).json({
        error: 'Acción POST no reconocida',
        received: body
      });
    }

    return res.status(405).json({
      error: 'Método no permitido'
    });

  } catch (err) {
    console.error("ERROR API:", err);

    return res.status(500).json({
      error: err.message
    });
  }
}
