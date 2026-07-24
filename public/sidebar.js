// ==========================================
// SIDEBAR V2
// CONFIGURACIÓN DE ÁREAS
// ==========================================

const AREA_CONFIG = [

    {
        id: "TODOS",
        nombre: "Todos",
        color: "#00A88F",
        icon: "todos.png"
    },

    {
        id: "C1",
        nombre: "C1",
        color: "#0F766E",
        icon: "c1.png"
    },

    {
        id: "C2",
        nombre: "C2",
        color: "#0EA5A4",
        icon: "c2.png"
    },

    {
        id: "HIDRO",
        nombre: "Hidro",
        color: "#0284C7",
        icon: "hidro.png"
    },

    {
        id: "RELAVES Y AGUAS",
        nombre: "Relaves y Aguas",
        color: "#0891B2",
        icon: "relaves.png"
    },

    {
        id: "MINA",
        nombre: "Mina",
        color: "#B45309",
        icon: "mina.png"
    },

    {
        id: "CONCENTRADORA",
        nombre: "Concentradora",
        color: "#CA8A04",
        icon: "concentradora.png"
    },

    {
        id: "MANTENIMIENTO MINA",
        nombre: "Mantenimiento Mina",
        color: "#64748B",
        icon: "mantenimiento-mina.png"
    },

    {
        id: "GENERAL PROCESOS",
        nombre: "General Procesos",
        color: "#7C3AED",
        icon: "procesos.png"
    },

    {
        id: "PLANTAS-PLAN OPIMIZADO",
        nombre: "Plantas Plan Optimizado",
        color: "#16A34A",
        icon: "plan.png"
    },

    {
        id: "MANTENIMIENTO ELECTRICO MINA",
        nombre: "Mantenimiento Eléctrico Mina",
        color: "#EAB308",
        icon: "electrico.png"
    }

];

export class Sidebar {

    constructor({

        config,

        onOpenPDF,

        onTaskSelected = null

    }) {

        this.config = config;

        this.onOpenPDF = onOpenPDF;

        // Callback hacia App
        this.onTaskSelected = onTaskSelected;

        this.petsList    = document.getElementById("petsList");
        this.searchInput = document.getElementById("searchInput");
        this.searchClear = document.getElementById("searchClear");
        this.areaFilters = document.getElementById("areaFilters");
        this.petsCounter = document.getElementById("petsCounter");

        // ==========================================
        // ELEMENTOS DEL SIDEBAR
        // ==========================================

        this.currentAreaName =
            document.getElementById("currentAreaName");

        this.changeAreaBtn =
            document.getElementById("changeAreaBtn");
        
        // ==========================================
        // PANEL DE SOLICITUD DE PROCEDIMIENTOS
        // ==========================================

        this.requestBtn =
            document.getElementById("requestBtn");

        this.requestPanel =
            document.getElementById("requestPanel");

        this.requestAreaSelect =
            document.getElementById("requestAreaSelect");

        this.requestPetsList =
            document.getElementById("requestPetsList");

        this.requestCounter =
            document.getElementById("requestCounter");

        this.copyRequestBtn =
            document.getElementById("copyRequestBtn");

        this.clearRequestBtn =
            document.getElementById("clearRequestBtn");

        this.closeRequestPanelBtn =
            document.getElementById("closeRequestPanel");

        this.requestSearch =
            document.getElementById("requestSearch");

        this.requestSelectAll =
            document.getElementById("requestSelectAll");

        this.cards            = [];
        this.activeCard       = null;
        this.activeButton     = null;
        this.activeAreaLabel  = null;
        this.searchTimeout    = null;

        // ==========================================
        // SIDEBAR V2
        // ==========================================

        this.viewMode = "areas";

        this.currentArea = "TODOS";

        this.areaCards = [];

        this.filteredPets = [];

        // ==========================================
        // SIDEBAR V4
        // ÁRBOL DEL PROCEDIMIENTO
        // ==========================================

        // Árbol generado por PDFViewer
        this.taskTree = [];

        // Paso actualmente visible
        this.currentTask = null;

        // Nodo actualmente resaltado
        this.activeTaskNode = null;

        // Paso seleccionado por el usuario
        this.selectedTask = null;

        // Referencias a los nodos renderizados
        this.taskNodes = new Map();

        // Nodos expandidos
        this.expandedTasks = new Set();

        // Texto del buscador interno
        this.taskSearch = "";

        // Contenedor donde posteriormente
        // se dibujará el árbol
        this.taskContainer = null;

        // Panel del índice jerárquico
        this.taskPanel = null;

        // ==========================================
        // SIDEBAR V3
        // SOLICITUD DE PROCEDIMIENTOS
        // ==========================================

        this.requestArea = "TODOS";

        this.requestSelection = new Map();

        this.requestVisible = false;

        // ==========================================
        // TOAST
        // ==========================================

        this.toast =

            document.getElementById(

                "toast"

            );

        this.toastMessage =

            document.getElementById(

                "toastMessage"

            );

        this.toastTimer = null;

        this.initialize();
    }

