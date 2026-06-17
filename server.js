const express = require('express');
const db = require('./db');
const xml2js = require('xml2js');
const { XMLValidator, XMLBuilder } = require('fast-xml-parser');

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(express.text({ type: 'application/xml' }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    next();
});

// =============================================
// MÓDULO 2: REGLAS DE CALIDAD DE DATOS
// =============================================

const PALABRAS_CLAVE_COMPLEJAS = [
    "parcial", "examen", "final", "proyecto", "tesis", "sustentacion",
    "calculo", "programacion", "algoritmos", "base de datos", "estadistica"
];

function validarCalidadDatos(datos) {
    const errores = [];

    // Regla 1: Campos obligatorios
    const camposObligatorios = ['nombre_estudiante', 'correo_estudiante', 'curso', 'tema', 'descripcion', 'urgencia'];
    for (const campo of camposObligatorios) {
        if (!datos[campo] || datos[campo].toString().trim() === '') {
            errores.push({
                campo,
                regla: 'CAMPO_OBLIGATORIO',
                mensaje: `El campo '${campo}' es obligatorio y no puede estar vacío`
            });
        }
    }

    // Regla 2: Correo institucional válido
    if (datos.correo_estudiante) {
        const regexCorreo = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!regexCorreo.test(datos.correo_estudiante)) {
            errores.push({
                campo: 'correo_estudiante',
                regla: 'CORREO_INVALIDO',
                mensaje: 'El correo no tiene un formato válido'
            });
        }
    }

    // Regla 3: Urgencia con valores permitidos
    if (datos.urgencia) {
        const urgenciasValidas = ['bajo', 'medio', 'alto'];
        if (!urgenciasValidas.includes(datos.urgencia.toLowerCase())) {
            errores.push({
                campo: 'urgencia',
                regla: 'VALOR_NO_PERMITIDO',
                mensaje: `Urgencia debe ser: bajo, medio o alto`
            });
        }
    }

    // Regla 4: Longitud mínima de descripción
    if (datos.descripcion && datos.descripcion.trim().length < 20) {
        errores.push({
            campo: 'descripcion',
            regla: 'LONGITUD_MINIMA',
            mensaje: 'La descripción debe tener al menos 20 caracteres'
        });
    }

    // Regla 5: Nombre no puede tener números
    if (datos.nombre_estudiante && /\d/.test(datos.nombre_estudiante)) {
        errores.push({
            campo: 'nombre_estudiante',
            regla: 'FORMATO_INVALIDO',
            mensaje: 'El nombre del estudiante no puede contener números'
        });
    }

    return errores;
}

// =============================================
// MÓDULO 3: TRANSFORMACIÓN XML ↔ JSON
// =============================================

function jsonToXml(datos) {
    const builder = new XMLBuilder({
        format: true,
        indentBy: "  "
    });

    const xmlObj = {
        solicitud: {
            estudiante: {
                nombre: datos.nombre_estudiante,
                correo: datos.correo_estudiante,
                curso: datos.curso
            },
            detalle: {
                tema: datos.tema,
                descripcion: datos.descripcion,
                urgencia: datos.urgencia,
                clasificacion: datos.clasificacion || 'pendiente'
            },
            metadata: {
                fecha: new Date().toISOString(),
                sistema_origen: 'CECAR-MIDDLEWARE'
            }
        }
    };

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(xmlObj);
}

function xmlToJson(xmlString) {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        parser.parseString(xmlString, (err, result) => {
            if (err) return reject(err);

            const s = result.solicitud;
            resolve({
                nombre_estudiante: s.estudiante?.nombre || '',
                correo_estudiante: s.estudiante?.correo || '',
                curso: s.estudiante?.curso || '',
                tema: s.detalle?.tema || '',
                descripcion: s.detalle?.descripcion || '',
                urgencia: s.detalle?.urgencia || ''
            });
        });
    });
}

// =============================================
// MOTOR DE CLASIFICACIÓN
// =============================================

