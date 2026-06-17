const mysql = require('mysql2');

const conexion = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'cecar'
});

conexion.connect((error) => {
    if (error) {
        console.log("Error de conexión:", error);
        return;
    }
    console.log("Conectado a MySQL correctamente");
});

module.exports = conexion;