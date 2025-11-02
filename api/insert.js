import {
    Pool
} from 'pg';

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function insertarRegistrosSacas(datos) {
    //1. Insertar todas las sacas
    //2. Retornar el id y el numero de saca de c/u

    const values = [];
    const placeholders = [];

    if (!datos || datos.length === 0) {
        return [];
    }

    datos.forEach((registro, index) => {
        values.push(registro.numero_saca);
        placeholders.push(`($${index + 1})`);
    });

    const query = `
        INSERT INTO registro_saca (numero_saca)
        VALUES ${placeholders.join(', ')} RETURNING id_saca, numero_saca
    `;

    const result = await db.query(query, values);
    return result.rows;
}

async function insertarTrackings(datos) {
    //1. Insertar todas los trackings pasados por el request
    const valores = [];
    const valueTuples = [];
    let paramIndex = 1;

    if (!datos || datos.length === 0) {
        return;
    }

    datos.forEach((tracking) => {
        valores.push(tracking.id_saca, tracking.numero_tracking, tracking.ubicacion);
        valueTuples.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        paramIndex += 3;
    });

    const query = `
        INSERT INTO registro_tracking ("id_saca", "numero_tracking", "ubicacion")
        VALUES ${valueTuples.join(', ')}
    `;

    await db.query(query, valores);

}

async function ConsultarTrackingsReporte(fechaInicio, fechaFinal, estadosString) {
    const estados = estadosString.split(',').map(e => e.trim()); // ["Pendiente", "Recibido"]

    const query = `
        SELECT rt.numero_tracking,
               rt.ubicacion,
               rt.estado,
               rt.fecha_recibido,
               rt.fecha_entregado,
               rt.fecha_devuelto,
               rt.tipo_paquete,
               rt.id_saca,
               rs.numero_saca,
               rs.fecha_creacion
        FROM registro_tracking rt
                 INNER JOIN
             registro_saca rs
             ON
                 rt.id_saca = rs.id_saca
        WHERE rs.fecha_creacion BETWEEN $1 AND $2
          AND rt.estado = ANY ($3);
    `;

    const values = [fechaInicio, fechaFinal, estados];

    const result = await db.query(query, values);
    return result.rows;
}


export default async function handler(req, res) {
    const {method, query, body} = req;

    const token = req.headers['authorization'];

    if (token !== `Bearer ${process.env.API_SECRET_TOKEN}`) {
        return res.status(401).json({error: 'Unauthorized'});
    }

    try {
        if (method === 'POST') {
            const {action, datos, referenciaId} = body;

            if (action === 'InsertarSacas') {
                const result = await insertarRegistrosSacas(datos);
                return res.status(200).json({
                    message: 'Registros sacas insertados correctamente',
                    sacas: result
                });
            }

            if (action === 'InsertarTracking') {
                await insertarTrackings(datos);
                return res.status(200).send('Insertados los trackings correctamente');
            }

            if (action === 'ConsultarTrackingsReporte') {
                const fechaInicio = body.fechaInicio;
                const fechaFinal = body.fechaFinal;
                const estadosString = body.estadosString;
                const result = await ConsultarTrackingsReporte(fechaInicio, fechaFinal, estadosString);

                return res.status(200).json({
                    message: 'Registros para reporte obtenidos correctamente',
                    trackings: result
                });
            }


            return res.status(400).json({error: 'Acción POST no reconocida'});
        }

        if (method === 'GET') {

            return res.status(400).json({error: 'Acción GET no reconocida'});
        }

        res.status(405).end(`Método ${method} no permitido`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error del servidor: ' + err.message);
    }
}