function clasificarSolicitud(tema, urgencia) {
    const temaLower = tema.toLowerCase();
    const esCompleja = urgencia.toLowerCase() === 'alto' &&
        PALABRAS_CLAVE_COMPLEJAS.some(p => temaLower.includes(p));

    const tipo = esCompleja ? 'compleja' : 'simple';
    const eventos = esCompleja
        ? ['solicitud_creada', 'solicitud_clasificada', 'requiere_asesoria', 'asesoria_programada']
        : ['solicitud_creada', 'solicitud_clasificada', 'respuesta_directa_enviada'];

    return { tipo, eventos };
}

// =============================================
// MÓDULO 4: ENDPOINTS DEL MIDDLEWARE
// =============================================

// GET / - Estado del servicio
app.get('/', (req, res) => {
    res.json({
        servicio: 'Middleware CECAR - Sistema de Asesorías Académicas',
        version: '2.0.0',
        estado: 'activo',
        endpoints: [
            'POST /api/v1/solicitud',
            'POST /api/v1/solicitud/xml',
            'GET  /api/v1/solicitudes',
            'GET  /api/v1/solicitudes/:id',
            'POST /api/v1/transformar/json-a-xml',
            'POST /api/v1/transformar/xml-a-json',
            'GET  /api/v1/calidad/reporte'
        ]
    });
});

// POST /api/v1/solicitud - Recibe JSON
app.post('/api/v1/solicitud', async (req, res) => {
    const datos = req.body;

    const errores = validarCalidadDatos(datos);
    if (errores.length > 0) {
        for (const err of errores) {
            await registrarError(datos.correo_estudiante || 'desconocido', err);
        }
        return res.status(400).json({
            estado: 'error',
            mensaje: 'Errores de validación encontrados',
            errores,
            total_errores: errores.length
        });
    }

    const clasificacion = clasificarSolicitud(datos.tema, datos.urgencia);

    const sql = `INSERT INTO solicitudes
        (nombre_estudiante, correo_estudiante, curso, tema, descripcion, urgencia, clasificacion)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [
        datos.nombre_estudiante, datos.correo_estudiante, datos.curso,
        datos.tema, datos.descripcion, datos.urgencia, clasificacion.tipo
    ], (error, resultado) => {
        if (error) {
            console.error(error);
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor' });
        }

        const id = resultado.insertId;
        const xmlGenerado = jsonToXml({ ...datos, clasificacion: clasificacion.tipo });
        registrarEvento(id, clasificacion.eventos);

        res.status(201).json({
            estado: 'exitoso',
            id_solicitud: id,
            clasificacion,
            xml_equivalente: xmlGenerado,
            mensaje: clasificacion.tipo === 'compleja'
                ? 'Asesoría programada. El docente será notificado.'
                : 'Consulta registrada. Recibirás respuesta pronto.'
        });
    });
});

// POST /api/v1/solicitud/xml - Recibe XML
app.post('/api/v1/solicitud/xml', async (req, res) => {
    try {
        const xmlString = req.body;

        const validacion = XMLValidator.validate(xmlString);
        if (validacion !== true) {
            return res.status(400).json({
                estado: 'error',
                mensaje: 'XML inválido',
                detalle: validacion.err
            });
        }

        const datos = await xmlToJson(xmlString);

        const errores = validarCalidadDatos(datos);
        if (errores.length > 0) {
            return res.status(400).json({
                estado: 'error',
                mensaje: 'Errores de calidad en datos XML',
                errores
            });
        }

        const clasificacion = clasificarSolicitud(datos.tema, datos.urgencia);

        const sql = `INSERT INTO solicitudes
            (nombre_estudiante, correo_estudiante, curso, tema, descripcion, urgencia, clasificacion)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

        db.query(sql, [
            datos.nombre_estudiante, datos.correo_estudiante, datos.curso,
            datos.tema, datos.descripcion, datos.urgencia, clasificacion.tipo
        ], (error, resultado) => {
            if (error) return res.status(500).json({ estado: 'error', mensaje: 'Error BD' });

            res.status(201).json({
                estado: 'exitoso',
                id_solicitud: resultado.insertId,
                datos_transformados: datos,
                clasificacion,
                mensaje: 'XML recibido, transformado a JSON y procesado correctamente'
            });
        });

    } catch (err) {
        res.status(400).json({ estado: 'error', mensaje: 'Error al procesar XML', detalle: err.message });
    }
});

