/**
 * ====================================================================
 * visor.js - Visor PROFESIONAL de PETS
 * Versión: 3.2.0 (CORREGIDO - SIN TOKEN - SIN DESTROY ANTICIPADO)
 * ====================================================================
 * 
 * FUNCIONES PRINCIPALES:
 * - autenticarUsuario()     → Valida sesión y correo corporativo
 * - cargarConfiguracion()   → Obtiene y carga la configuración del sistema
 * - cargarListaMascotas()   → Pobla el selector de mascotas/PETS
 * - actualizarAreas()       → Actualiza áreas según mascota seleccionada
 * - cargarPDF()             → Función principal: carga y renderiza TODAS las páginas
 * - renderizarPagina()      → Renderiza una página individual en canvas
 * - manejarZoomRueda()      → Zoom con Ctrl + Rueda del mouse
 * - manejarZoomPinch()      → Zoom táctil para móviles
 * - cerrarSesion()          → Cierra sesión y redirige al login
 * ====================================================================
 */

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
let configuracion = null;           // Configuración del sistema (config.json)
let escalaActual = 1.0;             // Escala de zoom actual (0.5 - 1.8)
let tareaActual = null;              // Tarea de carga de PDF actual
let documentoPDF = null;             // Referencia al documento PDF cargado
let cargando = false;                // Bandera para evitar múltiples cargas
let totalPaginas = 0;                // Total de páginas del PDF actual
let renderCancelado = false;         // Bandera para cancelar renderizado
let idCargaActual = 0;               // ✅ NUEVO: ID único por carga para invalidar renders obsoletos

// Variables para zoom táctil
let distanciaInicial = null;
let timeoutZoom = null;

// Variables para control de sesión
let ultimaActividad = Date.now();
const TIEMPO_MAX_INACTIVIDAD = 10 * 60 * 1000; // 10 minutos
let timeoutActividad = null;
let verificandoSesion = false;

// ===============================
// 🚪 EXPORTAR FUNCIONES GLOBALES
// ===============================
window.logout = logout;
window.showAlert = showAlert;

// ===============================
// 🔐 DETECTAR NAVEGADOR
// ===============================
function esBrave() {
    return navigator.brave !== undefined;
}

// ===============================
// 🔐 AUTENTICACIÓN DE USUARIO
// ===============================
(async function autenticarUsuario() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            window.location.href = "index.html";
            return;
        }

        const email = session.user.email || "";

        if (!email.endsWith("@intelliall.com")) {
            await supabaseClient.auth.signOut();
            showAlert("⛔ Solo se permiten correos corporativos", "warning");
            window.location.href = "index.html";
            return;
        }
        
        console.log("✅ Usuario autenticado:", email);
        console.log("🦁 Brave detectado:", esBrave());
        
    } catch (error) {
        console.error("❌ Error en autenticación:", error);
        window.location.href = "index.html";
    }
})();

// ===============================
// 📄 CARGAR CONFIGURACIÓN DEL SISTEMA
// ===============================
async function cargarConfiguracion() {
    try {
        const respuesta = await fetch("config.json");
        
        if (!respuesta.ok) {
            throw new Error("No se pudo cargar config.json");
        }
        
        configuracion = await respuesta.json();
        console.log("✅ Configuración cargada correctamente");
        
        cargarListaMascotas();
        
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
        showAlert("❌ Error cargando configuración del sistema", "error");
    }
}

// ===============================
// 📋 CARGAR LISTA DE MASCOTAS/PETS
// ===============================
function cargarListaMascotas() {
    try {
        const selectorMascota = document.getElementById("petSelect");

        if (!configuracion || !configuracion.pets || !Array.isArray(configuracion.pets)) {
            console.error("❌ Configuración inválida");
            return;
        }

        selectorMascota.innerHTML = "";

        configuracion.pets.forEach((mascota, indice) => {
            const opcion = document.createElement("option");
            opcion.value = indice;
            opcion.textContent = mascota.nombre;
            selectorMascota.appendChild(opcion);
        });

        selectorMascota.selectedIndex = 0;
        selectorMascota.onchange = actualizarAreas;
        
        actualizarAreas();
        
    } catch (error) {
        console.error("❌ Error cargando lista de mascotas:", error);
    }
}

