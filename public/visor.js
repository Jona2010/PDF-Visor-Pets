// ===============================
// 🔐 CONFIGURACIÓN SUPABASE (UNA SOLA VEZ)
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

let config = null;
let pdfScale = 1;
let renderToken = 0;
let currentLoadingTask = null;
let pdfDocument = null;
let cargandoPDF = false;

// ===============================
// 🔐 VALIDAR SESIÓN GOOGLE
// ===============================
(async () => {
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
    } catch (err) {
        console.error("❌ Error validando sesión:", err);
        window.location.href = "index.html";
    }
})();

// ===============================
// 📄 CARGAR CONFIG
// ===============================

async function loadConfig() {
    try {
        const res = await fetch("config.json");
        if (!res.ok) {
            throw new Error("No se pudo cargar config.json");
        }
        config = await res.json();
        loadPDFList();
    } catch (err) {
        console.error("❌ Error cargando config:", err);
        showAlert("❌ Error cargando configuración", "error");
    }
}


// 📄 CARGAR LISTA PDF
function loadPDFList() {
    try {
        const petSelect = document.getElementById("petSelect");

        if (!config || !config.pets || !Array.isArray(config.pets)) {
            console.error("❌ Config inválida");
            return;
        }

        petSelect.innerHTML = "";

        config.pets.forEach((pet, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.textContent = pet.nombre;
            petSelect.appendChild(option);
        });

        petSelect.selectedIndex = 0;
        petSelect.onchange = updateAreas;
        updateAreas();
    } catch (err) {
        console.error("❌ Error loadPDFList:", err);
    }
}

// 🚪 LOGOUT
async function logout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (err) {
        console.error("❌ Error logout:", err);
    }
    window.location.href = "index.html";
}


// 🔄 ACTUALIZAR ÁREAS
function updateAreas() {
    try {
        const petSelect = document.getElementById("petSelect");
        const areaSelect = document.getElementById("areaSelect");
        const petIndex = petSelect.value;

        if (!config || !config.pets || !config.pets[petIndex]) {
            return;
        }

        areaSelect.innerHTML = "";
        const areas = config.pets[petIndex].archivos;

        if (!areas) return;

        Object.keys(areas).forEach(area => {
            const option = document.createElement("option");
            option.value = area;
            option.textContent = area;
            areaSelect.appendChild(option);
        });

        areaSelect.selectedIndex = 0;
        areaSelect.onchange = () => {
            if (!cargandoPDF) {
                loadPDF();
            }
        };

        if (!cargandoPDF) {
            requestAnimationFrame(() => {
                loadPDF();
            });
        }
    } catch (err) {
        console.error("❌ Error updateAreas:", err);
    }
}


// 📱 DETECTAR MÓVIL
function esMovil() {
    return window.innerWidth <= 768;
}


// ⏳ REGISTRAR SESIÓN EXPIRADA
async function registrarSesionExpirada(user) {
    if (!user) return;
    try {
        await supabaseClient.from("alerts").insert({
            user_id: user?.id || null,
            email: user?.email || "Desconocido",
            message: `⏳ Sesión expirada: ${user?.email || ""}`,
            nivel: "warning",
            visto: false,
            created_at: new Date().toISOString()
        });

        await supabaseClient.from("logs").insert({
            user_email: user?.email || "Desconocido",
            pet: "SESSION",
            area: "Sesión expirada"
        });
    } catch (err) {
        console.error("❌ Error sesión expirada:", err);
    }
}


