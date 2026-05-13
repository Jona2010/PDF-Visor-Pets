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
// 🚪 CONTROL LOGOUT
let cerrandoSesion = false;
let currentLoadingTask = null;

// 📄 PDF ACTUAL
let pdfDocument = null;

let cargandoPDF = false;

// ===============================
// 🔐 VALIDAR SESIÓN GOOGLE
// ===============================
async function validarSesionInicial(){

    const redirectLogin = () => {

        window.location.replace(
            "index.html"
        );
    };

    try{

        const {
            data:{ session },
            error
        } = await supabaseClient
            .auth
            .getSession();

        if(error || !session){

            redirectLogin();

            return null;
        }

        const email =
            session?.user?.email || "";

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

            setTimeout(() => {

                redirectLogin();

            }, 1200);

            return null;
        }

        return session;

    }catch(err){

        console.error(
            "❌ Error validando sesión:",
            err
        );

        redirectLogin();

        return null;
    }
}

// ===============================
// 📄 CARGAR CONFIG
// ===============================

async function loadConfig(){

    // ⏳ TIMEOUT FETCH
    const controller =
        new AbortController();

    const timeout =
        setTimeout(() => {

            controller.abort();

        }, 10000);

    try{

        const res =
            await fetch(
                "config.json",
                {
                    cache:"no-store",
                    signal:
                        controller.signal
                }
            );

        clearTimeout(timeout);

        // 🚫 ERROR HTTP
        if(!res.ok){

            throw new Error(
                `HTTP ${res.status}`
            );
        }

        // 📄 JSON
        const json =
            await res.json();

        // 🚫 VALIDAR
        if(
            !json ||
            typeof json.bucket !== "string" ||
            json.bucket.trim() === "" ||
            !Array.isArray(
                json.pets
            )
        ){

            throw new Error(
                "Config inválida"
            );
        }

        // ✅ CONFIG GLOBAL
        config = json;

        // 🚀 LOAD LIST
        await loadPDFList();

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
async function loadPDFList(){

    try{

        const petSelect =
            document.getElementById(
                "petSelect"
            );

        // 🚫 VALIDAR DOM
        if(!petSelect){

            throw new Error(
                "petSelect no encontrado"
            );
        }

        // 🚫 VALIDAR CONFIG
        if(
            !config ||
            !Array.isArray(
                config.pets
            )
        ){

            throw new Error(
                "Config inválida"
            );
        }

        // 🧹 LIMPIAR
        petSelect.innerHTML = "";

        // ✅ FILTRAR PETS VÁLIDOS

        const validPets = config.pets
            .map((pet, index) => ({ pet, index }))
            .filter(({ pet }) =>
                pet &&
                typeof pet.nombre === "string" &&
                pet.nombre.trim() !== "" &&
                pet.archivos &&
                typeof pet.archivos === "object"
            );

        // 🚫 SIN PETS
        if(validPets.length === 0){

            throw new Error(
                "No hay PETS válidos"
            );
        }

        // 🔥 OPTIONS
        validPets.forEach(({ pet, index }) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                index;

            option.textContent =
                pet.nombre;

            petSelect.appendChild(
                option
            );
        });

        // ✅ DEFAULT
        petSelect.selectedIndex = 0;

        // 🚫 EVITAR DUPLICADOS
        petSelect.onchange =
            updateAreas;

        // 🚀 ESPERAR REPAINT
        requestAnimationFrame(() => {

            updateAreas();

        });

    }catch(err){

        console.error(
            "❌ Error loadPDFList:",
            err
        );

        showAlert(
            "❌ Error cargando lista PDF",
            "error"
        );
    }
}

// 🚪 LOGOUT
async function logout(){

    // 🚫 EVITAR DOBLE LOGOUT
    if(cerrandoSesion){
        return;
    }

    cerrandoSesion = true;

    try{

        // 🧹 CANCELAR PDF
        try{

            if(currentLoadingTask){

                await currentLoadingTask.destroy();

                currentLoadingTask = null;
            }

            if(pdfDocument){

                pdfDocument.cleanup();

                pdfDocument = null;
            }

        }catch(cleanErr){

            console.warn(
                "⚠️ Error limpiando PDF:",
                cleanErr
            );
        }

        // 🔓 RESET
        cargandoPDF = false;

        // 🚪 LOGOUT SUPABASE
        await supabaseClient
            .auth
            .signOut();

    }catch(err){

        console.error(
            "❌ Error logout:",
            err
        );

    }finally{

        // 🚀 REDIRECT
        window.location.replace(
            "index.html"
        );
    }
}

// 🔄 CONTROL UPDATE AREAS
let updateAreasTimeout = null;

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

        if(!petSelect || !areaSelect){

            throw new Error(
                "Selects no encontrados"
            );
        }

        const petIndex =
            Number(
                petSelect.value
            );

        const area =
            areaSelect.value;

        // 🚫 VALIDAR CONFIG
        if(
            !config ||
            !Array.isArray(
                config.pets
            ) ||
            !config.pets[petIndex]
        ){
            return;
        }

        const pet =
            config.pets[petIndex];

        // 🚫 VALIDAR ARCHIVOS
        if(
            !pet.archivos ||
            typeof pet.archivos !==
            "object"
        ){
            return;
        }

        // 🧹 LIMPIAR
        areaSelect.innerHTML = "";

        const areas =
            Object.keys(
                pet.archivos
            );

        // 🚫 SIN ÁREAS
        if(areas.length === 0){

            console.warn(
                "⚠️ Sin áreas"
            );

            return;
        }

        // 🔥 OPTIONS
        areas.forEach(area => {

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

        // ✅ DEFAULT
        areaSelect.selectedIndex = 0;

        // 🚫 EVITAR DUPLICADOS
        areaSelect.onchange = () => {

            // 🚫 DEBOUNCE
            clearTimeout(
                updateAreasTimeout
            );

            updateAreasTimeout =
                setTimeout(() => {

                    loadPDF();

                }, 80);
        };

    }catch(err){

        console.error(
            "❌ Error updateAreas:",
            err
        );
    }
}

// 📱 DETECTAR MÓVIL
function esMovil(){

    return (

        window.innerWidth <= 768 ||

        (
            "ontouchstart" in window &&
            window.innerWidth <= 1024
        ) ||

        /Android|iPhone|iPad|iPod/i
        .test(
            navigator.userAgent
        )
    );
}

// 🚫 EVITAR DUPLICADOS
let registrandoSesionExpirada = false;

// ⏳ REGISTRAR SESIÓN EXPIRADA
async function registrarSesionExpirada(user){

    // 🚫 EVITAR DUPLICADOS
    if(registrandoSesionExpirada){
        return;
    }

    registrandoSesionExpirada = true;

    try{

        // 🚫 VALIDAR USER
        if(!user?.email){

            console.warn(
                "⚠️ Usuario inválido"
            );

            return;
        }

        // 🚀 INSERTS PARALELOS
        await Promise.allSettled([

            // 🔔 ALERTA
            supabaseClient
                .from("alerts")
                .insert({

                    user_id:
                        user.id,

                    email:
                        user.email,

                    message:
                        `⏳ Sesión expirada: ${user.email}`,

                    nivel:"warning",

                    visto:false
                }),

            // 📊 LOG
            supabaseClient
                .from("logs")
                .insert({

                    user_email:
                        user.email,

                    pet:"SESSION",

                    area:"Sesión expirada"
                })
        ]);

    }catch(err){

        console.error(
            "❌ Error sesión expirada:",
            err
        );

    }finally{

        registrandoSesionExpirada = false;
    }
}

/// 📥 CARGAR PDF
async function loadPDF(){

    const token =
        ++renderToken;

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

        const petSelect =
            document.getElementById(
                "petSelect"
            );

        const areaSelect =
            document.getElementById(
                "areaSelect"
            );

        // 🚫 VALIDAR DOM
        if(
            !container ||
            !loader ||
            !petSelect ||
            !areaSelect
        ){

            throw new Error(
                "DOM PDF no encontrado"
            );
        }

        const petIndex =
            Number(
                petSelect.value
            );

        const area =
            areaSelect.value;

        // 🚫 VALIDAR CONFIG
        if(
            !config ||
            typeof config.bucket !== "string" ||
            config.bucket.trim() === "" ||
            !Array.isArray(
                config.pets
            ) ||
            !config.pets[petIndex]
        ){

            return;
        }

        // 🚫 VALIDAR ARCHIVO
        if(
            !config.pets[petIndex]
                ?.archivos?.[area]
        ){

            return;
        }

        const fileName =
            config.pets[petIndex]
                .archivos[area];

        // =====================================
        // 🧹 LIMPIAR PDF ANTERIOR
        // =====================================
        try{

            if(currentLoadingTask){

                await currentLoadingTask
                    .destroy();

                currentLoadingTask =
                    null;
            }

            if(pdfDocument){

                try{

                    await pdfDocument
                        .destroy();

                }catch(cleanErr){

                    console.warn(
                        "⚠️ Error destruyendo PDF:",
                        cleanErr
                    );
                }

                pdfDocument =
                    null;
            }

        }catch(cancelErr){

            console.warn(
                "⚠️ Error cancelando PDF:",
                cancelErr
            );
        }

        // =====================================
        // 🧹 LIMPIAR GPU CANVASES
        // =====================================
        const oldCanvases =
            container.querySelectorAll(
                "canvas"
            );

        oldCanvases.forEach(canvas => {

            canvas.width =
                0;

            canvas.height =
                0;
        });

        // =====================================
        // 🧹 LIMPIAR UI
        // =====================================
        container.style.opacity =
            "0";

        container.innerHTML =
            "";

        requestAnimationFrame(() => {

            container.style.opacity =
                "1";
        });

        container.classList.remove(
            "loaded"
        );

        loader.style.display =
            "flex";

        // =====================================
        // 🔐 GENERAR URL FIRMADA
        // =====================================
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

        if(token !== renderToken){

            return;
        }

        if(error || !data?.signedUrl){

            console.error(error);

            showAlert(
                "❌ Error cargando PDF",
                "error"
            );

            return;
        }

        // =====================================
        // 🚫 VALIDAR PDF.JS
        // =====================================
        if(typeof window.pdfjsLib === "undefined"){

            showAlert(
                "❌ PDF.js no disponible",
                "error"
            );

            return;
        }

        // =====================================
        // 🚀 CARGAR PDF
        // =====================================
        currentLoadingTask =
            window.pdfjsLib.getDocument({

                url:
                    data.signedUrl,

                verbosity:
                    0,

                disableAutoFetch:
                    true,

                disableStream:
                    false,

                disableRange:
                    false,

                rangeChunkSize:
                    262144,

                cMapUrl:
                    "cmaps/",

                cMapPacked:
                    true,

                standardFontDataUrl:
                    "standard_fonts/"
            });

        pdfDocument =
            await currentLoadingTask
                .promise;

        currentLoadingTask =
            null;

        if(token !== renderToken){

            return;
        }

        const totalPages =
            pdfDocument.numPages;

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

            if(token !== renderToken){

                return;
            }

            const pageElement =
                await renderSinglePage(
                    pdfDocument,
                    i,
                    modoMovil,
                    token
                );

            if(
                pageElement &&
                token === renderToken
            ){

                container.appendChild(
                    pageElement
                );
            }

            if(i === 1){

                loader.style.display =
                    "none";

                container.classList.add(
                    "loaded"
                );
            }

            if(i % 4 === 0){

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            16
                        )
                );
            }
        }

        requestAnimationFrame(() => {

            container.classList.add(
                "loaded"
            );

            loader.style.display =
                "none";
        });

        // =====================================
        // 👤 LOG
        // =====================================
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

        showAlert(
            "❌ Error cargando PDF",
            "error"
        );

    }finally{

        if(token === renderToken){

            cargandoPDF =
                false;

            const loader =
                document.getElementById(
                    "loader"
                );

            if(loader){

                loader.style.display =
                    "none";
            }
        }
    }
}

