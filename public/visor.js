import { createClient }
from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

import { PDFViewer }
from "./pdf-viewer.js";

import { ZoomManager }
from "./zoom.js";

import { Sidebar }
from "./sidebar.js";

// ================================
// 🌍 GLOBALS
// ================================

let supabase  = null;
let viewer    = null;
let zoom      = null;
let sidebar   = null;
let config    = null;

let currentPath = null;
let loading     = false;
const versionCache = new Map();

let isMobile = window.matchMedia("(max-width: 900px)").matches;

// ================================
// 🚀 START
// ================================

window.addEventListener("DOMContentLoaded", initializeApp);

// ================================
// 🚀 INIT APP
// ================================

async function initializeApp() {

    try {

        togglePDFSplash(true);

        pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";

        config = await loadConfig();

        createSupabaseClient(config.supabaseUrl, config.supabaseKey);

        const viewerContainer = document.getElementById("viewerContainer");
        const pdfViewerEl     = document.getElementById("pdfViewer");

        if (!viewerContainer || !pdfViewerEl) {
            throw new Error("Estructura HTML inválida");
        }

        viewer = new PDFViewer({

            container: viewerContainer,

            viewer: pdfViewerEl,

            onPageChange:(page,total)=>{

                updatePageUI(page,total);

                syncSearchWithCurrentPage(page);

            }

        });

        // ZoomManager registra sus propios listeners de wheel y botones
        zoom = new ZoomManager({ viewer });

        sidebar = new Sidebar({

            config,

            onOpenPDF: openPDF,

            onTaskSelected: handleTaskSelection

        });

        initializeKeyboard();
        initializeResize();
        initializeVisibility();
        initializeOnlineStatus();
        initializeMobileSidebar();
        initializePageNav();
        initializeExplorer();
        createWatermarkOverlay();

        console.log("✅ APP READY");
        togglePDFSplash(false);

    } catch (error) {
        console.error("❌ INIT ERROR:", error);
        showFatalError("No se pudo iniciar el visor", null);
    }
}

// ================================
// 📖 EXPLORER
// ================================

let explorerOpen = false;

const explorer = {

    panel:null,

    overlay:null,

    button:null,

    close:null,

    tabs:[],

    title:null,

    subtitle:null,

    counter:null,

    activeTab:"steps",

    views:{},

    stepsView:null,

    searchView:null,

    // ===============================
    // BUSCADOR PDF
    // ===============================

    searchPanel:null,

    searchInput:null,

    searchClear:null,

    // Botones de navegación
    searchPrev:null,

    searchNext:null,

    // Información
    searchInfo:null,

    searchCounter:null,

    // Contenedores
    searchResults:null,

    searchList:null,

    searchEmpty:null,

    // Estado
    searchMatches:[],

    currentMatch:-1,

    searchTimer:null

};

function initializeExplorer(){

    explorer.panel =
        document.getElementById(
            "explorerPanel"
        );

    explorer.overlay =
        document.getElementById(
            "explorerOverlay"
        );

    explorer.button =
        document.getElementById(
            "explorerBtn"
        );

    explorer.close =
        document.getElementById(
            "closeExplorerBtn"
        );

    explorer.stepsView =
        document.getElementById(
            "stepsView"
        );

    explorer.searchView =
        document.getElementById(
            "searchView"
        );

    // ===============================
    // BUSCADOR PDF
    // ===============================

    explorer.searchPanel =
        document.getElementById(
            "pdfSearchPanel"
        );

    explorer.searchInput =
        document.getElementById(
            "pdfSearchInput"
        );

    explorer.searchClear =
        document.getElementById(
            "pdfSearchClear"
        );

    // -----------------------------
    // Navegación
    // -----------------------------

    explorer.searchPrev =
        document.getElementById(
            "pdfSearchPrev"
        );

    explorer.searchNext =
        document.getElementById(
            "pdfSearchNext"
        );

    // -----------------------------
    // Información
    // -----------------------------

    explorer.searchInfo =
        document.getElementById(
            "pdfSearchInfo"
        );

    explorer.searchCounter =
        document.getElementById(
            "pdfSearchCounter"
        );

    // -----------------------------
    // Contenedores
    // -----------------------------

    explorer.searchResults =
        document.getElementById(
            "pdfSearchResults"
        );

    explorer.searchList =
        document.getElementById(
            "pdfSearchList"
        );

    explorer.searchEmpty =
        document.getElementById(
            "pdfSearchEmpty"
        );

    explorer.title =
        document.getElementById(
            "explorerTitle"
        );

    explorer.subtitle =
        document.getElementById(
            "explorerSubtitle"
        );

    explorer.tabs = [

        ...document.querySelectorAll(
            ".explorer-tab"
        )

    ];

    explorer.button?.addEventListener(

        "click",

        toggleExplorer

    );

    explorer.close?.addEventListener(

        "click",

        closeExplorer

    );

    explorer.overlay?.addEventListener(

        "click",

        closeExplorer

    );

    explorer.views = {

        steps: explorer.stepsView,

        search: explorer.searchView

    };

    initializeExplorerEvents();

    if(!explorer.panel){

        console.warn(
            "Explorer Panel no encontrado."
        );

        return;

    }

}

