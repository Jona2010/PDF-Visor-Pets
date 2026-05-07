// ===============================
// 🔐 CONFIGURACIÓN SUPABASE (UNA SOLA VEZ)
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

let config = null;
let pdfScale = 1;
let resizeTimeout = null; // 🔥 ESTA LÍNEA FALTABA
let lastScale = window.visualViewport ? window.visualViewport.scale : 1;

// ===============================
// 🔐 VALIDAR SESIÓN GOOGLE
// ===============================
(async ()=>{

    const { data:{ session } } =
        await supabaseClient.auth.getSession();

    if(!session){

        window.location.href = "index.html";
        return;
    }

    const email = session.user.email || "";

    // 🔥 SOLO CORREOS CORPORATIVOS
    if(!email.endsWith("@intelliall.com")){

        await supabaseClient.auth.signOut();

        alert(
            "Solo se permiten correos corporativos"
        );

        window.location.href = "index.html";
        return;
    }

})();

async function loadConfig() {
    const res = await fetch("config.json");
    config = await res.json();

    //console.log("CONFIG CARGADA:", config);

    loadPDFList();
}

// 📄 CARGAR LISTA
function loadPDFList() {

    const petSelect = document.getElementById("petSelect");

    petSelect.innerHTML = "";

    config.pets.forEach((pet, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = pet.nombre;
        petSelect.appendChild(option);
    });

    petSelect.selectedIndex = 0;

    petSelect.addEventListener("change", updateAreas);

    updateAreas();
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

// 🔄 ACTUALIZAR ÁREAS
function updateAreas() {

    const petSelect = document.getElementById("petSelect");
    const areaSelect = document.getElementById("areaSelect");

    const petIndex = petSelect.value;

    if (!config.pets[petIndex]) return;

    areaSelect.innerHTML = "";

    const areas = config.pets[petIndex].archivos;

    Object.keys(areas).forEach(area => {
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        areaSelect.appendChild(option);
    });

    areaSelect.selectedIndex = 0;

    areaSelect.onchange = loadPDF;

    loadPDF();
}

function esMovil(){
    return window.innerWidth <= 768;
}

async function registrarSesionExpirada(user){

    try {

        // 🔔 ALERTA
        await supabaseClient.from("alerts").insert({
            user_id: user?.id || null,
            email: user?.email || "Desconocido",
            message: `⏳ Sesión expirada: ${user?.email || ""}`,
            nivel: "warning",
            visto: false,
            created_at: new Date().toISOString()
        });

        // 📊 LOG
        await supabaseClient.from("logs").insert({
            user_email: user?.email || "Desconocido",
            pet: "SESSION",
            area: "Sesión expirada"
        });

    } catch (err) {
        console.error("Error registrando sesión expirada:", err);
    }
}

// 🔒 BLOQUE GLOBAL (agregar arriba del archivo)
let cargandoPDF = false;


// 📥 CARGAR PDF (FIX TOTAL)
async function loadPDF() {

    // 🚫 EVITAR LOOP INFINITO
    if (cargandoPDF) {
        //console.log("⛔ Ya está cargando → evitar loop");
        return;
    }

    cargandoPDF = true;

    try {

        const container = document.getElementById("pdfContainer");
        const loader = document.getElementById("loader");

        const petIndex = document.getElementById("petSelect").value;
        const area = document.getElementById("areaSelect").value;

        // 🔒 VALIDACIONES
        if (!config.pets[petIndex]) {

            cargandoPDF = false;
            return;
        }

        if (!config.pets[petIndex].archivos[area]) {

            cargandoPDF = false;
            return;
        }

        const fileName = config.pets[petIndex].archivos[area];

        // 🔥 UI
        container.classList.remove("loaded");
        container.replaceChildren();
        loader.style.display = "flex";

        // 🔐 SUPABASE URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 60);

        if (error) {

            alert("Error cargando PDF");

            loader.style.display = "none";

            cargandoPDF = false;

            return;
        }

        const url = data.signedUrl;

        // 📄 PDF
        const loadingTask = pdfjsLib.getDocument({

            url: url,

            disableAutoFetch: true,

            disableStream: false,

            rangeChunkSize: 65536
        });

        const pdf = await loadingTask.promise;

        let row;
        const modoMovil = esMovil();

        for (let i = 1; i <= pdf.numPages; i++) {

            if (modoMovil || (i - 1) % 2 === 0) {

                row = document.createElement("div");

                row.style.display = "flex";
                row.style.justifyContent = "center";
                row.style.gap = "20px";
                row.style.width = "100%";

                container.appendChild(row);
            }

            const page = await pdf.getPage(i);

            const containerWidth =
                container.clientWidth;

            const baseViewport =
                page.getViewport({ scale: 1 });

            let scale;

            if (modoMovil) {

                scale =
                    ((window.innerWidth - 20) /
                    baseViewport.width) * pdfScale;

            } else {

                scale =
                    ((containerWidth / 2 - 40) /
                    baseViewport.width) * pdfScale;
            }

            // ✅ CALIDAD OPTIMIZADA
            const devicePixelRatio =
                esMovil()
                ? 1.7
                : 1.5;

            const viewport = page.getViewport({
                scale: scale * devicePixelRatio
            });

            const canvas =
                document.createElement("canvas");

            const ctx =
                canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            canvas.style.width =
                (viewport.width / devicePixelRatio)
                + "px";

            canvas.style.height =
                (viewport.height / devicePixelRatio)
                + "px";

            const pageWrapper =
                document.createElement("div");

            pageWrapper.className =
                "page-wrapper";

            pageWrapper.appendChild(canvas);

            row.appendChild(pageWrapper);

            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            renderQueue.push(renderTask);

            canvas.style.opacity = "1";
            canvas.style.transition = "opacity .2s ease";
        }

        // 👤 LOG
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            await supabaseClient.from("logs").insert({
                user_email: user.email,
                pet: config.pets[petIndex].nombre,
                area: area + " | VISUALIZACIÓN PDF"
            });
        }

        // 🔥 UI FINAL
        container.classList.add("loaded");

        // ✅ TERMINÓ TODO EL PDF
        loader.style.display = "none";

        cargandoPDF = false;

    } catch (err) {

        console.error("❌ Error en loadPDF:", err);

        loader.style.display = "none";

        cargandoPDF = false;
    }
}

