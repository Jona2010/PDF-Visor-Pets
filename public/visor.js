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

// 📥 CARGAR PDF - VERSIÓN OPTIMIZADA CON 2 COLUMNAS
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
        container.innerHTML = "";
        loader.style.display = "flex";
        cargandoPDF = true;

        // 🔐 SUPABASE URL
        const { data, error } = await supabaseClient
            .storage
            .from(config.bucket)
            .createSignedUrl(fileName, 3600);

        if (error) {
            showAlert("❌ Error cargando PDF", "error");
            loader.style.display = "none";
            cargandoPDF = false;
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
            disableAutoFetch: false,
            rangeChunkSize: 65536,
            maxImageSize: -1,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });

        const pdf = await currentLoadingTask.promise;
        pdfDocument = pdf;
        
        console.log(`✅ PDF CARGADO: ${pdf.numPages} páginas`);

        // 🚫 TOKEN VÁLIDO
        if (token !== renderToken) {
            pdf.destroy();
            cargandoPDF = false;
            return;
        }

        const totalPages = pdf.numPages;
        const modoMovil = esMovil();
        
        console.log(`📄 Renderizando ${totalPages} páginas en ${modoMovil ? '1 columna' : '2 columnas por fila'}`);
        
        // 🔥 Configurar CSS para grid de 2 columnas
        container.classList.remove('modo-movil', 'modo-escritorio');
        
        if (modoMovil) {
            container.classList.add('modo-movil');
            // Estilos inline para móvil
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.gap = '20px';
        } else {
            container.classList.add('modo-escritorio');
            // 🔥 CLAVE: Estilos inline para grid de 2 columnas
            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(2, 1fr)';
            container.style.gap = '24px';
            container.style.alignItems = 'start';
            container.style.justifyItems = 'center';
            container.style.padding = '20px';
        }
        
        // Array para almacenar las promesas de renderizado
        const renderPromises = [];
        
        // Renderizar todas las páginas
        for (let i = 1; i <= totalPages; i++) {
            if (token !== renderToken) break;
            
            // Crear wrapper para cada página
            const pageWrapper = document.createElement("div");
            pageWrapper.className = "page-wrapper";
            
            // Estilos específicos para el wrapper
            if (modoMovil) {
                pageWrapper.style.width = '100%';
                pageWrapper.style.maxWidth = '500px';
                pageWrapper.style.margin = '0 auto';
            } else {
                pageWrapper.style.width = '100%';
                pageWrapper.style.display = 'flex';
                pageWrapper.style.justifyContent = 'center';
                pageWrapper.style.alignItems = 'center';
            }
            
            // Añadir al contenedor
            container.appendChild(pageWrapper);
            
            // Renderizar la página
            const renderPromise = renderPagina(pdf, i, pageWrapper, token, modoMovil);
            renderPromises.push(renderPromise);
            
            // Log de progreso cada 10 páginas
            if (i % 10 === 0) {
                console.log(`📄 Progreso: ${i}/${totalPages} páginas`);
                // Pequeña pausa para no bloquear UI
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }
        
        // Esperar a que todas las páginas se rendericen
        await Promise.all(renderPromises);
        
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
                area: `${area} | ${totalPages} PÁGINAS | ${modoMovil ? '1 COLUMNA' : '2 COLUMNAS'}`
            });
        }

        loader.style.display = "none";
        cargandoPDF = false;
        console.log(`✅ RENDER COMPLETO: ${totalPages} páginas en ${modoMovil ? '1 columna' : '2 columnas'}`);

    } catch (err) {
        console.error("❌ Error loadPDF:", err);
        if (currentLoadingTask) {
            try {
                currentLoadingTask.destroy();
            } catch (e) {}
        }
        document.getElementById("loader").style.display = "none";
        currentLoadingTask = null;
        cargandoPDF = false;
        showAlert(`❌ Error PDF: ${err.message}`, "error");
    }
}

// 🎯 FUNCIÓN PARA RENDERIZAR CADA PÁGINA (OPTIMIZADA PARA 2 COLUMNAS)
async function renderPagina(pdf, pageNum, containerElement, token, modoMovil) {
    if (token !== renderToken) return null;

    try {
        const page = await pdf.getPage(pageNum);
        
        // 🔥 Calcular escala optimizada para 2 columnas
        let scale;
        
        if (modoMovil) {
            // Móvil: una página ocupa casi todo el ancho
            const containerWidth = Math.min(window.innerWidth - 40, 500);
            const baseViewport = page.getViewport({ scale: 1 });
            scale = (containerWidth * 0.95) / baseViewport.width;
            scale = Math.min(Math.max(scale, 0.5), 2);
        } else {
            // Escritorio: cada página ocupa la mitad del grid (aprox 45% del ancho total)
            // Calcular basado en el contenedor padre
            const gridContainer = document.getElementById("pdfContainer");
            let availableWidth = 500; // Valor por defecto
            
            if (gridContainer) {
                const gridWidth = gridContainer.clientWidth;
                // Restar gaps y padding, dividir entre 2 columnas
                availableWidth = (gridWidth - 48) / 2; // 24px gap * 2 = 48
            }
            
            const baseViewport = page.getViewport({ scale: 1 });
            // Ocupar el 95% del espacio disponible por columna
            scale = (availableWidth * 0.95) / baseViewport.width;
            // Limitar escala para mantener legibilidad
            scale = Math.min(Math.max(scale, 0.6), 1.5);
        }
        
        const viewport = page.getViewport({ scale: scale });
        
        // Crear canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false }); // Optimización: alpha false mejora performance
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // 🔥 Estilos CSS para el canvas
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxWidth = `${viewport.width}px`;
        canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        canvas.style.backgroundColor = "white";
        canvas.style.borderRadius = '4px';
        
        // Limpiar contenedor y añadir canvas
        containerElement.innerHTML = "";
        containerElement.appendChild(canvas);
        
        // Renderizar
        const renderTask = page.render({
            canvasContext: ctx,
            viewport: viewport,
            background: 'white'
        });
        
        await renderTask.promise;
        page.cleanup();
        
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
            ) ||
            
            (
                e.ctrlKey &&
                e.key === "u"
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

            // Escuchar cambios de tamaño de ventana para re-renderizar si es necesario
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