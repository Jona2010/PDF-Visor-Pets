// ===============================
// 🔐 CONFIGURACIÓN SUPABASE
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

// ===============================
// 🚀 INICIO
// ===============================
document.addEventListener("DOMContentLoaded", () => {

    // FORM LOGIN
    const form = document.getElementById("adminLoginForm");

    if(form){
        form.addEventListener("submit", async (e)=>{
            e.preventDefault();
            await loginAdmin();
        });
    }

    // TOGGLE PASSWORD
    const toggle = document.getElementById("togglePass");

    if(toggle){
        toggle.addEventListener("click", togglePassword);
    }

});

// ===============================
// 👁 MOSTRAR / OCULTAR PASSWORD
// ===============================
function togglePassword(){

    const input = document.getElementById("password");
    const icon  = document.getElementById("togglePass");

    if(!input) return;

    if(input.type === "password"){
        input.type = "text";
        icon.textContent = "🙈";
    }else{
        input.type = "password";
        icon.textContent = "👁️";
    }
}

// ===============================
// 🔔 ALERTA PROFESIONAL
// ===============================
function showAlert(msg, tipo = "error"){

    // elimina alertas previas
    const old = document.querySelector(".top-alert");
    if(old) old.remove();

    const div = document.createElement("div");

    div.className = `top-alert ${tipo}`;
    div.innerHTML = msg;

    document.body.appendChild(div);

    // animar entrada
    setTimeout(()=>{
        div.classList.add("show");
    },50);

    // auto cerrar
    setTimeout(()=>{
        div.classList.remove("show");

        setTimeout(()=>{
            div.remove();
        },400);

    },3500);
}

// ===============================
// 🔐 LOGIN ADMIN CORREGIDO
// ===============================
async function loginAdmin(){

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();

    if(!email || !password){
        showAlert("⚠️ Completa todos los campos", "warning");
        return;
    }

    // LOGIN AUTH
    const { data: authData, error: authError } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if(authError){
        showAlert("❌ Usuario no registrado o contraseña incorrecta", "error");
        return;
    }

    // VALIDAR TABLA ADMINS
    const { data: admin, error: adminError } =
        await supabaseClient
            .from("admins")
            .select("id,email,nombre,activo,rol")
            .ilike("email", email)   // 🔥 mejor que eq
            .eq("activo", true)
            .single();

    if(adminError || !admin){

        await supabaseClient.auth.signOut();

        console.log("ERROR ADMIN:", adminError);

        showAlert("⛔ Usuario sin permisos administrativos", "error");
        return;
    }

    // GUARDAR SESIÓN ADMIN
    localStorage.setItem("admin_user", JSON.stringify(admin));

    showAlert("✅ Acceso autorizado", "success");

    setTimeout(()=>{
        location.href = "admin.html";
    },900);
}