function showAlert(message, type = "error") {

    const alert = document.createElement("div");

    alert.className = `custom-alert ${type}`;
    alert.innerText = message;

    document.body.appendChild(alert);

    // animación entrada
    setTimeout(() => {
        alert.classList.add("show");
    }, 10);

    // auto eliminar
    setTimeout(() => {
        alert.classList.remove("show");

        setTimeout(() => {
            alert.remove();
        }, 300);

    }, 3000);
}

// ===============================
// 🔐 CONTROL DE SESIÓN (FIX)
// ===============================

// ⏱️ Inicializar correctamente
let lastActivity = Date.now();

// ⏳ 10 minutos
const TIEMPO_MAX = 10 * 60 * 1000;


// ===============================
// 🎯 DETECTAR ACTIVIDAD USUARIO
// ===============================
function actualizarActividad(){
    lastActivity = Date.now();
}

// Eventos
document.addEventListener("click", actualizarActividad);
document.addEventListener("touchstart", actualizarActividad);
document.addEventListener("keydown", actualizarActividad);
document.addEventListener("scroll", actualizarActividad);


// ===============================
// 🚨 REGISTRAR ALERTA SESIÓN EXPIRADA
// ===============================
async function registrarSesionExpirada(user){

    if(!user) return;

    try{
        await supabaseClient.from("alerts").insert({
            user_id: user.id,
            email: user.email,
            message: `⏳ Sesión expirada: ${user.email}`,
            nivel: "warning",
            visto: false
        });

        console.log("🚨 Alerta de sesión expirada registrada");
    }catch(err){
        console.error("Error registrando alerta:", err);
    }
}