// ================================
// EVENTOS EXPLORADOR
// ================================

function initializeExplorerEvents(){

    // -------------------------
    // Tabs
    // -------------------------

    explorer.tabs.forEach(tab=>{

        tab.addEventListener("click",()=>{

            const view =
                tab.dataset.view;

            changeExplorerTab(view);

        });

    });

    // -------------------------
    // Input
    // -------------------------

    explorer.searchInput?.addEventListener(

        "input",

        handleExplorerSearch

    );

    // -------------------------
    // Limpiar
    // -------------------------

    explorer.searchClear?.addEventListener(

        "click",

        clearExplorerSearch

    );

    // -------------------------
    // Navegación de resultados
    // -------------------------

    explorer.searchPrev?.addEventListener(

        "click",

        ()=>{

            navigateSearchResults(-1);

        }

    );

    explorer.searchNext?.addEventListener(

        "click",

        ()=>{

            navigateSearchResults(1);

        }

    );

    explorer.searchInput?.addEventListener(

        "keydown",

        event=>{

            switch(event.key){

                case "ArrowDown":

                    event.preventDefault();

                    navigateSearchResults(+1);

                    break;

                case "ArrowUp":

                    event.preventDefault();

                    navigateSearchResults(-1);

                    break;

                case "Enter":

                    event.preventDefault();

                    if(explorer.searchMatches.length){

                        openSearchResult(

                            explorer.currentMatch < 0
                                ? 0
                                : explorer.currentMatch

                        );

                    }

                    break;

                case "Escape":

                    clearExplorerSearch();

                    break;

            }

        }

    );
        // -------------------------
    // Eventos del PDFViewer
    // -------------------------

    document.addEventListener(

        "pdf-search-results",

        event=>{

            explorer.searchMatches =

                Array.isArray(event.detail)
                    ? event.detail
                    : [];

            renderSearchResults(

                explorer.searchInput?.value || ""

            );

        }

    );

    document.addEventListener(

        "pdf-search-active",

        event=>{

            const activeId = event.detail?.id;

            if(activeId == null){

                return;

            }

            const index =

                explorer.searchMatches.findIndex(

                    item => item.id === activeId

                );

            if(index < 0){

                return;

            }

            explorer.currentMatch = index;

            updateActiveSearchCard();

        }

    );

}

// ================================
// CAMBIAR TAB
// ================================

function changeExplorerTab(view){

    explorer.activeTab = view;

    explorer.tabs.forEach(tab=>{

        tab.classList.toggle(

            "active",

            tab.dataset.view===view

        );

    });

    Object.entries(explorer.views)

        .forEach(([key,el])=>{

            if(!el) return;

            el.hidden =
                key!==view;

        });

    if(view==="search"){

        explorer.searchInput?.focus();

    }

}

// ================================
// INPUT BUSCADOR
// ================================

function handleExplorerSearch(){

    clearTimeout(

        explorer.searchTimer

    );

    explorer.searchTimer =

        setTimeout(

            performExplorerSearch,

            250

        );

}

// ================================
// LIMPIAR BUSCADOR
// ================================

