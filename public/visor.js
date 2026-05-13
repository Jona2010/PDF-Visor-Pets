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

// 📥 CARGAR PDF (VERSIÓN ESTABLE PRODUCCIÓN)
async function loadPDF(){

    // 🚫 EVITAR CARGAS DUPLICADAS
    if(cargandoPDF){
        return;
    }

    // 🔒 BLOQUEAR
    cargandoPDF = true;

    try{

        const container =
            document.getElementById(
                "pdfContainer"
            );

        const loader =
            document.getElementById(
                "loader"
            );

        const petIndex =
            document.getElementById(
                "petSelect"
            ).value;

        const area =
            document.getElementById(
                "areaSelect"
            ).value;

        // 🔒 VALIDAR CONFIG
        if(
            !config ||
            !config.pets ||
            !config.pets[petIndex]
        ){

            cargandoPDF = false;
            return;
        }

        // 🔒 VALIDAR ARCHIVO
        if(
            !config.pets[petIndex]
            .archivos[area]
        ){

            cargandoPDF = false;
            return;
        }

        const fileName =
            config.pets[petIndex]
            .archivos[area];

        // 🚀 TOKEN NUEVO
        const token = ++renderToken;

        container.style.opacity = "0";

        container.innerHTML = "";

        requestAnimationFrame(() => {

            container.style.opacity = "1";

        });

        container.classList.remove(
            "loaded"
        );

        loader.style.display = "flex";

        currentLoadingTask = null;

        // 🔐 GENERAR URL
        const {
            data,
            error
        } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(
                fileName,
                3600
            );

        // 🚫 ERROR URL
        if(error){

            console.error(error);

            loader.style.display =
                "none";

            cargandoPDF = false;

            showAlert(
                "❌ Error cargando PDF",
                "error"
            );

            return;
        }

        // 🚫 VALIDAR PDF.JS
        if(typeof pdfjsLib === "undefined"){

            loader.style.display =
                "none";

            cargandoPDF = false;

            showAlert(
                "❌ PDF.js no disponible",
                "error"
            );

            return;
        }

        // 🚀 CARGAR PDF
        currentLoadingTask =
            pdfjsLib.getDocument({

                url:data.signedUrl,

                verbosity:0,

                disableAutoFetch:true,

                disableStream:false,

                disableRange:false,

                rangeChunkSize:262144,

                // ✅ CMAPS LOCAL
                cMapUrl:"cmaps/",

                cMapPacked:true,

                // ✅ FUENTES PDF
                standardFontDataUrl:
                    "standard_fonts/"
            });

        // 📄 PDF
        const pdf =
            await currentLoadingTask.promise;

        // 🚫 TOKEN INVÁLIDO
        if(token !== renderToken){

            loader.style.display =
                "none";

            cargandoPDF = false;

            return;
        }

        // 📄 TOTAL
        const totalPages =
            pdf.numPages;

        console.log(
            `📄 PDF cargado: ${totalPages} páginas`
        );

        const modoMovil =
            esMovil();

        // =====================================
        // 🚀 RENDER SECUENCIAL
        // =====================================
        for(
            let i = 1;
            i <= totalPages;
            i++
        ){

            // 🚫 CANCELADO
            if(token !== renderToken){

                loader.style.display =
                    "none";

                cargandoPDF = false;

                return;
            }

            // 🚀 RENDER
            await renderSinglePage(
                pdf,
                i,
                container,
                modoMovil,
                token
            );

            // 🧹 DESCANSO MEMORIA
            if(i % 5 === 0){

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            30
                        )
                );

                console.log(
                    `✅ ${i}/${totalPages}`
                );
            }
        }

        // ✅ UI FINAL
        container.classList.add(
            "loaded"
        );

        loader.style.display =
            "none";

        // 🔓 LIBERAR
        cargandoPDF = false;

        // 👤 LOG
        try{

            const {
                data:{ user }
            } = await supabaseClient
                .auth
                .getUser();

            if(user){

                await supabaseClient
                    .from("logs")
                    .insert({

                        user_email:
                            user.email,

                        pet:
                            config.pets[
                                petIndex
                            ].nombre,

                        area:
                            `${area} | ${totalPages} páginas`
                    });
            }

        }catch(logErr){

            console.warn(
                "⚠️ Error guardando log:",
                logErr
            );
        }

    }catch(err){

        console.error(
            "❌ Error loadPDF:",
            err
        );

        document
            .getElementById(
                "loader"
            )
            .style.display = "none";

        // 🔓 LIBERAR
        cargandoPDF = false;

        currentLoadingTask = null;

        showAlert(
            `❌ ${err.message}`,
            "error"
        );
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
            ? ((window.innerWidth - 20) / baseViewport.width)
            : (containerWidth * 0.95 / baseViewport.width);

        const devicePixelRatio = modoMovil ? (window.devicePixelRatio || 2) : 1.5;
        let finalScale = Math.min(scale * devicePixelRatio, 2.5); // ✅ LÍMITE

        const viewport = page.getViewport({ scale: finalScale });
        
        // 🖼️ CANVAS OPTIMIZADO
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext(
            "2d",
            {
                alpha:false,
                desynchronized:true
            }
        );
        
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        
        canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;
        canvas.style.opacity = "0";
        canvas.style.transition = "opacity 0.3s ease";
        canvas.style.willChange = "opacity";

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
        renderTask.cancel = null;
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

function applyZoom(){

    const container =
        document.getElementById(
            "pdfContainer"
        );

    if(!container){
        return;
    }

    container.style.transform =
        `scale(${pdfScale})`;

    container.style.transformOrigin =
        "top center";
}

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
function handleWheelZoom(e){

    if(!e.ctrlKey){
        return;
    }

    e.preventDefault();

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

    // 🚀 ZOOM CSS
    zoomTimeout =
        setTimeout(() => {

            applyZoom();

            zoomTimeout = null;

        }, 16);
}

// ===============================
// 📱 PINCH ZOOM
// ===============================
function handlePinchZoom(e){

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

    // 🔍 ZOOM
    pdfScale += diff * 0.0008;

    // 🔒 LIMITES
    pdfScale =
        Math.min(
            Math.max(0.6, pdfScale),
            3
        );

    initialDistance = distance;

    if(zoomTimeout){
        return;
    }

    // 🚀 ZOOM CSS
    zoomTimeout =
        setTimeout(() => {

            applyZoom();

            zoomTimeout = null;

        }, 16);
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