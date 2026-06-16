export class Sidebar {

    constructor({ config, onOpenPDF }) {

        this.config    = config;
        this.onOpenPDF = onOpenPDF;

        this.petsList    = document.getElementById("petsList");
        this.searchInput = document.getElementById("searchInput");
        this.searchClear = document.getElementById("searchClear");
        this.areaFilters = document.getElementById("areaFilters");
        this.petsCounter = document.getElementById("petsCounter");

        this.cards            = [];
        this.activeCard       = null;
        this.activeButton     = null;
        this.activeAreaLabel  = null;
        this.searchTimeout    = null;

        this.initialize();
    }

    initialize() {
        this.renderPets();
        this.initializeSearch();
        this.updateCounter();
        this.restoreLastSelection();
        
        // Ocultar los filtros de área
        if (this.areaFilters) {
            this.areaFilters.style.display = "none";
        }
    }

    // ================================
    // 🔤 NORMALIZAR — quita tildes,
    // minúsculas, elimina prefijo numérico
    // ================================

    normalize(str) {
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    // ================================
    // 🔎 BÚSQUEDA
    // ================================

    initializeSearch() {

        this.searchInput?.addEventListener("input", () => {
            clearTimeout(this.searchTimeout);
            if (this.searchClear) {
                this.searchClear.hidden = !this.searchInput.value;
            }
            this.searchTimeout = setTimeout(() => this.filterPets(), 120);
        });

        this.searchClear?.addEventListener("click", () => {
            this.searchInput.value  = "";
            this.searchClear.hidden = true;
            this.searchInput.focus();
            this.filterPets();
        });
    }

    filterPets() {

        const raw   = this.searchInput?.value.trim() || "";
        const query = this.normalize(raw);

        let visible = 0;

        this.cards.forEach(({ card, pet }) => {
            let match = true;
            
            if (query) {
                const normNombre = this.normalize(pet.nombre);
                const matchName  = normNombre.includes(query);
                const matchArea  = Object.keys(pet.archivos)
                    .some(a => this.normalize(a).includes(query));
                match = matchName || matchArea;
            }

            const show = match;
            card.style.display = show ? "" : "none";
            if (show) visible++;
        });

        this.renderEmptyState(visible === 0);
        this.updateCounter(visible);
    }

    // ================================
    // 📭 EMPTY STATE
    // ================================

    renderEmptyState(show) {
        let empty = this.petsList?.querySelector(".empty-search-state");

        if (show) {
            if (!empty) {
                empty = document.createElement("div");
                empty.className = "empty-search-state";
                empty.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <circle cx="14" cy="14" r="10" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M22 22l6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M10 14h8M14 10v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.4"/>
                    </svg>
                    <p>Sin resultados</p>
                    <span>Intenta con otro término</span>
                `;
                this.petsList?.appendChild(empty);
            }
        } else if (empty) {
            empty.remove();
        }
    }

    // ================================
    // 🔢 CONTADOR
    // ================================

    updateCounter(visibleCount) {
        if (!this.petsCounter) return;
        const total   = this.config.pets.length;
        const visible = visibleCount ?? total;

        this.petsCounter.textContent = visible === total
            ? `${total} procedimientos`
            : `${visible} de ${total} procedimientos`;
    }

    // ================================
    // 📚 RENDER PETS
    // ================================

    renderPets() {
        const frag = document.createDocumentFragment();
        this.config.pets.forEach(pet => frag.appendChild(this.createPetCard(pet)));
        this.petsList?.appendChild(frag);
    }

    // ================================
    // 📚 EXTRACT VERSION
    // ================================

    extractVersionFromPath(path){

        const match =
            path.match(
                /(VERSION|VER|V)[\s_-]*(\d+)/i
            );

        return match
            ? match[2].padStart(2,"0")
            : null;
    }

    // ================================
    // 📦 CREATE CARD
    // ================================

    createPetCard(pet) {

        const card = document.createElement("div");
        card.className = "pet-card";
        card.setAttribute("role", "listitem");

        const numMatch = pet.nombre.match(/^(\d+)/);

        const petNum =
            numMatch
                ? `PET ${numMatch[1].padStart(3,"0")}`
                : "";

        const petName =
            pet.nombre
                .replace(/^\d+[-\s]*/, "")
                .trim();

        const firstPath =
            Object.values(pet.archivos)[0];

        const version =
            this.extractVersionFromPath(
                firstPath
            );

        // ==========================
        // NÚMERO PET
        // ==========================

        if(petNum){

            const petHeader =
                document.createElement("div");

            petHeader.className =
                "pet-number-row";

            const numEl =
                document.createElement("div");

            numEl.className =
                "pet-number";

            numEl.textContent =
                version
                    ? `${petNum} · VER. ${version}`
                    : petNum;

            petHeader.appendChild(numEl);

            card.appendChild(petHeader);
        }

        // ==========================
        // HEADER
        // ==========================

        const header =
            document.createElement("div");

        header.className =
            "pet-card-header";

        const title =
            document.createElement("div");

        title.className =
            "pet-title";

        title.textContent =
            petName;

        const chevron =
            document.createElement("div");

        chevron.className =
            "pet-chevron";

        chevron.innerHTML =
        `
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
            >
                <path
                    d="M4 6L8 10L12 6"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `;

        header.appendChild(title);
        header.appendChild(chevron);

        card.appendChild(header);

        // ==========================
        // ÁREA ACTIVA
        // ==========================

        const areaIndicator =
            document.createElement("div");

        areaIndicator.className =
            "pet-active-area";

        card.appendChild(areaIndicator);

        // ==========================
        // ÁREAS
        // ==========================

        const areasRow =
            document.createElement("div");

        areasRow.className =
            "areas-row areas-collapsed";

        Object.entries(
            pet.archivos
        ).forEach(
            ([area,path]) => {

                areasRow.appendChild(

                    this.createAreaButton({

                        area,
                        path,

                        card,

                        areaIndicator,

                        petName:
                            pet.nombre,

                        areaName:
                            area
                    })
                );
            }
        );

        card.appendChild(
            areasRow
        );

        // ==========================
        // ACORDEÓN
        // ==========================

        header.addEventListener(
            "click",
            () => {

                const expanded =

                    card.classList.contains(
                        "expanded"
                    );

                // ==========================
                // CERRAR TODOS
                // ==========================

                this.cards.forEach(
                    item => {

                        item.card.classList.remove(
                            "expanded"
                        );

                        item.card.classList.remove(
                            "active"
                        );

                        item.areasRow.classList.add(
                            "areas-collapsed"
                        );

                        item.chevron.classList.remove(
                            "open"
                        );

                        const badge =
                            item.card.querySelector(
                                ".pet-active-area"
                            );

                        if(badge){

                            badge.textContent = "";

                            badge.classList.remove(
                                "visible"
                            );
                        }

                        item.card.querySelectorAll(
                            ".area-btn.active"
                        ).forEach(
                            btn => btn.classList.remove(
                                "active"
                            )
                        );
                    }
                );

                // ==========================
                // LIMPIAR REFERENCIAS
                // ==========================

                this.activeCard =
                    null;

                this.activeButton =
                    null;

                this.activeAreaLabel =
                    null;

                // ==========================
                // ABRIR ACTUAL
                // ==========================

                if(!expanded){

                    card.classList.add(
                        "expanded"
                    );

                    areasRow.classList.remove(
                        "areas-collapsed"
                    );

                    chevron.classList.add(
                        "open"
                    );
                }
            }
        );

        // ==========================
        // REGISTRO
        // ==========================

        this.cards.push({

            pet,

            card,

            areasRow,

            chevron
        });

        return card;
    }

    // ================================
    // 🔘 CREATE BUTTON
    // ================================

    createAreaButton({ area, path, card, areaIndicator, petName, areaName }) {

        const btn = document.createElement("button");
        btn.className    = "area-btn";
        btn.textContent  = area;
        btn.dataset.path = path;
        btn.title        = `${petName} — ${area}`;
        btn.setAttribute("aria-label", `Abrir ${petName}, área ${area}`);

        btn.addEventListener("click", async () => {
            try {
                this.setActive(card, btn, areaIndicator, area);

                localStorage.setItem("lastPDF",      path);
                localStorage.setItem("lastPetName",  petName);
                localStorage.setItem("lastAreaName", areaName);

                await this.onOpenPDF(path, petName, areaName);
            } catch (err) {
                console.error("❌ PDF ERROR:", err);
            }
        });

        return btn;
    }

    // ================================
    // 🎯 ACTIVE STATE + badge de área
    // ================================

    setActive(card, button, areaIndicator, area) {
        // limpiar anterior
        this.activeCard?.classList.remove("active");
        this.activeButton?.classList.remove("active");

        if (this.activeAreaLabel) {
            this.activeAreaLabel.textContent = "";
            this.activeAreaLabel.classList.remove("visible");
        }

        // activar nuevo
        card.classList.add("active");
        button.classList.add("active");

        if (areaIndicator && area) {
            areaIndicator.textContent = `Viendo: ${area}`;
            areaIndicator.classList.add("visible");
        }

        this.activeCard      = card;
        this.activeButton    = button;
        this.activeAreaLabel = areaIndicator;

        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ================================
    // 💾 RESTAURAR ÚLTIMA SELECCIÓN
    // ================================

    restoreLastSelection() {

        const lastPDF =
            localStorage.getItem(
                "lastPDF"
            );

        if(!lastPDF)
            return;

        const btn =
            document.querySelector(
                `[data-path="${CSS.escape(lastPDF)}"]`
            );

        if(!btn)
            return;

        requestAnimationFrame(
            () => {

                const card =
                    btn.closest(
                        ".pet-card"
                    );

                const areasRow =
                    card?.querySelector(
                        ".areas-row"
                    );

                const chevron =
                    card?.querySelector(
                        ".pet-chevron"
                    );

                if(
                    card &&
                    areasRow &&
                    chevron
                ){

                    card.classList.add(
                        "expanded"
                    );

                    areasRow.classList.remove(
                        "areas-collapsed"
                    );

                    chevron.classList.add(
                        "open"
                    );
                }

                //btn.click();
            }
        );
    }
}