function clearExplorerSearch(){

    explorer.searchInput.value = "";

    explorer.searchMatches = [];

    explorer.currentMatch = -1;

    // -------------------------
    // Limpiar resultados
    // -------------------------

    if(explorer.searchResults){

        explorer.searchResults.innerHTML = "";

    }

    if(explorer.searchList){

        explorer.searchList.innerHTML = "";

    }

    // -------------------------
    // Estado vacío
    // -------------------------

    if(explorer.searchEmpty){

        explorer.searchEmpty.hidden = false;

    }

    // -------------------------
    // Información
    // -------------------------

    if(explorer.searchInfo){

        explorer.searchInfo.textContent = "";

        explorer.searchInfo.className = "";

    }

    // -------------------------
    // Contador
    // -------------------------

    if(explorer.searchCounter){

        explorer.searchCounter.textContent = "0 resultados";

    }

    explorer.searchInput?.focus();

    explorer.searchResults

        ?.querySelectorAll(

            ".pdf-search-card"

        )

        .forEach(card=>{

            card.classList.remove("active");

            card.removeAttribute("aria-current");

        });

    if(viewer?.clearSearchHighlight){

        viewer.clearSearchHighlight();

    }

}

// ================================
// BUSCAR
// ================================

async function performExplorerSearch(){

    const query =
        explorer.searchInput
            ?.value
            ?.trim();

    if(!query){

        clearExplorerSearch();

        return;

    }

    if(!viewer){

        return;

    }

    explorer.searchInfo.className =
        "pdf-search-info-loading";

    explorer.searchInfo.innerHTML = `

        <span class="pdf-search-spinner"></span>

        Buscando...

    `;

    if(explorer.searchResults){

        explorer.searchResults.innerHTML = "";

    }

    if(explorer.searchList){

        explorer.searchList.innerHTML = "";

    }

    if(explorer.searchEmpty){

        explorer.searchEmpty.hidden = true;

    }

    explorer.searchMatches = [];

    explorer.currentMatch = -1;

    try{

        // La búsqueda ahora la controla PDFViewer.
        // Los resultados llegarán mediante el evento
        // "pdf-search-results".

        await viewer.searchText(query);

    }

    catch(error){

        console.error(error);

        explorer.searchInfo.className =
            "pdf-search-info-error";

        explorer.searchInfo.textContent =
            "No se pudo realizar la búsqueda.";

    }

}

// ================================
// RENDER SEARCH RESULTS
// ================================

function renderSearchResults(query){

    if(!explorer.searchList){

        return;

    }

    const matches = explorer.searchMatches;

    // -------------------------
    // Limpiar lista
    // -------------------------

    explorer.searchList.innerHTML = "";

    // -------------------------
    // Sin resultados
    // -------------------------

    if(!matches.length){

        if(explorer.searchInfo){

            explorer.searchInfo.className =
                "pdf-search-info-error";

            explorer.searchInfo.textContent =
                "No se encontraron coincidencias.";

        }

        if(explorer.searchCounter){

            explorer.searchCounter.textContent =
                "0 resultados";

        }

        if(explorer.searchEmpty){

            explorer.searchEmpty.hidden = false;

        }

        return;

    }

    // -------------------------
    // Hay resultados
    // -------------------------

    if(explorer.searchInfo){

        explorer.searchInfo.className =
            "pdf-search-info-success";

        explorer.searchInfo.textContent =
            `${matches.length} coincidencias encontradas`;

    }

    if(explorer.searchCounter){

        explorer.searchCounter.textContent =
            `${matches.length} resultados`;

    }

    if(explorer.searchEmpty){

        explorer.searchEmpty.hidden = true;

    }

    // -------------------------
    // Crear tarjetas
    // -------------------------

    const fragment =
        document.createDocumentFragment();

    matches.forEach((match,index)=>{

        const card =

            createSearchCard(

                match,

                query,

                index

            );

        fragment.appendChild(card);

    });

    explorer.searchList.appendChild(fragment);

    // -------------------------
    // Primer resultado activo
    // -------------------------

    explorer.currentMatch = 0;

    updateActiveSearchCard();

    explorer.searchInput?.focus();

}

// ================================
// CREAR TARJETA
// ================================

function createSearchCard(match,query,index){

    const card =
        document.createElement("button");

    card.type = "button";

    card.className =
        "pdf-search-card";

    card.dataset.index = index;

    card.innerHTML = `

        <div class="pdf-search-page">

            Página ${match.page}

        </div>

        <div class="pdf-search-snippet">

            ${highlightSearchText(

                match.preview,

                query

            )}

        </div>

    `;

    card.addEventListener(

        "click",

        ()=>{

            openSearchResult(index);

        }

    );

    return card;

}

