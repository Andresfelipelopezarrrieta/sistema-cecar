const formulario = document.getElementById("formulario");

formulario.addEventListener("submit", async function(e) {
    e.preventDefault();

    const nombre = document.getElementById("nombre").value;
    const correo = document.getElementById("correo").value;
    const curso = document.getElementById("curso").value;
    const tema = document.getElementById("tema").value;
    const descripcion = document.getElementById("descripcion").value;
    const urgencia = document.getElementById("urgencia").value;

    const datos = {
        nombre,
        correo,
        curso,
        tema,
        descripcion,
        urgencia
    };

    const respuesta = await fetch('http://localhost:3000/api/v1/solicitud', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    });

    const mensaje = await respuesta.text();
    alert(mensaje);
});