export class PDFViewer {

    constructor({ container, viewer, onPageChange }) {

        this.container    = container;
        this.viewer       = viewer;
        this.onPageChange = onPageChange || null;

        this.pdfDoc     = null;
        this.scale      = 1;
        this.prevScale  = 1;   // escala anterior — para anclar el zoom al cursor
        this.pixelRatio = window.devicePixelRatio || 1;

        // Flag para suprimir el observer de render mientras el zoom anima
        this._zooming = false;

        this.currentPage = 1;
        this.loadedAt    = null;

        // ================================
        // 🔎 SEARCH ENGINE
        // ================================

        this.searchIndex = [];
        this.searchMatches = [];
        this.currentMatch = -1;

        // Coincidencia actualmente seleccionada
        this.activeSearchLocation = -1;

        // Total de coincidencias encontradas
        this.totalSearchLocations = 0;
        this.searchQuery = "";
        this.searchReady = false;

        // Texto por página
        this.pageTextCache = new Map();

        // Timer del buscador
        this.searchDebounce = null;

        // ================================
        // HIGHLIGHT ENGINE
        // ================================

        // (Reservado para el motor de resaltado basado en coordenadas)

        // ================================
        // ÍNDICE ESPACIAL DEL PDF
        // ================================

        // Coordenadas de todos los fragmentos de texto
        this.textCoordinates = new Map();

        // Fragmentos organizados por página
        this.pageTextFragments = new Map();

        // Coincidencias localizadas dentro del PDF
        this.searchLocations = [];

        // Capas HTML de resaltado por página
        this.highlightLayers = new Map();

        this.outlineTaskSteps = [];

        // ================================
        // 📚 SECCIONES DEL PET
        // ================================

        this.sections = {};

        this.procedureBlock = null;

        this.procedureType = null;

         // =====================================================
        // DOCUMENT OUTLINE ENGINE (V2)
        // =====================================================

        // Fragmentos originales pertenecientes al procedimiento
        this.outlineFragments = [];

        // Líneas reconstruidas del procedimiento
        this.outlineLines = [];

        // Árbol completo del documento
        this.outline = [];

        // Árbol jerárquico
        this.outlineTree = [];

        // Índice rápido
        this.outlineIndex = new Map();

        // Coordenadas físicas
        this.outlineLocations = new Map();

        // Rango del procedimiento
        this.outlineRange = {

            startPage: null,
            endPage: null,

            startIndex: null,
            endIndex: null

        };

        // Estilos detectados
        this.headingStyles = {

            normalSize:0,

            headingSize:0,

            boldFonts:new Set()

        };

        // Estadísticas
        this.outlineStats = {

            totalFragments:0,

            totalHeadings:0,

            totalLevels:0

        };

        // Pasos detectados
        this.taskSteps = [];

        // Índice rápido de encabezados
        this.taskMap = new Map();

        // Árbol jerárquico de procedimientos
        this.taskTree = [];

        // =====================================
        // SINCRONIZACIÓN CON EL SIDEBAR
        // =====================================

        // Referencia al Sidebar
        this.sidebar = null;

        // Nodo actualmente activo
        this.currentTaskNode = null;

        // Ubicación física de cada encabezado
        // id -> { page, x, y, title }
        this.taskLocations = new Map();

        // Evita emitir el mismo evento varias veces
        this.lastVisibleTask = null;

        // ================================================
        // CALLBACK DE SINCRONIZACIÓN CON EL SIDEBAR
        // ================================================

        this.onCurrentTaskChange = null;

        // Callback opcional cuando cambia el paso
        this.onTaskChange = null;
        
        // ── PAGE CACHE ──
        this.pages = [];

        // ── RENDER TASKS ──
        this.renderTasks = new Map();
        this.zoomTimeout = null;

        // ── OBSERVERS ──
        this.observer     = null;
        this.pageObserver = null;

        // Flag para suprimir el observer durante scroll programático
        this._scrolling = false;
        this._scrollEnd = null;

        this.initializeSearchShortcuts();
        this.initializeObserver();
        this.initializePageObserver();
    }

    // ================================
    // 👀 LAZY RENDER OBSERVER
    // ================================