// ================================
// ABRIR RESULTADO
// ================================

async function openSearchResult(index){

    const result =
        explorer.searchMatches[index];

    if(!result){

        return;

    }

    explorer.currentMatch = index;

    updateActiveSearchCard();

    try{

        if(viewer?.goToSearchResult){

            await viewer.goToSearchResult(result.id);

            return;

        }

        if(viewer?.scrollToPage){

            await viewer.scrollToPage(result.page);

        }

        if(viewer?.highlightSearchResult){

            viewer.highlightSearchResult(result);

        }

    }

    catch(error){

        console.error(

            "SEARCH NAVIGATION ERROR",

            error

        );

    }

}

// ================================
// TARJETA ACTIVA
// ================================

function updateActiveSearchCard(){

    if(!explorer.searchList){

        return;

    }

    explorer.searchList

        .querySelectorAll(

            ".pdf-search-card"

        )

        .forEach(card=>{

            card.classList.remove("active");

            card.removeAttribute("aria-current");

        });

    const active =

        explorer.searchList.querySelector(

            `[data-index="${explorer.currentMatch}"]`

        );

    if(!active){

        return;

    }

    active.classList.add("active");

    active.setAttribute(

        "aria-current",

        "true"

    );

    active.scrollIntoView({

        block:"nearest",

        behavior:"smooth"

    });

}

// ================================
// NAVEGACIÓN RESULTADOS
// ================================

function navigateSearchResults(direction){

    if(!explorer.searchMatches.length){

        return;

    }

    let index =
        explorer.currentMatch + direction;

    if(index < 0){

        index = 0;

    }

    if(index >= explorer.searchMatches.length){

        index = explorer.searchMatches.length - 1;

    }

    if(index === explorer.currentMatch){

        return;

    }

    openSearchResult(index);

}

// ================================
// SINCRONIZAR BUSCADOR
// ================================

function syncSearchWithCurrentPage(page){

    if(

        !explorer.searchMatches.length

    ){

        return;

    }

    const index =

        explorer.searchMatches.findIndex(

            match => match.page === page

        );

    if(index === -1){

        return;

    }

    if(index === explorer.currentMatch){

        return;

    }

    explorer.currentMatch = index;

    updateActiveSearchCard();

}

// ================================
// RESULTADO ACTUAL
// ================================

function setCurrentSearchResult(index){

    explorer.currentMatch = index;

    updateActiveSearchCard();

}

// ================================
// RESALTAR TEXTO
// ================================

function highlightSearchText(text,query){

    if(!text){

        return "";

    }

    const escaped =
        query.replace(

            /[.*+?^${}()|[\]\\]/g,

            "\\$&"

        );

    return text.replace(

        new RegExp(

            escaped,

            "ig"

        ),

        value =>

            `<span class="pdf-search-highlight">${value}</span>`

    );

}

function toggleExplorer(){

    if(!explorer.panel) return;

    explorerOpen
        ? closeExplorer()
        : openExplorer();

}

function openExplorer(){

    if(!explorer.panel) return;

    explorerOpen = true;

    if(viewer?.pdfDoc){

        renderExplorer();

    }

    explorer.panel.hidden = false;

    explorer.overlay.hidden = false;

    explorer.panel.setAttribute(
        "aria-hidden",
        "false"
    );

    requestAnimationFrame(()=>{

        explorer.panel.classList.add("visible");

        explorer.overlay?.classList.add("visible");

    });

}

function closeExplorer(){

    if(!explorer.panel) return;

    explorerOpen = false;

    explorer.panel.classList.remove("visible");

    explorer.overlay?.classList.remove("visible");

    setTimeout(()=>{

        explorer.panel.hidden = true;

        explorer.overlay.hidden = true;

        explorer.panel.setAttribute(
            "aria-hidden",
            "true"
        );

    },300);

}

// ================================
// 📋 RENDER EXPLORER
// ================================

function renderExplorer(){

    if(!viewer) return;

    updateExplorerInfo();

    renderTaskSteps();

}

