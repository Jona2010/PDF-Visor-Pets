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

// 📥 CARGAR PDF - VERSIÓN CORREGIDA
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

        // 🚫 EVITAR DOBLE CARGA
        if (cargandoPDF) return;
        cargandoPDF = true;

        // 🧹 LIMPIAR
        container.innerHTML = "";
        loader.style.display = "flex";

        // 🔐 URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 3600);

        if (error) {
            loader.style.display = "none";
            cargandoPDF = false;
            showAlert("❌ Error cargando PDF", "error");
            return;
        }

        // 🚀 CANCELAR ANTERIOR
        if (currentLoadingTask) {
            try {
                if (pdfDocument) {
                    pdfDocument.destroy();
                }
                currentLoadingTask.destroy();
            } catch (e) {}
        }

        const token = ++renderToken;

        // 📄 CONFIGURACIÓN PDF
        currentLoadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            verbosity: 0,
            disableAutoFetch: false,
            rangeChunkSize: 65536,
            cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
            cMapPacked: true
        });

        const pdf = await currentLoadingTask.promise;
        pdfDocument = pdf;

        if (token !== renderToken) {
            if (pdfDocument) pdfDocument.destroy();
            cargandoPDF = false;
            loader.style.display = "none";
            return;
        }

        const totalPages = pdf.numPages;
        console.log(`📄 PDF CARGADO: ${totalPages} páginas`);

        const modoMovil = esMovil();

        // 🎨 CONFIGURAR GRID LAYOUT
        if (modoMovil) {
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.alignItems = "center";
            container.style.gap = "20px";
            container.style.padding = "10px";
        } else {
            container.style.display = "grid";
            container.style.gridTemplateColumns = "repeat(2, minmax(400px, 1fr))";
            container.style.gap = "24px";
            container.style.padding = "20px";
            container.style.maxWidth = "1600px";
            container.style.margin = "0 auto";
        }

        // 📄 RENDERIZAR CADA PÁGINA (UNA POR UNA)
        for (let i = 1; i <= totalPages; i++) {
            if (token !== renderToken) {
                console.log(`🛑 Render cancelado en página ${i}`);
                break;
            }

            // Crear wrapper para la página
            const pageWrapper = document.createElement("div");
            pageWrapper.className = "page-wrapper";
            pageWrapper.style.width = "100%";
            pageWrapper.style.display = "flex";
            pageWrapper.style.justifyContent = "center";
            pageWrapper.style.alignItems = "flex-start";
            
            if (!modoMovil) {
                pageWrapper.style.maxWidth = "700px";
                pageWrapper.style.margin = "0 auto";
            }
            
            container.appendChild(pageWrapper);
            
            // Renderizar página
            await renderSinglePage(pdf, i, pageWrapper, token, modoMovil);
            
            // Pequeña pausa para no bloquear UI
            if (i % 3 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            console.log(`✅ Página ${i}/${totalPages} renderizada`);
        }

        // 🧹 LIMPIEZA
        if (pdfDocument && token === renderToken) {
            pdfDocument.destroy();
            pdfDocument = null;
        }
        currentLoadingTask = null;
        cargandoPDF = false;
        loader.style.display = "none";

        // 📝 LOG
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user && token === renderToken) {
            await supabaseClient.from("logs").insert({
                user_email: user.email,
                pet: config.pets[petIndex].nombre,
                area: `${area} | ${totalPages} PÁGINAS`
            });
        }

        console.log(`✅ PDF COMPLETO: ${totalPages} páginas renderizadas`);

    } catch (err) {
        console.error("❌ Error loadPDF:", err);
        if (pdfDocument) {
            try { pdfDocument.destroy(); } catch (e) {}
            pdfDocument = null;
        }
        currentLoadingTask = null;
        cargandoPDF = false;
        document.getElementById("loader").style.display = "none";
        showAlert(`❌ Error PDF: ${err.message}`, "error");
    }
}

