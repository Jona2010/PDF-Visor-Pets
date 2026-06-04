export class ZoomManager {

    constructor({ viewer }) {

        this.viewer = viewer;

        // ── Estado de zoom ──
        this.zoom      = 1;
        this.isFitMode = false;   // true cuando fitToWidth está activo

        // ── isMobile definido ANTES de usarse ──
        this.isMobile = window.matchMedia("(max-width: 768px)").matches;

        // ── Límites ──
        this.MIN_ZOOM  = 0.35;
        this.MAX_ZOOM  = this.isMobile ? 3 : 5;
        this.ZOOM_STEP = 0.15;

        // ── Elementos ──
        this.zoomLabel       = document.getElementById("zoomLabel");
        this.viewerContainer = document.getElementById("viewerContainer");
        this.pdfViewer       = document.getElementById("pdfViewer");

        // ── Suavizado ──
        // targetZoom: el zoom al que queremos llegar
        // animId: requestAnimationFrame en curso
        this.targetZoom  = 1;
        this.animId      = null;
        this.renderTimer = null;
        this.previousZoom = 1;

        this.initialize();
    }

    // ================================
    // 🚀 INIT
    // ================================

    initialize() {

        const zoomIn  = document.getElementById("zoomIn");
        const zoomOut = document.getElementById("zoomOut");
        const fitBtn  = document.getElementById("fitWidth");

        zoomIn?.addEventListener("click",  () => this.step(+1));
        zoomOut?.addEventListener("click", () => this.step(-1));

        // Click en el label → reset al 100%
        this.zoomLabel?.addEventListener("click", () => this.zoomTo(1));

        // fitWidth como toggle
        fitBtn?.addEventListener("click", () => this.toggleFitWidth(fitBtn));

        // Wheel zoom (Ctrl + rueda) — llamado desde visor.js
        // pero también puede registrarse aquI
        // Actualizar isMobile en resize
        window.addEventListener("resize", () => {
            this.isMobile = window.matchMedia("(max-width: 768px)").matches;
            this.MAX_ZOOM = 5;
            if (this.isFitMode) {

                this._calcFitScale()
                    .then(scale => {

                        if(scale){

                            this.zoom = scale;
                            this.targetZoom = scale;

                        }

                    });

            }
        }, { passive: true });
    }

    // ================================
    // ± PASO FIJO (botones +/-)
    // ================================

    step(direction) {
        this.isFitMode = false;
        this.zoomTo(this.zoom + direction * this.ZOOM_STEP);
        this.updateFitButton(false);
    }

    // ================================
    // 🖱️ DELTA SUAVE (rueda)
    // ================================

    zoomBy(delta) {
        this.isFitMode = false;
        const next =
            Math.max(
                this.MIN_ZOOM,
                Math.min(
                    this.MAX_ZOOM,
                    this.targetZoom + delta
                )
            );
        this.zoomTo(next);
        this.updateFitButton(false);
    }

    // ================================
    // 🔍 ZOOM TO — núcleo
    //
    // Arquitectura de suavizado tipo Adobe Reader:
    // 1. Se actualiza this.targetZoom inmediatamente.
    // 2. Un loop rAF interpola this.zoom → targetZoom
    //    con lerp (easing exponencial).
    // 3. Mientras se interpola, el CSS transform da
    //    feedback visual INSTANTÁNEO sin re-render.
    // 4. Cuando la animación termina (|diff| < 0.001)
    //    se dispara el re-render real del PDF con un
    //    pequeño debounce para no hacerlo en cada frame.
    // ================================

    zoomTo(value) {

        if(
            Math.abs(
                value - this.targetZoom
            ) < 0.005
        ){
            return;
        }

        this.targetZoom = Math.max(
            this.MIN_ZOOM,
            Math.min(this.MAX_ZOOM, value)
        );

        // Iniciar loop de animación si no está corriendo
        if (!this.animId) {
            this.animId = requestAnimationFrame(() => this._animateZoom());
        }
    }

    _animateZoom() {

        const diff   = this.targetZoom - this.zoom;
        const speed  = 0.25;   // 0..1 — más alto = más rápido

        if (Math.abs(diff) < 0.0008) {
            // Llegamos — fijar exacto y lanzar render real
            this.zoom   = this.targetZoom;
            this.animId = null;
            //this._applyVisualScale(this.zoom);
            this._updateLabel(this.zoom);
            this._scheduleRender();
            return;
        }

        // Lerp exponencial (como Acrobat: rápido al inicio, suave al llegar)
        this.zoom += diff * speed;

        //this._applyVisualScale(this.zoom);
        this._updateLabel(this.zoom);

        this.animId = requestAnimationFrame(() => this._animateZoom());
    }

    /* // Aplica transform:scale SOLO como feedback visual durante la animación.
    // El render real del PDF usa setScale (sin transform).
    _applyVisualScale(z) {
        if (this.pdfViewer) {
            this.pdfViewer.style.transform       = `scale(${z})`;
            this.pdfViewer.style.transformOrigin = "top center";
        }
    } */

    _updateLabel(z) {
        if (this.zoomLabel) {
            this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
        }
    }

    // Debounce del render real: espera 180ms después de que la animación
    // termine para no re-renderizar en cada frame de la rueda.
    _scheduleRender() {
        clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => {
            this.viewer?.setScale(this.zoom);
        }, 220);
    }

    // ================================
    // 📐 FIT TO WIDTH — toggle
    //
    // Primera pulsación: ajusta al ancho del contenedor.
    // Segunda pulsación: vuelve al zoom anterior.
    // ================================

    async toggleFitWidth(btn) {

        if (!this.viewer?.pdfDoc) return;

        if (this.isFitMode) {

            this.isFitMode = false;
            this.updateFitButton(false);

            this.zoomTo(this.previousZoom);

            return;
        }

        // Calcular escala para ajustar al ancho
        const fitScale = await this._calcFitScale();
        if (!fitScale) return;

        this.previousZoom = this.zoom;

        this.isFitMode = true;
        this.updateFitButton(true);

        // Animación suave al fit
        this.zoomTo(fitScale);
    }

    async _calcFitScale() {
        try {
            const page     = await this.viewer.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1 });

            // Padding horizontal del contenedor (90px cada lado → 180px total)
            const padding = this.isMobile ? 20 : 60;
            const available = (this.viewerContainer?.clientWidth || window.innerWidth) - padding;

            // Limitar entre 60% y 150% para que no quede absurdo
            const scale = Math.max(0.45, Math.min(this.MAX_ZOOM, available / viewport.width));

            return Math.round(scale * 100) / 100; // redondear a 2 decimales
        } catch {
            return null;
        }
    }

    updateFitButton(active) {
        const btn = document.getElementById("fitWidth");
        if (!btn) return;
        btn.classList.toggle("active", active);
        btn.title = active
            ? "Desactivar ajuste al ancho (volver a 100%)"
            : "Ajustar al ancho";
    }
}