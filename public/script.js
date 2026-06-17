const formulario = document.getElementById("formulario");

formulario.addEventListener("submit", async function(e) {
    e.preventDefault();

    const nombre_estudiante = document.getElementById("nombre").value;
    const correo_estudiante = document.getElementById("correo").value;
    const curso = document.getElementById("curso").value;
    const tema = document.getElementById("tema").value;
    const descripcion = document.getElementById("descripcion").value;
    const urgencia = document.getElementById("urgencia").value;

    const datos = {
        nombre_estudiante,
        correo_estudiante,
        curso,
        tema,
        descripcion,
        urgencia
    };

    const respuesta = await fetch('/api/v1/solicitud', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json();

    if (resultado.estado === 'error') {
        const listaErrores = resultado.errores.map(e => `- ${e.mensaje}`).join('\n');
        alert('Se encontraron errores:\n\n' + listaErrores);
    } else {
        alert(resultado.mensaje + '\n\nClasificación: ' + resultado.clasificacion.tipo);
        formulario.reset();
    }
});