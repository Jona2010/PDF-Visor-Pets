// ===============================
// 🔍 DIAGNÓSTICO RÁPIDO DE NAVEGADOR
// ===============================
async function diagnosticarNavegador() {
    console.log("%c=== DIAGNÓSTICO DE NAVEGADOR ===", "color: blue; font-size: 16px; font-weight: bold");
    console.log("📱 Navegador:", navigator.userAgent);
    console.log("🕒 Fecha/Hora:", new Date().toLocaleString());
    
    // Detectar navegador específico
    const ua = navigator.userAgent;
    const isChrome = ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("Brave");
    const isEdge = ua.includes("Edg");
    const isBrave = navigator.brave?.isBrave ? await navigator.brave.isBrave() : false;
    const isFirefox = ua.includes("Firefox");
    const isSafari = ua.includes("Safari") && !ua.includes("Chrome");
    
    console.log("🔍 Navegador detectado:", 
        isBrave ? "Brave" : 
        isEdge ? "Edge" : 
        isChrome ? "Chrome" : 
        isFirefox ? "Firefox" : 
        isSafari ? "Safari" : 
        "Desconocido"
    );
    
    // Verificar PDF.js
    console.log("📚 PDF.js disponible:", typeof pdfjsLib !== 'undefined');
    if (typeof pdfjsLib !== 'undefined') {
        console.log("⚙️ Worker configurado:", pdfjsLib.GlobalWorkerOptions?.workerSrc || "No configurado");
        console.log("📦 Versión PDF.js:", pdfjsLib.version || "Desconocida");
    }
    
    // Verificar Supabase
    console.log("🗄️ Supabase cliente disponible:", !!supabaseClient);
    
    // Probar fetch a Supabase
    try {
        console.log("🔄 Probando conexión a Supabase...");
        const test = await fetch("https://xnkpjgrxgwkfhgrrzwhu.supabase.co", {
            method: 'HEAD',
            mode: 'cors'
        });
        console.log("✅ Supabase accesible - Status:", test.status);
    } catch(e) {
        console.log("❌ Supabase bloqueado:", e.message);
        console.log("   Posible causa: CORS, bloqueador de rastreadores o VPN");
    }
    
    // Probar CDN de PDF.js
    try {
        console.log("🔄 Probando CDN de PDF.js...");
        const cdnTest = await fetch("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js", {
            method: 'HEAD'
        });
        console.log("✅ CDN accesible - Status:", cdnTest.status);
    } catch(e) {
        console.log("❌ CDN bloqueado:", e.message);
        console.log("   Solución: Usar worker local o CDN alternativo");
    }
    
    // Verificar almacenamiento local
    try {
        localStorage.setItem("test", "test");
        localStorage.removeItem("test");
        console.log("💾 LocalStorage: Disponible");
    } catch(e) {
        console.log("❌ LocalStorage: Bloqueado -", e.message);
    }
    
    // Verificar WebGL/Canvas
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        console.log("🎨 WebGL:", gl ? "Disponible" : "No disponible (puede afectar renderizado)");
    } catch(e) {
        console.log("❌ WebGL: Error -", e.message);
    }
    
    // Memoria del navegador (si está disponible)
    if (performance.memory) {
        console.log("💾 Memoria JS:", Math.round(performance.memory.jsHeapSizeLimit / 1048576), "MB límite");
        console.log("   Uso actual:", Math.round(performance.memory.usedJSHeapSize / 1048576), "MB");
    } else {
        console.log("💾 API de memoria no disponible en este navegador");
    }
    
    console.log("%c=== FIN DIAGNÓSTICO ===", "color: blue; font-size: 16px; font-weight: bold");
    
    // Mostrar alerta visual si es Brave
    if (isBrave) {
        showAlert(
            "⚠️ Brave detectado: Para ver PDFs correctamente, desactive 'Shields' (escudo) para este sitio",
            "warning"
        );
    }
    
    // Mostrar advertencia si es Chrome con memoria limitada
    if (isChrome && performance.memory && performance.memory.jsHeapSizeLimit < 500 * 1048576) {
        showAlert(
            "⚠️ Chrome con memoria limitada: Algunas páginas pueden no cargarse correctamente",
            "warning"
        );
    }
    
    return {
        isChrome,
        isEdge,
        isBrave,
        isFirefox,
        isSafari,
        pdfjsAvailable: typeof pdfjsLib !== 'undefined',
        supabaseAvailable: !!supabaseClient
    };
}

// ===============================
// 🔐 CONFIGURACIÓN SUPABASE (UNA SOLA VEZ)
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

let config = null;

let pdfScale = 1;

// 🔒 EVITAR MÚLTIPLES CARGAS PDF
// 🚀 CONTROL RENDER PDF
let renderToken = 0;

let currentLoadingTask = null;

let pdfDocument = null; // ✅ AGREGAR ESTA LÍNEA
let cargandoPDF = false; // ✅ AGREGAR ESTA LÍNEA

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