// ================================
// 📋 RENDER TASK STEPS
// ================================

function renderTaskSteps(){

    if(!explorer.stepsView) return;

    const steps = viewer?.getTaskSteps?.() || [];

    if(!Array.isArray(steps)){

        console.warn("TaskSteps inválido:", steps);

        return;

    }

    explorer.stepsView.innerHTML = "";

    // ---------------------------------
    // Actualizar contador
    // ---------------------------------

    const counter = document.getElementById("stepsCount");

    if(counter){

        counter.textContent =
            `${steps.length} ${steps.length === 1 ? "paso" : "pasos"}`;

    }

    // ---------------------------------
    // Estado vacío
    // ---------------------------------

    if(!steps.length){

        explorer.stepsView.innerHTML = `

            <div class="explorer-empty">

                <div class="explorer-empty-icon">

                    📄

                </div>

                <h3>

                    No se encontraron pasos

                </h3>

                <p>

                    Este PET no contiene una sección
                    de pasos de la tarea reconocible.

                </p>

            </div>

        `;

        return;

    }

    // ---------------------------------
    // Ordenar pasos
    // ---------------------------------

    const orderedSteps = [...steps].sort(

        (a,b)=>a.step-b.step

    );

    // ---------------------------------
    // Crear fragmento
    // ---------------------------------

    const fragment = document.createDocumentFragment();

    orderedSteps.forEach((step,index)=>{

        const card = renderStepCard(step);

        // Animación escalonada

        card.style.animationDelay = `${index * 40}ms`;

        fragment.appendChild(card);

    });

    explorer.stepsView.appendChild(fragment);

}

// ================================
// 📄 STEP CARD (NUEVO DISEÑO)
// ================================

// ================================
// 📄 STEP CARD (CON SUBSECCIONES)
// ================================

function renderStepCard(step) {

    const card = document.createElement("button");
    card.className = "explorer-step";
    card.type = "button";
    card.dataset.step = step.step;
    card.dataset.page = step.page;
    card.dataset.id = step.id;

    // Verificar si tiene items/subsecciones
    const hasItems = step.items && step.items.length > 0;

    card.innerHTML = `

        <div class="explorer-step-header">

            <div class="explorer-step-number">
                ${step.step}
            </div>

            <div class="explorer-step-body">

                <div class="explorer-step-title">
                    ${step.title}
                </div>

                <div class="explorer-step-page">

                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true">

                        <path
                            d="M7 3H15L20 8V21H7V3Z"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linejoin="round"/>

                        <path
                            d="M15 3V8H20"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linejoin="round"/>

                    </svg>

                    Página ${step.page}

                </div>

            </div>

            <div class="explorer-step-arrow">

                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    class="arrow-icon">

                    <path
                        d="M9 6L15 12L9 18"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"/>

                </svg>

            </div>

        </div>

        ${hasItems ? `
            <div class="explorer-step-content" style="display: none;">

                <div class="explorer-step-items">

                    ${step.items.map((item, idx) => `
                        <div class="explorer-step-item">

                            <div class="explorer-item-number">${idx + 1}</div>

                            <div class="explorer-item-text">
                                ${escapeHtml(item.text)}
                            </div>

                            <div class="explorer-item-page">
                                Pág. ${item.page}
                            </div>

                        </div>
                    `).join('')}

                </div>

            </div>
        ` : ''}

    `;

    // EVENT: Click en el header para navegar
    const header = card.querySelector(".explorer-step-header");
    header.addEventListener("click", (e) => {
        e.stopPropagation();

        // Quitar selección anterior
        document
            .querySelectorAll(".explorer-step.active")
            .forEach(el => el.classList.remove("active"));

        // Seleccionar tarjeta
        card.classList.add("active");

        // Navegar al paso
        if (viewer?.goToTaskStep) {
            viewer.goToTaskStep(step.id);
        }
    });

    // EVENT: Click en la flecha para expandir/contraer
    if (hasItems) {
        const arrow = card.querySelector(".arrow-icon");
        const content = card.querySelector(".explorer-step-content");

        arrow.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();

            const isVisible = content.style.display !== "none";
            content.style.display = isVisible ? "none" : "block";

            // Rotar la flecha
            arrow.style.transform = isVisible ? "rotate(0deg)" : "rotate(90deg)";
        });
    }

    return card;
}