    initialize() {
        //this.renderPets();
        this.render();

        this.initializeSearch();

        this.initializeTaskPanel();

        this.requestBtn?.addEventListener(

            "click",

            ()=>{

                this.openRequestPanel();

            }

        );

        this.closeRequestPanelBtn?.addEventListener(
            "click",
            () => {
                this.closeRequestPanel();
            }
        );

        this.clearRequestBtn?.addEventListener(

            "click",

            ()=>{

                this.clearRequest();

            }

        );

        this.copyRequestBtn?.addEventListener(

            "click",

            ()=>{

                this.copyRequest();

            }

        );

        this.requestSearch?.addEventListener(

            "input",

            ()=>{

                this.renderRequestPets();

            }

        );

        this.requestSelectAll?.addEventListener(

            "change",

            ()=>{

                this.toggleAllRequestPets();

            }

        );

        // ==========================================
        // CAMBIO DE ÁREA EN SOLICITUD
        // ==========================================

        this.requestAreaSelect?.addEventListener(

            "change",

            () => {

                this.requestArea =
                    this.requestAreaSelect.value;

                if(this.requestSearch){

                    this.requestSearch.value = "";

                }

                this.renderRequestPets();

            }

        );

        // ==========================================
        // RESTAURAR ÚLTIMA ÁREA
        // ==========================================

        const lastArea = localStorage.getItem("lastArea");

        if (
            lastArea &&
            AREA_CONFIG.some(area => area.id === lastArea)
        ) {

            this.currentArea = lastArea;

            const areaConfig = AREA_CONFIG.find(
                area => area.id === lastArea
            );

            if (this.currentAreaName) {

                this.currentAreaName.textContent =
                    areaConfig?.nombre ?? "Todos";

            }

        }

        this.updateCounter();


        //this.restoreLastSelection();

        // ==========================================
        // BOTÓN CAMBIAR ÁREA
        // ==========================================

        this.changeAreaBtn?.addEventListener(

            "click",

            ()=>{

                this.showAreas();

            }

        );
       
        // Ocultar los filtros de área
        if (this.areaFilters) {
            this.areaFilters.style.display = "none";
        }
    }

    // ==========================================
    // SIDEBAR V2
    // RENDER PRINCIPAL
    // ==========================================

    // ==========================================
    // SIDEBAR V2
    // RENDER PRINCIPAL
    // ==========================================

    render() {

        // Fade Out
        this.petsList.style.opacity = "0";

        requestAnimationFrame(() => {

            // Limpiar contenido
            this.petsList.innerHTML = "";

            // Renderizar según la vista actual
            if (this.viewMode === "areas") {

                this.renderAreas();

            } else {

                this.renderPets();

            }

            // Fade In
            requestAnimationFrame(() => {

                this.petsList.style.opacity = "1";

            });

        });

    }

    // ==========================================
    // SIDEBAR V4
    // RECIBIR EL ÁRBOL DEL PDF
    // ==========================================

    setTaskTree(tree = []) {

        this.taskTree =

            Array.isArray(tree)

                ? tree

                : [];

        this.currentTask = null;

        this.selectedTask = null;

        this.taskNodes.clear();

        this.expandedTasks.clear();

        if (this.taskTree.length) {

            this.expandRootTasks();

            this.renderTaskTree();

            this.showTaskPanel();

        } else {

            this.clearTaskTreeView();

            this.hideTaskPanel();

        }

    }