    initializeObserver() {
        this.observer = new IntersectionObserver(
            entries => {
                if (!this.pdfDoc) return;
                if (this.pages.length === 0) return;
                if (this._zooming) return;   // no renderizar con escala vieja durante el gesto
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const pageNum = Number(entry.target.dataset.page);
                        this.renderVisiblePage(pageNum);
                    }
                });
            },
            {
                root:       this.container,
                rootMargin: "1200px 0px",
                threshold:  0
            }
        );
    }

    // ================================
    // 👀 PAGE TRACKING OBSERVER
    // ── FIX: ignorar disparos mientras
    //    _scrolling = true (scroll programático)
    // ================================

    initializePageObserver() {
        this.pageObserver = new IntersectionObserver(
            entries => {

                // Ignorar completamente si estamos en scroll programático o en zoom
                if (this._scrolling) return;
                if (this._zooming) return;

                let bestPage = null;
                let bestRatio = 0;

                this.pages.forEach(pageData => {

                    const rect =
                        pageData.pageDiv.getBoundingClientRect();

                    const visibleHeight =
                        Math.min(rect.bottom, window.innerHeight) -
                        Math.max(rect.top, 0);

                    const ratio =
                        visibleHeight / rect.height;

                    if (ratio > bestRatio) {

                        bestRatio = ratio;
                        bestPage = pageData.pageNum;

                    }

                });

                if (
                    bestPage &&
                    bestPage !== this.currentPage
                ) {

                    this.currentPage = bestPage;

                    this.onPageChange?.(
                        bestPage,
                        this.pdfDoc?.numPages || 0
                    );

                }
            },
            {
                root:      this.container,
                threshold: [0.15, 0.30, 0.45, 0.60]
            }
        );
    }

    // ================================
    // 📄 LOAD PDF
    // ================================

    async load(url) {
        try {

            this.destroy();

            const loadingTask = pdfjsLib.getDocument({
                url,
                withCredentials: false
            });

            // ✅ Guardar la referencia para poder cancelarla después
            this.loadingTask = loadingTask;

            this.pdfDoc = await loadingTask.promise;

             // ✅ La carga terminó correctamente, ya no hace falta conservarla
            this.loadingTask = null;

            await this.buildTextIndex();

            // ================================
            // MOTOR ACTUAL
            // ================================
            this.extractProcedureBlock();

            this.normalizeProcedureBlock();

            this.detectProcedureType();

            this.parseProcedureBlock();

            // ================================
            // NUEVO DOCUMENT OUTLINE ENGINE
            // ================================
            this.extractProcedureRange();

            this.mergeFragmentsIntoLines();

            this.detectHeadingStyles();

            this.detectOutlineHeadings();

            this.buildOutlineTree();

            this.exportOutlineTasks();
            // DEBUG: Ver qué pasos se extrajeron
            console.log("🔍 DEBUG - Pasos extraídos:", this.taskSteps.length);
            if (this.taskSteps.length > 0) {
                console.log("📋 Primeros pasos:");
                console.table(this.taskSteps.slice(0, 5).map(s => ({
                    id: s.id,
                    title: s.title.substring(0, 50),
                    page: s.page,
                    items: s.items?.length || 0
                })));
            } else {
                console.warn("⚠️ No se extrajeron pasos");
            }

            this.debugSearchIndex();

            this.loadedAt = Date.now();

            // Crear placeholders en paralelo
            await Promise.all(
                Array.from(
                    { length: this.pdfDoc.numPages },
                    (_, i) => this.createPage(i + 1)
                )
            );

            this.currentPage = 1;
            this.onPageChange?.(1, this.pdfDoc.numPages);

            requestAnimationFrame(() => {
                const firstPage = this.pages[0];
                if (firstPage) {
                    this.renderVisiblePage(1);
                }
            });

        } catch (error) {

            // También limpiar la referencia si falla
            this.loadingTask = null;

            console.error("❌ PDF LOAD ERROR:", error);
            throw error;
        }
    }

    // ================================
    // 🏗️ CREATE PAGE PLACEHOLDER
    // ================================

    async createPage(pageNum) {

        const page     = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });

        const pageDiv = document.createElement("div");
        pageDiv.className            = "pdf-page";
        pageDiv.dataset.page         = pageNum;
        pageDiv.style.animationDelay = `${Math.min(pageNum * 30, 300)}ms`;

        const loadingLayer = document.createElement("div");
        loadingLayer.className = "page-loader";
        loadingLayer.innerHTML = `
            <div class="page-loader-spinner"></div>
            <div class="page-loader-text">Página ${pageNum}</div>
        `;
        pageDiv.appendChild(loadingLayer);

        pageDiv.style.width =
            `${viewport.width}px`;

        pageDiv.style.height =
            `${viewport.height}px`;

        pageDiv.style.minWidth = "0";
        pageDiv.style.minHeight = "0";

        const canvas = document.createElement("canvas");

        canvas.style.opacity = "0";
        //canvas.style.transition = "opacity .25s ease";

        canvas.style.width  = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        pageDiv.appendChild(canvas);

        const highlightLayer = document.createElement("div");

        highlightLayer.className = "page-highlight-layer";

        pageDiv.appendChild(highlightLayer);

        this.highlightLayers.set(
            pageNum,
            highlightLayer
        );

        // ===============================
        // MARCA DE AGUA POR PÁGINA
        // ===============================

        const watermark =
            document.createElement("div");

        watermark.className =
            "page-watermark";

        let html = "";

        for(let i = 0; i < 50; i++){

            html +=
                "<span>PROHIBIDO COMPARTIR</span>";
        }

        watermark.innerHTML =
        `
        <div class="page-watermark-grid">
            ${html}
        </div>
        `;

        pageDiv.appendChild(watermark);

        this.viewer.appendChild(pageDiv);

        this.pages.push({
            pageNum,
            page,
            pageDiv,
            canvas,
            rendered:     false,
            rendering:    false,
            currentScale: this.scale
        });

        this.observer.observe(pageDiv);
        this.pageObserver.observe(pageDiv);
    }

    // ================================
    // 👀 RENDER VISIBLE PAGE
    // ================================

    async renderVisiblePage(pageNum) {

        const pageData = this.pages[pageNum - 1];
        if (!pageData) return;

        if (pageData.rendered && pageData.currentScale === this.scale) return;
        if (
            pageData.rendering &&
            pageData.currentScale === this.scale
        ) {
            return;
        }

        pageData.rendering = true;

        const { page, pageDiv, canvas } = pageData;

        try {
            const viewport = page.getViewport({ scale: this.scale });

            const renderScale = window.innerWidth <= 768
                ? Math.min(2.5, this.pixelRatio * 1.8)
                : Math.min(3,   this.pixelRatio * 2);

            const realWidth  = Math.max(1, Math.floor(viewport.width  * renderScale));
            const realHeight = Math.max(1, Math.floor(viewport.height * renderScale));

            const tempCanvas = document.createElement("canvas");
            const tempCtx    = tempCanvas.getContext("2d", { alpha: false });

            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = "high";
            tempCanvas.width  = realWidth;
            tempCanvas.height = realHeight;
            tempCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

            const renderTask = page.render({ canvasContext: tempCtx, viewport });
            this.renderTasks.set(pageNum, renderTask);
            await renderTask.promise;

            const newCanvas = document.createElement("canvas");
            newCanvas.width  = realWidth;
            newCanvas.height = realHeight;
            newCanvas.style.opacity    = "1";
            //newCanvas.style.transition = "opacity .25s ease";
            newCanvas.style.width      = "100%";
            newCanvas.style.height     = "100%";
            newCanvas.style.position   = "absolute";
            newCanvas.style.inset      = "0";

            const newCtx = newCanvas.getContext("2d", { alpha: false });

            newCtx.drawImage(tempCanvas, 0, 0);

            // =====================================
            // MARCA DE AGUA REPETIDA
            // =====================================

            /* newCtx.save();

            newCtx.rotate(-Math.PI / 6);

            const watermarkText =
                "PROHIBIDO COMPARTIR";

            const watermarkFontSize = 70;

            newCtx.font =
                `bold ${watermarkFontSize}px Arial`;

            newCtx.fillStyle =
                "rgba(184,134,11,0.13)";

            const spacingY = 260;

            const spacingX = 500;

            for(let y = -realHeight; y < realHeight * 2; y += spacingY){

                for(let x = -realWidth; x < realWidth * 2; x += spacingX){

                    newCtx.fillText(
                        watermarkText,
                        x,
                        y
                    );
                }
            }

            newCtx.restore(); */

            pageDiv.style.width  = `${viewport.width}px`;
            pageDiv.style.height = `${viewport.height}px`;
            pageDiv.querySelectorAll("canvas").forEach(c => c.remove());
            pageDiv.appendChild(newCanvas);

            //requestAnimationFrame(() => { newCanvas.style.opacity = "1"; });

            const loader = pageDiv.querySelector(".page-loader");
            if (loader) loader.classList.add("hide");

            requestAnimationFrame(() => {

                if (canvas.parentNode)
                    canvas.remove();

            });

            if(this.searchLocations.length){

                requestAnimationFrame(() => {

                    if(pageData.rendered){

                        this.renderPageHighlights(pageNum);

                    }

                });

            }

            pageData.rendered     = true;
            pageData.currentScale = this.scale;

        } catch (error) {
            if (error?.name !== "RenderingCancelledException") {
                console.error(`❌ PAGE ${pageNum}`, error);
            }
        } finally {
            pageData.rendering = false;
        }
    }

    // ================================
    // 🔍 SET SCALE
    //
    // Reescrito: devuelve una promesa que resuelve cuando las
    // páginas visibles están pintadas a la nueva escala.
    //
    // `anchor` (opcional) = { clientX, clientY } — punto de la
    // pantalla que debe quedar FIJO tras el cambio de escala
    // (típicamente la posición del cursor en el wheel-zoom).
    // Si no se pasa, se usa el centro del contenedor.
    // ================================

    // ================================
    // 🔍 SET SCALE
    //
    // REESCRITO para eliminar el doble escalado (causa del temblor):
    //
    //   _commitGeometry()  → SÍNCRONO. Redimensiona los pageDiv y
    //                        ajusta el scroll EN EL MISMO FRAME. El
    //                        llamador (zoom.js) quita el transform
    //                        justo después, sin ventana intermedia.
    //
    //   _renderVisible()   → ASYNC. Repinta los canvas a nitidez real.
    //                        Invisible: las páginas ya están al tamaño
    //                        correcto; el bitmap viejo se ve estirado
    //                        una fracción de segundo (como Acrobat).
    // ================================

    // Cambia la geometría de forma síncrona y devuelve sin esperar render.
    // Devuelve true si hubo cambio real de escala.
    _commitGeometry(newScale, anchor = null, force = false) {

        if (!this.pdfDoc) return false;

        this.prevScale = this.scale;
        this.scale = Math.max(0.35, Math.min(newScale, 5));

        if (this.scale === this.prevScale && !force) return false;

        // Cancelar renders en vuelo (quedaron a la escala vieja)
        for (const task of this.renderTasks.values()) {
            try { task.cancel(); } catch {}
        }
        this.renderTasks.clear();
        clearTimeout(this.zoomTimeout);

        // ── Punto de anclaje ANTES de cambiar geometría ──
        const containerRect = this.container.getBoundingClientRect();
        const anchorX = anchor ? anchor.clientX - containerRect.left
                               : this.container.clientWidth / 2;
        const anchorY = anchor ? anchor.clientY - containerRect.top
                               : this.container.clientHeight / 2;

        const contentX =
            this.container.scrollLeft + anchorX;

        const contentY =
            this.container.scrollTop + anchorY;

        const ratio =
            this.scale / this.prevScale;

        // 1. Redimensionar TODOS los pageDiv (síncrono)
        this.pages.forEach(pageData => {

            pageData.rendered = false;

            const viewport =
                pageData.page.getViewport({
                    scale: this.scale
                });

            pageData.pageDiv.style.width =
                `${viewport.width}px`;

            pageData.pageDiv.style.height =
                `${viewport.height}px`;

            pageData.pageDiv.style.minWidth = "0";
            pageData.pageDiv.style.minHeight = "0";
        });

        // 2. Compensar scroll para conservar el punto anclado (síncrono, mismo frame)
        if (anchor) {

            this.container.scrollLeft =
                (contentX * ratio) - anchorX;

            this.container.scrollTop =
                (contentY * ratio) - anchorY;
        }

        return true;
    }

    // Repinta las páginas visibles a nitidez real. Async, fuera del frame crítico.
    async _renderVisible() {
        const renderJobs = [];
        this.pages.forEach(pageData => {
            const rect = pageData.pageDiv.getBoundingClientRect();
            const visible = rect.bottom >= -800 &&
                            rect.top <= window.innerHeight + 800;
            if (visible) {
                renderJobs.push(this.renderVisiblePage(pageData.pageNum));
            }
        });
        await Promise.allSettled(renderJobs);

        if(this.searchLocations.length){

            this.renderHighlights();

        }

        const current =

            this.getCurrentSearchMatch();

        if(current){

            this.scrollToSearchMatch(
                current
            );

        }
    }

    // API antigua conservada para compatibilidad (resize, etc.):
    // hace el commit síncrono y luego el render async.
    async setScale(newScale, anchor = null, force = false) {
        const changed = this._commitGeometry(newScale, anchor, force);
        if (!changed) return;
        await this._renderVisible();
    }

    // ================================================
    // EVENTO DE CAMBIO DE BÚSQUEDA
    // ================================================

    notifySearchChanged(){

        const status =

            this.getSearchStatus();

        document.dispatchEvent(

            new CustomEvent(

                "pdf-search-change",

                {

                    detail:status

                }

            )

        );

    }

    // ================================================
    // ATAJOS DEL BUSCADOR
    // ================================================

    initializeSearchShortcuts(){

        document.addEventListener(
            "keydown",

            e=>{

                if(
                    e.key !== "Enter"
                ){

                    return;

                }

                const input =

                    document.activeElement;

                if(
                    !input ||
                    input.tagName !== "INPUT"
                ){

                    return;

                }

                if(e.shiftKey){

                    this.previousSearchMatch();

                }

                else{

                    this.nextSearchMatch();

                }

                e.preventDefault();

            }

        );

    }

    // ================================
    // 📐 FIT TO WIDTH
    // ================================

    async fitToWidth() {
        if (!this.pdfDoc) return;
        try {
            const page      = await this.pdfDoc.getPage(1);
            const viewport  = page.getViewport({ scale: 1 });
            const padding = window.innerWidth <= 768 ? 10 : 160;
            const available = (this.container.clientWidth || window.innerWidth) - padding;
            const fitScale  = available / viewport.width;

            const zoomLabel = document.getElementById("zoomLabel");
            if (zoomLabel) zoomLabel.textContent = `${Math.round(fitScale * 100)}%`;

            const pdfViewerEl = document.getElementById("pdfViewer");
            /* if (pdfViewerEl) {
                pdfViewerEl.style.transform       = `scale(${fitScale})`;
                pdfViewerEl.style.transformOrigin = "top center";
            } */

            await this.setScale(fitScale);

            if (window.app?.getZoom()) {
                window.app.getZoom().zoom = fitScale;
            }
        } catch (error) {
            console.error("❌ FIT WIDTH ERROR:", error);
        }
    }

    // ================================
    // 📄 SCROLL TO PAGE
    // ── FIX: activar flag _scrolling para
    //    suprimir el pageObserver durante el
    //    scroll, evitando el doble disparo.
    // ================================

    scrollToPage(pageNum) {

        if (!this.pdfDoc) return;

        const total  = this.pdfDoc.numPages;
        const target = Math.max(1, Math.min(pageNum, total));

        const pageData = this.pages[target - 1];
        if (!pageData) return;

        // 1. Actualizar estado y UI INMEDIATAMENTE (sin esperar al observer)
        this.currentPage = target;
        this.onPageChange?.(target, total);

        // 2. Suprimir pageObserver durante el scroll animado
        this._scrolling = true;
        clearTimeout(this._scrollEnd);

        // 3. Hacer el scroll
        const targetTop =
            pageData.pageDiv.offsetTop;

        this.container.scrollTo({
            top: targetTop,
            behavior: "smooth"
        });

        // 4. Reactivar pageObserver cuando el scroll termine (~600ms)
        //    El browser no emite un evento "scrollend" fiable en todos los browsers,
        //    así que usamos un timeout generoso.
        this._scrollEnd = setTimeout(() => {
            this._scrolling = false;
        }, 1200);
    }

    // ================================================
    // 📍 IR A UN PASO DEL PROCEDIMIENTO
    // ================================================
    async scrollToTask(taskId) {

        const location =
            this.taskLocations.get(taskId);

        if (!location) {

            console.warn(
                "Task no encontrado:",
                taskId
            );

            return false;

        }

        const pageData =
            this.pages[location.page - 1];

        if (!pageData) {

            return false;

        }

        await this.renderVisiblePage(
            location.page
        );

        const viewport =
            pageData.page.getViewport({
                scale: this.scale
            });

        let targetTop =
            pageData.pageDiv.offsetTop;

        if (
            location.x !== null &&
            location.y !== null
        ) {

            const [, top] =
                viewport.convertToViewportPoint(
                    location.x,
                    location.y
                );

            targetTop += top - 100;

        }

        this.currentPage =
            location.page;

        this.onPageChange?.(
            location.page,
            this.pdfDoc.numPages
        );

        this.currentTaskNode =
            taskId;

        this._scrolling = true;

        clearTimeout(
            this._scrollEnd
        );

        this.container.scrollTo({

            top: Math.max(0, targetTop),

            behavior: "smooth"

        });

        this._scrollEnd =
            setTimeout(() => {

                this._scrolling = false;

            }, 900);

        return true;

    }

    // ================================================
    // OBTENER UBICACIÓN DE UN PASO
    // ================================================
    getTaskLocation(taskId) {

        return this.taskLocations.get(taskId) || null;

    }

    // ================================================
    // VERIFICAR SI EXISTE UN PASO
    // ================================================
    hasTask(taskId) {

        return this.taskLocations.has(taskId);

    }

    // ================================================
    // ESTABLECER CALLBACK DE TASK ACTUAL
    // ================================================

    setCurrentTaskListener(callback){

        this.onCurrentTaskChange = callback;

    }

    // ================================================
    // NOTIFICAR CAMBIO DE PROCEDIMIENTO ACTUAL
    // ================================================

    notifyCurrentTask(taskId){

        // Evitar emitir el mismo procedimiento varias veces
        if(this.lastVisibleTask === taskId){

            return;

        }

        this.lastVisibleTask = taskId;

        this.currentTaskNode = taskId;

        // Notificar a la aplicación
        if(typeof this.onCurrentTaskChange === "function"){

            this.onCurrentTaskChange(taskId);

        }

    }

    // ================================================
    // 📍 IR A UNA COINCIDENCIA
    // ================================================

    async scrollToSearchMatch(match){

        if(!match){

            return;

        }

        const pageData =
            this.pages[match.page - 1];

        if(!pageData){

            return;

        }

        if(!pageData.pageDiv){

            return;

        }

        const viewport =
            pageData.page.getViewport({
                scale:this.scale
            });

        const [, top] =
            viewport.convertToViewportPoint(
                match.x,
                match.y
            );

        const targetTop =
            pageData.pageDiv.offsetTop +
            top -
            120;

        this.currentPage =
            match.page;

        this.onPageChange?.(
            match.page,
            this.pdfDoc.numPages
        );

        this._scrolling = true;

        clearTimeout(
            this._scrollEnd
        );

        await this.renderVisiblePage(
            match.page
        );

        this.container.scrollTo({

            top:Math.max(0,targetTop),

            behavior:"smooth"

        });

        this._scrollEnd =
            setTimeout(()=>{

                this._scrolling = false;

            },900);

    }

    // ================================================
    // 🧹 NORMALIZAR TEXTO
    // ================================================

    normalizeText(text = "") {

        return text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

    }

    // ================================================
    // CLASIFICADOR DE ENCABEZADOS
    // ================================================
    classifyProcedureLine(text = "") {

        text = text.trim();

        if (!text) {
            return null;
        }

        // ============================================
        // 1. NÚMEROS DECIMALES (4.3.1, 4.3, etc.)
        // ============================================
        const decimal = text.match(/^(\d+(?:\.\d+)*)\s*\.?\s+(.+)/);
        if (decimal) {
            const numbers = decimal[1].split(".");
            const level = numbers.length;
            
            // Determinar qué tipo de encabezado es
            const content = (decimal[2] || text).toUpperCase();
            let type = "decimal";
            
            if (/ACTIVIDADES|CONSIDERACIONES|MOVILIZACION|MOVILIZACIÓN|DESMOVILIZACION|DESMOVILIZACIÓN|EJECUCION|EJECUCIÓN|FINALIZACION|FINALIZACIÓN|MEDIDAS|PASOS/i.test(content)) {
                type = "section";
            }
            
            return {
                type: type,
                level: Math.min(level, 4),
                match: decimal[1]
            };
        }

        // ============================================
        // 2. ROMANOS (I., II., III., etc.)
        // ============================================
        if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+/i.test(text)) {
            return {
                type: "roman",
                level: 1
            };
        }

        // ============================================
        // 3. LETRAS (A., B., C., etc.)
        // ============================================
        if (/^[A-ZÑ]\.\s+/i.test(text)) {
            return {
                type: "letter",
                level: 2
            };
        }

        // ============================================
        // 4. ENCABEZADOS GENÉRICOS
        // ============================================
        if (/^(ACTIVIDADES|CONSIDERACIONES|MOVILIZACION|MOVILIZACIÓN|DESMOVILIZACION|DESMOVILIZACIÓN|EJECUCION|EJECUCIÓN|FINALIZACION|FINALIZACIÓN|MEDIDAS|PASOS|DESARROLLO)/i.test(text)) {
            return {
                type: "generic",
                level: 1
            };
        }

        return null;
    }

    // ================================================
    // 📚 CONSTRUIR ÍNDICE DE TEXTO DEL PDF
    // ================================================

    async buildTextIndex() {

        if (!this.pdfDoc) return;

        console.log("📖 Construyendo índice de texto...");

        // Reiniciar estructuras
        this.pageTextCache.clear();

        this.searchIndex = [];

        this.textCoordinates.clear();

        this.pageTextFragments.clear();

        this.searchLocations = [];

        this.searchReady = false;

        try {

            for (let pageNumber = 1; pageNumber <= this.pdfDoc.numPages; pageNumber++) {

                const page = await this.pdfDoc.getPage(pageNumber);

                const textContent = await page.getTextContent();

                const fragments = [];

                // =====================================
                // Reconstruir el texto respetando líneas
                // =====================================

                let pageText = "";

                let lastY = null;

                for (const item of textContent.items) {

                    fragments.push({

                        text: item.str,

                        x: item.transform[4],

                        y: item.transform[5],

                        width: item.width,

                        height: item.height,

                        fontSize: item.transform[0]

                    });

                    // Cuando cambia la coordenada Y,
                    // significa que comienza una nueva línea.
                    if (lastY !== null && Math.abs(item.transform[5] - lastY) > 6) {

                        pageText += "\n";

                    }

                    pageText += item.str + " ";

                    lastY = item.transform[5];

                }

                pageText = pageText
                    .replace(/[ \t]+/g, " ")
                    .replace(/\n\s+/g, "\n")
                    .trim();

                // Guardar en caché
                this.pageTextCache.set(pageNumber, pageText);

                this.pageTextFragments.set(

                    pageNumber,

                    fragments

                );

                this.textCoordinates.set(

                    pageNumber,

                    fragments.map(fragment => ({

                        text: this.normalizeText(fragment.text),

                        x: fragment.x,

                        y: fragment.y,

                        width: fragment.width,

                        height: fragment.height,

                        fontSize: fragment.fontSize

                    }))

                );

                console.log(
                    `Página ${pageNumber}:`,
                    pageText.substring(0,150)
                );

                // Agregar al índice de búsqueda
                this.searchIndex.push({

                    page: pageNumber,

                    text: pageText,

                    normalized: this.normalizeText(pageText)

                });

            }

            this.searchReady = true;

            console.log(
                `✅ Índice creado (${this.searchIndex.length} páginas)`
            );

        }

        catch(error){

            console.error(
                "❌ Error creando índice del PDF",
                error
            );

            this.searchReady = false;

        }

    }

    // ================================================
    // 🔍 BUSCAR TEXTO DENTRO DEL PDF
    // ================================================

    searchText(query){

        // Limpiar resultados anteriores
        this.searchMatches = [];

        this.currentMatch = -1;

        this.searchQuery = "";

        if(!this.searchReady){

            console.warn("⚠️ El índice de búsqueda aún no está listo.");

            this.clearAllHighlights();

            return [];

        }

        if(!query || !query.trim()){

            this.clearAllHighlights();

            return [];

        }

        const search = this.normalizeText(query);

        this.searchQuery = search;

        const results = [];

        for(const page of this.searchIndex){

            let occurrences = 0;

            let position = page.normalized.indexOf(search)

            while(position !== -1){

                occurrences++;

                position = page.normalized.indexOf(
                    search,
                    position + search.length
                );

            }

            if(occurrences > 0){
                const firstMatch = page.normalized.indexOf(search);  // ✅ Declarado fuera
                results.push({
                    page: page.page,
                    occurrences,
                    preview: page.text.substring(
                        Math.max(0, firstMatch - 50),
                        Math.min(page.text.length, firstMatch + search.length + 80)
                    )
                });
            }

        }

        this.searchMatches = results;

        this.findSearchLocations(search);

        this.totalSearchLocations =
            this.searchLocations.length;

        this.activeSearchLocation =
            this.totalSearchLocations > 0
                ? 0
                : -1;

        this.renderHighlights();
        this.notifySearchChanged();

        document.dispatchEvent(

            new CustomEvent(

                "pdf-search-results",

                {

                    detail:

                        this.getDetailedSearchResults()

                }

            )

        );

        if(
            this.activeSearchLocation >= 0
        ){

            this.scrollToSearchMatch(

                this.searchLocations[
                    this.activeSearchLocation
                ]

            );

        }

        console.log(
            `🔎 "${query}" encontrado en ${results.length} página(s)`
        );

        console.table(results);

        return results;

    }

    // ================================================
    // BÚSQUEDA DIFERIDA
    // ================================================

    searchTextDebounced(query, delay = 250){

        clearTimeout(
            this.searchDebounce
        );

        this.searchDebounce = setTimeout(()=>{

            this.searchText(query);

        }, delay);

    }

    // ================================================
    // 📋 BUSCAR LA SECCIÓN "PASOS DE LA TAREA"
    // ================================================

    findTaskStepsSection() {

        if (!this.searchReady) return null;

        const regex =

            /^\d+(\.\d+)?\.?\s+PASOS\s+DE\s+LA\s+TAREA/i;

        for (const page of this.searchIndex) {

            const lines = page.text.split("\n");

            for (const line of lines) {

                if (regex.test(line.trim())) {

                    return {

                        page: page.page,

                        title: line.trim()

                    };

                }

            }

        }

        return null;

    }

    // ================================================
    // 📋 EXTRAER BLOQUE DEL PROCEDIMIENTO (V2)
    // ================================================
    extractProcedureBlock() {

        this.procedureBlock = [];

        if (!this.searchReady) {
            console.warn("⚠️ Índice de búsqueda no disponible.");
            return [];
        }

        const startRegex =
            /^\s*4(\.\d+)?\.?\s*(PROCEDIMIENTO|PASOS\s+DE\s+LA\s+TAREA|ACTIVIDADES|CONSIDERACIONES)/i;

        const endRegex =
            /^\s*(5|6|7|8|9|10)(\.\d+)?\./;

        let started = false;

        for (const page of this.searchIndex) {

            // Ignorar completamente la primera página
            // (normalmente contiene el índice)
            if (page.page === 1)
                continue;

            const lines = page.text
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean);

            for (const line of lines) {

                if (!started) {

                    if (!startRegex.test(line))
                        continue;

                    // Si parece una entrada del índice
                    // (........11)
                    if (/\.{3,}\s*\d+$/.test(line))
                        continue;

                    started = true;

                }

                if (started) {

                    if (endRegex.test(line))
                        return this.procedureBlock;

                    this.procedureBlock.push({

                        page: page.page,
                        text: line

                    });

                }

            }

        }

        return this.procedureBlock;

    }

    // ================================================
    // 🧹 NORMALIZAR BLOQUE DEL PROCEDIMIENTO
    // ================================================
    normalizeProcedureBlock() {

        if (!Array.isArray(this.procedureBlock) || !this.procedureBlock.length) {

            console.warn("⚠️ procedureBlock vacío.");

            return [];

        }

        const normalized = [];

        let buffer = "";

        let page = 1;

        const flushBuffer = () => {

            if (!buffer.trim()) return;

            normalized.push({

                page,

                text: buffer
                    .replace(/\s+/g, " ")
                    .replace(/\s+\./g, ".")
                    .replace(/\s+,/g, ",")
                    .replace(/\s+:/g, ":")
                    .trim()

            });

            buffer = "";

        };

        for (const item of this.procedureBlock) {

            page = item.page;

            let line = item.text
                .replace(/\u00A0/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            if (!line) continue;

            // ===============================
            // Ignorar encabezados de página
            // ===============================

            if (/^Página\s+\d+/i.test(line)) continue;

            if (/^PET[-\s]/i.test(line)) continue;

            if (/^Código:/i.test(line)) continue;

            if (/^Versión:/i.test(line)) continue;

            // ===============================
            // Romanos
            // ===============================

            if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.?$/i.test(line)) {

                flushBuffer();

                buffer = line;

                continue;

            }

            // ===============================
            // Numeración decimal
            // ===============================

            if (/^\d+(\.\d+){1,4}\.?$/i.test(line)) {

                flushBuffer();

                buffer = line;

                continue;

            }

            // ===============================
            // Letras
            // ===============================

            if (/^[A-ZÑ]\.$/.test(line)) {

                flushBuffer();

                buffer = line;

                continue;

            }

            // ===============================
            // Viñetas
            // ===============================

            if (/^[•●▪■►➤✓✔]/.test(line)) {

                flushBuffer();

                normalized.push({

                    page,

                    text: line

                });

                continue;

            }

            // ===============================
            // Encabezados completos
            // ===============================

            if (

                /^(ACTIVIDADES|CONSIDERACIONES|MOVILIZACION|MOVILIZACIÓN|DESMOVILIZACION|DESMOVILIZACIÓN|EJECUCION|EJECUCIÓN|FINALIZACION|FINALIZACIÓN|MEDIDAS|PASOS|PROCEDIMIENTO)/i.test(line)

            ) {

                if (buffer) {

                    buffer += " " + line;

                    flushBuffer();

                } else {

                    normalized.push({

                        page,

                        text: line

                    });

                }

                continue;

            }

            // ===============================
            // Continuación
            // ===============================

            if (buffer) {

                buffer += " " + line;

            }

            else {

                normalized.push({

                    page,

                    text: line

                });

            }

        }

        flushBuffer();

        this.procedureBlock = normalized;

        console.group("🧹 PROCEDURE NORMALIZED");

        console.table(normalized);

        console.groupEnd();

        return normalized;

    }

    // ================================================
    // 🔍 DETECTAR TIPO DE PROCEDIMIENTO
    // ================================================
    detectProcedureType() {

        if (
            !Array.isArray(this.procedureBlock) ||
            !this.procedureBlock.length
        ) {

            console.warn("⚠️ procedureBlock vacío.");

            this.procedureType = null;

            return null;

        }

        const stats = {

            roman: 0,

            decimal: 0,

            letters: 0,

            bullets: 0,

            generic: 0

        };

        for (const item of this.procedureBlock) {

            const text = item.text.trim();

            // I. II. III.
            if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\./i.test(text)) {

                stats.roman++;

                continue;

            }

            // 4.2.1
            if (/^\d+(\.\d+){1,4}/.test(text)) {

                stats.decimal++;

                continue;

            }

            // A. B. C.
            if (/^[A-ZÑ]\./.test(text)) {

                stats.letters++;

                continue;

            }

            // • ► ✓ ➤
            if (/^[•●▪■►➤✓✔]/.test(text)) {

                stats.bullets++;

                continue;

            }

            stats.generic++;

        }

        const entries = Object.entries(stats);

        entries.sort((a, b) => b[1] - a[1]);

        const [type, count] = entries[0];

        const total = this.procedureBlock.length;

        const confidence = total
            ? Number((count / total).toFixed(2))
            : 0;

        this.procedureType = {

            type,

            confidence,

            stats

        };

        console.group("📊 PROCEDURE TYPE");

        console.table(stats);

        console.log("Tipo:", type);

        console.log("Confianza:", confidence);

        console.groupEnd();

        return this.procedureType;

    }

    // ================================================
    // 📋 PARSEAR PROCEDIMIENTO
    // ================================================
    parseProcedureBlock() {

        this.taskSteps = [];

        if (
            !Array.isArray(this.procedureBlock) ||
            !this.procedureBlock.length
        ) {

            console.warn("⚠️ procedureBlock vacío.");

            return [];

        }

        this.detectHeaders();

        this.attachItems();

        this.normalizeSteps();

        this.finalizeSteps();

        this.buildTaskTree();

        this.validateTaskTree();

        // Construir índice de ubicaciones
        this.buildTaskLocations();

        console.group("📋 TASK STEPS");

        console.table(

            this.taskSteps.map(step => ({

                id: step.id,

                page: step.page,

                title: step.title,

                items: step.items.length

            }))

        );

        console.groupEnd();

        return this.taskSteps;

    }

    // ================================================
    // DETECTAR ENCABEZADOS (JERÁRQUICO)
    // ================================================
    detectHeaders() {

       this.taskSteps = [];
       this.taskMap.clear();

        let id = 1;

        // Pila para construir la jerarquía
        const stack = [];

        for (const row of this.procedureBlock) {

            const text = row.text.trim();

            if (!text) {

                continue;

            }

            // Clasificar la línea
            const info = this.classifyProcedureLine(text);

            // No es un encabezado
            if (!info) {

                continue;

            }

            // -------------------------------------
            // Encontrar el padre según el nivel
            // -------------------------------------

            while (

                stack.length &&

                stack[stack.length - 1].level >= info.level

            ) {

                stack.pop();

            }

            const parent =

                stack.length

                    ? stack[stack.length - 1]

                    : null;

            // -------------------------------------
            // Crear nodo
            // -------------------------------------

            const node = {

                id: id++,

                page: row.page,

                title: text,

                headerType: info.type,

                level: info.level,

                parentId: parent ? parent.id : null,

                children: [],

                items: []

            };

            // Registrar hijo en el padre

            if (parent) {

                parent.children.push(node.id);

            }

            // Guardar nodo

            this.taskSteps.push(node);

            // Crear clave única
            const key = `${row.page}-${text}`;

            // Registrar en el índice
            this.taskMap.set(key, node);

            // El nodo pasa a ser el contexto actual

            stack.push(node);

        }

        console.group("🌳 PROCEDURE TREE");

        console.table(

            this.taskSteps.map(step => ({

                id: step.id,

                parent: step.parentId,

                level: step.level,

                type: step.headerType,

                title: step.title,

                children: step.children.join(", ")

            }))

        );

        console.groupEnd();

    }

    // ================================================
    // OBTENER PASO POR CLAVE
    // ================================================
    getTaskStep(page, title) {

        return this.taskMap.get(

            `${page}-${title}`

        ) || null;

    }

    // ================================================
    // ASOCIAR CONTENIDO A CADA PASO
    // ================================================
    attachItems() {

        if (!this.taskSteps.length) {

            return;

        }

        let currentStep = null;

        for (const row of this.procedureBlock) {

            const text = row.text.trim();

            if (!text) {

                continue;

            }

            // ---------------------------------
            // ¿Es un encabezado?
            // ---------------------------------

            const info = this.classifyProcedureLine(text);

            if (info) {

                const key = `${row.page}-${text}`;

                currentStep = this.getTaskStep(

                    row.page,

                    text

                );

                continue;

            }

            // ---------------------------------
            // Aún no existe un encabezado activo
            // ---------------------------------

            if (!currentStep) {

                continue;

            }

            // ---------------------------------
            // Ignorar títulos generales
            // ---------------------------------

            if (

                /^PROCEDIMIENTO$/i.test(text) ||

                /^PASOS\s+DE\s+LA\s+TAREA$/i.test(text)

            ) {

                continue;

            }

            // ---------------------------------
            // Agregar contenido al paso actual
            // ---------------------------------

            currentStep.items.push({

                page: row.page,

                text

            });

        }

        console.group("📋 STEP ITEMS");

        console.table(

            this.taskSteps.map(step => ({

                id: step.id,

                level: step.level,

                parent: step.parentId,

                title: step.title,

                items: step.items.length

            }))

        );

        console.groupEnd();

    }

    // ================================================
    // NORMALIZAR PASOS
    // ================================================
    normalizeSteps() {

        for (const step of this.taskSteps) {

            const normalizedItems = [];

            let previous = "";

            for (const item of step.items) {

                let text = item.text || "";

                // ---------------------------------
                // Espacios
                // ---------------------------------

                text = text
                    .replace(/\u00A0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                // ---------------------------------
                // Limpiar viñetas repetidas
                // ---------------------------------

                text = text.replace(

                    /^[•●▪■►➤✓✔\-\*]+\s*/,

                    "• "

                );

                // ---------------------------------
                // Eliminar líneas vacías
                // ---------------------------------

                if (!text.length) {

                    continue;

                }

                // ---------------------------------
                // Ignorar textos demasiado pequeños
                // ---------------------------------

                if (text.length < 3) {

                    continue;

                }

                // ---------------------------------
                // Evitar duplicados consecutivos
                // ---------------------------------

                if (

                    previous.toLowerCase() ===
                    text.toLowerCase()

                ) {

                    continue;

                }

                previous = text;

                normalizedItems.push({

                    page: item.page,

                    text

                });

            }

            // ---------------------------------
            // Fusionar líneas partidas
            // ---------------------------------

            const merged = [];

            for (const item of normalizedItems) {

                if (!merged.length) {

                    merged.push(item);

                    continue;

                }

                const last = merged[merged.length - 1];

                const lastEndsSentence =

                    /[.;:]$/.test(last.text);

                const currentStartsBullet =

                    /^[•]/.test(item.text);

                if (

                    !lastEndsSentence &&

                    !currentStartsBullet

                ) {

                    last.text += " " + item.text;

                }

                else {

                    merged.push(item);

                }

            }

            step.items = merged;

        }

    }

    // ================================================
    // FINALIZAR PASOS
    // ================================================
    finalizeSteps() {

        const finalized = [];

        let id = 1;

        for (const step of this.taskSteps) {

            // ----------------------------
            // Validaciones
            // ----------------------------

            if (!step.title) {

                continue;

            }

            if (!Array.isArray(step.items)) {

                step.items = [];

            }

            // ----------------------------
            // Limpiar items vacíos
            // ----------------------------

            step.items = step.items.filter(item => {

                return (

                    item &&

                    item.text &&

                    item.text.trim().length > 0

                );

            });

            // ----------------------------
            // Normalizar título
            // ----------------------------

            const cleanTitle = step.title

            // eliminar líderes de puntos
            .replace(/\.{2,}\s*\d+$/, "")

            // eliminar página al final
            .replace(/\s+\d+$/, "")

            // espacios
            .replace(/\s+/g, " ")

            .trim();

            // ----------------------------
            // Preview
            // ----------------------------

            const preview =

                step.items.length

                    ? step.items[0].text

                    : "";

            // ----------------------------
            // Total palabras
            // ----------------------------

            let totalWords = 0;

            for (const item of step.items) {

                totalWords += item.text

                    .split(/\s+/)

                    .filter(Boolean)

                    .length;

            }

            finalized.push({

                // ---------------------------------
                // Identificación
                // ---------------------------------

                id,

                page: step.page,

                title: cleanTitle,

                shortTitle: cleanTitle

                    .replace(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s*/i, "")

                    .replace(/^\d+(\.\d+){1,4}\s*/, "")

                    .replace(/^[A-ZÑ]\.\s*/, "")

                    .trim(),

                // ---------------------------------
                // NUEVO
                // Mantener estructura jerárquica
                // ---------------------------------

                level: step.level,

                parentId: step.parentId,

                children: [...step.children],

                headerType: step.headerType,

                // ---------------------------------
                // Búsqueda
                // ---------------------------------

                searchKey:

                    this.normalizeText(cleanTitle),

                preview,

                // ---------------------------------
                // Estadísticas
                // ---------------------------------

                totalItems:

                    step.items.length,

                totalWords,

                expanded: false,

                // ---------------------------------
                // Contenido
                // ---------------------------------

                items: step.items

            });

            id++;

        }

        this.taskSteps = finalized;

        console.group("📋 FINAL TASK STEPS");

        console.table(

            this.taskSteps.map(step => ({

                id: step.id,

                page: step.page,

                level: step.level,

                parent: step.parentId,

                children: step.children.join(", "),

                type: step.headerType,

                title: step.title,

                items: step.totalItems,

                words: step.totalWords

            }))

        );

        console.groupEnd();

    }

    // ================================================
    // CONSTRUIR ÁRBOL DE PASOS
    // ================================================
    buildTaskTree() {

        const nodes = new Map();

        this.taskTree = [];

        // ---------------------------------------
        // Crear copia de cada nodo
        // ---------------------------------------

        for (const step of this.taskSteps) {

            nodes.set(step.id, {

                ...step,

                children: []

            });

        }

        // ---------------------------------------
        // Reconstruir jerarquía
        // ---------------------------------------

        for (const step of this.taskSteps) {

            const node = nodes.get(step.id);

            if (

                step.parentId === null ||

                !nodes.has(step.parentId)

            ) {

                this.taskTree.push(node);

                continue;

            }

            nodes

                .get(step.parentId)

                .children

                .push(node);

        }

        console.group("🌳 TASK TREE");

        console.dir(this.taskTree);

        console.groupEnd();

    }

    // ================================================
    // VALIDAR ÁRBOL
    // ================================================
    validateTaskTree() {

        const warnings = [];

        const ids = new Set(
            this.taskSteps.map(step => step.id)
        );

        for (const step of this.taskSteps) {

            // -----------------------------
            // Padre inexistente
            // -----------------------------

            if (

                step.parentId !== null &&

                !ids.has(step.parentId)

            ) {

                warnings.push({

                    type: "INVALID_PARENT",

                    step: step.title,

                    parent: step.parentId

                });

            }

            // -----------------------------
            // Nivel inválido
            // -----------------------------

            if (

                step.level < 1 ||

                step.level > 10

            ) {

                warnings.push({

                    type: "INVALID_LEVEL",

                    step: step.title,

                    level: step.level

                });

            }

            // -----------------------------
            // Sin contenido
            // -----------------------------

            if (

                !step.items.length &&

                !step.children.length

            ) {

                warnings.push({

                    type: "EMPTY_STEP",

                    step: step.title

                });

            }

        }

        if (warnings.length) {

            console.group("⚠️ TASK TREE WARNINGS");

            console.table(warnings);

            console.groupEnd();

        }
        else {

            console.log("✅ TaskTree validado correctamente.");

        }

        return warnings;

    }

    // ================================================
    // OBTENER ESTADÍSTICAS
    // ================================================
    getTaskStatistics() {

        let totalItems = 0;

        let totalWords = 0;

        for (const step of this.taskSteps) {

            totalItems += step.totalItems;

            totalWords += step.totalWords;

        }

        return {

            totalSteps: this.taskSteps.length,

            totalItems,

            totalWords,

            roots: this.taskTree.length

        };

    }

    // ================================================
    // OBTENER ÁRBOL COMPLETO
    // ================================================
    getTaskTree() {

        return this.taskTree;

    }

    // ================================================
    // CONSTRUIR UBICACIONES DEL TASK TREE
    // ================================================
    buildTaskLocations() {

        this.taskLocations.clear();

        const walk = nodes => {

            nodes.forEach(node => {

                const location = this.findTaskHeaderLocation(node);

                this.taskLocations.set(node.id, {

                    id: node.id,

                    page: node.page,

                    title: node.title,

                    level: node.level,

                    x: location?.x ?? null,

                    y: location?.y ?? null,

                    fragment: location?.fragment ?? null

                });

                if (
                    Array.isArray(node.children) &&
                    node.children.length
                ) {

                    walk(node.children);

                }

            });

        };

        walk(this.taskTree);

        console.group("📍 TASK LOCATIONS");

        console.table(
            [...this.taskLocations.values()]
        );

        console.groupEnd();

    }

    // ================================================
    // BUSCAR UBICACIÓN DEL ENCABEZADO
    // ================================================
    findTaskHeaderLocation(node) {

        const fragments =
            this.pageTextFragments.get(node.page);

        if (!fragments)
            return null;

        const target =
            this.normalizeText(node.title);

        let best = null;

        for (const fragment of fragments) {

            const text =
                this.normalizeText(fragment.text);

            if (text !== target)
                continue;

            // Ignorar líneas del índice
            if (/\.{3,}\d+$/.test(fragment.text))
                continue;

            // Ignorar títulos demasiado arriba
            if (fragment.y > 760)
                continue;

            best = {

                x: fragment.x,
                y: fragment.y,
                fragment

            };

            break;

        }

        return best;

    }

    // ================================================
    // OBTENER NODOS RAÍZ
    // ================================================
    getRootSteps() {

        return this.taskTree;

    }

    // ================================================
    // 📚 EXTRAER SECCIONES DEL PET
    // ================================================

    extractSections() {

        this.sections = {};

        if (!this.searchReady) {

            console.warn("⚠️ El índice aún no está listo.");

            return {};

        }

        const sectionPatterns = [

            "objetivo",
            "alcance",
            "responsabilidades",
            "equipos",
            "herramientas",
            "materiales",
            "epp",
            "pasos de la tarea",
            "riesgos",
            "controles",
            "restricciones",
            "anexos"

        ];

        for (const page of this.searchIndex) {

            const text = page.normalized;

            for (const section of sectionPatterns) {

                const index = text.indexOf(section);

                if (index === -1) continue;

                if (!this.sections[section]) {

                    this.sections[section] = {

                        page: page.page,

                        position: index,

                        preview: page.text.substring(

                            Math.max(0, index - 80),

                            Math.min(
                                page.text.length,
                                index + 300
                            )

                        )

                    };

                }

            }

        }

        console.log("📚 Secciones detectadas:");

        console.table(this.sections);

        return this.sections;

    }

    // ================================================
    // 📚 OBTENER UNA SECCIÓN
    // ================================================

    getSection(sectionName){

        if(!sectionName){

            return null;

        }

        return this.sections[
            sectionName.toLowerCase()
        ] || null;

    }

    // ================================================
    // LOCALIZAR COINCIDENCIAS
    // (MULTI FRAGMENTO)
    // ================================================

    findSearchLocations(query){

        this.searchLocations = [];

        if(!query){

            return [];

        }

        const search =
            this.normalizeText(query);

        const duplicates =
            new Set();

        for(const page of this.searchIndex){

            const windows =
                this.buildSearchWindows(page.page);

            windows.forEach(window=>{

                if(
                    !window.normalized.includes(search)
                ){

                    return;

                }

                const key =
                    `${window.page}-${window.startIndex}`;

                if(
                    duplicates.has(key)
                ){

                    return;

                }

                duplicates.add(key);

                this.searchLocations.push({

                    id:
                        this.searchLocations.length,

                    page:
                        window.page,

                    index:
                        window.startIndex,

                    text:
                        window.text,

                    x:
                        window.x,

                    y:
                        window.y,

                    width:
                        window.width,

                    height:
                        window.height

                });

            });

        }

        return this.searchLocations;

    }

    // ================================================
    // SIGUIENTE COINCIDENCIA
    // ================================================

    nextSearchMatch(){

        if(
            !this.searchLocations.length
        ){

            return null;

        }

        this.activeSearchLocation++;

        if(
            this.activeSearchLocation >=
            this.searchLocations.length
        ){

            this.activeSearchLocation = 0;

        }

        this.renderHighlights();
        this.notifySearchChanged();

        document.dispatchEvent(

            new CustomEvent(

                "pdf-search-active",

                {

                    detail:{

                        id:this.activeSearchLocation

                    }

                }

            )

        );

        const match =

            this.searchLocations[
                this.activeSearchLocation
            ];

        this.scrollToSearchMatch(match);

        return match;

    }

    // ================================================
    // COINCIDENCIA ANTERIOR
    // ================================================

    previousSearchMatch(){

        if(
            !this.searchLocations.length
        ){

            return null;

        }

        this.activeSearchLocation--;

        if(
            this.activeSearchLocation < 0
        ){

            this.activeSearchLocation =
                this.searchLocations.length - 1;

        }

        this.renderHighlights();
        this.notifySearchChanged();

        document.dispatchEvent(

            new CustomEvent(

                "pdf-search-active",

                {

                    detail:{

                        id:this.activeSearchLocation

                    }

                }

            )

        );

        const match =

            this.searchLocations[
                this.activeSearchLocation
            ];

        this.scrollToSearchMatch(match);

        return match;

    }

    // ================================================
    // 🔍 OBTENER RESULTADOS DE BÚSQUEDA
    // ================================================

    getSearchResults(){

        return [...this.searchMatches];

    }

    // ================================================
    // RESULTADOS DETALLADOS DEL BUSCADOR
    // ================================================

    getDetailedSearchResults(){

        return this.searchLocations.map(location=>({

            id:location.id,

            page:location.page,

            text:location.text,

            preview:

                location.text.length > 120

                    ? location.text.substring(0,120) + "..."

                    : location.text

        }));

    }

    // ================================================
    // IR A UN RESULTADO
    // ================================================

    goToSearchResult(id){

        const match =

            this.searchLocations.find(

                item=>item.id===id

            );

        if(!match){

            return false;

        }

        this.activeSearchLocation =

            this.searchLocations.indexOf(match);

        this.renderHighlights();

        this.notifySearchChanged();

        this.scrollToSearchMatch(match);

        return true;

    }

    // ================================================
    // OBTENER UBICACIONES DE COINCIDENCIAS
    // ================================================

    getSearchLocations(){

        return [...this.searchLocations];

    }

    getCurrentSearchMatch(){

        if(
            this.activeSearchLocation < 0
        ){

            return null;

        }

        return this.searchLocations[
            this.activeSearchLocation
        ];

    }

    getSearchStatus(){

        return {

            current:

                this.activeSearchLocation >= 0

                    ? this.activeSearchLocation + 1

                    : 0,

            total:

                this.searchLocations.length

        };

    }

    // ================================================
    // TOTAL DE RESULTADOS
    // ================================================

    getSearchCount(){

        return this.searchLocations.length;

    }

    // ================================================
    // 📄 OBTENER TEXTO DE UNA PÁGINA
    // ================================================

    getPageText(pageNumber){

        return this.pageTextCache.get(pageNumber) || "";

    }

    // ================================================
    // 🧪 DEBUG DEL ÍNDICE DE TEXTO
    // ================================================

    debugSearchIndex(){

        if(!this.searchReady){

            console.warn("Índice no construido.");

            return;

        }

        console.group("📚 SEARCH INDEX");

        this.searchIndex.forEach(page=>{

            console.group(

                `Página ${page.page}`

            );

            console.log(page.text);

            console.groupEnd();

        });

        console.groupEnd();

    }

    // ================================================
    // OBTENER FRAGMENTOS DE UNA PÁGINA
    // ================================================

    getPageFragments(pageNumber){

        return this.pageTextFragments.get(pageNumber) || [];

    }

    // ================================================
    // OBTENER COORDENADAS NORMALIZADAS
    // ================================================

    getPageCoordinates(pageNumber){

        return this.textCoordinates.get(pageNumber) || [];

    }

    // ================================================
    // CONSTRUIR VENTANAS DE BÚSQUEDA
    // ================================================

    buildSearchWindows(pageNumber){

        const fragments =
            this.getPageCoordinates(pageNumber);

        const windows = [];

        const MAX_WORDS = 8;

        for(let start = 0; start < fragments.length; start++){

            let combinedText = "";

            for(
                let end = start;
                end < Math.min(
                    fragments.length,
                    start + MAX_WORDS
                );
                end++
            ){

                if(combinedText){

                    combinedText += " ";

                }

                combinedText +=
                    fragments[end].text;

                windows.push({

                    page: pageNumber,

                    startIndex: start,

                    endIndex: end,

                    text: combinedText,

                    normalized: this.normalizeText(combinedText),

                    x: fragments[start].x,

                    y: fragments[start].y,

                    width:
                        fragments[end].x +
                        fragments[end].width -
                        fragments[start].x,

                    height: Math.max(

                        ...fragments
                            .slice(start,end+1)
                            .map(f=>f.height)

                    )

                });

            }

        }

        return windows;

    }

    // ================================================
    // DIBUJAR RESALTADOS DE UNA PÁGINA
    // ================================================

    renderPageHighlights(pageNumber){

        this.clearHighlightLayer(pageNumber);

        const layer =

            this.highlightLayers.get(pageNumber);

        if(!layer){

            return;

        }

        const pageData =

            this.pages[pageNumber-1];

        if(!pageData){

            return;

        }

        const viewport =

            pageData.page.getViewport({

                scale:this.scale

            });

        this.searchLocations

            .filter(item=>item.page===pageNumber)

            .forEach(location=>{

                const marker =

                    document.createElement("div");

                marker.className =
                    "pdf-search-highlight";

                if(
                    location.id ===
                    this.activeSearchLocation
                ){

                    marker.classList.add(
                        "active"
                    );

                }

                marker.dataset.page =
                    pageNumber;

                marker.dataset.index =
                    location.index;

                const [left, top] =
                    viewport.convertToViewportPoint(
                        location.x,
                        location.y
                    );

                const scaledWidth =
                    location.width * viewport.scale;

                const scaledHeight =
                    Math.max(

                        location.height *
                        viewport.scale,

                        18

                    );

                marker.style.left =
                    `${left}px`;

                marker.style.top =
                    `${top - scaledHeight}px`;

                marker.style.width =
                    `${scaledWidth}px`;

                marker.style.height =
                    `${scaledHeight}px`;

                layer.appendChild(marker);

            });

    }

    // ================================================
    // DIBUJAR RESALTADOS
    // ================================================

    renderHighlights(){

        this.highlightLayers.forEach((_,page)=>{

            this.renderPageHighlights(page);

        });

    }

    // ================================================
    // LIMPIAR RESALTADOS VISUALES
    // ================================================

    clearHighlightLayer(pageNumber){

        const layer = this.highlightLayers.get(pageNumber);

        if(!layer){

            return;

        }

        layer.innerHTML = "";

    }

    // ================================================
    // LIMPIAR TODOS LOS RESALTADOS
    // ================================================

    clearAllHighlights(){

        this.highlightLayers.forEach(layer=>{

            layer.innerHTML = "";

        });

        document.dispatchEvent(

            new CustomEvent(

                "pdf-search-results",

                {

                    detail:[]

                }

            )

        );

    }

    // ================================
    // 📋 OBTENER PASOS DE LA TAREA
    // ================================

    getTaskSteps() {

        if (!Array.isArray(this.taskSteps)) {
            return [];
        }

        return this.taskSteps.map(step => ({
            id: step.id,
            step: step.id,
            title: step.title,
            page: step.page,
            items: step.items || [],
            level: step.level || 1,
            headerType: step.headerType,
            children: step.children || []
        }));

    }

    // ================================
    // 🎯 NAVEGAR A UN PASO DE TAREA
    // ================================

    goToTaskStep(stepId) {

        if (!stepId) {
            console.warn("❌ stepId no proporcionado");
            return false;
        }

        // Buscar el paso por ID
        const step = this.taskSteps.find(s => s.id === stepId);

        if (!step) {
            console.warn("❌ Paso no encontrado:", stepId);
            return false;
        }

        // Usar la función scrollToTask que ya existe
        return this.scrollToTask(stepId);

    }

    // =====================================================
    // DOCUMENT OUTLINE ENGINE
    // =====================================================

    resetOutline(){

        this.outlineFragments = [];

        this.outlineLines = [];

        this.outline = [];

        this.outlineTree = [];

        this.outlineTaskSteps = [];

        this.outlineIndex.clear();

        this.outlineLocations.clear();

        this.outlineRange = {

            startPage:null,
            endPage:null,

            startIndex:null,
            endIndex:null

        };

        this.outlineStats = {

            totalFragments:0,

            totalHeadings:0,

            totalLevels:0

        };

    }

    getOutline(){

        return this.outline;

    }

    getOutlineTree(){

        return this.outlineTree;

    }

    // =====================================================
    // OBTENER NODOS RAÍZ
    // =====================================================

    getOutlineRoots(){

        return this.outlineTree;

    }

    // =====================================================
    // OBTENER HIJOS
    // =====================================================

    getOutlineChildren(id){

        const node =

            this.getOutlineNode(id);

        if(!node){

            return [];

        }

        return node.children;

    }

    // =====================================================
    // OBTENER PADRE
    // =====================================================

    getOutlineParent(id){

        const node =

            this.getOutlineNode(id);

        if(!node){

            return null;

        }

        if(node.parent===null){

            return null;

        }

        return this.getOutlineNode(

            node.parent

        );

    }

    getOutlineNode(id){

        return this.outlineIndex.get(id) || null;

    }

    getOutlineLocation(id){

        return this.outlineLocations.get(id) || null;

    }

    debugOutline(){

        console.group(

            "DOCUMENT OUTLINE"

        );

        console.table(

            this.outline.map(node=>({

                id:node.id,

                title:node.title,

                level:node.level,

                parent:node.parent,

                children:node.children.length,

                page:node.page

            }))

        );

        console.groupEnd();

    }

    // =====================================================
    // EXTRAER RANGO DEL PROCEDIMIENTO
    // =====================================================

    extractProcedureRange() {

        this.resetOutline();

        if (!this.searchReady) {
            return;
        }

        const startRegex =
            /^\s*4(\.\d+)?\.?\s+PROCEDIMIENTO\b/i;

        const endRegex =
            /^\s*5(\.\d+)?\.?\s+RESTRICCIONES\b/i;

        let started = false;

        for (const page of this.searchIndex) {

            // Ignorar índice
            if (page.page === 1) {
                continue;
            }

            const fragments =
                this.pageTextFragments.get(page.page);

            if (!fragments) {
                continue;
            }

            for (let i = 0; i < fragments.length; i++) {

                const fragment = fragments[i];

                const text =
                    fragment.text.trim();

                if (!text) {
                    continue;
                }

                // Inicio del procedimiento
                if (!started) {

                    if (startRegex.test(text)) {

                        started = true;

                        this.outlineRange.startPage =
                            page.page;

                        this.outlineRange.startIndex =
                            i;

                    }

                }

                if (started) {

                    this.outlineFragments.push({

                        page: page.page,

                        index: i,

                        text: fragment.text,

                        x: fragment.x,

                        y: fragment.y,

                        width: fragment.width,

                        height: fragment.height,

                        fontSize: fragment.fontSize

                    });

                }

                // Fin del procedimiento
                if (
                    started &&
                    endRegex.test(text)
                ) {

                    this.outlineRange.endPage =
                        page.page;

                    this.outlineRange.endIndex =
                        i;

                    started = false;

                    break;

                }

            }

            if (!started && this.outlineRange.endPage) {
                break;
            }

        }

        this.outlineStats.totalFragments =
            this.outlineFragments.length;

        console.group("DOCUMENT OUTLINE RANGE");

        console.log("Rango:");

        console.table(this.outlineRange);

        console.log("Total Fragmentos:", this.outlineFragments.length);

        console.table(this.outlineFragments);

        console.groupEnd();

    }

    // =====================================================
    // RECONSTRUIR LÍNEAS DEL PROCEDIMIENTO
    // =====================================================

    mergeFragmentsIntoLines(){

        this.outlineLines = [];

        if(!this.outlineFragments.length){

            return;

        }

        const pages = new Map();

        for (const fragment of this.outlineFragments) {

            if (!pages.has(fragment.page)) {
                pages.set(fragment.page, []);
            }

            pages.get(fragment.page).push(fragment);

        }

        pages.forEach((fragments,page)=>{

            fragments.sort((a,b)=>{

                if(Math.abs(a.y-b.y)>2){

                    return b.y-a.y;

                }

                return a.x-b.x;

            });

            let current=null;

            for(const fragment of fragments){

                if(

                    !current ||

                    Math.abs(current.y-fragment.y)>3

                ){

                    current={

                        page,

                        y:fragment.y,

                        x:fragment.x,

                        width:fragment.width,

                        height:fragment.height,

                        fontSize:fragment.fontSize,

                        fragments:[fragment]

                    };

                    this.outlineLines.push(current);

                }

                else{

                    current.fragments.push(fragment);

                    current.width=

                        fragment.x+

                        fragment.width-

                        current.x;

                }

            }

        });

        this.outlineLines.forEach(line=>{

            line.fragments.sort((a,b)=>a.x-b.x);

            line.text=

                line.fragments

                    .map(f=>f.text)

                    .join(" ")

                    .replace(/\s+/g," ")

                    .trim();

        });

        console.group("DOCUMENT OUTLINE LINES");

        console.table(

            this.outlineLines.map(line=>({

                page:line.page,

                text:line.text,

                y:line.y,

                fragments:line.fragments.length

            }))

        );

        console.groupEnd();

    }

    // =====================================================
    // DETECTAR ESTILOS DEL DOCUMENTO
    // =====================================================

   detectHeadingStyles() {

        if (!this.outlineFragments.length) {

            return;

        }

        const histogram = new Map();

        for (const line of this.outlineLines) {

            const size = Math.round(line.fontSize);

            histogram.set(

                size,

                (histogram.get(size) || 0) + 1

            );

        }

        let normalSize = 0;

        let normalCount = 0;

        histogram.forEach((count, size) => {

            if (count > normalCount) {

                normalCount = count;

                normalSize = size;

            }

        });

        this.headingStyles.normalSize = normalSize;

        this.headingStyles.headingSize =

            Math.max(

                ...histogram.keys()

            );

        console.group("DOCUMENT STYLES");

        console.table(

            [...histogram.entries()].map(

                ([size, count]) => ({

                    size,

                    count

                })

            )

        );

        console.log(

            "Texto:",

            normalSize

        );

        console.log(

            "Encabezado:",

            this.headingStyles.headingSize

        );

        console.groupEnd();

    }

    // =====================================================
    // DETECTAR ENCABEZADOS
    // =====================================================

    detectOutlineHeadings() {

        this.outline = [];

        let id = 1;

        for (const line of this.outlineLines) {

            const text = line.text.trim();

            if (!text) {
                continue;
            }

            let level = null;

            let type = null;

            // -----------------------------
            // 4.2.1
            // -----------------------------

            if (/^\d+(\.\d+)+/.test(text)) {

                level =
                    text.match(/\./g).length;

                type = "decimal";

            }

            // -----------------------------
            // I.
            // -----------------------------

            else if (

                /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\./i.test(text)

            ) {

                level = 1;

                type = "roman";

            }

            // -----------------------------
            // A.
            // -----------------------------

            else if (

                /^[A-ZÑ]\./.test(text)

            ) {

                level = 3;

                type = "letter";

            }

            // -----------------------------
            // Encabezados visuales
            // -----------------------------

            else if (

                fragment.fontSize >=
                this.headingStyles.headingSize

            ) {

                level = 2;

                type = "visual";

            }

            if (level === null) {
                continue;
            }

            const node = {

                id,

                title: text,

                shortTitle:

                    text

                        .replace(/^(\d+(\.\d+)*)\s*/, "")

                        .replace(/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s*/i, "")

                        .replace(/^[A-ZÑ]\.\s*/, "")

                        .trim(),

                page: line.page,

                x: line.x,

                y: line.y,

                width: line.width,

                height: line.height,

                fontSize: line.fontSize,

                level,

                type,

                parent: null,

                children: []

            };

            this.outline.push(node);

            this.outlineIndex.set(
                id,
                node
            );

            this.outlineLocations.set(
                id,
                {

                    page: fragment.page,

                    x: fragment.x,

                    y: fragment.y

                }

            );

            id++;

        }

        this.outlineStats.totalHeadings =
            this.outline.length;

        console.group(
            "DOCUMENT OUTLINE HEADINGS"
        );

        console.table(this.outline);

        console.groupEnd();

    }

    // =====================================================
    // CONSTRUIR ÁRBOL DEL DOCUMENTO
    // =====================================================

    buildOutlineTree(){

        this.outlineTree = [];

        if(!this.outline.length){

            return;

        }

        const stack = [];

        for(const node of this.outline){

            node.parent = null;

            const cloned = {

                ...node,

                children: []

            };

            while(

                stack.length &&

                stack[stack.length-1].level >= node.level

            ){

                stack.pop();

            }

            if(stack.length){

                node.parent =
                    stack[stack.length-1].id;

                stack[stack.length-1]
                    .children
                    .push(node);

            }

            else{

                this.outlineTree.push(node);

            }

            stack.push(node);

        }

        this.outlineStats.totalLevels =

            Math.max(

                ...this.outline.map(
                    n=>n.level
                )

            );

        console.group(

            "DOCUMENT OUTLINE TREE"

        );

        console.dir(

            this.outlineTree

        );

        console.groupEnd();

    }

    // =====================================================
    // EXPORTAR OUTLINE A TASK STEPS
    // =====================================================

    exportOutlineTasks() {

        const outlineSteps = [];

        const walk = (nodes, parent = null) => {

            nodes.forEach(node => {

                outlineSteps.push({

                    id: node.id,

                    page: node.page,

                    title: node.title,

                    shortTitle: node.shortTitle,

                    level: node.level,

                    parentId: parent,

                    headerType: node.type,

                    items: [],

                    children: node.children.map(
                        child => child.id
                    )

                });

                walk(node.children, node.id);

            });

        };

        walk(this.outlineTree);

        this.outlineTaskSteps = outlineSteps;

        console.group("TASK STEPS FROM OUTLINE");

        console.table(outlineSteps);

        console.groupEnd();

    }

    // ================================
    // 🧹 DESTROY
    // ================================

    destroy() {

        // ✅ Cancelar una carga de PDF que aún esté en progreso
        if (this.loadingTask) {
            try {
                this.loadingTask.destroy();
            } catch (e) {
                console.warn("No se pudo cancelar loadingTask", e);
            }
            this.loadingTask = null;
        }

        for (const task of this.renderTasks.values()) {
            try {
                task.cancel();
            } catch {}
        }

        this.renderTasks.clear();

        this.observer?.disconnect();
        this.pageObserver?.disconnect();

        this.viewer.innerHTML = "";

        // ================================
        // 🔎 SEARCH RESET
        // ================================

        this.searchIndex = [];
        this.searchMatches = [];
        this.currentMatch = -1;
        this.activeSearchLocation = -1;

        this.totalSearchLocations = 0;
        this.searchQuery = "";
        this.searchReady = false;
        this.pageTextCache.clear();
        this.textCoordinates.clear();

        this.pageTextFragments.clear();
        this.searchLocations = [];
        this.highlightLayers.clear();
        this.pages = [];
        this.sections = {};
        this.procedureBlock = null;
        this.procedureType = null;
        this.pdfDoc = null;
        this.taskSteps = [];
        this.taskMap.clear();
        this.taskTree = [];
        this.resetOutline();
        this.loadedAt = null;
        this.currentPage = 1;

        this._scrolling = false;
        this._zooming = false;

        clearTimeout(this.searchDebounce);
        clearTimeout(this._scrollEnd);
        clearTimeout(this.zoomTimeout);

        this.initializeObserver();
        this.initializePageObserver();
    }
}