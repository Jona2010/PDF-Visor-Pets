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

        showLoading("Iniciando visor...");

        pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";

        config = await loadConfig();

        createSupabaseClient(config.supabaseUrl, config.supabaseKey);

        const viewerContainer = document.getElementById("viewerContainer");
        const pdfViewerEl     = document.getElementById("pdfViewer");

        if (!viewerContainer || !pdfViewerEl) {
            throw new Error("Estructura HTML inválida");
        }

        viewer = new PDFViewer({
            container:    viewerContainer,
            viewer:       pdfViewerEl,
            onPageChange: updatePageUI
        });

        // ZoomManager registra sus propios listeners de wheel y botones
        zoom = new ZoomManager({ viewer });

        sidebar = new Sidebar({ config, onOpenPDF: openPDF });

        initializeKeyboard();
        initializeResize();
        initializeVisibility();
        initializeOnlineStatus();
        initializeMobileSidebar();
        initializePageNav();

        console.log("✅ APP READY");
        hideLoading();

    } catch (error) {
        console.error("❌ INIT ERROR:", error);
        showFatalError("No se pudo iniciar el visor", null);
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

        toggleEmptyState(false);
        togglePDFSplash(true);
        showLoading("Cargando PDF...");

        updateTopBar(petName, areaName);

        const pdfUrl = await buildPDFUrl(path);
        await viewer.load(pdfUrl);

        togglePDFSplash(false);
        hideLoading();

    } catch (error) {

        console.error("❌ PDF ERROR:", error);
        togglePDFSplash(false);
        hideLoading();

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

        showFatalError("No se pudo abrir el PDF", path);

    } finally {
        loading = false;
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
            // Si estamos en modo fit, recalcular; si no, re-renderizar al zoom actual
            if (zoom.isFitMode) {
                zoom._calcFitScale().then(s => s && zoom.zoomTo(s));
            } else {
                viewer.setScale(zoom.targetZoom);
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

// ================================
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
}

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