// 🎯 RENDER PÁGINA INDIVIDUAL - CORREGIDA
async function renderSinglePage(pdf, pageNum, containerElement, token, modoMovil) {
    if (token !== renderToken) return null;

    try {
        const page = await pdf.getPage(pageNum);
        
        // Calcular escala
        let scale;
        
        if (modoMovil) {
            const containerWidth = Math.min(window.innerWidth - 40, 500);
            const baseViewport = page.getViewport({ scale: 1 });
            scale = (containerWidth * 0.95) / baseViewport.width;
            scale = Math.min(Math.max(scale, 0.5), 2);
        } else {
            const gridContainer = document.getElementById("pdfContainer");
            let availableWidth = 450;
            
            if (gridContainer) {
                const gridWidth = gridContainer.clientWidth;
                availableWidth = (gridWidth - 48) / 2;
            }
            
            const baseViewport = page.getViewport({ scale: 1 });
            scale = (availableWidth * 0.85) / baseViewport.width;
            scale = Math.min(Math.max(scale, 0.5), 1.3);
        }
        
        const viewport = page.getViewport({ scale: scale });
        
        // Crear canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // Estilos CSS
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.maxWidth = "100%";
        canvas.style.backgroundColor = "white";
        canvas.style.borderRadius = "8px";
        canvas.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        canvas.style.display = "block";
        
        // Limpiar contenedor y añadir canvas
        containerElement.innerHTML = "";
        containerElement.appendChild(canvas);
        
        // Renderizar
        await page.render({
            canvasContext: ctx,
            viewport: viewport,
            background: "white"
        }).promise;
        
        // Limpiar página
        page.cleanup();
        
        return pageNum;
        
    } catch (err) {
        console.warn(`⚠️ Error página ${pageNum}:`, err);
        
        // Mostrar error en la página
        const errorDiv = document.createElement("div");
        errorDiv.style.padding = "20px";
        errorDiv.style.textAlign = "center";
        errorDiv.style.color = "red";
        errorDiv.style.backgroundColor = "#ffeeee";
        errorDiv.style.borderRadius = "8px";
        errorDiv.textContent = `Error al cargar página ${pageNum}`;
        containerElement.innerHTML = "";
        containerElement.appendChild(errorDiv);
        
        return null;
    }
}

// 📢 ALERTA
function showAlert(message, type = "error") {
    document.querySelectorAll(".custom-alert").forEach(el => el.remove());

    const alert = document.createElement("div");
    alert.className = `custom-alert ${type}`;
    alert.textContent = message;
    alert.style.position = "fixed";
    alert.style.bottom = "20px";
    alert.style.right = "20px";
    alert.style.zIndex = "9999";
    alert.style.padding = "12px 24px";
    alert.style.borderRadius = "8px";
    alert.style.backgroundColor = type === "error" ? "#dc2626" : "#f59e0b";
    alert.style.color = "white";
    alert.style.fontWeight = "bold";
    alert.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    alert.style.opacity = "0";
    alert.style.transition = "opacity 0.3s ease";
    
    document.body.appendChild(alert);

    requestAnimationFrame(() => {
        alert.style.opacity = "1";
    });

    setTimeout(() => {
        alert.style.opacity = "0";
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 300);
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

// Eventos de actividad
document.addEventListener("click", actualizarActividad, { passive: true });
document.addEventListener("touchstart", actualizarActividad, { passive: true });
document.addEventListener("keydown", actualizarActividad, { passive: true });

// Verificación de sesión
setInterval(async () => {
    if (verificandoSesion) return;
    verificandoSesion = true;

    try {
        const ahora = Date.now();
        if (ahora - lastActivity > TIEMPO_MAX) {
            console.log("⏳ Sesión expirada por inactividad");
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

// 🚫 Bloqueos de seguridad
document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I") || (e.ctrlKey && e.key === "u")) {
        e.preventDefault();
    }
});

// Prevenir zoom con gestos en iOS
if ("ongesturestart" in window) {
    document.addEventListener("gesturestart", (e) => {
        e.preventDefault();
    }, { passive: false });
}

// ===============================
// 🔍 ZOOM PDF (VERSIÓN ÚNICA)
// ===============================
let initialDistance = null;
let zoomTimeout = null;

function initPDFZoom() {
    const pdfContainer = document.getElementById("pdfContainer");
    if (!pdfContainer) return;

    pdfContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
    pdfContainer.addEventListener("touchmove", handlePinchZoom, { passive: false });
}

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
            showAlert("⏳ Sesión expirada", "error");
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

        // Escuchar cambios de tamaño de ventana
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                if (pdfDocument && !cargandoPDF) {
                    console.log("🔄 Re-renderizando por cambio de tamaño");
                    loadPDF();
                }
            }, 300);
        });

    } catch (err) {
        console.error("❌ Error init:", err);
        showAlert("❌ Error iniciando visor", "error");
    }
});