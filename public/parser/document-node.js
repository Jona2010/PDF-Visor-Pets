export class DocumentNode {

    constructor({

        id,

        title,

        shortTitle = "",

        page,

        x,

        y,

        width,

        height,

        level,

        type

    }){

        // Identificación
        this.id = id;

        this.title = title;

        this.shortTitle = shortTitle || title;

        // Jerarquía
        this.level = level;

        this.parent = null;

        this.children = [];

        // Contenido
        this.items = [];

        // Posición PDF
        this.page = page;

        this.x = x;

        this.y = y;

        this.width = width;

        this.height = height;

        // Tipo de encabezado
        this.type = type;

        // Estadísticas

        this.totalItems = 0;

        this.totalWords = 0;

        this.preview = "";

        this.searchKey = "";

    }

}