// 📥 CARGAR PDF (FIX TOTAL - 52 PÁGINAS)
async function loadPDF() {
    try {
        const container = document.getElementById("pdfContainer");
        const loader = document.getElementById("loader");

        const petIndex = document.getElementById("petSelect").value;
        const area = document.getElementById("areaSelect").value;

        if (!config.pets[petIndex] || !config.pets[petIndex].archivos[area]) {
            return;
        }

        const fileName = config.pets[petIndex].archivos[area];

        // 🔥 UI LIMPIA
        container.classList.remove("loaded");
        container.innerHTML = "";
        loader.style.display = "flex";
        cargandoPDF = true;

        // 🔐 SUPABASE URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 3600);

        if (error) {
            throw new Error("Error obteniendo URL del PDF");
        }

        // 🚀 CANCELAR ANTERIOR
        if (currentLoadingTask) {
            try {
                if (pdfDocument) {
                    pdfDocument.destroy();
                    pdfDocument = null;
                }
                currentLoadingTask.destroy();
            } catch (err) {
                console.warn("⚠️ Task anterior destruida");
            }
            currentLoadingTask = null;
        }

        const token = ++renderToken;

        // 🔥 CONFIGURACIÓN CRÍTICA PDFs GRANDES
        currentLoadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            verbosity: 0,
            disableAutoFetch: false,  // ✅ CAMBIADO: permitir auto-fetch para páginas completas
            rangeChunkSize: 1048576,
            maxImageSize: 4096,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });

        const pdf = await currentLoadingTask.promise;
        pdfDocument = pdf; // ✅ Guardar referencia

        if (token !== renderToken) {
            pdfDocument.destroy();
            pdfDocument = null;
            currentLoadingTask = null;
            cargandoPDF = false;
            return;
        }

        const totalPages = pdf.numPages;
        console.log(`✅ PDF: ${totalPages} páginas cargadas`);
        console.log(`📄 Renderizando ${totalPages} páginas...`);

        const modoMovil = esMovil();
        const pagePromises = [];

        // 🔥 RENDERIZADO SECUENCIAL CON BATCH DE 3 (más estable)
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (token !== renderToken) {
                console.log(`🛑 Render cancelado en página ${pageNum}`);
                break;
            }

            // Renderizar página actual
            await renderSinglePage(pdf, pageNum, container, modoMovil, token);
            
            // Pequeña pausa cada 5 páginas para liberar el event loop
            if (pageNum % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
                console.log(`✅ Progreso: ${pageNum}/${totalPages} páginas renderizadas`);
            }
        }

        // ✅ VERIFICAR QUE NO SE CANCELÓ ANTES DE DESTRUIR
        if (token === renderToken) {
            console.log(`✅ Renderizado completado: ${totalPages} páginas`);
            container.classList.add("loaded");
        } else {
            console.log(`🛑 Renderizado cancelado antes de completar`);
        }

        // 🧹 LIMPIEZA FINAL - SOLO UNA VEZ
        if (pdfDocument) {
            pdfDocument.destroy();
            pdfDocument = null;
        }
        currentLoadingTask = null;
        cargandoPDF = false;

        // 👤 LOG
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user && token === renderToken) {
            await supabaseClient.from("logs").insert({
                user_email: user.email,
                pet: config.pets[petIndex].nombre,
                area: `${area} | ${totalPages} PÁGINAS`
            });
        }

        loader.style.display = "none";

    } catch (err) {
        console.error("❌ Error loadPDF:", err);
        
        // Limpieza segura en caso de error
        if (pdfDocument) {
            try {
                pdfDocument.destroy();
            } catch (e) {}
            pdfDocument = null;
        }
        if (currentLoadingTask) {
            try {
                currentLoadingTask.destroy();
            } catch (e) {}
            currentLoadingTask = null;
        }
        
        document.getElementById("loader").style.display = "none";
        cargandoPDF = false;
        showAlert(`❌ Error PDF: ${err.message}`, "error");
    }
}