// 📥 CARGAR PDF (FIX TOTAL - 52 PÁGINAS)
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
        container.innerHTML = ""; // ✅ LIMPIA DOM COMPLETO
        loader.style.display = "flex";

        // 🔐 SUPABASE URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 3600); // 🔄 1 HORA

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

        // 🔥 CONFIGURACIÓN CRÍTICA PDFs GRANDES
        currentLoadingTask = pdfjsLib.getDocument({
            url: data.signedUrl,
            verbosity: 0,              // ✅ SILENCIO
            disableAutoFetch: true,    // ✅ MANUAL
            rangeChunkSize: 1048576,   // ✅ 1MB
            maxImageSize: 4096,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/', // ✅ CDN
            cMapPacked: true
        });

        const pdf = await currentLoadingTask.promise;

        pdfDocument = pdf; // ✅ GUARDAR REFERENCIA
        console.log(`✅ PDF: ${pdf.numPages} páginas`); // ✅ DEBUG

        // 🚫 TOKEN VÁLIDO
        if (token !== renderToken) {
            pdf.destroy(); // ✅ SIEMPRE DESTROY
            return;
        }

        const totalPages = pdf.numPages;
        console.log(`📄 Renderizando ${totalPages} páginas...`);

        const modoMovil = esMovil();
        const renderedPages = []; // ✅ TRACK PÁGINAS

        // 🔥 BATCH RENDERIZADO (5 PÁGINAS POR VEZ)
        for (let batchStart = 1; batchStart <= totalPages; batchStart += 5) {
            if (token !== renderToken) {
                break;
            }

            const batchEnd = Math.min(batchStart + 4, totalPages);
            const batchPromises = [];

            // 🚀 PROCESAR BATCH
            for (let i = batchStart; i <= batchEnd; i++) {
                batchPromises.push(
                    renderSinglePage(pdf, i, container, modoMovil, token)
                );
            }

            // ⏳ ESPERAR BATCH
            await Promise.all(batchPromises);
            
            // 🧹 LIMPIA MEMORIA CADA 5 PÁGINAS
            if (batchStart % 15 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
                console.log(`✅ Batch ${batchStart}/${totalPages} completado`);
            }
        }

        // 🧹 DESTROY DEFINITIVO
        if (pdfDocument) {
            pdfDocument.destroy();
            pdfDocument = null;
        }
        currentLoadingTask = null;

        // ✅ DESTROY PDF - CRÍTICO
        pdf.destroy();
        currentLoadingTask = null;

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

// 🎯 FUNCIÓN RENDER PÁGINA INDIVIDUAL (OPTIMIZADA)
async function renderSinglePage(pdf, pageNum, container, modoMovil, token) {
    if (token !== renderToken) return null;

    try {
        const page = await pdf.getPage(pageNum);
        
        // 📏 CÁLCULO ESCALA OPTIMIZADO
        const containerWidth = container.clientWidth;
        const baseViewport = page.getViewport({ scale: 1 });
        
        let scale = modoMovil 
            ? ((window.innerWidth - 20) / baseViewport.width) * pdfScale
            : (containerWidth * 0.95 / baseViewport.width) * pdfScale;

        const devicePixelRatio = modoMovil ? (window.devicePixelRatio || 2) : 1.5;
        let finalScale = Math.min(scale * devicePixelRatio, 2.5); // ✅ LÍMITE

        const viewport = page.getViewport({ scale: finalScale });
        
        // 🖼️ CANVAS OPTIMIZADO
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d"); // ✅ SIN ALPHA POR DEFAULT
        
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
        
        // 🧹 LIMPIA PÁGINA INMEDIATO
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

let verificandoSesion = false;

setInterval(async () => {

    // 🚫 EVITAR MÚLTIPLES CHECKS
    if(verificandoSesion){
        return;
    }

    verificandoSesion = true;

    try{

        const ahora = Date.now();

        // ⏳ EXPIRADA
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

            // 🚨 REGISTRAR
            await registrarSesionExpirada(
                user
            );

            // 🔓 LOGOUT
            await supabaseClient
                .auth
                .signOut();

            // 🔔 ALERTA
            showAlert(
                "⏳ Sesión expirada por inactividad",
                "error"
            );

            // 🚀 REDIRECT ÚNICO
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
            
            // 🔍 EJECUTAR DIAGNÓSTICO AL INICIO
            const diagnostico = await diagnosticarNavegador();
            console.log("📊 Resultado diagnóstico:", diagnostico);

            // 🔐 DEVICE
            const device_id =
                localStorage.getItem(
                    "device_id"
                );

            // 🔑 SESSION
            const {
                data:{ session }
            } = await supabaseClient
                .auth
                .getSession();

            // 🚫 SIN SESIÓN
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

            // ⏳ EXPIRADA
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

            // ⚠️ DEVICE
            if(!device_id){

                console.warn(
                    "⚠️ device_id no encontrado"
                );
            }

            // 🚀 LOAD CONFIG
            await loadConfig();

            // 🚀 INIT PDF EVENTS
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
async function handleWheelZoom(e){

    // 🚫 SOLO CTRL + WHEEL
    if(!e.ctrlKey){
        return;
    }

    e.preventDefault();

    // 🚫 EVITAR SPAM
    if(zoomTimeout){
        return;
    }

    // 🔍 ZOOM
    if(e.deltaY < 0){

        pdfScale += 0.1;

    }else{

        pdfScale -= 0.1;
    }

    // 🔒 LIMITES
    pdfScale =
        Math.min(
            Math.max(0.6, pdfScale),
            3
        );

    // 🚀 THROTTLE
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

    // 🚀 INIT
    if(!initialDistance){

        initialDistance = distance;

        return;
    }

    const diff =
        distance - initialDistance;

    // 🚫 FILTRAR MICRO MOVIMIENTOS
    if(Math.abs(diff) < 8){
        return;
    }

    // 🔍 ZOOM
    pdfScale += diff * 0.0008;

    // 🔒 LIMITES
    pdfScale =
        Math.min(
            Math.max(0.6, pdfScale),
            3
        );

    initialDistance = distance;

    // 🚫 EVITAR SPAM
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