// 🎯 RENDER PÁGINA INDIVIDUAL
async function renderSinglePage(
    pdf,
    pageNum,
    modoMovil,
    token
){

    // 🚫 TOKEN INVÁLIDO
    if(token !== renderToken){
        return null;
    }

    try{

        // 📄 PAGE
        const page =
            await pdf.getPage(
                pageNum
            );

        // 🚫 CANCELADO
        if(token !== renderToken){

            page.cleanup();

            return null;
        }

        // =====================================
        // 📏 VIEWPORT BASE
        // =====================================
        const baseViewport =
            page.getViewport({
                scale:1
            });

        // =====================================
        // 📏 ANCHO DISPONIBLE
        // =====================================
        const availableWidth =
            modoMovil
                ? window.innerWidth - 32
                : (window.innerWidth / 2) - 60;

        // =====================================
        // 🔍 ESCALA
        // =====================================
        let scale =
            availableWidth /
            baseViewport.width;

        // 📱 DPR
        const devicePixelRatio =
            modoMovil
                ? (
                    window.devicePixelRatio || 2
                )
                : 1.5;

        // 🚫 LIMITE
        const finalScale =
            Math.min(
                scale * devicePixelRatio,
                2.2
            );

        // 📄 VIEWPORT FINAL
        const viewport =
            page.getViewport({
                scale:finalScale
            });

        // =====================================
        // 🖼️ CANVAS
        // =====================================
        const canvas =
            document.createElement(
                "canvas"
            );

        const ctx =
            canvas.getContext(
                "2d",
                {
                    alpha:false
                }
            );

        // 🚫 CONTEXTO INVÁLIDO
        if(!ctx){

            page.cleanup();

            return null;
        }

        // 📏 SIZE REAL
        canvas.width =
            Math.floor(
                viewport.width
            );

        canvas.height =
            Math.floor(
                viewport.height
            );

        // 📏 SIZE VISUAL
        canvas.style.width =
            `${
                Math.floor(
                    viewport.width /
                    devicePixelRatio
                )
            }px`;

        canvas.style.height =
            `${
                Math.floor(
                    viewport.height /
                    devicePixelRatio
                )
            }px`;

        // ✨ ANIMACIÓN
        canvas.style.opacity = "0";

        canvas.style.transition =
            "opacity .25s ease";

        // =====================================
        // 📦 WRAPPER
        // =====================================
        const pageWrapper =
            document.createElement(
                "div"
            );

        pageWrapper.className =
            "page-wrapper";

        pageWrapper.appendChild(
            canvas
        );

        // =====================================
        // 🎨 RENDER
        // =====================================
        const renderTask =
            page.render({

                canvasContext:ctx,

                viewport:viewport
            });

        await renderTask.promise;

        // 🚫 CANCELADO
        if(token !== renderToken){

            canvas.width = 0;
            canvas.height = 0;

            page.cleanup();

            return null;
        }

        // 🧹 CLEAN PAGE
        page.cleanup();

        // ✨ SHOW
        requestAnimationFrame(() => {

            canvas.style.opacity =
                "1";

        });

        // ✅ DEVOLVER ELEMENTO
        return pageWrapper;

    }catch(err){

        console.warn(
            `⚠️ Error página ${pageNum}:`,
            err
        );

        return null;
    }
}