// ===============================
// 📱 FIX MÓVIL (ANTI PINCH BREAK)
// ===============================
document.addEventListener("gesturestart", function (e) {
    e.preventDefault();
});


// ===============================
// 🔥 VERIFICACIÓN AUTOMÁTICA
// ===============================
setInterval(async () => {

    const ahora = Date.now();

    if (ahora - lastActivity > TIEMPO_MAX) {

        console.log("⏳ Sesión expirada por inactividad");

        const { data: { user } } = await supabaseClient.auth.getUser();

        await registrarSesionExpirada(user);

        await supabaseClient.auth.signOut();

        showAlert("⏳ Sesión expirada por inactividad", "error");

        setTimeout(() => {
            window.location.href = "index.html";
        }, 2000);

        window.location.href = "index.html";
    }

}, 30000);

// 🚫 BLOQUEOS
document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
    if (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.key === "I")) {
        e.preventDefault();
    }
});

document.addEventListener("DOMContentLoaded", async () => {

    //console.log("VISOR INICIADO");

    // 🔐 DEVICE ID
    let device_id = localStorage.getItem("device_id");
    //console.log("DEVICE ID EN VISOR:", device_id);

    // 👤 USUARIO
    const { data: { user } } = await supabaseClient.auth.getUser();
    //console.log("USER EN VISOR:", user);

    // 🔑 SESIÓN
    const { data: { session } } = await supabaseClient.auth.getSession();
   // console.log("SESSION EN VISOR:", session);

    // ===============================
    // 🔥 VALIDACIÓN DE SESIÓN
    // ===============================
    if (!session) {
        alert("Sesión expirada");
        window.location.href = "index.html";
        return;
    }

    // 🔥 PASO 2 — CONTROL REAL DE EXPIRACIÓN
    const expiresAt = session.expires_at * 1000;
    const now = Date.now();

    if (now > expiresAt) {

        await registrarSesionExpirada(user);

        await supabaseClient.auth.signOut();
        alert("Sesión expirada");
        window.location.href = "visor.html";
        return;
    }

    // ⚠️ VALIDAR DEVICE ID
    if (!device_id) {
        console.warn("⚠️ No hay device_id en este navegador");
    }

    await loadConfig();

    // ===============================
    // 🔥 PASO 3 — AUTO EXPIRACIÓN
    // ===============================
    setInterval(async () => {

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            window.location.href = "index.html";
            return;
        }

        const expiresAt = session.expires_at * 1000;

        if (Date.now() > expiresAt) {

            const { data: { user } } = await supabaseClient.auth.getUser();

            await registrarSesionExpirada(user);

            await supabaseClient.auth.signOut();
            alert("Sesión expirada");
            window.location.href = "index.html";
        }

    }, 60000); // cada 1 minuto

});

let initialDistance = null;

// 👇 ZOOM RUEDA (DESKTOP)
document.addEventListener("wheel", (e) => {

    if (!e.ctrlKey) return;

    e.preventDefault();

    if (e.deltaY < 0) pdfScale += 0.1;
    else pdfScale -= 0.1;

    pdfScale = Math.min(Math.max(0.5, pdfScale), 3);

    loadPDF();

}, { passive: false });

// 👇 ZOOM PINCH (MÓVIL)
document.addEventListener("touchmove", (e) => {

    if (e.touches.length === 2) {

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;

        const distance = Math.sqrt(dx * dx + dy * dy);

        if (!initialDistance) {
            initialDistance = distance;
        } else {

            const diff = distance - initialDistance;

            pdfScale += diff * 0.001;

            pdfScale = Math.min(Math.max(0.5, pdfScale), 3);

            loadPDF();

            initialDistance = distance;
        }
    }

}, { passive: false });

document.addEventListener("touchend", () => {
    initialDistance = null;
});