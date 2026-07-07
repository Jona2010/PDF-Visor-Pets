require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");
const compression = require("compression");

// ✅ REDIS
const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");

const app = express();
app.use(compression());

// IMPORTANTE PARA RENDER
app.set("trust proxy", 1);

app.use(express.json());
app.use((req, res, next) => {

    // PDFs más rápidos
    if(req.url.endsWith(".pdf")){

        res.setHeader(
            "Cache-Control",
            "public, max-age=30d"
        );

        res.setHeader(
            "Accept-Ranges",
            "bytes"
        );
    }

    next();
});

// =====================================
// ✅ REDIS SOLO EN PRODUCCIÓN
// =====================================

let redisClient = null;

if(process.env.NODE_ENV === "production"){

    redisClient = createClient({
        url: process.env.REDIS_URL
    });

    redisClient.on("error", (err) => {
        console.error("Redis error:", err);
    });

    (async () => {
        await redisClient.connect();
    })();

    console.log("✅ Redis activado");

}else{

    console.log("⚡ Redis desactivado en localhost");
}

// =====================================
// 🔐 CONFIGURAR SESIONES
// =====================================

const sessionConfig = {

    secret: process.env.SESSION_SECRET || "secreto123",

    resave: false,

    saveUninitialized: false,

    cookie: {

        secure: process.env.NODE_ENV === "production",

        httpOnly: true,

        sameSite: "lax"
    }
};

// ✅ SOLO PRODUCCIÓN USA REDIS
if(process.env.NODE_ENV === "production"){

    sessionConfig.store = new RedisStore({
        client: redisClient
    });

    console.log("✅ Sesiones Redis activadas");
}

app.use(session(sessionConfig));

// =====================================
// ✅ SERVIR PUBLIC
// =====================================

app.use(express.static(
    path.join(__dirname, "public"),
    {

        maxAge: "30d",

        etag: true,

        lastModified: true
    }
));

// =====================================
// 🔥 ENDPOINT RÁPIDO
// =====================================

app.get("/ping", (req, res) => {
    res.status(200).send("OK");
});

// =====================================
// ✅ RUTA PRINCIPAL
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/visor.html"));
});

// =====================================
// 🔐 LOGIN ADMIN
// =====================================

app.post("/login-admin", (req, res) => {

    const { usuario, password } = req.body;

    if (usuario === "admin" && password === "123") {

        req.session.rol = "admin";

        return res.json({ ok: true });
    }

    res.json({ ok: false });
});

// =====================================
// 🔐 LOGIN USER
// =====================================

app.post("/login-user", (req, res) => {

    const { usuario, password } = req.body;

    if (usuario === "user" && password === "123") {

        req.session.rol = "user";

        return res.json({ ok: true });
    }

    res.json({ ok: false });
});

// =====================================
// 🔒 PROTEGER ADMIN
// =====================================

app.get("/admin", (req, res) => {

    if (req.session.rol !== "admin") {

        return res.redirect("/admin-login.html");
    }

    res.sendFile(path.join(__dirname, "public/admin.html"));
});

// =====================================
// 🔒 PROTEGER VISOR
// =====================================

app.get("/visor", (req, res) => {

    if (req.session.rol !== "user") {

        return res.redirect("/");
    }

    res.sendFile(
        path.join(
            __dirname,
            "public/visor.html"
        )
    );
});

// =====================================
// 🚀 PUERTO
// =====================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log("Servidor corriendo en puerto " + PORT);
});