// 🎯 FUNCIÓN RENDER PÁGINA INDIVIDUAL (OPTIMIZADA)
async function renderSinglePage(pdf, pageNum, container, modoMovil, token) {
    if (token !== renderToken || !pdf) return null;

    try {
        const page = await pdf.getPage(pageNum);
        
        const containerWidth = container.clientWidth || window.innerWidth - 40;
        const baseViewport = page.getViewport({ scale: 1 });
        
        let scale = modoMovil 
            ? ((window.innerWidth - 20) / baseViewport.width) * pdfScale
            : (containerWidth * 0.95 / baseViewport.width) * pdfScale;

        const devicePixelRatio = modoMovil ? (window.devicePixelRatio || 2) : 1.5;
        let finalScale = Math.min(scale * devicePixelRatio, 2.5);

        const viewport = page.getViewport({ scale: finalScale });
        
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false }); // ✅ alpha: false mejora rendimiento
        
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        
        canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;
        canvas.style.opacity = "0";
        canvas.style.transition = "opacity 0.2s ease";
        canvas.style.display = "block";
        canvas.style.margin = "0 auto";

        const pageWrapper = document.createElement("div");
        pageWrapper.className = "page-wrapper";
        pageWrapper.style.marginBottom = "10px";
        pageWrapper.style.display = "flex";
        pageWrapper.style.justifyContent = "center";
        pageWrapper.appendChild(canvas);
        
        // ✅ Verificar token antes de agregar al DOM
        if (token !== renderToken) {
            return null;
        }
        
        container.appendChild(pageWrapper);

        const renderTask = page.render({
            canvasContext: ctx,
            viewport: viewport,
            background: "white" // ✅ Fondo blanco mejora rendimiento
        });

        await renderTask.promise;
        
        // ✅ Limpiar página después de renderizar
        page.cleanup();
        
        if (token === renderToken) {
            requestAnimationFrame(() => {
                if (canvas) canvas.style.opacity = "1";
            });
        }

        return pageNum;
        
    } catch (err) {
        console.warn(`⚠️ Error página ${pageNum}:`, err);
        return null;
    }
}


