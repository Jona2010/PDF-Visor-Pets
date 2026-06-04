export class PDFViewer {

    constructor({ container, viewer, onPageChange }) {

        this.container    = container;
        this.viewer       = viewer;
        this.onPageChange = onPageChange || null;

        this.pdfDoc     = null;
        this.scale      = 1;
        this.pixelRatio = window.devicePixelRatio || 1;

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

                // Ignorar completamente si estamos en scroll programático
                if (this._scrolling) return;

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

            //console.log("📄 LOADING PDF:", url);

            const loadingTask = pdfjsLib.getDocument({
                url,
                withCredentials: false
            });

            this.pdfDoc   = await loadingTask.promise;
            this.loadedAt = Date.now();

            //console.log("✅ PDF:", this.pdfDoc.numPages, "páginas");

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

        if (window.innerWidth <= 768) {
            pageDiv.style.width =
                `${viewport.width}px`;

            pageDiv.style.height =
                `${viewport.height}px`;
        } else {
            pageDiv.style.minWidth  = `${viewport.width}px`;
            pageDiv.style.minHeight = `${viewport.height}px`;
        }

        const canvas = document.createElement("canvas");
        canvas.style.opacity    = "0";
        //canvas.style.transition = "opacity .25s ease";
        canvas.style.width      = `${viewport.width}px`;
        canvas.style.height     = `${viewport.height}px`;
        pageDiv.appendChild(canvas);

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

            //console.log(`✅ PAGE ${pageNum}`);

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
    // ================================

    async setScale(newScale) {

        if (!this.pdfDoc) return;

        this.scale = Math.max(
            0.35,
            Math.min(newScale, 5)
        );

        for (const task of this.renderTasks.values()) {
            try {
                task.cancel();
            } catch {}
        }

        this.renderTasks.clear();

        clearTimeout(this.zoomTimeout);

        this.zoomTimeout = setTimeout(() => {

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

            });

            this.pages.forEach(pageData => {

                const rect =
                    pageData.pageDiv.getBoundingClientRect();

                const visible =

                    rect.bottom >= -800 &&
                    rect.top <= window.innerHeight + 800;

                if (visible) {

                    this.renderVisiblePage(
                        pageData.pageNum
                    );

                }

            });

        }, 25);
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