// ================================
// HELPER: Escapar HTML
// ================================

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ================================
// 📄 UPDATE EXPLORER INFO
// ================================

function updateExplorerInfo(){

    if(explorer.title){

        explorer.title.textContent =

            document.getElementById(

                "topBarPetName"

            )?.textContent || "PET";

    }

    if(explorer.subtitle){

        explorer.subtitle.textContent =

            document.getElementById(

                "topBarArea"

            )?.textContent || "";

    }

}

// ================================
// 🧹 CLEAR EXPLORER
// ================================

function clearExplorer(){

    explorer.stepsView?.replaceChildren();

    explorer.searchView?.replaceChildren();

    const counter = document.getElementById("stepsCount");

    if (counter) {

        counter.textContent = "0 pasos";

    }

    if(explorer.title){

        explorer.title.textContent = "Sin documento";

    }

    if(explorer.subtitle){

        explorer.subtitle.textContent = "";

    }

}

// ================================
// 📱 MOBILE SIDEBAR
// ================================

function initializeMobileSidebar() {

    const sidebarEl  = document.getElementById("sidebar");
    const menuButton = document.getElementById("mobileMenuBtn");
    const closeBtn   = document.getElementById("closeSidebarBtn");
    const overlay    = document.getElementById("sidebarOverlay");

    if (!sidebarEl) return;

    function openSidebar() {
        sidebarEl.classList.add("mobile-open");
        overlay?.classList.add("visible");
        menuButton?.setAttribute("aria-expanded", "true");
    }

    function closeSidebar() {
        sidebarEl.classList.remove("mobile-open");
        overlay?.classList.remove("visible");
        menuButton?.setAttribute("aria-expanded", "false");
    }

    menuButton?.addEventListener("click", openSidebar);
    closeBtn?.addEventListener("click",   closeSidebar);
    overlay?.addEventListener("click",    closeSidebar);

    sidebarEl.addEventListener("click", e => {
        if (!isMobile) return;
        if (e.target.classList.contains("area-btn")) {
            setTimeout(closeSidebar, 180);
        }
    });
}

// ================================
// 📄 OPEN PDF
// ================================

async function openPDF(path, petName, areaName) {

    try {

        if (loading && currentPath === path) return;

        loading     = true;
        currentPath = path;

        hideFatalError?.();
        clearExplorer();
        clearExplorerSearch();

        viewer?.destroy?.();       // si existe
        viewer?.clear?.();         // si existe

        const container = document.getElementById("pdfContainer");
        if (container) {
            container.innerHTML = "";
        }

        toggleEmptyState(false);
        togglePDFSplash(true);
        //showLoading("Cargando PDF...");

        updateTopBar(petName, areaName);

        const pdfUrl = await buildPDFUrl(path);
        await viewer.load(pdfUrl);

        // ==========================
        // ACTUALIZAR EXPLORADOR
        // ==========================

        renderExplorer();

        togglePDFSplash(false);
        //hideLoading();

    } catch (error) {

        console.error("❌ PDF ERROR:", error);
        togglePDFSplash(false);
        //hideLoading();

        // Reintento automático si URL expiró
        if (error?.message?.includes("expired") || error?.status === 400) {
            try {
                const freshUrl = await buildPDFUrl(path);
                await viewer.load(freshUrl);
                togglePDFSplash(false);
                return;
            } catch (e2) {
                console.error("❌ RETRY ERROR:", e2);
            }
        }

        clearExplorer();

        viewer?.destroy?.();
        viewer?.clear?.();

        const container = document.getElementById("pdfContainer");
        if (container) {
            container.innerHTML = "";
        }

        showFatalError("No se pudo abrir el PDF", path);

    } finally {
        loading = false;
    }
}

// ================================
// 📍 TASK SELECTION
// ================================

async function handleTaskSelection(taskId){

    if(!viewer){

        return;

    }

    try{

        await viewer.scrollToTask(taskId);

    }

    catch(error){

        console.error(

            "TASK NAVIGATION ERROR",

            error

        );

    }

}

// ================================
// 🔝 TOP BAR
// ================================

