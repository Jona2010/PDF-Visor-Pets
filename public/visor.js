// ===============================
// 🔐 CONFIGURACIÓN SUPABASE (UNA SOLA VEZ)
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

let config = null;

let pdfScale = 1;

// 🔒 EVITAR MÚLTIPLES CARGAS PDF
let renderToken = 0;
let currentLoadingTask = null;
let pdfDocument = null;
let cargandoPDF = false;

// ===============================
// 🔐 VALIDAR SESIÓN GOOGLE
// ===============================

(async () => {

    try{

        const {
            data:{ session }
        } = await supabaseClient
            .auth
            .getSession();

        // 🚫 SIN SESIÓN
        if(!session){

            window.location.href =
                "index.html";

            return;
        }

        const email =
            session.user.email || "";

        // 🔒 SOLO CORPORATIVOS
        if(
            !email.endsWith(
                "@intelliall.com"
            )
        ){

            await supabaseClient
                .auth
                .signOut();

            showAlert(
                "⛔ Solo se permiten correos corporativos",
                "warning"
            );

            window.location.href =
                "index.html";

            return;
        }

    }catch(err){

        console.error(
            "❌ Error validando sesión:",
            err
        );

        window.location.href =
            "index.html";
    }

})();

// ===============================
// 📄 CARGAR CONFIG
// ===============================

async function loadConfig(){

    try{

        const res =
            await fetch("config.json");

        if(!res.ok){

            throw new Error(
                "No se pudo cargar config.json"
            );
        }

        config = await res.json();

        loadPDFList();

    }catch(err){

        console.error(
            "❌ Error cargando config:",
            err
        );

        showAlert(
            "❌ Error cargando configuración",
            "error"
        );
    }
}

// 📄 CARGAR LISTA PDF
function loadPDFList(){

    try{

        const petSelect =
            document.getElementById(
                "petSelect"
            );

        if(
            !config ||
            !config.pets ||
            !Array.isArray(config.pets)
        ){

            console.error(
                "❌ Config inválida"
            );

            return;
        }

        // 🔥 LIMPIAR
        petSelect.innerHTML = "";

        // 🔥 OPTIONS
        config.pets.forEach((pet, index) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = index;

            option.textContent =
                pet.nombre;

            petSelect.appendChild(option);
        });

        // 🔥 DEFAULT
        petSelect.selectedIndex = 0;

        // 🚫 EVITAR LISTENERS DUPLICADOS
        petSelect.onchange =
            updateAreas;

        // 🔥 INICIAL
        updateAreas();

    }catch(err){

        console.error(
            "❌ Error loadPDFList:",
            err
        );
    }
}

// 🚪 LOGOUT
async function logout(){

    try{

        await supabaseClient
            .auth
            .signOut();

    }catch(err){

        console.error(
            "❌ Error logout:",
            err
        );
    }

    window.location.href =
        "index.html";
}

// 🔄 ACTUALIZAR ÁREAS
function updateAreas(){

    try{

        const petSelect =
            document.getElementById(
                "petSelect"
            );

        const areaSelect =
            document.getElementById(
                "areaSelect"
            );

        const petIndex =
            petSelect.value;

        // 🚫 VALIDAR
        if(
            !config ||
            !config.pets ||
            !config.pets[petIndex]
        ){
            return;
        }

        // 🔥 LIMPIAR
        areaSelect.innerHTML = "";

        const areas =
            config.pets[petIndex]
            .archivos;

        // 🚫 VALIDAR
        if(!areas){
            return;
        }

        // 🔥 OPTIONS
        Object.keys(areas)
        .forEach(area => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = area;

            option.textContent =
                area;

            areaSelect.appendChild(
                option
            );
        });

        // 🔥 DEFAULT
        areaSelect.selectedIndex = 0;

        // 🚫 EVITAR DUPLICADOS
        areaSelect.onchange = () => {

            if(!cargandoPDF){

                loadPDF();
            }
        };

        // 🔥 SOLO UNA CARGA
        if(!cargandoPDF){

            requestAnimationFrame(() => {

                loadPDF();
            });
        }

    }catch(err){

        console.error(
            "❌ Error updateAreas:",
            err
        );
    }
}