    // ==========================================
    // OBTENER EL ÁRBOL
    // ==========================================

    getTaskTree() {

        return this.taskTree;

    }

    // ==========================================
    // LIMPIAR EL ÁRBOL
    // ==========================================

    clearTaskTree() {

        this.taskTree = [];

        this.currentTask = null;

        this.selectedTask = null;

        this.taskNodes.clear();

        this.expandedTasks.clear();

        this.clearTaskTreeView();

        this.hideTaskPanel();

    }

    // ==========================================
    // EXISTE ÁRBOL
    // ==========================================

    hasTaskTree() {

        return this.taskTree.length > 0;

    }

    // ==========================================
    // ESTADÍSTICAS DEL ÁRBOL
    // ==========================================

    getTaskTreeInfo() {

        let total = 0;

        const walk = (nodes) => {

            nodes.forEach(node => {

                total++;

                if (

                    Array.isArray(node.children) &&

                    node.children.length

                ) {

                    walk(node.children);

                }

            });

        };

        walk(this.taskTree);

        return {

            roots: this.taskTree.length,

            total

        };

    }

    // ==========================================
    // CREAR PANEL DEL ÍNDICE
    // ==========================================

    initializeTaskPanel() {

        if (this.taskPanel) {

            return;

        }

        this.taskPanel = document.createElement("div");

        this.taskPanel.className = "task-tree-panel";

        this.taskPanel.hidden = true;

        this.taskContainer = document.createElement("div");

        this.taskContainer.className = "task-tree";

        this.taskPanel.appendChild(this.taskContainer);

        this.petsList.parentNode.insertBefore(

            this.taskPanel,

            this.petsList

        );

    }

    // ==========================================
    // MOSTRAR PANEL
    // ==========================================

    showTaskPanel() {

        if (!this.taskPanel) {

            return;

        }

        this.taskPanel.hidden = false;

    }

    // ==========================================
    // OCULTAR PANEL
    // ==========================================

    hideTaskPanel() {

        if (!this.taskPanel) {

            return;

        }

        this.taskPanel.hidden = true;

    }

    // ==========================================
    // LIMPIAR PANEL DEL ÁRBOL
    // ==========================================

    clearTaskTreeView() {

        if (!this.taskContainer) {

            return;

        }

        this.taskContainer.innerHTML = "";

        this.taskNodes.clear();

    }

    // ==========================================
    // RENDER DEL ÁRBOL
    // ==========================================

    renderTaskTree() {

        if (!this.taskContainer) {

            return;

        }

        this.clearTaskTreeView();

        const fragment = document.createDocumentFragment();

        this.taskTree.forEach(node => {

            fragment.appendChild(

                this.createTaskNode(node)

            );

        });

        this.taskContainer.appendChild(fragment);

    }

    // ==========================================
    // CREAR NODO DEL ÁRBOL
    // ==========================================

    createTaskNode(node, level = 0) {

        const container = document.createElement("div");

        container.className = "task-node";

        container.dataset.id = node.id;

        container.dataset.level = level;

        // sangría
        container.style.marginLeft = `${level * 18}px`;

        const row = document.createElement("div");

        row.className = "task-node-row";

        // ------------------------------------

        const toggle = document.createElement("button");

        toggle.type = "button";

        toggle.className = "task-toggle";

        const hasChildren =

            Array.isArray(node.children)

            &&

            node.children.length > 0;

        toggle.textContent =

            hasChildren

                ? (

                    this.expandedTasks.has(node.id)

                        ? "▼"

                        : "▶"

                )

                : "";

        toggle.disabled = !hasChildren;

        row.appendChild(toggle);

        // ------------------------------------

        const title = document.createElement("button");

        title.type = "button";

        title.className = "task-node-title";

        title.textContent = node.title;

        row.appendChild(title);

        container.appendChild(row);

        this.taskNodes.set(

            node.id,

            container

        );

        // ------------------------------------

        const childrenContainer =

            document.createElement("div");

        childrenContainer.className =

            "task-children";

        if (

            hasChildren

        ) {

            if (

                !this.expandedTasks.has(node.id)

            ) {

                childrenContainer.hidden = true;

            }

            node.children.forEach(child => {

                childrenContainer.appendChild(

                    this.createTaskNode(

                        child,

                        level + 1

                    )

                );

            });

        }

        container.appendChild(

            childrenContainer

        );

        // ------------------------------------

        toggle.addEventListener(

            "click",

            e => {

                e.stopPropagation();

                this.toggleTaskNode(

                    node.id

                );

            }

        );

        title.addEventListener(

            "click",

            ()=>{

                this.selectTaskNode(

                    node.id

                );

            }

        );

        return container;

    }

