require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

// ✅ REDIS
const { createClient } = require("redis");
const RedisStore = require("connect-redis").default;

const app = express();

// IMPORTANTE PARA RENDER
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔥 CONFIGURAR REDIS
const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.connect().catch(console.error);

// 🔐 SESIONES CON REDIS
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || "secreto123",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,       // HTTPS (Render)
        httpOnly: true,
        sameSite: "lax"
    }
}));

// ✅ SERVIR CARPETA PUBLIC
app.use(express.static(path.join(__dirname, "public")));

// ✅ RUTA PRINCIPAL
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------------- LOGIN ADMIN
app.post("/login-admin", (req, res) => {
    const { usuario, password } = req.body;

    if (usuario === "admin" && password === "123") {
        req.session.rol = "admin";
        return res.json({ ok: true });
    }

    res.json({ ok: false });
});

// ---------------- LOGIN USER
app.post("/login-user", (req, res) => {
    const { usuario, password } = req.body;

    if (usuario === "user" && password === "123") {
        req.session.rol = "user";
        return res.json({ ok: true });
    }

    res.json({ ok: false });
});

// ---------------- PROTEGER ADMIN
app.get("/admin", (req, res) => {
    if (req.session.rol !== "admin") {
        return res.redirect("/admin-login.html");
    }
    res.sendFile(path.join(__dirname, "public/admin.html"));
});

// ---------------- PROTEGER VISOR
app.get("/visor", (req, res) => {
    if (req.session.rol !== "user") {
        return res.redirect("/index.html");
    }
    res.sendFile(path.join(__dirname, "public/visor.html"));
});

// ---------------- PUERTO
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto " + PORT);
});