// ===============================
// 🔄 ACTUALIZAR ÁREAS SEGÚN MASCOTA
// ===============================
function actualizarAreas() {
    try {
        const selectorMascota = document.getElementById("petSelect");
        const selectorArea = document.getElementById("areaSelect");
        const indiceMascota = selectorMascota.value;

        if (!configuracion || !configuracion.pets || !configuracion.pets[indiceMascota]) {
            return;
        }

        selectorArea.innerHTML = "";
        const areas = configuracion.pets[indiceMascota].archivos;

        if (!areas) return;

        Object.keys(areas).forEach(area => {
            const opcion = document.createElement("option");
            opcion.value = area;
            opcion.textContent = area;
            selectorArea.appendChild(opcion);
        });

        selectorArea.selectedIndex = 0;
        selectorArea.onchange = () => {
            if (!cargando) {
                cargarPDF();
            }
        };

        if (!cargando) {
            // ✅ REEMPLAZADO: requestAnimationFrame por setTimeout
            setTimeout(() => {
                if (!cargando) {
                    cargarPDF();
                }
            }, 100);
        }
        
    } catch (error) {
        console.error("❌ Error actualizando áreas:", error);
    }
}

// ===============================
// 📱 DETECTAR DISPOSITIVO MÓVIL
// ===============================
function esDispositivoMovil() {
    return window.innerWidth <= 768;
}