function showAlert(message, type = "error") {
    document.querySelectorAll(".custom-alert").forEach(el => el.remove());

    const alert = document.createElement("div");
    alert.className = `custom-alert ${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);

    requestAnimationFrame(() => {
        alert.classList.add("show");
    });

    setTimeout(() => {
        alert.classList.remove("show");
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 250);
    }, 3000);
}


// ===============================
// 🔐 CONTROL SESIÓN
// ===============================

let lastActivity = Date.now();
const TIEMPO_MAX = 10 * 60 * 1000;
let activityTimeout = null;
let verificandoSesion = false;

function actualizarActividad() {
    if (activityTimeout) return;
    activityTimeout = setTimeout(() => {
        lastActivity = Date.now();
        activityTimeout = null;
    }, 300);
}


// ===============================
// 🎧 EVENTOS
// ===============================

document.addEventListener("click", actualizarActividad, { passive: true });
document.addEventListener("touchstart", actualizarActividad, { passive: true });
document.addEventListener("keydown", actualizarActividad, { passive: true });

// 🚫 NO USAR SCROLL GLOBAL
// document.addEventListener("scroll", actualizarActividad);

// ===============================
// 🚨 REGISTRAR SESIÓN EXPIRADA
// ===============================
async function registrarSesionExpirada(user){

    if(!user){
        return;
    }

    try{

        await supabaseClient
            .from("alerts")
            .insert({

                user_id:user.id,

                email:user.email,

                message:
                    `⏳ Sesión expirada: ${user.email}`,

                nivel:"warning",

                visto:false
            });

        console.log(
            "🚨 Sesión expirada registrada"
        );

    }catch(err){

        console.error(
            "❌ Error sesión expirada:",
            err
        );
    }
}


// ===============================
// 📱 FIX MOBILE PINCH
// ===============================

// 🚫 SOLO SAFARI/iOS
if("ongesturestart" in window){

    document.addEventListener(
        "gesturestart",
        (e) => {

            e.preventDefault();

        },
        { passive:false }
    );
}

// ===============================
// 🔐 VERIFICAR SESIÓN
// ===============================

setInterval(async () => {
    if (verificandoSesion) return;
    verificandoSesion = true;

    try {
        const ahora = Date.now();
        if (ahora - lastActivity > TIEMPO_MAX) {
            console.log("⏳ Sesión expirada");
            const { data: { user } } = await supabaseClient.auth.getUser();
            await registrarSesionExpirada(user);
            await supabaseClient.auth.signOut();
            showAlert("⏳ Sesión expirada por inactividad", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1800);
        }
    } catch (err) {
        console.error("❌ Error verificando sesión:", err);
    } finally {
        verificandoSesion = false;
    }
}, 30000);


// 🚫 BLOQUEOS
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("keydown", e => {
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
        e.preventDefault();
    }
});

// ===============================
// 🚀 INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const device_id = localStorage.getItem("device_id");
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            showAlert("⏳ Sesión expirada", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
            return;
        }

        const user = session.user;
        const expiresAt = session.expires_at * 1000;

        if (Date.now() > expiresAt) {
            await registrarSesionExpirada(user);
            await supabaseClient.auth.signOut();
            showAlert("⏳ Sesión expirada por inactividad", "error");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 1500);
            return;
        }

        if (!device_id) {
            console.warn("⚠️ device_id no encontrado");
        }

        await loadConfig();
        initPDFZoom();
    } catch (err) {
        console.error("❌ Error init:", err);
        showAlert("❌ Error iniciando visor", "error");
    }
});


// ===============================
// 🔍 ZOOM PDF
// ===============================
let initialDistance = null;
let zoomTimeout = null;

function initPDFZoom() {
    const pdfContainer = document.getElementById("pdfContainer");
    if (!pdfContainer) return;

    pdfContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
    pdfContainer.addEventListener("touchmove", handlePinchZoom, { passive: false });
}

// ===============================
// 🔍 ZOOM PDF
// ===============================

let initialDistance = null;

let zoomTimeout = null;

// ===============================
// 🚀 INIT PDF EVENTS
// ===============================
function initPDFZoom(){

    const pdfContainer =
        document.getElementById(
            "pdfContainer"
        );

    if(!pdfContainer){
        return;
    }

    // ===============================
    // 🖥️ ZOOM RUEDA
    // ===============================
    pdfContainer.addEventListener(
        "wheel",
        handleWheelZoom,
        { passive:false }
    );

    // ===============================
    // 📱 PINCH
    // ===============================
    pdfContainer.addEventListener(
        "touchmove",
        handlePinchZoom,
        { passive:false }
    );
}

// ===============================
// 🖥️ WHEEL ZOOM
// ===============================
async function handleWheelZoom(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (zoomTimeout) return;

    if (e.deltaY < 0) {
        pdfScale += 0.1;
    } else {
        pdfScale -= 0.1;
    }

    pdfScale = Math.min(Math.max(0.6, pdfScale), 3);

    zoomTimeout = setTimeout(async () => {
        await loadPDF();
        zoomTimeout = null;
    }, 120);
}


// ===============================
// 📱 PINCH ZOOM
// ===============================
async function handleWheelZoom(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (zoomTimeout) return;

    if (e.deltaY < 0) {
        pdfScale += 0.1;
    } else {
        pdfScale -= 0.1;
    }

    pdfScale = Math.min(Math.max(0.6, pdfScale), 3);

    zoomTimeout = setTimeout(async () => {
        await loadPDF();
        zoomTimeout = null;
    }, 120);
}

async function handlePinchZoom(e) {
    if (e.touches.length !== 2) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (!initialDistance) {
        initialDistance = distance;
        return;
    }

    const diff = distance - initialDistance;
    if (Math.abs(diff) < 8) return;

    pdfScale += diff * 0.0008;
    pdfScale = Math.min(Math.max(0.6, pdfScale), 3);
    initialDistance = distance;

    if (zoomTimeout) return;
    zoomTimeout = setTimeout(async () => {
        await loadPDF();
        zoomTimeout = null;
    }, 150);
}

document.addEventListener("touchend", () => {
    initialDistance = null;
});


// ===============================
// 📱 TOUCH END
// ===============================
document.addEventListener(
    "touchend",
    () => {

        initialDistance = null;
    }
);