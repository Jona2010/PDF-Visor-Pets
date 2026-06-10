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

            this.pdfDoc   = await loadingTask.promise;
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
    }

    // API antigua conservada para compatibilidad (resize, etc.):
    // hace el commit síncrono y luego el render async.
    async setScale(newScale, anchor = null, force = false) {
        const changed = this._commitGeometry(newScale, anchor, force);
        if (!changed) return;
        await this._renderVisible();
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

    // ================================
    // 🧹 DESTROY
    // ================================

    destroy() {
        for (const task of this.renderTasks.values()) {
            try { task.cancel(); } catch (_) {}
        }
        this.renderTasks.clear();

        this.observer?.disconnect();
        this.pageObserver?.disconnect();

        this.viewer.innerHTML = "";
        this.pages       = [];
        this.pdfDoc      = null;
        this.loadedAt    = null;
        this.currentPage = 1;
        this._scrolling  = false;
        clearTimeout(this._scrollEnd);
    }
}