import { Pool } from 'pg';

// -------------------- DB --------------------
let db;

if (!global.db) {
  global.db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
}

db = global.db;

// -------------------- SACAS --------------------
async function insertarRegistrosSacas(datos) {
  if (!datos || datos.length === 0) return [];

  const values = [];
  const placeholders = [];

  await db.query(`
    SELECT setval(
      pg_get_serial_sequence('registro_saca', 'id_saca'),
      (SELECT COALESCE(MAX(id_saca), 1) FROM registro_saca)
    );
  `);

  datos.forEach((r, i) => {
    values.push(r.numero_saca);
    placeholders.push(`($${i + 1})`);
  });

  const query = `
    INSERT INTO registro_saca (numero_saca)
    VALUES ${placeholders.join(', ')}
    RETURNING id_saca, numero_saca
  `;

  const result = await db.query(query, values);
  return result.rows;
}

// -------------------- TRACKINGS --------------------
async function insertarTrackings(datos) {
  if (!datos || datos.length === 0) return;

  const valores = [];
  const tuples = [];
  let i = 1;

  await db.query(`
    SELECT setval(
      pg_get_serial_sequence('registro_tracking', 'id_tracking'),
      (SELECT COALESCE(MAX(id_tracking), 1) FROM registro_tracking)
    );
  `);

  datos.forEach(t => {
    valores.push(t.id_saca, t.numero_tracking, t.ubicacion);
    tuples.push(`($${i}, $${i + 1}, $${i + 2})`);
    i += 3;
  });

  const query = `
    INSERT INTO registro_tracking (id_saca, numero_tracking, ubicacion)
    VALUES ${tuples.join(', ')}
  `;

  await db.query(query, valores);
}

// -------------------- REPORTE --------------------
async function ConsultarTrackingsReporte(fechaInicio, fechaFinal, estadosString) {
  const estados = estadosString.split(',').map(e => e.trim());

  const query = `
    SELECT rt.*, rs.numero_saca, rs.fecha_creacion
    FROM registro_tracking rt
    INNER JOIN registro_saca rs ON rt.id_saca = rs.id_saca
    WHERE rs.fecha_creacion BETWEEN $1 AND $2
    AND rt.estado = ANY($3);
  `;

  const result = await db.query(query, [
    fechaInicio,
    fechaFinal,
    estados
  ]);

  return result.rows;
}

// -------------------- HANDLER --------------------
export default async function handler(req, res) {
  const { method, body } = req;

  // 🔥 1. HEALTH CHECK (AppSheet TEST)
  if (method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'API conectada correctamente'
    });
  }

  // 🔐 AUTH
  const token = req.headers['authorization'];

  if (token !== `Bearer ${process.env.API_SECRET_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // -------------------- POST --------------------
    if (method === 'POST') {

      // 🔥 INSERT SACAS
      if (req.url.includes('sacas')) {
        const result = await insertarRegistrosSacas(body.datos);
        return res.status(200).json({
          message: 'Sacas insertadas',
          data: result
        });
      }

      // 🔥 INSERT TRACKINGS
      if (req.url.includes('trackings')) {
        await insertarTrackings(body.datos);
        return res.status(200).json({
          message: 'Trackings insertados'
        });
      }

      // 🔥 REPORTE
      if (req.url.includes('reporte')) {
        const result = await ConsultarTrackingsReporte(
          body.fechaInicio,
          body.fechaFinal,
          body.estadosString
        );

        return res.status(200).json({
          message: 'Reporte generado',
          data: result
        });
      }

      return res.status(400).json({
        error: 'Endpoint POST no reconocido'
      });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Error servidor',
      detail: err.message
    });
  }
}
