/**
 * ====================================================================
 * visor.js - Visor PROFESIONAL de PETS
 * Versión: 3.0.0 (Estable - Renderizado Completo)
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
let configuracion = null;           // Configuración del sistema (pets.json)
let escalaActual = 1.0;             // Escala de zoom actual (0.6 - 3.0)
let tokenRenderizado = 0;            // Token para cancelar renders antiguos
let tareaActual = null;              // Tarea de carga de PDF actual
let documentoPDF = null;             // Referencia al documento PDF cargado
let cargando = false;                // Bandera para evitar múltiples cargas
let totalPaginas = 0;                // Total de páginas del PDF actual
let paginaActual = 0;                // Página que se está renderizando

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
window.cerrarSesion = logout;
window.mostrarAlerta = showAlert;

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
            mostrarAlerta("⛔ Solo se permiten correos corporativos", "warning");
            window.location.href = "index.html";
            return;
        }
        
        console.log("✅ Usuario autenticado:", email);
        
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
        mostrarAlerta("❌ Error cargando configuración del sistema", "error");
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
            requestAnimationFrame(() => {
                cargarPDF();
            });
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
function mostrarAlerta(mensaje, tipo = "error") {
    // Eliminar alertas anteriores
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
// 🎨 RENDERIZAR PÁGINA INDIVIDUAL
// ===============================
async function renderizarPagina(documentoPDF, numeroPagina, contenedor, token, esMovil) {
    // Verificar si el token sigue siendo válido
    if (token !== tokenRenderizado) return null;

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
        
        // Aplicar zoom adicional si se ha modificado
        escala = escala * escalaActual;
        escala = Math.min(Math.max(escala, 0.4), 2.5);
        
        const DPR = esMovil ? Math.min(window.devicePixelRatio || 1, 2) : 1;

        const viewport = pagina.getViewport({ scale: escala * DPR });
        
        // Crear canvas para renderizar
        const canvas = document.createElement("canvas");
        const contexto = canvas.getContext("2d", { alpha: false });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        canvas.style.width = "100%";
        canvas.style.height = "auto";
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
// 📥 CARGAR Y RENDERIZAR PDF COMPLETO
// ===============================
async function cargarPDF() {
    // Evitar múltiples cargas simultáneas
    if (cargando) {
        console.log("⚠️ Ya hay una carga en progreso, esperando...");
        return;
    }
    
    try {
        const contenedor = document.getElementById("pdfContainer");
        const loader = document.getElementById("loader");
        const selectorMascota = document.getElementById("petSelect");
        const selectorArea = document.getElementById("areaSelect");
        const indiceMascota = selectorMascota.value;
        const areaSeleccionada = selectorArea.value;
        
        // Validar configuración
        if (!configuracion?.pets?.[indiceMascota]?.archivos?.[areaSeleccionada]) {
            console.error("❌ Configuración inválida para el área seleccionada");
            return;
        }
        
        const nombreArchivo = configuracion.pets[indiceMascota].archivos[areaSeleccionada];
        
        // Marcar inicio de carga
        cargando = true;
        
        // Limpiar contenedor y mostrar loader
        contenedor.innerHTML = "";
        loader.style.display = "flex";
        
        // Actualizar texto del loader
        const textoProgreso = document.getElementById("progressText");
        if (textoProgreso) {
            textoProgreso.textContent = "Descargando documento...";
        }
        
        // Obtener URL firmada del PDF
        const { data: urlData, error: urlError } = await supabaseClient
            .storage
            .from(configuracion.bucket)
            .createSignedUrl(nombreArchivo, 3600);
        
        if (urlError) {
            throw new Error("No se pudo obtener la URL del documento");
        }
        
        // Cancelar carga anterior si existe
        if (tareaActual) {
            try {
                if (documentoPDF) {
                    documentoPDF.destroy();
                }
                tareaActual.destroy();
            } catch (error) {
                console.warn("⚠️ Error cancelando tarea anterior:", error);
            }
        }
        
        // Generar nuevo token para esta carga
        const token = ++tokenRenderizado;
        
        // Configurar y cargar el PDF
        const tareaActual = pdfjsLib.getDocument({

            url: urlData.signedUrl,

            verbosity: 0,

            disableStream: true,

            disableAutoFetch: true,

            disableRange: true,

            stopAtErrors: false
        });
        
        const pdf = await tareaActual.promise;
        documentoPDF = pdf;
        
        // Verificar si el token sigue siendo válido
        if (token !== tokenRenderizado) {
            if (documentoPDF) documentoPDF.destroy();
            cargando = false;
            loader.style.display = "none";
            return;
        }
        
        totalPaginas = pdf.numPages;
        console.log(`📄 Documento cargado: ${totalPaginas} páginas`);
        
        const esMovil = esDispositivoMovil();
        
        // Configurar layout (grid 2 columnas en escritorio, 1 columna en móvil)
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
        
        // RENDERIZADO SECUENCIAL DE CADA PÁGINA
        for (let pagina = 1; pagina <= totalPaginas; pagina++) {
            // Verificar token
            if (token !== tokenRenderizado) {
                console.log(`🛑 Renderizado cancelado en página ${pagina}`);
                break;
            }
            
            // Actualizar progreso
            if (textoProgreso) {
                textoProgreso.textContent = `Renderizando página ${pagina} de ${totalPaginas} | ${esMovil ? "1 columna" : "2 columnas"}`;
            }
            
            // Crear wrapper para la página
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
            
            // Renderizar página actual
            await renderizarPagina(pdf, pagina, wrapperPagina, token, esMovil);
            
            // Pequeña pausa para permitir refrescos de UI
            if (pagina % 3 === 0 || pagina === totalPaginas) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            console.log(`✅ Página ${pagina}/${totalPaginas} renderizada`);
        }
        
        console.log(`✅ DOCUMENTO COMPLETO: ${totalPaginas} páginas renderizadas`);
        
        tareaActual = null;
        cargando = false;
        loader.style.display = "none";
        
        // Registrar en logs
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user && token === tokenRenderizado) {
            await supabaseClient.from("logs").insert({
                user_email: user.email,
                pet: configuracion.pets[indiceMascota].nombre,
                area: `${areaSeleccionada} | ${totalPaginas} PÁGINAS`,
                fecha: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error("❌ Error cargando PDF:", error);
        
        // Limpieza en caso de error
        if (documentoPDF) {
            try { documentoPDF.destroy(); } catch (e) {}
            documentoPDF = null;
        }
        
        tareaActual = null;
        cargando = false;
        
        const loader = document.getElementById("loader");
        if (loader) loader.style.display = "none";
        
        mostrarAlerta(`❌ Error al cargar documento: ${error.message}`, "error");
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
    
    // Limitar escala
    escalaActual = Math.min(Math.max(0.5, escalaActual), 2.5);
    
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
    escalaActual = Math.min(Math.max(0.5, escalaActual), 2.5);
    
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
document.addEventListener("scroll", actualizarActividad, { passive: true });

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
            
            mostrarAlerta("⏳ Sesión expirada por inactividad", "warning");
            
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
    const teclasBloqueadas = [
        "F12",
        "F5"
    ];
    
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
            mostrarAlerta("⏳ Sesión expirada", "error");
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
            mostrarAlerta("⏳ Sesión expirada", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
            return;
        }
        
        // Cargar configuración e inicializar
        await cargarConfiguracion();
        inicializarZoom();
        
        // NOTA: El resize NO recarga el PDF automáticamente
        // para evitar problemas de renderizado. Si el usuario
        // cambia el tamaño, puede hacer zoom o cambiar de documento.
        
        console.log("🚀 Visor PETS 3.0 inicializado correctamente");
        console.log("📐 Grid: 2 columnas (escritorio) | 1 columna (móvil)");
        
    } catch (error) {
        console.error("❌ Error inicializando visor:", error);
        mostrarAlerta("❌ Error iniciando el visor", "error");
    }
});