    // ==========================================
    // ACTUALIZAR ÁRBOL
    // ==========================================

    refreshTaskTree() {

        if (

            !this.hasTaskTree()

        ) {

            return;

        }

        this.renderTaskTree();

    }

    // ==========================================
    // BUSCAR NODO
    // ==========================================

    getTaskNode(id) {

        return this.taskNodes.get(id) || null;

    }

    // ==========================================
    // EXPANDIR / CONTRAER
    // ==========================================

    toggleTaskNode(id){

        if(

            this.expandedTasks.has(id)

        ){

            this.expandedTasks.delete(id);

        }

        else{

            this.expandedTasks.add(id);

        }

        this.refreshTaskTree();

    }

    // ==========================================
    // SELECCIONAR NODO
    // ==========================================

    selectTaskNode(id){

        const node = this.findTaskById(id);

        if(!node){

            return;

        }

        this.selectedTask = id;

        this.expandParents(id);

        this.highlightTaskNode(id);

        this.scrollTaskNodeIntoView(id);

        if(typeof this.onTaskSelected === "function"){

            this.onTaskSelected(node.id);

        }

    }

    // ==========================================
    // RESALTAR NODO
    // ==========================================

    highlightTaskNode(id){

        if(

            this.activeTaskNode

        ){

            this.activeTaskNode.classList.remove(

                "active"

            );

        }

        const element =

            this.getTaskNode(id);

        if(!element){

            return;

        }

        element.classList.add(

            "active"

        );

        this.activeTaskNode =

            element;

    }

    // ==========================================
    // SCROLL HACIA EL NODO
    // ==========================================

    scrollTaskNodeIntoView(id){

        const element =

            this.getTaskNode(id);

        if(!element){

            return;

        }

        element.scrollIntoView({

            behavior:"smooth",

            block:"nearest"

        });

    }

    // ==========================================
    // BUSCAR TASK POR ID
    // ==========================================

    findTaskById(id){

        let result = null;

        const walk = nodes=>{

            for(const node of nodes){

                if(node.id===id){

                    result=node;

                    return;

                }

                if(node.children?.length){

                    walk(node.children);

                }

                if(result){

                    return;

                }

            }

        };

        walk(this.taskTree);

        return result;

    }

    // ==========================================
    // ACTUALIZAR CALLBACK
    // ==========================================

    setTaskSelectionListener(callback){

        this.onTaskSelected = callback;

    }

    // ==========================================
    // ACTUALIZAR TASK ACTUAL
    // ==========================================

    setCurrentTask(id){

        if(

            this.currentTask===id

        ){

            return;

        }

        this.currentTask=id;

        this.highlightTaskNode(id);

        this.scrollTaskNodeIntoView(id);

    }

    // ==========================================
    // LIMPIAR TASK ACTUAL
    // ==========================================

    clearCurrentTask(){

        this.currentTask = null;

        this.selectedTask = null;

        if(

            this.activeTaskNode

        ){

            this.activeTaskNode.classList.remove(

                "active"

            );

        }

        this.taskNodes.clear();

        this.expandedTasks.clear();

        this.activeTaskNode = null;

        this.clearTaskTreeView();

        this.hideTaskPanel();

    }

    // ==========================================
    // EXPANDIR PADRES
    // ==========================================

    expandParents(id){

        const walk = (nodes,parent=null)=>{

            for(const node of nodes){

                if(node.id===id){

                    if(parent){

                        this.expandedTasks.add(parent.id);

                    }

                    return true;

                }

                if(node.children?.length){

                    const found =

                        walk(

                            node.children,

                            node

                        );

                    if(found){

                        this.expandedTasks.add(

                            node.id

                        );

                        return true;

                    }

                }

            }

            return false;

        };

        walk(this.taskTree);

        this.refreshTaskTree();

    }

