const mysql = require('mysql2');

const conexion = mysql.createConnection({
    host: process.env.DB_HOST || 'zephyr.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'zACPLbnVqhZBMPZDPVnVqJwHzqQimUCB',
    database: process.env.DB_NAME || 'railway',
    port: process.env.DB_PORT || 13820
});

conexion.connect((error) => {
    if (error) {
        console.log("Error de conexión:", error);
        return;
    }
    console.log("Conectado a MySQL correctamente");
});

module.exports = conexion;