// 🚨 ALERTA GLOBAL
let currentAlert = null;

// 🚨 SHOW ALERT
function showAlert(
    message,
    type = "error"
){

    // 🚫 VALIDAR BODY
    if(!document.body){
        return;
    }

    // 🚫 TYPES INVÁLIDOS
    const validTypes = [
        "error",
        "success",
        "warning"
    ];

    if(
        !validTypes.includes(type)
    ){
        type = "error";
    }

    // 🚫 ELIMINAR ALERTA ANTERIOR
    if(currentAlert){

        currentAlert.remove();

        currentAlert = null;
    }

    // 🔥 CREAR
    const alert =
        document.createElement(
            "div"
        );

    alert.className =
        `custom-alert ${type}`;

    alert.textContent =
        message;

    // 💾 GLOBAL
    currentAlert = alert;

    // 🚀 APPEND
    document.body.appendChild(
        alert
    );

    // ✨ ANIMACIÓN
    requestAnimationFrame(() => {

        alert.classList.add(
            "show"
        );
    });

    // ⏳ DURACIÓN
    const ALERT_DURATION = 3000;

    // ⏳ TRANSICIÓN
    const ALERT_TRANSITION = 250;

    // 🚀 REMOVE TIMER
    const removeTimeout =
        setTimeout(() => {

            alert.classList.remove(
                "show"
            );

            // 🚀 ESPERAR CSS
            const transitionTimeout =
                setTimeout(() => {

                    if(
                        alert.parentNode
                    ){

                        alert.remove();
                    }

                    // 🧹 LIMPIAR GLOBAL
                    if(
                        currentAlert === alert
                    ){

                        currentAlert = null;
                    }

                }, ALERT_TRANSITION);

        }, ALERT_DURATION);

    // ✅ RETORNO ÚTIL
    return alert;
}

