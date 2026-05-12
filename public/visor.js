// ===============================
// 🔐 CONFIGURACIÓN SUPABASE
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

// ===============================
// 📦 VARIABLES GLOBALES
// ===============================
let configuracion = null;
let cargando = false;

// ===============================
// 🚪 FUNCIONES GLOBALES
// ===============================
window.logout = logout;

// ===============================
// 🔔 ALERTAS
// ===============================
function showAlert(mensaje, tipo = "error") {

    document.querySelectorAll(".custom-alert").forEach(alerta => {
        if (alerta.parentNode) {
            alerta.remove();
        }
    });

    const alerta = document.createElement("div");

    alerta.className = `custom-alert ${tipo}`;
    alerta.textContent = mensaje;

    document.body.appendChild(alerta);

    requestAnimationFrame(() => {
        alerta.classList.add("show");
    });

    setTimeout(() => {

        alerta.classList.remove("show");

        setTimeout(() => {
            if (alerta.parentNode) {
                alerta.remove();
            }
        }, 300);

    }, 3000);
}

// ===============================
// 🚪 CERRAR SESIÓN
// ===============================
async function logout() {

    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error(error);
    }

    window.location.href = "index.html";
}

// ===============================
// 📄 CARGAR CONFIGURACIÓN
// ===============================
async function cargarConfiguracion() {

    try {

        const respuesta = await fetch("config.json");

        if (!respuesta.ok) {
            throw new Error("No se pudo cargar config.json");
        }

        configuracion = await respuesta.json();

        cargarListaMascotas();

    } catch (error) {

        console.error(error);

        showAlert(
            "Error cargando configuración",
            "error"
        );
    }
}

// ===============================
// 📋 CARGAR MASCOTAS
// ===============================
function cargarListaMascotas() {

    const selectorMascota =
        document.getElementById("petSelect");

    if (
        !configuracion ||
        !Array.isArray(configuracion.pets)
    ) {
        showAlert(
            "Configuración inválida",
            "error"
        );
        return;
    }

    selectorMascota.innerHTML = "";

    configuracion.pets.forEach((mascota, indice) => {

        const option = document.createElement("option");

        option.value = indice;
        option.textContent = mascota.nombre;

        selectorMascota.appendChild(option);
    });

    selectorMascota.addEventListener(
        "change",
        actualizarAreas
    );

    actualizarAreas();
}

// ===============================
// 🔄 ACTUALIZAR ÁREAS
// ===============================
function actualizarAreas() {

    const selectorMascota =
        document.getElementById("petSelect");

    const selectorArea =
        document.getElementById("areaSelect");

    const indiceMascota =
        selectorMascota.value;

    const mascota =
        configuracion?.pets?.[indiceMascota];

    if (!mascota) return;

    selectorArea.innerHTML = "";

    const areas = mascota.archivos;

    Object.keys(areas).forEach(area => {

        const option = document.createElement("option");

        option.value = area;
        option.textContent = area;

        selectorArea.appendChild(option);
    });

    selectorArea.onchange = () => {

        if (!cargando) {
            cargarPDF();
        }
    };

    cargarPDF();
}

// ===============================
// 🎨 RENDERIZAR PÁGINA
// ===============================
async function renderizarPagina(
    pdf,
    numeroPagina,
    contenedor,
    esMovil
) {

    try {

        const pagina =
            await pdf.getPage(numeroPagina);

        const escala =
            esMovil ? 1 : 1.2;

        const viewport =
            pagina.getViewport({
                scale: escala
            });

        const canvas =
            document.createElement("canvas");

        const contexto =
            canvas.getContext("2d");

        if (!contexto) {
            throw new Error(
                "No se pudo crear canvas"
            );
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        contenedor.appendChild(canvas);

        await pagina.render({
            canvasContext: contexto,
            viewport
        }).promise;

    } catch (error) {

        console.error(
            `Error página ${numeroPagina}`,
            error
        );

        const errorDiv =
            document.createElement("div");

        errorDiv.className = "pdf-error";

        errorDiv.textContent =
            `Error cargando página ${numeroPagina}`;

        contenedor.appendChild(errorDiv);
    }
}

// ===============================
// 📥 CARGAR PDF
// ===============================
async function cargarPDF() {

    if (cargando) return;

    const contenedor =
        document.getElementById("pdfContainer");

    const loader =
        document.getElementById("loader");

    try {

        cargando = true;

        loader.classList.add("active");

        contenedor.innerHTML = "";

        const selectorMascota =
            document.getElementById("petSelect");

        const selectorArea =
            document.getElementById("areaSelect");

        const mascota =
            configuracion.pets[
                selectorMascota.value
            ];

        const area =
            selectorArea.value;

        const nombreArchivo =
            mascota.archivos[area];

        // ===============================
        // 📄 OBTENER URL PDF
        // ===============================
        let urlPdf;

        try {

            const { data, error } =
                await supabaseClient
                    .storage
                    .from(configuracion.bucket)
                    .createSignedUrl(
                        nombreArchivo,
                        3600
                    );

            if (error) throw error;

            urlPdf = data.signedUrl;

        } catch {

            const { data } =
                supabaseClient
                    .storage
                    .from(configuracion.bucket)
                    .getPublicUrl(nombreArchivo);

            if (!data?.publicUrl) {
                throw new Error(
                    "No se pudo obtener URL"
                );
            }

            urlPdf = data.publicUrl;
        }

        // ===============================
        // 📄 CARGAR PDF
        // ===============================
        const pdf =
            await pdfjsLib
                .getDocument(urlPdf)
                .promise;

        const totalPaginas =
            pdf.numPages;

        const esMovil =
            window.innerWidth <= 768;

        // ===============================
        // 📄 RENDERIZAR PÁGINAS
        // ===============================
        for (
            let pagina = 1;
            pagina <= totalPaginas;
            pagina++
        ) {

            const wrapper =
                document.createElement("div");

            wrapper.className =
                "page-wrapper";

            contenedor.appendChild(wrapper);

            await renderizarPagina(
                pdf,
                pagina,
                wrapper,
                esMovil
            );
        }

        // ===============================
        // 📝 LOGS
        // ===============================
        const {
            data: { user }
        } = await supabaseClient
            .auth
            .getUser();

        if (user) {

            supabaseClient
                .from("logs")
                .insert({
                    user_email: user.email,
                    pet: mascota.nombre,
                    area: area,
                    fecha: new Date().toISOString()
                })
                .catch(console.error);
        }

    } catch (error) {

        console.error(error);

        showAlert(
            error.message ||
            "Error cargando PDF",
            "error"
        );

    } finally {

        cargando = false;

        loader.classList.remove("active");
    }
}

// ===============================
// 🚀 INICIALIZAR APP
// ===============================
document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            const {
                data: { session }
            } = await supabaseClient
                .auth
                .getSession();

            if (!session) {

                showAlert(
                    "Sesión expirada",
                    "error"
                );

                setTimeout(() => {
                    window.location.href =
                        "index.html";
                }, 1500);

                return;
            }

            await cargarConfiguracion();

        } catch (error) {

            console.error(error);

            showAlert(
                "Error iniciando visor",
                "error"
            );
        }
    }
);