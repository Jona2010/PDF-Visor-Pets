export class ZoomManager {

    // ── DEBUG: poner en false para silenciar ──
    static DEBUG = false;

    _log(...args) {
        if (ZoomManager.DEBUG) {
            const t = (performance.now() - (this._t0 || 0)).toFixed(1);
            console.log(`[zoom +${t}ms]`, ...args);
        }
    }

    constructor({ viewer }) {

        this.viewer = viewer;
        this._t0    = performance.now();

        // ── Estado de zoom ──
        this.zoom      = 1;
        this.isFitMode = false;   // true cuando fitToWidth está activo

        // ── isMobile definido ANTES de usarse ──
        this.isMobile = window.matchMedia("(max-width: 768px)").matches;

        // ── Límites ──
        this.MIN_ZOOM  = 0.20;
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

        // Punto de anclaje del próximo render (posición del cursor en el wheel).
        // null = anclar al centro del contenedor.
        this.anchor = null;

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

        // ── Wheel zoom (Ctrl/⌘ + rueda) con anclaje al cursor ──
        this.viewerContainer?.addEventListener("wheel", e => {

            if (!e.ctrlKey && !e.metaKey) return;   // sólo zoom, no scroll normal

            e.preventDefault();

            // Guardar la posición del cursor para anclar el próximo render
            this.anchor = { clientX: e.clientX, clientY: e.clientY };

            // deltaY negativo = scroll arriba = acercar
            const delta = -e.deltaY * 0.0015;
            this.zoomBy(delta);

        }, { passive: false });

        // Wheel zoom (Ctrl + rueda) — llamado desde visor.js
        // pero también puede registrarse aquI
        // Actualizar isMobile en resize
        window.addEventListener("resize", () => {
            this.isMobile = window.matchMedia("(max-width: 768px)").matches;
            this.MAX_ZOOM =
                this.isMobile ? 3 : 5;
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
        this._t0 = performance.now();
        this._log(`STEP ${direction > 0 ? "+" : "−"} | zoom actual=${this.zoom.toFixed(3)} | viewer.scale=${this.viewer?.scale?.toFixed(3)}`);
        this.isFitMode = false;
        this.anchor = null;   // botones/teclado → anclar al centro
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
            if (this.viewer) this.viewer._zooming = true;
            this._baseScale = this.viewer?.scale || 1;
            this._frameCount = 0;
            this._log(`ZOOM_TO target=${this.targetZoom.toFixed(3)} | baseScale congelada=${this._baseScale.toFixed(3)}`);
            this.animId = requestAnimationFrame(() => this._animateZoom());
        } else {
            this._log(`ZOOM_TO target=${this.targetZoom.toFixed(3)} (anim ya corriendo)`);
        }
    }

    _animateZoom() {

        this._frameCount = (this._frameCount || 0) + 1;
        const diff   = this.targetZoom - this.zoom;
        const speed  = 0.85;   // 0..1 — más alto = más rápido

        if (Math.abs(diff) < 0.0008) {
            // Llegamos — fijar exacto y lanzar render real
            this.zoom   = this.targetZoom;
            this.animId = null;
            this._applyVisualScale(this.zoom);
            this._updateLabel(this.zoom);
            this._log(`ANIM FIN tras ${this._frameCount} frames | zoom=${this.zoom.toFixed(3)}`);
            this._scheduleRender();
            return;
        }

        // Lerp exponencial (como Acrobat: rápido al inicio, suave al llegar)
        this.zoom += diff * speed;

        this._applyVisualScale(this.zoom);
        this._updateLabel(this.zoom);

        this.animId = requestAnimationFrame(() => this._animateZoom());
    }

    // Aplica transform:scale SOLO como feedback visual durante la animación.
    // CLAVE: el transform es relativo a la escala YA renderizada (committedScale),
    // no al zoom absoluto. Así no se produce doble escalado cuando setScale
    // repinta las páginas a su tamaño real.
    // El origen se fija en el punto del cursor para que el zoom "salga" de ahí.
    _applyVisualScale(z) {

        if (!this.pdfViewer) return;

        const committed = this._baseScale || this.viewer?.scale || 1;
        const ratio = z / committed;

        // El origin del transform DEBE coincidir con el punto que _commitGeometry
        // usa para anclar, o al quitar el transform habrá un salto.
        // - Con cursor (wheel): el punto del cursor.
        // - Sin cursor (botones/teclado): el centro del viewport.
        const vrect = this.pdfViewer.getBoundingClientRect();
        const crect = this.viewerContainer?.getBoundingClientRect();

        let ox, oy;
        if (this.anchor) {
            ox = this.anchor.clientX - vrect.left;
            oy = this.anchor.clientY - vrect.top;
        } else if (crect) {
            // centro del viewport, en coordenadas del #pdfViewer
            ox = (crect.left + crect.width / 2) - vrect.left;
            oy = (crect.top + crect.height / 2) - vrect.top;
        } else {
            ox = vrect.width / 2;
            oy = 0;
        }

        this.pdfViewer.style.transformOrigin = `${ox}px ${oy}px`;
        //this.pdfViewer.style.transform = `scale(${ratio})`;
    }

    _updateLabel(z) {
        if (this.zoomLabel) {
            this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
        }
    }

    // Al terminar la animación:
    // 1. _commitGeometry redimensiona y ajusta scroll SÍNCRONO.
    // 2. En el MISMO frame se quita el transform → cero doble escalado.
    // 3. El render nítido va después, async, sin bloquear (invisible).
    _scheduleRender() {
        clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => {

            const anchor = this.anchor;

            this._log(`COMMIT inicio | zoom=${this.zoom.toFixed(3)} | transform=${this.pdfViewer?.style.transform} | scrollTop=${this.viewerContainer?.scrollTop}`);

            // ── Bloque SÍNCRONO: geometría + reset transform en el mismo frame ──
            const changed = this.viewer?._commitGeometry(this.zoom, anchor, false);

            if (this.pdfViewer) {
                //this.pdfViewer.style.transform       = "scale(1)";
                this.pdfViewer.style.transformOrigin = "top center";
            }
            if (this.viewer) this.viewer._zooming = false;
            this.anchor = null;

            this._log(`COMMIT fin | viewer.scale=${this.viewer?.scale?.toFixed(3)} | scrollTop=${this.viewerContainer?.scrollTop} | transform=${this.pdfViewer?.style.transform} | changed=${changed}`);

            // ── Render nítido DESPUÉS, async (las páginas ya están al tamaño correcto) ──
            if (changed) {
                this.viewer?._renderVisible();
            }

        }, 1);
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