// ===============================
// 🔐 CONTROL SESIÓN
// ===============================

// ⏱️ ÚLTIMA ACTIVIDAD
let lastActivity =
    Date.now();

// ⏱️ THROTTLE ACTIVIDAD
let lastActivityUpdate = 0;

// ⏳ 10 MINUTOS
const TIEMPO_MAX =
    10 * 60 * 1000;

// ===============================
// 🎯 ACTUALIZAR ACTIVIDAD
// ===============================
function actualizarActividad(){

    const now =
        Date.now();

    // 🚫 THROTTLE 300ms
    if(
        now - lastActivityUpdate <
        300
    ){
        return;
    }

    // ✅ UPDATE
    lastActivity = now;

    lastActivityUpdate = now;
}

// ===============================
// 🎧 EVENTOS ACTIVIDAD
// ===============================

// 🖱️ TOUCH / MOUSE / PEN
document.addEventListener(
    "pointerdown",
    actualizarActividad,
    {
        passive:true
    }
);

// ⌨️ TECLADO
document.addEventListener(
    "keydown",
    actualizarActividad,
    {
        passive:true
    }
);

// 👁️ VOLVER A PESTAÑA
document.addEventListener(
    "visibilitychange",
    () => {

        if(
            document.visibilityState ===
            "visible"
        ){

            actualizarActividad();
        }
    }
);

