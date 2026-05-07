// ===============================
// 🔐 CONFIGURACIÓN SUPABASE (UNA SOLA VEZ)
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

// ===============================
// 🚀 INICIO APP
// ===============================
document.addEventListener("DOMContentLoaded", () => {

    //console.log("APP CARGADA");

    const form = document.getElementById("loginForm");

    if (!form) {
        console.error("❌ Formulario no encontrado");
        return;
    }

    // 🔥 BLOQUEAR SUBMIT NATIVO
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        //console.log("LOGIN EJECUTADO");

        await login();
    });

    // 👁 TOGGLE PASSWORD
    const toggle = document.getElementById("togglePass");

    if (toggle) {
        toggle.addEventListener("click", togglePass);
    }

});

// ===============================
// 👁 MOSTRAR / OCULTAR PASSWORD
// ===============================
function togglePass() {
    const input = document.getElementById("password");
    const icon = document.getElementById("togglePass");

    if (input.type === "password") {
        input.type = "text";
        icon.textContent = "🙈";
    } else {
        input.type = "password";
        icon.textContent = "👁️";
    }
}

function generarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function showAlert(msg, tipo="error"){

    const old = document.querySelector(".toast");
    if(old) old.remove();

    const div = document.createElement("div");
    div.className = `toast ${tipo}`;
    div.innerText = msg;

    document.body.appendChild(div);

    setTimeout(()=>{
        div.classList.add("show");
    },100);

    setTimeout(()=>{
        div.classList.remove("show");

        setTimeout(()=>{
            div.remove();
        },400);

    },3500);
}

// ===============================
// 🔐 LOGIN
// ===============================
async function login() {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    //console.log("Intentando login...");

    // ===============================
    // 🔐 LOGIN SUPABASE
    // ===============================
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    // ===============================
    // ❌ LOGIN FALLIDO = ALERTA
    // ===============================
    if (error) {

        console.error(error);

        await supabaseClient
            .from("alerts")
            .insert([{
                email: email,
                message: `❌ Intento fallido de login: ${email}`,
                nivel: "alto",
                created_at: new Date().toISOString()
            }]);

        showAlert(
            "❌ Usuario no registrado o contraseña incorrecta",
            "error"
        );

        return;
    }

    const user = data.user;

    // ===============================
    // ✅ LOGIN EXITOSO = ALERTA
    // ===============================
    await supabaseClient
        .from("alerts")
        .insert([{
            user_id: user.id,
            email: user.email,
            message: `✅ Inicio de sesión exitoso: ${user.email}`,
            nivel: "bajo",
            created_at: new Date().toISOString()
        }]);



    // ===============================
    // 🧩 DETECTAR DISPOSITIVO
    // ===============================
    const userAgent = navigator.userAgent;

    let browser = "Desconocido";

    if (userAgent.includes("Edg")) browser = "Edge";
    else if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Chrome")) browser = "Chrome";
    else if (userAgent.includes("Safari")) browser = "Safari";

    let platform = "Desktop";

    if (/Android/i.test(userAgent)) platform = "Android";
    if (/iPhone|iPad|iPod/i.test(userAgent)) platform = "iOS";

    // ===============================
    // 🔥 GENERAR DEVICE ID ÚNICO
    // ===============================

    // FORZAR NUEVO DEVICE EN CADA INSTALACIÓN
    let device_id = localStorage.getItem("device_id");

    // 🔥 SI QUIERES REGENERAR AUTOMÁTICAMENTE
    // DESCOMENTA ESTA LÍNEA:
    localStorage.removeItem("device_id");

    if (!device_id) {

        // fingerprint básico
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width,
            screen.height,
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            navigator.platform
        ].join("|");

        // generar id único
        const random =
            crypto.randomUUID
            ? crypto.randomUUID()
            : generarUUID();

        device_id = btoa(fingerprint + "|" + random);

        localStorage.setItem("device_id", device_id);
    }

    //console.log("DEVICE ID:", device_id);

    // ===============================
    // 🔍 BUSCAR DISPOSITIVOS DEL USER
    // ===============================
    const { data: devices, error: devicesError } =
        await supabaseClient
            .from("user_devices")
            .select("*")
            .eq("user_id", user.id);

    if (devicesError) {

        console.error(devicesError);

        showAlert(
            "❌ Error validando dispositivo",
            "error"
        );

        return;
    }

    const device =
        devices.find(d => d.device_id === device_id);



    // ===============================
    // 📱 NUEVO DISPOSITIVO
    // ===============================
    if (!device) {

        let ip = "Desconocida";

        try {

            const res =
                await fetch(
                    "https://api.ipify.org?format=json"
                );

            const dataIp =
                await res.json();

            ip = dataIp.ip;

        } catch {}

        // alerta
        await supabaseClient
            .from("alerts")
            .upsert([{
                user_id: user.id,
                email: user.email,
                device_id: device_id,
                message:
                    `📱 Nuevo dispositivo detectado: ${browser} - ${platform} | IP: ${ip}`,
                nivel: "medio",
                created_at: new Date().toISOString()
            }]);

        // log
        await supabaseClient
            .from("logs")
            .insert([{
                user_id: user.id,
                user_email: user.email,
                pet: "LOGIN",
                area:
                    `Nuevo dispositivo (${browser} - ${platform})`,
                fecha: new Date().toISOString()
            }]);

        // registrar device
        await supabaseClient
            .from("user_devices")
            .insert([{
                user_id: user.id,
                device_id,
                browser,
                platform,
                approved: false
            }]);

        showAlert(
            "📱 Nuevo dispositivo detectado. Espera aprobación.",
            "warning"
        );

        await supabaseClient.auth.signOut();

        return;
    }



    // ===============================
    // ⛔ DISPOSITIVO NO APROBADO
    // ===============================
    if (!device.approved) {

        await supabaseClient
            .from("alerts")
            .insert([{
                user_id: user.id,
                email: user.email,
                device_id: device_id,
                message:
                    `⛔ Intento desde dispositivo bloqueado`,
                nivel: "alto",
                created_at: new Date().toISOString()
            }]);

        showAlert(
            "⛔ Dispositivo pendiente de aprobación",
            "warning"
        );

        return;
    }



    // ===============================
    // ✅ ACCESO AUTORIZADO
    // ===============================
    await supabaseClient
        .from("logs")
        .insert([{
            user_id: user.id,
            user_email: user.email,
            pet: "LOGIN",
            area: "Ingreso autorizado",
            fecha: new Date().toISOString()
        }]);

    showAlert(
        "✅ Acceso autorizado",
        "success"
    );

    setTimeout(() => {
        window.location.href = "visor.html";
    }, 1000);
}