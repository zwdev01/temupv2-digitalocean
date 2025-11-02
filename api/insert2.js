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

    datos.forEach((registro, index) => {
        values.push(registro.numero_saca);
        placeholders.push(`($${index + 1})`);
    });

    const query = `
        INSERT INTO registro_saca ("numero_saca")
        VALUES ${placeholders.join(', ')} RETURNING id, numero_saca
    `;

    const result = await db.query(query, values);
    return result.rows;
}

async function insertarTrackings(datos) {
    //1. Insertar todas los trackings pasados por el request
    const valores = [];
    const valueTuples = [];

    datos.forEach((tracking, i) => {
        const indiceContador = i * 2;
        valores.push(tracking.id_saca, tracking.numero_tracking);
        valueTuples.push(`($${indiceContador + 1}, $${indiceContador + 2})`);
    });

    const query = `
        INSERT INTO registro_tracking ("id_saca", "numero_tracking")
        VALUES ${valueTuples.join(', ')}
    `;

    await db.query(query, valores);

}

export default async function handler(req, res) {
    const {method, query, body} = req;

    try {
        if (method === 'POST') {
            const {action, datos, referenciaId} = body;

            if (action === 'InsertarReferencias') {
                /*const result = await insertarReferencias(datos);
                return res.status(200).json({
                    message: 'Registros referencias insertados correctamente',
                    referencias: result
                });*/
            }

            if (action === 'Insertar') {
                //await insertarRegistrosConciliaciones(datos);
                return res.status(200).send('Insertadas las conciliaciones correctamente');
            }

            if (action === 'ActualizarEstadoFinalizado') {
                if (!referenciaId) {
                    return res.status(400).json({error: 'Se requiere idReferencia para actualizar.'});
                }

                //const result = await actualizarEstadoFinalizado(referenciaId);
                return res.status(200).json({
                    message: 'Registros actualizados a Finalizado',
                    rowsActualizadas: result.rows
                });
            }


            return res.status(400).json({error: 'Acción POST no reconocida'});
        }

        if (method === 'GET') {
            const {action} = query;



            return res.status(400).json({error: 'Acción GET no reconocida'});
        }

        res.status(405).end(`Método ${method} no permitido`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error del servidor: ' + err.message);
    }
}