// ===============================
// 🔔 MOSTRAR ALERTA EN PANTALLA
// ===============================
function showAlert(mensaje, tipo = "error") {
    document.querySelectorAll(".custom-alert").forEach(alerta => alerta.remove());

    const alerta = document.createElement("div");
    alerta.className = `custom-alert ${tipo}`;
    alerta.textContent = mensaje;
    alerta.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        padding: 12px 24px;
        border-radius: 8px;
        background-color: ${tipo === "error" ? "#dc2626" : "#f59e0b"};
        color: white;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        opacity: 0;
        transition: opacity 0.3s ease;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    
    document.body.appendChild(alerta);

    requestAnimationFrame(() => {
        alerta.style.opacity = "1";
    });

    setTimeout(() => {
        alerta.style.opacity = "0";
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
        console.log("✅ Sesión cerrada correctamente");
    } catch (error) {
        console.error("❌ Error cerrando sesión:", error);
    }
    window.location.href = "index.html";
}

// ===============================
// ⏰ REGISTRAR SESIÓN EXPIRADA
// ===============================
async function registrarSesionExpirada(usuario) {
    if (!usuario) return;
    
    try {
        await supabaseClient.from("alerts").insert({
            user_id: usuario?.id || null,
            email: usuario?.email || "Desconocido",
            message: `⏳ Sesión expirada por inactividad: ${usuario?.email || ""}`,
            nivel: "warning",
            visto: false,
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.error("❌ Error registrando sesión expirada:", error);
    }
}

// ===============================
// 🎨 RENDERIZAR PÁGINA INDIVIDUAL (SIN TOKEN)
// ===============================
async function renderizarPagina(documentoPDF, numeroPagina, contenedor, esMovil) {
    try {
        const pagina = await documentoPDF.getPage(numeroPagina);
        
        // Calcular escala según el dispositivo
        let escala;
        
        if (esMovil) {
            const anchoContenedor = Math.min(window.innerWidth - 40, 500);
            const viewportBase = pagina.getViewport({ scale: 1 });
            escala = (anchoContenedor * 0.95) / viewportBase.width;
            escala = Math.min(Math.max(escala, 0.5), 2);
        } else {
            const contenedorGrid = document.getElementById("pdfContainer");
            let anchoDisponible = 450;
            
            if (contenedorGrid) {
                const anchoGrid = contenedorGrid.clientWidth;
                anchoDisponible = (anchoGrid - 48) / 2;
            }
            
            const viewportBase = pagina.getViewport({ scale: 1 });
            escala = (anchoDisponible * 0.85) / viewportBase.width;
            escala = Math.min(Math.max(escala, 0.5), 1.3);
        }
        
        // Aplicar zoom adicional con límite MÁXIMO 1.8 (CORREGIDO)
        escala = escala * escalaActual;
        escala = Math.min(Math.max(escala, 0.4), 1.8);  // ✅ LÍMITE SEGURO PARA BRAVE
        
        const viewport = pagina.getViewport({ scale: escala });
        
        // Crear canvas para renderizar
        const canvas = document.createElement("canvas");
        const contexto = canvas.getContext("2d", { alpha: false });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // ✅ CORREGIDO: usar dimensiones exactas, no porcentaje
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        canvas.style.maxWidth = "100%";
        canvas.style.backgroundColor = "white";
        canvas.style.borderRadius = "8px";
        canvas.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        canvas.style.display = "block";
        
        // Limpiar contenedor y agregar canvas
        contenedor.innerHTML = "";
        contenedor.appendChild(canvas);
        
        // Renderizar la página
        await pagina.render({
            canvasContext: contexto,
            viewport: viewport,
            background: "white"
        }).promise;
        
        // Liberar memoria de la página
        pagina.cleanup();
        
        return numeroPagina;
        
    } catch (error) {
        console.warn(`⚠️ Error renderizando página ${numeroPagina}:`, error);
        
        // Mostrar mensaje de error en la página
        const divError = document.createElement("div");
        divError.style.padding = "20px";
        divError.style.textAlign = "center";
        divError.style.color = "#dc2626";
        divError.style.backgroundColor = "#fee2e2";
        divError.style.borderRadius = "8px";
        divError.style.margin = "10px";
        divError.textContent = `❌ Error al cargar página ${numeroPagina}`;
        
        contenedor.innerHTML = "";
        contenedor.appendChild(divError);
        
        return null;
    }
}

// ===============================
// 📥 CARGAR Y RENDERIZAR PDF COMPLETO — CORREGIDO
// ===============================
async function cargarPDF() {
    if (cargando) {
        console.log("⚠️ Ya hay una carga en progreso, ignorando...");
        return;
    }

    // ✅ Incrementar ID de carga para invalidar cualquier render previo
    idCargaActual++;
    const miIdCarga = idCargaActual;

    try {
        const contenedor = document.getElementById("pdfContainer");
        const loader = document.getElementById("loader");
        const selectorMascota = document.getElementById("petSelect");
        const selectorArea = document.getElementById("areaSelect");
        const indiceMascota = selectorMascota.value;
        const areaSeleccionada = selectorArea.value;

        if (!configuracion?.pets?.[indiceMascota]?.archivos?.[areaSeleccionada]) {
            console.error("❌ Configuración inválida");
            return;
        }

        const nombreArchivo = configuracion.pets[indiceMascota].archivos[areaSeleccionada];

        cargando = true;
        contenedor.innerHTML = "";
        loader.style.display = "flex";

        const textoProgreso = document.getElementById("progressText");
        if (textoProgreso) textoProgreso.textContent = "Descargando documento...";

        // ✅ Limpiar tarea/documento ANTERIOR de forma segura
        if (tareaActual) {
            try { tareaActual.destroy(); } catch (e) {}
            tareaActual = null;
        }
        if (documentoPDF) {
            try { documentoPDF.destroy(); } catch (e) {}
            documentoPDF = null;
        }

        // --- Obtener URL del PDF (sin cambios) ---
        let urlPdf;
        try {
            const { data: urlData, error: urlError } = await supabaseClient
                .storage.from(configuracion.bucket)
                .createSignedUrl(nombreArchivo, 3600);

            if (urlError) throw urlError;
            urlPdf = urlData.signedUrl;

            if (esBrave()) {
                try {
                    const testResponse = await fetch(urlPdf, { method: 'HEAD', mode: 'cors' });
                    if (!testResponse.ok) throw new Error(`HTTP ${testResponse.status}`);
                } catch {
                    const { data: publicData } = supabaseClient.storage
                        .from(configuracion.bucket).getPublicUrl(nombreArchivo);
                    if (publicData?.publicUrl) urlPdf = publicData.publicUrl;
                }
            }
        } catch {
            const { data: publicData } = supabaseClient.storage
                .from(configuracion.bucket).getPublicUrl(nombreArchivo);
            if (publicData?.publicUrl) {
                urlPdf = publicData.publicUrl;
            } else {
                throw new Error("No se pudo obtener la URL del documento");
            }
        }

        // ✅ Verificar que esta carga sigue siendo válida
        if (miIdCarga !== idCargaActual) {
            console.log("🛑 Carga obsoleta descartada antes de iniciar PDF.js");
            cargando = false;
            return;
        }

        tareaActual = pdfjsLib.getDocument({
            url: urlPdf,
            verbosity: 0,
            disableStream: true,
            disableAutoFetch: false,
            disableRange: true,
            stopAtErrors: false,
            cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/standard_fonts/"
        });

        const pdf = await tareaActual.promise;

        // ✅ Verificar nuevamente tras el await (puede haber cambiado el ID)
        if (miIdCarga !== idCargaActual) {
            console.log("🛑 Carga obsoleta descartada después de cargar PDF");
            try { pdf.destroy(); } catch (e) {}
            cargando = false;
            return;
        }

        documentoPDF = pdf;
        totalPaginas = pdf.numPages;
        console.log(`📄 Documento cargado: ${totalPaginas} páginas`);

        const esMovil = esDispositivoMovil();

        if (esMovil) {
            contenedor.style.display = "flex";
            contenedor.style.flexDirection = "column";
            contenedor.style.alignItems = "center";
            contenedor.style.gap = "20px";
            contenedor.style.padding = "10px";
        } else {
            contenedor.style.display = "grid";
            contenedor.style.gridTemplateColumns = "repeat(2, minmax(450px, 1fr))";
            contenedor.style.gap = "24px";
            contenedor.style.padding = "20px";
            contenedor.style.maxWidth = "1600px";
            contenedor.style.margin = "0 auto";
        }

        // ✅ Loop de renderizado con validación de ID en cada iteración
        for (let pagina = 1; pagina <= totalPaginas; pagina++) {

            // Verificar que esta carga sigue siendo la activa
            if (miIdCarga !== idCargaActual) {
                console.log(`🛑 Render cancelado en página ${pagina} (nueva carga iniciada)`);
                break;
            }

            if (textoProgreso) {
                textoProgreso.textContent = `Renderizando página ${pagina} de ${totalPaginas}`;
            }

            const wrapperPagina = document.createElement("div");
            wrapperPagina.className = "page-wrapper";
            wrapperPagina.style.width = "100%";
            wrapperPagina.style.display = "flex";
            wrapperPagina.style.justifyContent = "center";
            wrapperPagina.style.alignItems = "flex-start";

            if (!esMovil) {
                wrapperPagina.style.maxWidth = "750px";
                wrapperPagina.style.margin = "0 auto";
            }

            contenedor.appendChild(wrapperPagina);

            await renderizarPagina(pdf, pagina, wrapperPagina, esMovil);

            // ✅ Verificar después del await de renderizado también
            if (miIdCarga !== idCargaActual) {
                console.log(`🛑 Render cancelado tras página ${pagina}`);
                break;
            }

            // Ceder el hilo cada 4 páginas (menos interrupciones que cada 2)
            if (pagina % 4 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            console.log(`✅ Página ${pagina}/${totalPaginas}`);
        }

        // Solo finalizar si esta carga sigue siendo la activa
        if (miIdCarga === idCargaActual) {
            console.log(`✅ DOCUMENTO COMPLETO: ${totalPaginas} páginas`);
            loader.style.display = "none";
            tareaActual = null;
            cargando = false;

            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                await supabaseClient.from("logs").insert({
                    user_email: user.email,
                    pet: configuracion.pets[indiceMascota].nombre,
                    area: `${areaSeleccionada} | ${totalPaginas} PÁGINAS`,
                    fecha: new Date().toISOString()
                });
            }
        }

    } catch (error) {
        console.error("❌ Error cargando PDF:", error);

        if (documentoPDF) {
            try { documentoPDF.destroy(); } catch (e) {}
            documentoPDF = null;
        }

        tareaActual = null;
        cargando = false;

        const loader = document.getElementById("loader");
        if (loader) loader.style.display = "none";

        showAlert(`❌ Error al cargar documento: ${error.message}`, "error");
    }
}

// ===============================
// 🔍 MANEJAR ZOOM CON RUEDA (Ctrl + Rueda)
// ===============================
async function manejarZoomRueda(evento) {
    if (!evento.ctrlKey) return;
    
    evento.preventDefault();
    
    if (timeoutZoom) return;
    
    if (evento.deltaY < 0) {
        escalaActual += 0.1;
    } else {
        escalaActual -= 0.1;
    }
    
    // ✅ Limitar escala a 1.8 máximo (seguro para Brave)
    escalaActual = Math.min(Math.max(0.5, escalaActual), 1.8);
    
    timeoutZoom = setTimeout(async () => {
        if (documentoPDF || totalPaginas > 0) {
            await cargarPDF();
        }
        timeoutZoom = null;
    }, 150);
}

// ===============================
// 📱 MANEJAR ZOOM CON PINCH (Táctil)
// ===============================
async function manejarZoomPinch(evento) {
    if (evento.touches.length !== 2) return;
    
    evento.preventDefault();
    
    const dx = evento.touches[0].clientX - evento.touches[1].clientX;
    const dy = evento.touches[0].clientY - evento.touches[1].clientY;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    
    if (!distanciaInicial) {
        distanciaInicial = distancia;
        return;
    }
    
    const diferencia = distancia - distanciaInicial;
    
    if (Math.abs(diferencia) < 10) return;
    
    escalaActual += diferencia * 0.001;
    
    // ✅ Limitar escala a 1.8 máximo
    escalaActual = Math.min(Math.max(0.5, escalaActual), 1.8);
    
    distanciaInicial = distancia;
    
    if (timeoutZoom) return;
    
    timeoutZoom = setTimeout(async () => {
        if (documentoPDF || totalPaginas > 0) {
            await cargarPDF();
        }
        timeoutZoom = null;
    }, 150);
}

// ===============================
// 🖱️ INICIALIZAR EVENTOS DE ZOOM
// ===============================
function inicializarZoom() {
    const contenedorPDF = document.getElementById("pdfContainer");
    
    if (!contenedorPDF) return;
    
    contenedorPDF.addEventListener("wheel", manejarZoomRueda, { passive: false });
    contenedorPDF.addEventListener("touchmove", manejarZoomPinch, { passive: false });
}

document.addEventListener("touchend", () => {
    distanciaInicial = null;
});

// ===============================
// ⏱️ CONTROL DE INACTIVIDAD
// ===============================
function actualizarActividad() {
    if (timeoutActividad) return;
    
    timeoutActividad = setTimeout(() => {
        ultimaActividad = Date.now();
        timeoutActividad = null;
    }, 300);
}

// Suscribir eventos de actividad
document.addEventListener("click", actualizarActividad, { passive: true });
document.addEventListener("touchstart", actualizarActividad, { passive: true });
document.addEventListener("keydown", actualizarActividad, { passive: true });

// Verificar inactividad periódicamente
setInterval(async () => {
    if (verificandoSesion) return;
    
    verificandoSesion = true;
    
    try {
        const ahora = Date.now();
        
        if (ahora - ultimaActividad > TIEMPO_MAX_INACTIVIDAD) {
            console.log("⏳ Sesión expirada por inactividad");
            
            const { data: { user } } = await supabaseClient.auth.getUser();
            await registrarSesionExpirada(user);
            await supabaseClient.auth.signOut();
            
            showAlert("⏳ Sesión expirada por inactividad", "warning");
            
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
        }
        
    } catch (error) {
        console.error("❌ Error verificando sesión:", error);
        
    } finally {
        verificandoSesion = false;
    }
}, 30000);

// ===============================
// 🔒 BLOQUEOS DE SEGURIDAD
// ===============================
// Bloquear clic derecho
document.addEventListener("contextmenu", evento => evento.preventDefault());

// Bloquear teclas de desarrollador
document.addEventListener("keydown", evento => {
    const teclasBloqueadas = ["F12", "F5"];
    
    const combinacionesBloqueadas = [
        (evento.ctrlKey && evento.shiftKey && (evento.key === "I" || evento.key === "i")),
        (evento.ctrlKey && (evento.key === "u" || evento.key === "U")),
        (evento.ctrlKey && (evento.key === "r" || evento.key === "R")),
        (evento.ctrlKey && (evento.key === "s" || evento.key === "S"))
    ];
    
    if (teclasBloqueadas.includes(evento.key) || combinacionesBloqueadas.some(cond => cond)) {
        evento.preventDefault();
        return false;
    }
});

// Prevenir zoom con gestos en iOS
if ("ongesturestart" in window) {
    document.addEventListener("gesturestart", (evento) => {
        evento.preventDefault();
    }, { passive: false });
}

// ===============================
// 🚀 INICIALIZACIÓN DE LA APLICACIÓN
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Verificar sesión nuevamente al cargar
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            showAlert("⏳ Sesión expirada", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
            return;
        }
        
        const usuario = session.user;
        const expiraEn = session.expires_at * 1000;
        
        if (Date.now() > expiraEn) {
            await registrarSesionExpirada(usuario);
            await supabaseClient.auth.signOut();
            showAlert("⏳ Sesión expirada", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
            return;
        }
        
        // Cargar configuración e inicializar
        await cargarConfiguracion();
        inicializarZoom();
        
        console.log("🚀 Visor PETS 3.2 CORREGIDO - SIN TOKEN - SIN DESTROY");
        console.log("📐 Grid: 2 columnas (escritorio) | 1 columna (móvil)");
        console.log("🔒 Escala máxima: 1.8 (seguro para Brave)");
        
    } catch (error) {
        console.error("❌ Error inicializando visor:", error);
        showAlert("❌ Error iniciando el visor", "error");
    }
});