    // ==========================================
    // EXPANDIR TODO
    // ==========================================

    expandAllTasks(){

        const walk = nodes =>{

            nodes.forEach(node=>{

                if(

                    node.children?.length

                ){

                    this.expandedTasks.add(

                        node.id

                    );

                    walk(node.children);

                }

            });

        };

        walk(

            this.taskTree

        );

        this.refreshTaskTree();

    }

    // ==========================================
    // COLAPSAR TODO
    // ==========================================

    collapseAllTasks(){

        this.expandedTasks.clear();

        this.refreshTaskTree();

    }

    // ==========================================
    // EXPANDIR SOLO RAÍCES
    // ==========================================

    expandRootTasks(){

        this.expandedTasks.clear();

        this.taskTree.forEach(node=>{

            if(

                node.children?.length

            ){

                this.expandedTasks.add(

                    node.id

                );

            }

        });

        this.refreshTaskTree();

    }

    // ==========================================
    // SIDEBAR V2
    // CAMBIAR A VISTA ÁREAS
    // ==========================================

    showAreas(){

        this.viewMode="areas";

        if(this.currentAreaName){

            this.currentAreaName.textContent="Todos";

        }

        if(this.changeAreaBtn){

            this.changeAreaBtn.hidden=true;

        }

        if(this.searchInput){

            this.searchInput.disabled = true;

            this.searchInput.placeholder =
                "Seleccione un área";

        }

        this.render();

    }

    // ==========================================
    // SIDEBAR V2
    // CAMBIAR A VISTA PETS
    // ==========================================

    showPets(){

        this.viewMode="pets";

        if(this.changeAreaBtn){

            this.changeAreaBtn.hidden=false;

        }

        if(this.searchInput){

            this.searchInput.disabled = false;

            this.searchInput.placeholder =
                "Buscar PET o área...";

        }

        this.render();

    }

    // ==========================================
    // SIDEBAR V2
    // SELECCIONAR ÁREA
    // ==========================================

    selectArea(area){

        this.currentArea=area;

        if(this.currentAreaName){

            const areaConfig = AREA_CONFIG.find(
                a => a.id === area
            );

            this.currentAreaName.textContent =
                areaConfig?.nombre ?? area;

        }

        if(this.searchInput){

            this.searchInput.value="";

        }

        if(this.searchClear){

            this.searchClear.hidden=true;

        }

        this.showPets();

    }

    // ==========================================
    // SIDEBAR V2
    // RENDER ÁREAS
    // ==========================================