function updateTopBar(petName, areaName) {
    const nameEl = document.getElementById("topBarPetName");
    const areaEl = document.getElementById("topBarArea");
    if (nameEl) nameEl.textContent = petName  || "PET";
    if (areaEl) areaEl.textContent = areaName || "";
}

// ================================
// 📄 ESTADO VACÍO
// ================================

function toggleEmptyState(show) {
    document.getElementById("emptyState")?.classList.toggle("hidden", !show);
}

// ================================
// 🔢 NAVEGACIÓN DE PÁGINAS
// ================================

function initializePageNav() {

    const prevBtn   = document.getElementById("prevPage");
    const nextBtn   = document.getElementById("nextPage");
    const pageInput = document.getElementById("pageInput");
    
    function goToPage() {

        if (!viewer?.pdfDoc) return;

        const val = parseInt(pageInput.value, 10);

        if (
            !isNaN(val) &&
            val >= 1 &&
            val <= viewer.pdfDoc.numPages
        ) {
            viewer.scrollToPage(val);
        }
        else {
            pageInput.value = viewer.currentPage;
        }
    }

    prevBtn?.addEventListener("click", () => {
        if (!viewer?.pdfDoc) return;
        viewer.scrollToPage(viewer.currentPage - 1);
    });

    nextBtn?.addEventListener("click", () => {
        if (!viewer?.pdfDoc) return;
        viewer.scrollToPage(viewer.currentPage + 1);
    });

    pageInput?.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            goToPage();
        }
    });

    pageInput?.addEventListener("change", goToPage);

    pageInput?.addEventListener("blur", () => {

        if (!viewer?.pdfDoc)
            return;

        pageInput.value = viewer.currentPage;
    });
}

// ================================
// 🔢 UI DE PÁGINAS
// ================================

function updatePageUI(currentPage, totalPages) {
    const pageInput = document.getElementById("pageInput");
    const pageTotal = document.getElementById("pageTotal");
    const prevBtn   = document.getElementById("prevPage");
    const nextBtn   = document.getElementById("nextPage");

    if (pageInput) pageInput.value        = currentPage;
    if (pageTotal) pageTotal.textContent  = totalPages;
    if (prevBtn)   prevBtn.disabled       = currentPage <= 1;
    if (nextBtn)   nextBtn.disabled       = currentPage >= totalPages;
}

// ================================
// 🔐 SUPABASE
// ================================

function createSupabaseClient(url, key) {
    supabase = createClient(url, key);
}

async function loadConfig() {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error("No se pudo cargar config");
    return r.json();
}

// ================================
// ⏳ SPLASH LOADER
// ================================

function togglePDFSplash(show) {
    document.getElementById("pdfSplashLoader")
        ?.classList.toggle("show", show);
}

// ================================
// 🔗 SIGNED URL
// ================================

async function buildPDFUrl(path) {
    const { data, error } = await supabase
        .storage
        .from(config.bucket || "pets")
        .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
}

// ================================
// ⌨️ KEYBOARD
// ================================

function initializeKeyboard() {

    document.addEventListener("keydown", e => {

        const key = e.key;

        // Bloquear guardado e impresión
        if (e.ctrlKey && (key === "s" || key === "p")) {
            e.preventDefault();
            return;
        }

        // Zoom teclado — delegar a ZoomManager
        if (e.ctrlKey) {
            if (key === "+" || key === "=") {
                e.preventDefault();
                zoom?.step(+1);
            }
            if (key === "-") {
                e.preventDefault();
                zoom?.step(-1);
            }
            if (key === "0") {
                e.preventDefault();
                zoom?.zoomTo(1);
            }
            return;
        }

        // Flechas → páginas (solo si el foco no está en un input)
        if (document.activeElement?.tagName === "INPUT") return;

        if (key === "ArrowRight" || key === "ArrowDown") {
            viewer?.scrollToPage((viewer.currentPage || 0) + 1);
        }
        if (key === "ArrowLeft" || key === "ArrowUp") {
            viewer?.scrollToPage((viewer.currentPage || 0) - 1);
        }
    });
}

// ================================
// 📐 RESIZE
// ================================