// 📱 DETECTAR MÓVIL
function esMovil(){

    return window.innerWidth <= 768;
}

// ⏳ REGISTRAR SESIÓN EXPIRADA
async function registrarSesionExpirada(user){

    try{

        // 🔔 ALERTA
        await supabaseClient
            .from("alerts")
            .insert({

                user_id:
                    user?.id || null,

                email:
                    user?.email ||
                    "Desconocido",

                message:
                    `⏳ Sesión expirada: ${
                        user?.email || ""
                    }`,

                nivel:"warning",

                visto:false,

                created_at:
                    new Date()
                    .toISOString()
            });

        // 📊 LOG
        await supabaseClient
            .from("logs")
            .insert({

                user_email:
                    user?.email ||
                    "Desconocido",

                pet:"SESSION",

                area:"Sesión expirada"
            });

    }catch(err){

        console.error(
            "❌ Error sesión expirada:",
            err
        );
    }
}

// 📥 CARGAR PDF COMPLETO (TODAS LAS PÁGINAS)
async function loadPDF() {
    try {
        const container = document.getElementById("pdfContainer");
        const loader = document.getElementById("loader");

        const petIndex = document.getElementById("petSelect").value;
        const area = document.getElementById("areaSelect").value;

        // 🔒 VALIDACIONES
        if (!config.pets[petIndex] || !config.pets[petIndex].archivos[area]) {
            return;
        }

        const fileName = config.pets[petIndex].archivos[area];

        // 🔥 UI LIMPIA
        container.classList.remove("loaded");
        container.innerHTML = "";
        loader.style.display = "flex";

        // 🔐 SUPABASE URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 3600);

        if (error) {
            showAlert("❌ Error cargando PDF", "error");
            loader.style.display = "none";
            return;
        }

        // 🚀 CANCELAR ANTERIOR
        if (currentLoadingTask) {
            try {
                currentLoadingTask.destroy();
            } catch (err) {
                console.warn("⚠️ Task anterior destruida");
            }
        }

        const token = ++renderToken;
        currentLoadingTask = null;

        // 🔥 CONFIGURACIÓN PARA CARGAR TODAS LAS PÁGINAS
        currentLoadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            verbosity: 0,
            disableAutoFetch: false,     // ✅ CAMBIADO: CARGAR TODAS LAS PÁGINAS
            rangeChunkSize: 65536,       // ✅ TAMAÑO ÓPTIMO
            maxImageSize: -1,            // ✅ SIN LÍMITE
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });

        const pdf = await currentLoadingTask.promise;
        pdfDocument = pdf;
        
        console.log(`✅ PDF CARGADO: ${pdf.numPages} páginas`);

        // 🚫 TOKEN VÁLIDO
        if (token !== renderToken) {
            pdf.destroy();
            return;
        }

        const totalPages = pdf.numPages;
        console.log(`📄 Renderizando TODAS LAS ${totalPages} páginas...`);

        const modoMovil = esMovil();
        
        // 🔥 RENDERIZAR TODAS LAS PÁGINAS (SIN LOTES)
        for (let i = 1; i <= totalPages; i++) {
            if (token !== renderToken) {
                break;
            }
            
            await renderSinglePage(pdf, i, container, modoMovil, token);
            
            // 💡 PEQUEÑA PAUSA PARA NO BLOQUEAR EL UI
            if (i % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
                console.log(`📄 Progreso: ${i}/${totalPages} páginas renderizadas`);
            }
        }

        // 🧹 LIMPIEZA
        if (pdfDocument) {
            pdfDocument.destroy();
            pdfDocument = null;
        }
        
        if (currentLoadingTask) {
            currentLoadingTask.destroy();
            currentLoadingTask = null;
        }

        // 👤 LOG
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            await supabaseClient.from("logs").insert({
                user_email: user.email,
                pet: config.pets[petIndex].nombre,
                area: `${area} | ${totalPages} PÁGINAS`
            });
        }

        // 🔥 UI FINAL
        container.classList.add("loaded");
        loader.style.display = "none";
        
        console.log(`✅ RENDER COMPLETO: ${totalPages} páginas mostradas`);

    } catch (err) {
        console.error("❌ Error loadPDF:", err);
        if (currentLoadingTask) {
            try {
                currentLoadingTask.destroy();
            } catch (e) {}
        }
        document.getElementById("loader").style.display = "none";
        currentLoadingTask = null;
        showAlert(`❌ Error PDF: ${err.message}`, "error");
    }
}