    renderAreas() {

        // Limpiar listado
        this.petsList.innerHTML = "";

        // Ya no existen tarjetas PET en esta vista
        this.cards = [];

        const frag = document.createDocumentFragment();

        AREA_CONFIG.forEach(area => {

            // ==========================
            // CONTADOR DE PETS
            // ==========================

            let total = this.config.pets.length;

            if (area.id !== "TODOS") {

                total = this.config.pets.filter(pet =>
                    Object.keys(pet.archivos).includes(area.id)
                ).length;

            }

            // ==========================
            // TARJETA
            // ==========================

            const card = document.createElement("button");

            card.className = "area-card";

            card.dataset.area = area.id;

            // ==========================================
            // COLOR DEL ÁREA
            // ==========================================

            card.style.setProperty(
                "--area-color",
                area.color
            );

            card.innerHTML = `

                <div class="area-card-header">

                    <div class="area-card-icon">

                        <img
                            src="icons/${area.icon}"
                            alt="${area.nombre}"
                            loading="lazy"
                            draggable="false"
                        >

                    </div>

                </div>

                <div class="area-card-title">

                    ${area.nombre}

                </div>

                <div class="area-card-count">

                    ${total} procedimientos

                </div>

            `;

            card.addEventListener("click", () => {

                this.selectArea(area.id);

            });

            if(area.id===this.currentArea){

                card.classList.add("selected");

            }

            frag.appendChild(card);

        });

        this.petsList.appendChild(frag);

        this.filteredPets=[...this.config.pets];

        this.updateCounter();

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

            const areaMatch =

                this.currentArea==="TODOS"

                ||

                Object.keys(pet.archivos)

                    .includes(this.currentArea);

            const show =

                match && areaMatch;
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

    // ==========================================
    // SIDEBAR V2
    // CONTADOR
    // ==========================================

    updateCounter(visibleCount) {

        if (!this.petsCounter) return;

        // ===============================
        // VISTA DE ÁREAS
        // ===============================

        if (this.viewMode === "areas") {

            const totalAreas = AREA_CONFIG.filter(
                area => area.id !== "TODOS"
            ).length;

            this.petsCounter.textContent =
                `${totalAreas} áreas`;

            return;

        }

        // ===============================
        // VISTA DE PETS
        // ===============================

        const total = this.filteredPets.length;

        const visible = visibleCount ?? total;

        if (visible === total) {

            this.petsCounter.textContent =
                `${total} procedimientos`;

        } else {

            this.petsCounter.textContent =
                `${visible} de ${total} procedimientos`;

        }

    }

    // ==========================================
    // SIDEBAR V2
    // RENDER PETS
    // ==========================================

    renderPets() {

        // ==========================================
        // LIMPIAR CONTENEDOR
        // ==========================================

        this.petsList.innerHTML = "";

        // Reiniciar tarjetas registradas
        this.cards = [];

        // ==========================================
        // OBTENER ÁREA ACTUAL
        // ==========================================

        const area = this.currentArea;

        // ==========================================
        // FILTRAR PETS
        // ==========================================

        this.filteredPets =

            area === "TODOS"

                ? [...this.config.pets]

                : this.config.pets.filter(pet =>

                    Object.keys(pet.archivos)
                        .includes(area)

                );

        // ==========================================
        // CREAR FRAGMENTO
        // ==========================================

        const fragment = document.createDocumentFragment();

        // ==========================================
        // RENDERIZAR TARJETAS
        // ==========================================

        this.filteredPets.forEach(pet => {

            const card = this.createPetCard(pet);

            fragment.appendChild(card);

        });

        // ==========================================
        // INSERTAR EN EL DOM
        // ==========================================

        this.petsList.appendChild(fragment);

        // ==========================================
        // CONTADOR
        // ==========================================

        this.updateCounter(this.filteredPets.length);

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
                ? `PET ${numMatch[1].padStart(3, "0")}`
                : "";

        const petName =
            pet.nombre
                .replace(/^\d+[-\s]*/, "")
                .trim();
        
        // ==========================================
        // ID DEL PET
        // ==========================================

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

    // ==========================================
    // SIDEBAR V3
    // PANEL SOLICITUD
    // ==========================================

    openRequestPanel(){

        if(!this.requestPanel)
            return;

        this.requestVisible = true;

        if(this.requestSearch){

            this.requestSearch.value = "";

        }

        // Abrir directamente en el área que el usuario
        // está visualizando en el visor
        this.requestArea =

            this.currentArea === "TODOS"

                ? "C1"

                : this.currentArea;

        this.requestPanel.hidden = false;

        this.requestPanel.setAttribute(

            "aria-hidden",

            "false"

        );

        this.renderRequestAreas();

        this.renderRequestPets();

        this.updateRequestCounter();

    }

    // ==========================================
    // CERRAR PANEL
    // ==========================================

    closeRequestPanel(){

        if(!this.requestPanel)
            return;

        this.requestVisible = false;

        this.requestPanel.hidden = true;

        this.requestPanel.setAttribute(
            "aria-hidden",
            "true"
        );

        this.requestArea = this.currentArea;

    }

    // ==========================================
    // RENDER ÁREAS DE SOLICITUD
    // ==========================================

    renderRequestAreas(){

        if(!this.requestAreaSelect)
            return;

        this.requestAreaSelect.innerHTML = "";

        AREA_CONFIG
            .filter(area => area.id !== "TODOS")
            .forEach(area => {

                const option =
                    document.createElement("option");

                option.value = area.id;

                option.textContent = area.nombre;

                this.requestAreaSelect.appendChild(option);

            });

        if(
            !this.requestArea ||
            this.requestArea === "TODOS"
        ){

            const defaultArea =

                AREA_CONFIG.find(

                    area => area.id === "C1"

                );

            this.requestArea = defaultArea.id;

        }

        this.requestAreaSelect.value =
            this.requestArea;

    }

    // ==========================================
    // RENDER PETS DE SOLICITUD
    // ==========================================

    renderRequestPets(){

        if(!this.requestPetsList)
            return;

        this.requestPetsList.innerHTML = "";

        const query =

            this.requestSearch
                ?.value
                .trim()
                .toLowerCase() || "";

        const pets =

            this.config.pets

                .filter(pet =>

                    Object.keys(

                        pet.archivos

                    ).includes(

                        this.requestArea

                    )

                )

                .filter(pet=>{

                    if(!query)
                        return true;

                    const number =
                        pet.nombre.match(/\d+/)?.[0] ?? "";

                    const petCode =
                        `PET ${number.padStart(3,"0")}`;

                    return(

                        pet.nombre
                            .toLowerCase()
                            .includes(query)

                        ||

                        petCode
                            .toLowerCase()
                            .includes(query)

                        ||

                        number
                            .includes(query)

                    );

                })

                .sort((a,b)=>{

                    const na =
                        parseInt(
                            a.nombre.match(/\d+/)?.[0] || 0
                        );

                    const nb =
                        parseInt(
                            b.nombre.match(/\d+/)?.[0] || 0
                        );

                    return na-nb;

                });

        if(!pets.length){

            this.requestPetsList.innerHTML = `
                <div class="request-empty">
                    No existen procedimientos para esta área.
                </div>
            `;

            this.updateRequestCounter();

            return;

        }

        const fragment =
            document.createDocumentFragment();

        pets.forEach(pet=>{

            const path =
                pet.archivos[
                    this.requestArea
                ];

            const version =
                this.extractVersionFromPath(
                    path
                );

            const numMatch =
                pet.nombre.match(/^(\d+)/);

            const petNum =

                numMatch

                    ? `PET ${numMatch[1].padStart(3,"0")}`

                    : pet.nombre;

            const item =
                document.createElement("label");

            item.className =
                "request-pet";

            item.innerHTML =

            `
                <input
                    type="checkbox"
                    data-pet="${pet.nombre}"
                >

                <span>

                    ${petNum}

                    ${version ? `• VER. ${version}` : ""}

                </span>
            `;

            const checkbox =
                item.querySelector("input");

            const key =
                `${this.requestArea}|${pet.nombre}`;

            checkbox.checked =
                this.requestSelection.has(
                    key
                );

            item.classList.toggle(
                "selected",
                checkbox.checked
            );

            checkbox.addEventListener(

                "change",

                ()=>{

                    item.classList.toggle(

                        "selected",

                        checkbox.checked

                    );

                    this.toggleRequestPet(

                        pet,

                        checkbox.checked

                    );

                }

            );

            fragment.appendChild(item);

        });

        this.requestPetsList.appendChild(

            fragment

        );

        if(this.requestSelectAll){

            const total =
                this.requestPetsList.querySelectorAll(

                    'input[type="checkbox"]'

                ).length;

            const selected =
                this.requestPetsList.querySelectorAll(

                    'input[type="checkbox"]:checked'

                ).length;

            this.requestSelectAll.checked =
                total > 0 && total === selected;

        }

    }

    // ==========================================
    // SELECCIONAR / DESELECCIONAR PET
    // ==========================================

    toggleRequestPet(pet, selected){

        const key =
            `${this.requestArea}|${pet.nombre}`;

        if(selected){

            this.requestSelection.set(

                key,

                {

                    ...pet,

                    requestArea: this.requestArea

                }

            );

        }else{

            this.requestSelection.delete(

                key

            );

        }

        this.updateRequestCounter();

    }

    // ==========================================
    // SELECCIONAR / DESELECCIONAR TODOS
    // ==========================================

    toggleAllRequestPets(){

        const checked =
            this.requestSelectAll.checked;

        const checkboxes =

            this.requestPetsList.querySelectorAll(

                'input[type="checkbox"]'

            );

        checkboxes.forEach(checkbox=>{

            checkbox.checked = checked;

            checkbox.dispatchEvent(

                new Event(

                    "change"

                )

            );

        });

    }

    // ==========================================
    // ACTUALIZAR CONTADOR
    // ==========================================

    updateRequestCounter(){

        if(!this.requestCounter)
            return;

        const total =
            this.requestSelection.size;

        if(total===0){

            this.requestCounter.textContent =
                "Solicitud vacía";

            return;

        }

        this.requestCounter.textContent =

            `${total} PETS${total>1?"s":""} seleccionado${total>1?"s":""}`;

    }

    // ==========================================
    // LIMPIAR SOLICITUD
    // ==========================================

    clearRequest(){

        this.requestSelection.clear();

        if(this.requestSearch){

            this.requestSearch.value = "";

        }

        this.updateRequestCounter();

        this.renderRequestPets();

        if(this.requestAreaSelect){

            this.requestAreaSelect.value =
                this.requestArea;

        }

        if(this.requestSelectAll){

            this.requestSelectAll.checked = false;

        }

    }

    // ==========================================
    // GENERAR TEXTO PARA WHATSAPP
    // ==========================================

    generateRequestText(){

        if(this.requestSelection.size === 0){

            return "";

        }

        const grouped = {};

        Array.from(this.requestSelection.values())

            .sort((a,b)=>{

                const na =
                    parseInt(
                        a.nombre.match(/\d+/)?.[0] || 0
                    );

                const nb =
                    parseInt(
                        b.nombre.match(/\d+/)?.[0] || 0
                    );

                return na-nb;

            })

            .forEach(pet=>{

                const area = pet.requestArea;

                if(!grouped[area]){

                    grouped[area] = [];

                }

                grouped[area].push(pet);

            });

        const lines = [];

        lines.push("📋 PROCEDIMIENTOS REQUERIDOS");

        lines.push("");

        AREA_CONFIG

        .filter(area => grouped[area.id])

        .forEach(area => {

            lines.push(`Área: ${area.nombre}`);

            lines.push("");

            grouped[area.id].forEach(pet => {

                const path =
                    pet.archivos[area.id];

                const version =
                    this.extractVersionFromPath(path);

                const number =
                    pet.nombre.match(/\d+/)?.[0];

                const petCode =
                    number
                        ? `PET ${number.padStart(3,"0")}`
                        : pet.nombre;

                lines.push(

                    `☑ ${petCode}${version ? ` • VER. ${version}` : ""}`

                );

            });

            lines.push("");

        });

        lines.push(

            `Total: ${this.requestSelection.size} procedimiento${this.requestSelection.size>1?"s":""}`

        );

        lines.push("");

        lines.push("Generado desde VISOR PETS");

        return lines.join("\n");

    }

    async copyToClipboard(text){

        if(
            navigator.clipboard &&
            window.isSecureContext
        ){

            try{

                await navigator.clipboard.writeText(text);

                return true;

            }catch(e){

                console.warn("Clipboard API falló", e);

            }

        }

        const textarea = document.createElement("textarea");

        textarea.value = text;

        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";

        document.body.appendChild(textarea);

        textarea.focus();

        textarea.select();

        textarea.setSelectionRange(
            0,
            textarea.value.length
        );

        let ok = false;

        try{

            ok = document.execCommand("copy");

        }catch(e){

            console.error(e);

        }

        textarea.remove();

        return ok;

    }

    // ==========================================
    // COPIAR SOLICITUD
    // ==========================================

    async copyRequest(){

        const text =
            this.generateRequestText();

        if(!text){

            this.showToast(
                "Seleccione al menos un procedimiento.",
                "warning"
            );

            return;

        }

        const copied =
            await this.copyToClipboard(text);

        if(copied){

            this.clearRequest();

            this.closeRequestPanel();

            this.showToast(
                "Solicitud copiada correctamente."
            );

        }else{

            this.showToast(
                "No fue posible copiar.",
                "error"
            );

        }

    }

    // ==========================================
    // MOSTRAR TOAST
    // ==========================================

    showToast(message,type="success"){

        if(!this.toast)
            return;

        clearTimeout(

            this.toastTimer

        );

        this.toast.className =

            "toast";

        this.toast.classList.add(

            type

        );

        this.toastMessage.textContent =

            message;

        this.toast.classList.add(

            "show"

        );

        this.toastTimer =

            setTimeout(()=>{

                this.hideToast();

            },2500);

    }

    // ==========================================
    // OCULTAR TOAST
    // ==========================================

    hideToast(){

        if(!this.toast)
            return;

        this.toast.classList.remove(

            "show",

            "success",

            "warning",

            "error"

        );

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