function initializeResize() {

    let t = null;

    window.addEventListener("resize", () => {

        clearTimeout(t);
        isMobile = window.matchMedia("(max-width: 900px)").matches;

        const active = document.activeElement;

        if (
            active &&
            (
                active.id === "pageInput" ||
                active.tagName === "INPUT"
            )
        ){
            return;
        }

        t = setTimeout(() => {
            if (!viewer || !zoom) return;
            // Si estamos en modo fit, recalcular; si no, re-renderizar al zoom actual.
            // force=true → re-renderiza para reajustar nitidez aunque la escala sea igual.
            if (zoom.isFitMode) {
                zoom._calcFitScale().then(s => s && zoom.zoomTo(s));
            } else {
                viewer.setScale(zoom.targetZoom, null, true);
            }
        }, 280);

    }, { passive: true });
}

// ================================
// 👁️ VISIBILITY (renovar URL si expiró)
// ================================

function initializeVisibility() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (currentPath && viewer?.pdfDoc) {
            const age = Date.now() - (viewer.loadedAt || 0);
            if (age > 50 * 60 * 1000) {
                console.log("🔄 Renovando URL firmada...");
                if(currentPath){

                    buildPDFUrl(currentPath);

                }
            }
        }
    });
}

// ================================
// 🌐 ONLINE STATUS
// ================================

function initializeOnlineStatus() {
    window.addEventListener("offline", () => showLoading("Sin conexión"));
    window.addEventListener("online",  () => hideLoading());
}

/* // ================================
// ⏳ LOADING OVERLAY
// ================================

function showLoading(text) {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loadingOverlay";
        overlay.innerHTML = `<div class="loader"></div><div class="loading-text">${text}</div>`;
        document.body.appendChild(overlay);
    }
    const el = overlay.querySelector(".loading-text");
    if (el) el.textContent = text;
    overlay.classList.add("show");
}

function hideLoading() {
    document.getElementById("loadingOverlay")?.classList.remove("show");
} */

// ================================
// 🚨 ERROR UI
// ================================

function showFatalError(message, retryPath) {

    let overlay = document.getElementById("errorOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "errorOverlay";
        overlay.style.cssText =
            "position:absolute;inset:0;z-index:600;display:flex;align-items:center;justify-content:center;";
        document.getElementById("viewerContainer")?.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="fatal-error">
            <div class="fatal-error-icon">⚠️</div>
            <div class="fatal-error-title">${message}</div>
            <div class="fatal-error-message">Verifica tu conexión o intenta con otro PET.</div>
            ${retryPath ? `<button class="fatal-error-retry" onclick="window.__retryPDF()">Reintentar</button>` : ""}
        </div>`;

    if (retryPath) {
        window.__retryPDF = () => {
            overlay.remove();
            currentPath = null;
            openPDF(retryPath);
        };
    }
}

function hideFatalError() {

    const overlay = document.getElementById("errorOverlay");

    if (overlay) {
        overlay.remove();
    }

    window.__retryPDF = null;

}

// ================================
// WATERMARK
// ================================

function createWatermarkOverlay(){

    const overlay =
        document.getElementById(
            "pdfWatermarkOverlay"
        );

    if(!overlay) return;

    let html =
        `<div class="watermark-grid">`;

    for(let i = 0; i < 80; i++){

        html +=
            `<span>PROHIBIDO COMPARTIR</span>`;
    }
    html += `</div>`;

    overlay.innerHTML = html;
}

// ================================
// EXTRACT PDF VERSION
// ================================

async function extractPdfVersion(pdfUrl){

    try{

        const pdf =
            await pdfjsLib
                .getDocument(pdfUrl)
                .promise;

        const page =
            await pdf.getPage(1);

        const content =
            await page.getTextContent();

        const text =
            content.items
                .map(i => i.str)
                .join(" ");

        const match =
            text.match(
                /Versi[oó]n\s*N[°º]?\s*:?\s*(\d+)/i
            );

        return match
            ? match[1].padStart(2,"0")
            : null;

    }catch(err){

        console.error(
            "VERSION ERROR",
            err
        );

        return null;
    }
}

// ================================
// 🔒 BLOQUEAR MENÚ CONTEXTUAL
// ================================

document.addEventListener("contextmenu", e => e.preventDefault());

// ================================
// 🌍 DEBUG
// ================================

window.app = {
    getViewer()   { return viewer;   },
    getZoom()     { return zoom;     },
    getSidebar()  { return sidebar;  },
    getSupabase() { return supabase; }
};