// GET /api/v1/solicitudes - Listar todas
app.get('/api/v1/solicitudes', (req, res) => {
    const { clasificacion, urgencia } = req.query;
    let sql = 'SELECT * FROM solicitudes WHERE 1=1';
    const params = [];

    if (clasificacion) { sql += ' AND clasificacion = ?'; params.push(clasificacion); }
    if (urgencia) { sql += ' AND urgencia = ?'; params.push(urgencia); }
    sql += ' ORDER BY fecha DESC';

    db.query(sql, params, (error, filas) => {
        if (error) return res.status(500).json({ estado: 'error', mensaje: 'Error al consultar' });
        res.json({ estado: 'exitoso', total: filas.length, solicitudes: filas });
    });
});

// GET /api/v1/solicitudes/:id - Una solicitud
app.get('/api/v1/solicitudes/:id', (req, res) => {
    db.query('SELECT * FROM solicitudes WHERE id = ?', [req.params.id], (error, filas) => {
        if (error) return res.status(500).json({ estado: 'error' });
        if (filas.length === 0) return res.status(404).json({ estado: 'error', mensaje: 'No encontrada' });
        res.json({ estado: 'exitoso', solicitud: filas[0] });
    });
});

// POST /api/v1/transformar/json-a-xml
app.post('/api/v1/transformar/json-a-xml', (req, res) => {
    try {
        const xml = jsonToXml(req.body);
        res.type('application/xml').send(xml);
    } catch (err) {
        res.status(400).json({ estado: 'error', mensaje: err.message });
    }
});

// POST /api/v1/transformar/xml-a-json
app.post('/api/v1/transformar/xml-a-json', async (req, res) => {
    try {
        const json = await xmlToJson(req.body);
        res.json({ estado: 'exitoso', datos: json });
    } catch (err) {
        res.status(400).json({ estado: 'error', mensaje: 'XML inválido', detalle: err.message });
    }
});

// GET /api/v1/calidad/reporte
app.get('/api/v1/calidad/reporte', (req, res) => {
    const sql = `SELECT tipo_error, COUNT(*) as total, MAX(fecha) as ultimo_error
                 FROM errores_calidad GROUP BY tipo_error ORDER BY total DESC`;

    db.query(sql, (error, filas) => {
        if (error) return res.status(500).json({ estado: 'error', mensaje: 'Error consultando reporte' });

        db.query('SELECT COUNT(*) as total FROM solicitudes', (err2, total) => {
            res.json({
                estado: 'exitoso',
                reporte_calidad: {
                    total_solicitudes: total[0]?.total || 0,
                    errores_por_tipo: filas,
                    total_errores: filas.reduce((sum, f) => sum + f.total, 0)
                }
            });
        });
    });
});

// =============================================
// FUNCIONES AUXILIARES
// =============================================

function registrarError(correo, error) {
    return new Promise((resolve) => {
        const sql = `INSERT INTO errores_calidad (correo_estudiante, campo, tipo_error, mensaje) VALUES (?, ?, ?, ?)`;
        db.query(sql, [correo, error.campo, error.regla, error.mensaje], () => resolve());
    });
}

function registrarEvento(id_solicitud, eventos) {
    for (const evento of eventos) {
        db.query(
            'INSERT INTO eventos (id_solicitud, nombre_evento) VALUES (?, ?)',
            [id_solicitud, evento],
            () => {}
        );
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log('Middleware CECAR v2.0 activo');
});