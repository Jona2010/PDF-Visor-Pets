// ===============================
// 🔐 CONFIGURACIÓN SUPABASE
// ===============================
const supabaseClient = supabase.createClient(
    "https://xnkpjgrxgwkfhgrrzwhu.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3BqZ3J4Z3drZmhncnJ6d2h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjY5NTAsImV4cCI6MjA5MTk0Mjk1MH0.XPvMGOe5ajGzFZRD4aQ9imGZ1BixN0Ht-8I9o0iGb8I"
);

// ===============================
// VARIABLES PAGINACIÓN
// ===============================
let pagina = 0;
const limite = 10;

// ===============================
// 🚀 INICIO
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await cargarDispositivos();
    await cargarLogs();
    await cargarAlerts();
});

// ===============================
// 🕒 FORMATEAR FECHA PERÚ
// ===============================
function fechaPeru(valor){

    if(!valor) return "-";

    const fecha = new Date(valor);

    if(isNaN(fecha)) return valor;

    // RESTAR 5 HORAS porque Supabase ya lo guardó desplazado
    fecha.setHours(fecha.getHours() - 5);

    return fecha.toLocaleString("es-PE",{
        year:"numeric",
        month:"2-digit",
        day:"2-digit",
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit",
        hour12:false
    });
}

// ===============================
// 📱 DISPOSITIVOS
// ===============================
// ===============================
// 📱 DISPOSITIVOS CON EMAIL REAL
// ===============================
async function cargarDispositivos(){

    const tbody = document.querySelector("#tablaDispositivos tbody");
    tbody.innerHTML = "";

    const { data, error } = await supabaseClient
        .from("user_devices")
        .select(`
            id,
            browser,
            platform,
            approved,
            created_at,
            profiles (
                email
            )
        `)
        .order("created_at", { ascending:false });

    if(error){
        console.error(error);
        tbody.innerHTML =
        `<tr><td colspan="5">Error cargando dispositivos</td></tr>`;
        return;
    }

    if(!data || data.length === 0){
        tbody.innerHTML =
        `<tr><td colspan="5">Sin dispositivos registrados</td></tr>`;
        return;
    }

    data.forEach(item => {

        const email =
            item.profiles?.email || "Sin correo";

        tbody.innerHTML += `
        <tr>

            <td>${email}</td>
            <td>${item.browser || "-"}</td>
            <td>${item.platform || "-"}</td>

            <td>
                ${
                    item.approved
                    ? `<span class="badge badge-ok">Aprobado</span>`
                    : `<span class="badge badge-wait">Bloqueado</span>`
                }
            </td>

            <td>
                ${
                    item.approved
                    ? `
                    <button class="btn-danger"
                        onclick="desaprobarDispositivo('${item.id}')">
                        Desaprobar
                    </button>
                    `
                    : `
                    <button class="btn-success"
                        onclick="aprobarDispositivo('${item.id}')">
                        Aprobar
                    </button>
                    `
                }
            </td>

        </tr>
        `;
    });
}

// ===============================
// ✅ APROBAR
// ===============================
async function aprobarDispositivo(id){

    await supabaseClient
        .from("user_devices")
        .update({ approved:true })
        .eq("id", id);

    await supabaseClient
        .from("alerts")
        .insert([{
            message:"Dispositivo aprobado por administrador",
            created_at:new Date().toISOString()
        }]);

    await cargarDispositivos();
    await cargarAlerts();
}

async function desaprobarDispositivo(id){

    // bloquear dispositivo
    await supabaseClient
        .from("user_devices")
        .update({ approved:false })
        .eq("id", id);

    // generar alerta
    await supabaseClient
        .from("alerts")
        .insert([{
            message:"Dispositivo desaprobado por administrador",
            created_at:new Date().toISOString()
        }]);

    // refrescar tablas
    await cargarDispositivos();
    await cargarAlerts();
}

// ===============================
// 📊 LOGS
// ===============================
async function cargarLogs(){

    const tabla = document.querySelector("#tablaLogs tbody");

    tabla.classList.remove("fade-in");
    tabla.classList.add("fade-out");

    tabla.innerHTML = "";

    for(let i=0;i<limite;i++){

        const tr = document.createElement("tr");
        tr.classList.add("skeleton-row");

        tr.innerHTML = `
            <td><div class="skeleton-box"></div></td>
            <td><div class="skeleton-box"></div></td>
            <td><div class="skeleton-box"></div></td>
            <td><div class="skeleton-box"></div></td>
        `;

        tabla.appendChild(tr);
    }

    await new Promise(r => setTimeout(r,300));

    const desde = pagina * limite;
    const hasta = desde + limite - 1;

    const { data, error } = await supabaseClient
        .from("logs")
        .select("*")
        .order("fecha",{ ascending:false })
        .range(desde,hasta);

    if(error){
        console.error(error);
        return;
    }

    tabla.innerHTML = "";

    data.forEach((log,index)=>{

        const tr = document.createElement("tr");

        tr.classList.add("fade-row");
        tr.style.animationDelay = `${index * 0.05}s`;

        tr.innerHTML = `
            <td>${log.user_email}</td>
            <td>${log.pet}</td>
            <td>${log.area}</td>
            <td>${fechaPeru(log.fecha)}</td>
        `;

        tabla.appendChild(tr);
    });

    tabla.classList.remove("fade-out");
    tabla.classList.add("fade-in");

    document.getElementById("paginaActual").textContent =
        `Página ${pagina + 1}`;

    document.querySelector(".logs-container").scrollTop = 0;
}

// ===============================
// 🚨 ALERTAS
// ===============================
async function cargarAlerts(){

    const { data, error } = await supabaseClient
        .from("alerts")
        .select("*")
        .order("created_at",{ ascending:false });

    if(error){
        console.error(error);
        return;
    }

    const tbody = document.querySelector("#tablaAlerts tbody");
    tbody.innerHTML = "";

    data.forEach(a => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${a.message}</td>
            <td>${fechaPeru(a.created_at)}</td>
        `;

        tbody.appendChild(tr);
    });
}

// ===============================
// PAGINACIÓN
// ===============================
function siguientePagina(){
    pagina++;
    cargarLogs();
}

function anteriorPagina(){

    if(pagina > 0){
        pagina--;
        cargarLogs();
    }
}

/* =========================================
✅ BOTÓN MANUAL
========================================= */

async function refrescarPanel(){

    const btn = document.querySelector(".btn-refresh");

    if(btn){
        btn.innerHTML = "⏳ Actualizando...";
        btn.disabled = true;
    }

    await cargarDispositivos();
    await cargarLogs();
    await cargarAlerts();

    if(btn){
        btn.innerHTML = "🔄 Actualizar ahora";
        btn.disabled = false;
    }
}

// ===============================
// 🚀 AL ABRIR PANEL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    refrescarPanel();
});