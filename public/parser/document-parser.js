import { DocumentNode } from "./document-node.js";

export class DocumentParser {

    constructor(viewer){

        this.viewer = viewer;

        this.reset();

    }

    reset(){

        this.documentTree = [];

        this.documentNodes = [];

        this.nodeIndex = new Map();

        this.locationIndex = new Map();

        // ==========================
        // Información del documento
        // ==========================

        this.searchIndex = [];

        this.pageTextCache = new Map();

        this.pageTextFragments = new Map();

        this.textCoordinates = new Map();

        this.sections = {};

        this.ready = false;

        // ======================================
        // Outline Engine
        // ======================================

        this.outlineFragments = [];

        this.outlineLines = [];

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

        this.outline = [];

        this.outlineTree = [];

        this.outlineTaskSteps = [];

        this.outlineIndex = new Map();

        this.outlineLocations = new Map();

        this.headingStyles = {

            normalSize:0,

            headingSize:0,

            boldFonts:new Set()

        };

    }

    // ====================================
    // Sincronizar información del visor
    // ====================================

    synchronize(){

        this.searchIndex =
            [...this.viewer.searchIndex];

        this.pageTextCache =
            new Map(this.viewer.pageTextCache);

        this.pageTextFragments =
            new Map(this.viewer.pageTextFragments);

        this.textCoordinates =
            new Map(this.viewer.textCoordinates);

        this.sections =

            structuredClone(
                this.viewer.sections
            );

        this.ready = true;

    }

    isReady(){

        return this.ready;

    }

    getTree(){

        return this.documentTree;

    }

    getNodes(){

        return this.documentNodes;

    }

    getNode(id){

        return this.nodeIndex.get(id);

    }

    getPageText(page){

        return this.pageTextCache.get(page) || "";

    }

    getFragments(page){

        return this.pageTextFragments.get(page) || [];

    }

    getCoordinates(page){

        return this.textCoordinates.get(page) || [];

    }

    extractProcedureRange() {

        this.outlineFragments = [];

        this.outlineRange = {

            startPage:null,
            endPage:null,

            startIndex:null,
            endIndex:null

        };

        if (!this.ready) {

            return [];

        }

        const startRegex =
            /^\s*4(\.\d+)?\.?\s+PROCEDIMIENTO\b/i;

        const endRegex =
            /^\s*5(\.\d+)?\.?\s+RESTRICCIONES\b/i;

        let started = false;

        for (const page of this.searchIndex) {

            if (page.page === 1)
                continue;

            const fragments =
                this.pageTextFragments.get(page.page);

            if (!fragments)
                continue;

            for (let i = 0; i < fragments.length; i++) {

                const fragment = fragments[i];

                const text =
                    fragment.text.trim();

                if (!text)
                    continue;

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

            if (

                !started &&

                this.outlineRange.endPage

            ){

                break;

            }

        }

        this.outlineStats.totalFragments =

            this.outlineFragments.length;

        return this.outlineFragments;

    }

    getOutlineFragments(){

        return this.outlineFragments;

    }

    getOutlineRange(){

        return this.outlineRange;

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

                line.fontSize >=
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
                    page: line.page,
                    x: line.x,
                    y: line.y
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

    buildOutlineTree() {

        this.outlineTree = [];

        if (!this.outline.length) {
            return;
        }

        const stack = [];

        for (const node of this.outline) {

            node.parent = null;
            node.children = [];

            while (
                stack.length &&
                stack[stack.length - 1].level >= node.level
            ) {
                stack.pop();
            }

            if (stack.length) {

                node.parent =
                    stack[stack.length - 1].id;

                stack[stack.length - 1]
                    .children
                    .push(node);

            } else {

                this.outlineTree.push(node);

            }

            stack.push(node);

        }

        this.outlineStats.totalLevels =
            this.outline.length
                ? Math.max(...this.outline.map(n => n.level))
                : 0;

        console.group("DOCUMENT OUTLINE TREE");

        console.dir(this.outlineTree);

        console.groupEnd();

    }

    // =====================================================
    // OBTENER NODO SIGUIENTE
    // =====================================================

    getNextOutlineNode(current){

        const index =

            this.outline.findIndex(

                node=>node.id===current.id

            );

        if(index<0){

            return null;

        }

        return this.outline[index+1] || null;

    }

    // =====================================================
    // LIMPIAR CONTENIDO DE LOS NODOS
    // =====================================================

    resetOutlineContent(){

        for(const node of this.outline){

            node.items=[];

            node.rawLines=[];

            node.preview="";

            node.totalItems=0;

            node.totalWords=0;

        }

    }

    buildOutline(){

        this.extractProcedureRange();

        this.mergeFragmentsIntoLines();

        this.detectHeadingStyles();

        this.detectOutlineHeadings();

        this.buildOutlineTree();

        this.resetOutlineContent();

        return this.outlineTree;

    }

    getOutlineTree() {

        return this.outlineTree || [];

    }

    getOutline() {

        return this.outline || [];

    }

    getOutlineNode(id) {

        return this.outlineIndex.get(id);

    }

    getOutlineLocation(id) {

        return this.outlineLocations.get(id);

    }

    getOutlineRoots() {

        return this.outlineTree || [];

    }

    getOutlineChildren(id) {

        const node = this.outlineIndex.get(id);

        return node ? node.children : [];

    }

    getOutlineParent(id) {

        const node = this.outlineIndex.get(id);

        if (!node || node.parent == null) {

            return null;

        }

        return this.outlineIndex.get(node.parent);

    }

    // =====================================================
    // OBTENER TODOS LOS NODOS
    // =====================================================

    getDocumentNodes(){

        return this.outline;

    }

    // =====================================================
    // OBTENER RAÍCES
    // =====================================================

    getDocumentTree(){

        return this.outlineTree;

    }

    // =====================================================
    // OBTENER ESTADÍSTICAS
    // =====================================================

    getDocumentStatistics(){

        return this.documentStatistics;

    }

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

        return outlineSteps;

    }

}