// 🎯 FUNCIÓN RENDER PÁGINA INDIVIDUAL
async function renderSinglePage(pdf, pageNum, container, modoMovil, token) {
    if (token !== renderToken) return null;

    try {
        const page = await pdf.getPage(pageNum);
        
        // 📏 CÁLCULO ESCALA
        const containerWidth = container.clientWidth;
        const baseViewport = page.getViewport({ scale: 1 });
        
        let scale = modoMovil 
            ? ((window.innerWidth - 20) / baseViewport.width) * pdfScale
            : (containerWidth * 0.95 / baseViewport.width) * pdfScale;

        const devicePixelRatio = modoMovil ? (window.devicePixelRatio || 2) : 1.5;
        let finalScale = Math.min(scale * devicePixelRatio, 2.5);

        const viewport = page.getViewport({ scale: finalScale });
        
        // 🖼️ CANVAS
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        
        canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;
        canvas.style.opacity = "0";
        canvas.style.transition = "opacity 0.3s ease";

        // 📦 WRAPPER
        const pageWrapper = document.createElement("div");
        pageWrapper.className = "page-wrapper";
        pageWrapper.appendChild(canvas);
        container.appendChild(pageWrapper);

        // 🎨 RENDER
        const renderTask = page.render({
            canvasContext: ctx,
            viewport: viewport
        });

        await renderTask.promise;
        
        // 🧹 LIMPIA PÁGINA
        page.cleanup();
        
        // ✨ ANIMACIÓN
        requestAnimationFrame(() => {
            canvas.style.opacity = "1";
        });

        return pageNum;
        
    } catch (err) {
        console.warn(`⚠️ Error página ${pageNum}:`, err);
        return null;
    }
}

function showAlert(
    message,
    type = "error"
){

    // 🚫 ELIMINAR ALERTAS ANTERIORES
    document
        .querySelectorAll(".custom-alert")
        .forEach(el => el.remove());

    // 🔥 CREAR
    const alert =
        document.createElement("div");

    alert.className =
        `custom-alert ${type}`;

    alert.textContent = message;

    document.body.appendChild(alert);

    // 🚀 ANIMACIÓN SUAVE
    requestAnimationFrame(() => {

        alert.classList.add("show");
    });

    // ⏳ AUTO REMOVE
    const removeTimer =
        setTimeout(() => {

            alert.classList.remove("show");

            // 🔥 ESPERAR TRANSICIÓN
            setTimeout(() => {

                if(alert.parentNode){

                    alert.remove();
                }

                clearTimeout(removeTimer);

            }, 250);

        }, 3000);
}

// ===============================
// 🔐 CONTROL SESIÓN
// ===============================

// ⏱️ ÚLTIMA ACTIVIDAD
let lastActivity = Date.now();

// ⏳ 10 MINUTOS
const TIEMPO_MAX =
    10 * 60 * 1000;

// 🚫 THROTTLE
let activityTimeout = null;

// ===============================
// 🎯 ACTUALIZAR ACTIVIDAD
// ===============================
function actualizarActividad(){

    // 🚫 EVITAR SPAM
    if(activityTimeout){
        return;
    }

    activityTimeout =
        setTimeout(() => {

            lastActivity = Date.now();

            activityTimeout = null;

        }, 300);
}

// ===============================
// 🎧 EVENTOS
// ===============================

document.addEventListener(
    "click",
    actualizarActividad,
    { passive:true }
);

document.addEventListener(
    "touchstart",
    actualizarActividad,
    { passive:true }
);

document.addEventListener(
    "keydown",
    actualizarActividad,
    { passive:true }
);

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

let verificandoSesion = false;