// ===============================
// 📱 FIX MOBILE PINCH
// ===============================

// 🚫 SOLO iOS SAFARI
if("ongesturestart" in window){

    document.addEventListener(
        "gesturestart",
        (e) => {

            // 🚫 SOLO SI USAS ZOOM CUSTOM
            if(pdfScale !== 1){

                e.preventDefault();
            }

        },
        {
            passive:false
        }
    );
}

// ===============================
// 🔐 VERIFICAR SESIÓN
// ===============================

// 🚫 EVITAR CHECKS DUPLICADOS
let verificandoSesion = false;

// 🚫 EVITAR MÚLTIPLES EXPIRACIONES
let sesionExpirada = false;

// ⏱️ INTERVAL
const sessionInterval =
    setInterval(async () => {

        // 🚫 YA EXPIRÓ
        if(sesionExpirada){
            return;
        }

        // 🚫 CHECK EN CURSO
        if(verificandoSesion){
            return;
        }

        verificandoSesion = true;

        try{

            const ahora =
                Date.now();

            // ⏳ EXPIRADA
            if(
                ahora - lastActivity >
                TIEMPO_MAX
            ){

                sesionExpirada = true;

                console.log(
                    "⏳ Sesión expirada"
                );

                // 🛑 DETENER INTERVAL
                clearInterval(
                    sessionInterval
                );

                // 🔑 SESSION
                const {
                    data:{ session }
                } = await supabaseClient
                    .auth
                    .getSession();

                const user =
                    session?.user;

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

                // 🚀 REDIRECT
                setTimeout(() => {

                    window.location.replace(
                        "index.html"
                    );

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

// ===============================
// 🚫 BLOQUEOS BÁSICOS
// ===============================

// 🚫 CLICK DERECHO SOLO EN PDF
document
    .getElementById(
        "pdfContainer"
    )
    ?.addEventListener(
        "contextmenu",
        e => {

            e.preventDefault();

        }
    );

// 🚫 DEVTOOLS BÁSICO
document.addEventListener(
    "keydown",
    e => {

        const key =
            e.key.toLowerCase();

        // 🚫 F12
        if(key === "f12"){

            e.preventDefault();

            return;
        }

        // 🚫 CTRL/CMD + SHIFT + I
        if(

            (
                e.ctrlKey ||
                e.metaKey
            ) &&

            e.shiftKey &&

            key === "i"
        ){

            e.preventDefault();
        }
    }
);

// 🚫 EVITAR INIT DUPLICADO
let appInicializada = false;

// ===============================
// 🚀 INIT
// ===============================
document.addEventListener(
    "DOMContentLoaded",
    async () => {

        // 🚫 EVITAR DUPLICADOS
        if(appInicializada){
            return;
        }

        appInicializada = true;

        try{

            // =====================================
            // 🔐 VALIDAR SESIÓN INICIAL
            // =====================================
            const session =
                await validarSesionInicial();

            // 🚫 SIN SESIÓN / REDIRECT EN PROCESO
            if(!session){
                return;
            }

            // =====================================
            // 🔍 DIAGNÓSTICO BACKGROUND
            // =====================================
            if(typeof diagnosticarNavegador === "function"){

                diagnosticarNavegador()
                    .then(result => {

                        console.log(
                            "📊 Resultado diagnóstico:",
                            result
                        );

                    })
                    .catch(diagErr => {

                        console.warn(
                            "⚠️ Error diagnóstico:",
                            diagErr
                        );
                    });

            }else{

                console.warn(
                    "⚠️ diagnosticarNavegador no está definido"
                );
            }

            // =====================================
            // 🔐 DEVICE
            // =====================================
            const device_id =
                localStorage.getItem(
                    "device_id"
                );

            if(!device_id){

                console.warn(
                    "⚠️ device_id no encontrado"
                );
            }

            // =====================================
            // 🚀 LOAD CONFIG
            // =====================================
            await loadConfig();

            // =====================================
            // 🔍 INIT ZOOM
            // =====================================
            initPDFZoom();

            // =====================================
            // 🚪 BOTÓN LOGOUT
            // =====================================
            const logoutBtn =
                document.getElementById(
                    "logoutBtn"
                );

            if(logoutBtn){

                logoutBtn.onclick =
                    logout;
            }

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

// ===============================
// 🔍 APPLY ZOOM
// ===============================
function applyZoom(){

    const wrapper =
        document.getElementById(
            "pdfZoomWrapper"
        );

    // 🚫 VALIDAR
    if(!wrapper){
        return;
    }

    // 🔒 LIMITES
    pdfScale = Math.min(
        Math.max(pdfScale, 0.6),
        3
    );

    // 🚀 GPU
    wrapper.style.willChange =
        "transform";

    // 🔍 SCALE
    wrapper.style.transform =
        `scale(${pdfScale})`;

    // 📍 ORIGEN
    wrapper.style.transformOrigin =
        "top center";

    // 🚀 SMOOTH
    wrapper.style.transition =
        "transform .12s ease-out";
}

// 🚫 EVITAR INIT DUPLICADO
let zoomEventsInitialized = false;

// ===============================
// 🚀 INIT PDF EVENTS
// ===============================
function initPDFZoom(){

    // 🚫 DUPLICADO
    if(zoomEventsInitialized){
        return;
    }

    zoomEventsInitialized = true;

    const zoomWrapper =
        document.getElementById(
            "pdfZoomWrapper"
        );

    // 🚫 VALIDAR
    if(!zoomWrapper){
        return;
    }

    // ===============================
    // 🖥️ WHEEL ZOOM
    // ===============================
    zoomWrapper.addEventListener(
        "wheel",
        (e) => {

            // 🚫 SOLO CTRL/CMD
            if(
                !e.ctrlKey &&
                !e.metaKey
            ){
                return;
            }

            handleWheelZoom(e);

        },
        {
            passive:false
        }
    );

    // ===============================
    // 📱 PINCH ZOOM
    // ===============================
    zoomWrapper.addEventListener(
        "touchmove",
        handlePinchZoom,
        {
            passive:false
        }
    );

    console.log(
        "🔍 Zoom inicializado"
    );
}

// 🚫 RAF DUPLICADO
let zoomAnimationFrame = null;

// ===============================
// 🖥️ WHEEL ZOOM
// ===============================
function handleWheelZoom(e){

    // 🚫 SOLO CTRL/CMD
    if(
        !e.ctrlKey &&
        !e.metaKey
    ){
        return;
    }

    e.preventDefault();

    // ⏱️ ACTIVIDAD
    actualizarActividad();

    // =====================================
    // 🔍 DELTA SUAVE
    // =====================================
    const zoomIntensity =
        0.0015;

    pdfScale -=
        e.deltaY *
        zoomIntensity;

    // =====================================
    // 🔒 LIMITES
    // =====================================
    pdfScale = Math.min(
        Math.max(pdfScale, 0.6),
        3
    );

    // =====================================
    // 🚫 CANCELAR RAF ANTERIOR
    // =====================================
    if(zoomAnimationFrame){

        cancelAnimationFrame(
            zoomAnimationFrame
        );
    }

    // =====================================
    // 🚀 APPLY ZOOM
    // =====================================
    zoomAnimationFrame =
        requestAnimationFrame(() => {

            applyZoom();

            zoomAnimationFrame =
                null;
        });
}

// 🚫 RAF DUPLICADO
let pinchAnimationFrame = null;

// ===============================
// 📱 PINCH ZOOM
// ===============================
function handlePinchZoom(e){

    // 🚫 SOLO 2 DEDOS
    if(e.touches.length !== 2){
        return;
    }

    e.preventDefault();

    // ⏱️ ACTIVIDAD
    actualizarActividad();

    // =====================================
    // 📏 DISTANCIA
    // =====================================
    const dx =
        e.touches[0].clientX -
        e.touches[1].clientX;

    const dy =
        e.touches[0].clientY -
        e.touches[1].clientY;

    const distance =
        Math.sqrt(
            dx * dx +
            dy * dy
        );

    // =====================================
    // 🚀 INIT
    // =====================================
    if(initialDistance === null){

        initialDistance =
            distance;

        return;
    }

    // =====================================
    // 🔍 DIFF
    // =====================================
    const diff =
        distance -
        initialDistance;

    // 🚫 MICRO MOVIMIENTOS
    if(Math.abs(diff) < 4){
        return;
    }

    // =====================================
    // 🔍 ZOOM SUAVE
    // =====================================
    pdfScale +=
        diff * 0.0005;

    // =====================================
    // 🔒 LIMITES
    // =====================================
    pdfScale = Math.min(
        Math.max(pdfScale, 0.6),
        3
    );

    // =====================================
    // 💾 UPDATE DISTANCE
    // =====================================
    initialDistance =
        distance;

    // =====================================
    // 🚫 CANCELAR RAF
    // =====================================
    if(pinchAnimationFrame){

        cancelAnimationFrame(
            pinchAnimationFrame
        );
    }

    // =====================================
    // 🚀 APPLY ZOOM
    // =====================================
    pinchAnimationFrame =
        requestAnimationFrame(() => {

            applyZoom();

            pinchAnimationFrame =
                null;
        });
}

// ===============================
// 📱 TOUCH END
// ===============================
document.addEventListener(
    "touchend",
    (e) => {

        // 🚫 SI YA NO HAY 2 DEDOS
        if(e.touches.length < 2){

            initialDistance = null;
        }

        // 🚫 CANCELAR RAF
        if(pinchAnimationFrame){

            cancelAnimationFrame(
                pinchAnimationFrame
            );

            pinchAnimationFrame =
                null;
        }
    },
    {
        passive:true
    }
);