setInterval(async () => {

    if(verificandoSesion){
        return;
    }

    verificandoSesion = true;

    try{

        const ahora = Date.now();

        if(
            ahora - lastActivity >
            TIEMPO_MAX
        ){

            console.log(
                "⏳ Sesión expirada"
            );

            const {
                data:{ user }
            } = await supabaseClient
                .auth
                .getUser();

            await registrarSesionExpirada(
                user
            );

            await supabaseClient
                .auth
                .signOut();

            showAlert(
                "⏳ Sesión expirada por inactividad",
                "error"
            );

            setTimeout(() => {

                window.location.href =
                    "index.html";

            }, 1800);
        }

    }catch(err){

        console.error(
            "❌ Error verificando sesión:",
            err
        );

    }finally{

        verificandoSesion = false;
    }

}, 30000);

// 🚫 BLOQUEOS
document.addEventListener(
    "contextmenu",
    e => e.preventDefault()
);

// 🚫 F12
document.addEventListener(
    "keydown",
    e => {

        if(
            e.key === "F12" ||

            (
                e.ctrlKey &&
                e.shiftKey &&
                e.key === "I"
            )
        ){
            e.preventDefault();
        }
    }
);

// ===============================
// 🚀 INIT
// ===============================
document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try{

            const device_id =
                localStorage.getItem(
                    "device_id"
                );

            const {
                data:{ session }
            } = await supabaseClient
                .auth
                .getSession();

            if(!session){

                showAlert(
                    "⏳ Sesión expirada",
                    "error"
                );

                setTimeout(() => {

                    window.location.href =
                        "index.html";

                }, 1500);

                return;
            }

            const user =
                session.user;

            const expiresAt =
                session.expires_at * 1000;

            if(Date.now() > expiresAt){

                await registrarSesionExpirada(
                    user
                );

                await supabaseClient
                    .auth
                    .signOut();

                showAlert(
                    "⏳ Sesión expirada por inactividad",
                    "error"
                );

                setTimeout(() => {

                    window.location.href =
                        "index.html";

                }, 1500);

                return;
            }

            if(!device_id){

                console.warn(
                    "⚠️ device_id no encontrado"
                );
            }

            await loadConfig();
            initPDFZoom();

        }catch(err){

            console.error(
                "❌ Error init:",
                err
            );

            showAlert(
                "❌ Error iniciando visor",
                "error"
            );
        }
    }
);

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

    pdfContainer.addEventListener(
        "wheel",
        handleWheelZoom,
        { passive:false }
    );

    pdfContainer.addEventListener(
        "touchmove",
        handlePinchZoom,
        { passive:false }
    );
}

// ===============================
// 🖥️ WHEEL ZOOM
// ===============================
async function handleWheelZoom(e){

    if(!e.ctrlKey){
        return;
    }

    e.preventDefault();

    if(zoomTimeout){
        return;
    }

    if(e.deltaY < 0){

        pdfScale += 0.1;

    }else{

        pdfScale -= 0.1;
    }

    pdfScale =
        Math.min(
            Math.max(0.6, pdfScale),
            3
        );

    zoomTimeout =
        setTimeout(async () => {

            await loadPDF();

            zoomTimeout = null;

        }, 120);
}

// ===============================
// 📱 PINCH ZOOM
// ===============================
async function handlePinchZoom(e){

    if(e.touches.length !== 2){
        return;
    }

    e.preventDefault();

    const dx =
        e.touches[0].clientX -
        e.touches[1].clientX;

    const dy =
        e.touches[0].clientY -
        e.touches[1].clientY;

    const distance =
        Math.sqrt(dx * dx + dy * dy);

    if(!initialDistance){

        initialDistance = distance;

        return;
    }

    const diff =
        distance - initialDistance;

    if(Math.abs(diff) < 8){
        return;
    }

    pdfScale += diff * 0.0008;

    pdfScale =
        Math.min(
            Math.max(0.6, pdfScale),
            3
        );

    initialDistance = distance;

    if(zoomTimeout){
        return;
    }

    zoomTimeout =
        setTimeout(async () => {

            await loadPDF();

            zoomTimeout = null;

        }, 150);
}

// ===============================
// 📱 TOUCH END
// ===============================
document.addEventListener(
    "touchend",
    () => {

        initialDistance = null;
    }
);