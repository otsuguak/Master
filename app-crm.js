// --- IMPORTACIÓN DE SUPABASE ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://rqjfaztnaktizrgllhna.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxamZhenRuYWt0aXpyZ2xsaG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzk1NjksImV4cCI6MjA4NzcxNTU2OX0.cb6LSWq5YZ7BKRdBx2VoeD-m1gUonfpU_MJemaTSB3U';

// 1. ALMACENAMIENTO A PRUEBA DE BALAS (Bypass de Edge)
// Usamos sessionStorage (por pestaña) y RAM, evitando el localStorage que Edge bloquea.
const RAM = {};
const almacenamientoSeguro = {
    getItem: (key) => {
        try { return window.sessionStorage.getItem(key) || RAM[key] || null; } 
        catch (e) { return RAM[key] || null; }
    },
    setItem: (key, value) => {
        try { window.sessionStorage.setItem(key, value); } catch (e) {}
        RAM[key] = value;
    },
    removeItem: (key) => {
        try { window.sessionStorage.removeItem(key); } catch (e) {}
        delete RAM[key];
    }
};

// 2. INICIALIZACIÓN DIRECTA (Apagamos los candados conflictivos)
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: almacenamientoSeguro,
        autoRefreshToken: true,
        persistSession: true, 
        detectSessionInUrl: false
    }
});

// Variables Globales
let usuarioActual = null;
let pqrSeleccionadoID = null;
let chartInstance = null;
let suscripcionTickets = null; 

// ==========================================
//  LÓGICA DE INTERFAZ (UI)
// ==========================================

function mostrarCargando() {
    const pantalla = document.getElementById('pantalla-carga');
    if(pantalla) {
        pantalla.classList.remove('hidden');
        pantalla.classList.add('flex');
    }
}

function ocultarCargando() {
    const pantalla = document.getElementById('pantalla-carga');
    if(pantalla) {
        pantalla.classList.remove('flex');
        pantalla.classList.add('hidden');
    }
}

function mostrarLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    ocultarCargando();
}

function mostrarDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    document.getElementById('dash-nombre').innerText = usuarioActual.nombre;
    document.getElementById('dash-rol').innerText = usuarioActual.rol === 'agente' ? 'Administrador' : 'Residente';

    if (usuarioActual.rol === 'agente') {
        document.getElementById('btn-nuevo-pqr').classList.add('hidden');
        document.getElementById('btn-exportar').classList.remove('hidden');
        document.getElementById('chat-nuevo-estado').classList.remove('hidden');
    } else {
        document.getElementById('btn-nuevo-pqr').classList.remove('hidden');
        document.getElementById('btn-exportar').classList.add('hidden');
        document.getElementById('chat-nuevo-estado').classList.add('hidden');
    }

    cargarDatosRealtime();
}

window.mostrarRegistro = () => {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
};
window.mostrarLogin = () => mostrarLogin();

// ==========================================
//  SISTEMA DE AUTENTICACIÓN ANTI-CONGELAMIENTO
// ==========================================
let procesandoSesion = false; // Candado para evitar que F5 dispare eventos dobles

supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("--> Evento Auth:", event);

    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;

    if (!session) {
        usuarioActual = null;
        mostrarLogin();
        return;
    }

    // Si ya estamos procesando la entrada, ignoramos para no chocar
    if (procesandoSesion) return;
    procesandoSesion = true;

    mostrarCargando();
    
    try {
        // Truco maestro: Le damos a Supabase máximo 6 segundos. Si se queda mudo, explota a propósito.
        const tiempoLimite = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("TIEMPO_AGOTADO")), 6000)
        );

        const peticionBD = supabase
            .from('usuarios')
            .select('*')
            .eq('id', session.user.id)
            .single();

        // Ejecutamos una "carrera" entre la respuesta de la base de datos y el cronómetro
        const { data, error } = await Promise.race([peticionBD, tiempoLimite]);

        if (error) throw error;

        if (data) {
            usuarioActual = data;
            mostrarDashboard();
        } else {
            throw new Error("Perfil no encontrado en BD");
        }
    } catch (err) {
        console.error("Fallo al cargar la sesión:", err);
        
        // Si el cronómetro ganó, la red o Supabase se quedaron colgados (el limbo)
        if (err.message === "TIEMPO_AGOTADO") {
            console.warn("Supabase se atascó. Forzando reinicio de la caché...");
            Swal.fire("Aviso", "La conexión tardó demasiado. Por favor, intenta ingresar de nuevo.", "warning");
        } else {
            Swal.fire("Error", "No se pudo cargar tu perfil.", "error");
        }
        
        // Limpieza "nuclear" para destrabar el navegador por completo
        window.sessionStorage.clear();
        window.localStorage.clear();
        try { await supabase.auth.signOut(); } catch(e) {}
        
        mostrarLogin(); // Te salva de la pantalla negra
    } finally {
        procesandoSesion = false; // Soltamos el candado
        ocultarCargando(); // Garantía absoluta de apagar el spinner
    }
});

window.iniciarSesion = async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('pass-input').value;
    
    if(!email || !pass) return Swal.fire('Error', 'Ingresa correo y contraseña', 'warning');

    mostrarCargando();
    
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        // Si no hay error, el onAuthStateChange tomará el control automáticamente
    } catch (err) {
        ocultarCargando();
        console.error("Fallo Login:", err);
        if (err.message && err.message.includes("Invalid login")) {
            Swal.fire('Error', 'Correo o contraseña incorrectos', 'error');
        } else {
            Swal.fire('Error', 'Falla de conexión con el servidor', 'error');
        }
    }
};

window.registrarUsuario = async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const nombre = document.getElementById('reg-nombre').value;
    const rol = document.getElementById('reg-rol').value;
    const inmueble = document.getElementById('reg-inmueble').value;

    if (!email || !pass || !nombre) return Swal.fire('Campos vacíos', 'Completa todo el formulario', 'warning');

    mostrarCargando(); 

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: pass,
        });

        if (authError) throw authError;

        if(authData.user) {
             const { error: dbError } = await supabase
                .from('usuarios')
                .insert([
                    { id: authData.user.id, email: email, nombre: nombre, rol: rol, inmueble: inmueble }
                ]);
            if (dbError) throw dbError;
        }

        Swal.fire('¡Éxito!', 'Usuario creado. Revisa tu correo si pedimos confirmación (depende de configuración).', 'success');
        mostrarLogin();

    } catch (error) {
        console.error("Error original de Supabase:", error);
        let mensajeEspanol = "Ocurrió un error inesperado al registrar el usuario.";

        if (error.message.includes("Password should be at least")) {
            mensajeEspanol = "La contraseña es muy débil. Debe tener al menos 8 caracteres e incluir letras (mayúsculas/minúsculas) y números.";
        } else if (error.message.includes("User already registered") || error.message.includes("already exists")) {
            mensajeEspanol = "Este correo electrónico ya se encuentra registrado en el sistema.";
        } else if (error.message.includes("Invalid email")) {
            mensajeEspanol = "El formato del correo electrónico no es válido.";
        } else {
            mensajeEspanol = error.message; 
        }

        Swal.fire({
            title: '¡Registro Exitoso!',
            text: 'Tu cuenta ha sido creada. Por favor, revisa tu bandeja de entrada para confirmar tu correo.',
            icon: 'success',
            confirmButtonColor: '#2563eb'
        });
    } finally {
        ocultarCargando(); 
    }
};

window.cerrarSesion = async () => {
    mostrarCargando();
    if(suscripcionTickets) supabase.removeChannel(suscripcionTickets);
    await supabase.auth.signOut();
    ocultarCargando();
};

window.recuperarClave = async () => {
    const { value: email } = await Swal.fire({
        title: 'Recuperar Contraseña',
        input: 'email',
        inputLabel: 'Ingresa tu correo registrado',
        showCancelButton: true
    });

    if (email) {
        mostrarCargando();
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        ocultarCargando();
        
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('Enviado', 'Revisa tu correo para recuperar la contraseña', 'success');
        }
    }
}

// ==========================================
//  LÓGICA DEL NEGOCIO (PQRS) CON SUPABASE
// ==========================================

async function cargarDatosRealtime() {
    let query = supabase.from('tickets').select('*').order('fecha', { ascending: false });
    
    if (usuarioActual.rol !== 'agente') {
        query = query.eq('usuario_id', usuarioActual.id);
    }

    mostrarCargando();
    try {
        const { data: tickets, error } = await query;
        if(!error && tickets) {
            procesarYRenderizarTickets(tickets);
        }
    } finally {
        ocultarCargando();
    }

    if(suscripcionTickets) supabase.removeChannel(suscripcionTickets);

    let channelFilter = '*';
    if(usuarioActual.rol !== 'agente'){
        channelFilter = `usuario_id=eq.${usuarioActual.id}`;
    }

    suscripcionTickets = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: channelFilter },
        async (payload) => {
          const { data: newData } = await query;
          if(newData) procesarYRenderizarTickets(newData);
          
          if(pqrSeleccionadoID && payload.new && payload.new.id === pqrSeleccionadoID){
              renderizarModalDetalle(payload.new);
          }
        }
      )
      .subscribe();
}

function procesarYRenderizarTickets(tickets) {
    let stats = { abiertos: 0, proceso: 0, cerrados: 0 };
    tickets.forEach(t => {
        if (t.estado === 'Abierto') stats.abiertos++;
        else if (t.estado === 'En Proceso') stats.proceso++;
        else if (t.estado === 'Cerrado') stats.cerrados++;
    });

    actualizarTabla(tickets);
    actualizarKPIs(stats, tickets.length);
    actualizarGrafica(stats);
}

function actualizarTabla(tickets) {
    const tbody = document.getElementById('tabla-body');
    tbody.innerHTML = '';

    if (tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No hay casos registrados.</td></tr>';
        return;
    }

    tickets.forEach(t => {
        let badgeColor = 'bg-gray-100 text-gray-800';
        if (t.estado === 'Abierto') badgeColor = 'bg-red-100 text-red-700 ring-1 ring-red-600/20';
        if (t.estado === 'En Proceso') badgeColor = 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-600/20';
        if (t.estado === 'Cerrado') badgeColor = 'bg-green-100 text-green-700 ring-1 ring-green-600/20';

        const fecha = new Date(t.fecha).toLocaleDateString();

        const row = `
            <tr class="border-b hover:bg-slate-50 transition cursor-pointer" onclick="abrirDetalle('${t.id}')">
                <td class="p-3 font-mono text-xs text-blue-600 font-bold uppercase">#${t.id.slice(0, 8)}</td>
                <td class="p-3"><span class="px-2 py-1 rounded-md text-xs font-bold ${badgeColor}">${t.estado}</span></td>
                <td class="p-3 text-gray-600">${fecha}</td>
                <td class="p-3 font-medium">${t.nombre_usuario}</td>
                <td class="p-3 text-gray-600"><span class="block text-xs font-bold text-blue-500">${t.categoria}</span>${t.tipo}</td>
                <td class="p-3 text-right"><i class="fas fa-chevron-right text-gray-400"></i></td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

window.crearPQR = async () => {
    const tipo = document.getElementById('pqr-tipo').value;
    const cat = document.getElementById('pqr-categoria').value;
    const desc = document.getElementById('pqr-desc').value;
    const fileInput = document.getElementById('pqr-file');

    if (!desc) return Swal.fire('Atención', 'Describe tu caso', 'warning');

    mostrarCargando(); 

    try {
        let fileUrl = null;

        // Subir archivo a Supabase Storage (¡COMPLETO Y SIN RECORTES!)
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage
              .from('evidencias')
              .upload(fileName, file);
              
            if(error) throw error;
            
            const { data: { publicUrl } } = supabase.storage
              .from('evidencias')
              .getPublicUrl(fileName);
              
            fileUrl = publicUrl;
        }

        const nuevoHistorial = [{
            autor: usuarioActual.nombre,
            rol: usuarioActual.rol,
            mensaje: "Caso radicado: " + desc,
            fecha: new Date().toISOString()
        }];

        const { error: dbError } = await supabase.from('tickets').insert([
            {
                usuario_id: usuarioActual.id,
                nombre_usuario: usuarioActual.nombre,
                tipo: tipo,
                categoria: cat,
                descripcion: desc,
                adjunto_url: fileUrl,
                estado: 'Abierto',
                historial: nuevoHistorial 
            }
        ]);

        if (dbError) throw dbError;

        Swal.fire('Enviado', 'Tu caso ha sido radicado', 'success');
        window.cerrarModal('modal-crear');
        document.getElementById('pqr-desc').value = "";
        document.getElementById('pqr-file').value = "";

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo crear el caso', 'error');
    } finally {
        ocultarCargando(); 
    }
};

window.abrirDetalle = async (id) => {
    pqrSeleccionadoID = id;
    const modal = document.getElementById('modal-detalle');
    modal.classList.remove('hidden');

    mostrarCargando();
    try {
        const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single();
        if(data) renderizarModalDetalle(data);
    } finally {
        ocultarCargando();
    }
};

function renderizarModalDetalle(data) {
    document.getElementById('det-titulo').innerText = `Caso #${data.id.split('-')[0].toUpperCase()}`;
    document.getElementById('det-estado').innerText = data.estado;
    document.getElementById('det-usuario').innerText = data.nombre_usuario;
    document.getElementById('det-categoria').innerText = data.categoria;
    document.getElementById('det-descripcion').innerText = data.descripcion;

    const link = document.getElementById('det-link');
    if (data.adjunto_url) {
        link.href = data.adjunto_url;
        link.classList.remove('hidden');
    } else {
        link.classList.add('hidden');
    }

    renderizarChat(data.historial || []);

    if (data.estado === 'Cerrado') {
        document.getElementById('zona-respuesta').classList.add('hidden');
        document.getElementById('zona-cerrada').classList.remove('hidden');
    } else {
        document.getElementById('zona-respuesta').classList.remove('hidden');
        document.getElementById('zona-cerrada').classList.add('hidden');
        if (usuarioActual.rol === 'agente') {
            document.getElementById('chat-nuevo-estado').value = data.estado;
        }
    }
}

function renderizarChat(historial) {
    const container = document.getElementById('chat-container');
    container.innerHTML = '';

    historial.forEach(msg => {
        const esAdmin = msg.rol === 'agente';
        const div = document.createElement('div');
        div.className = `chat-bubble flex flex-col ${esAdmin ? 'chat-admin ml-0' : 'chat-user ml-auto'}`;
        
        if (esAdmin) div.classList.add('bg-blue-100', 'self-start');
        else div.classList.add('bg-green-100', 'self-end');

        const hora = new Date(msg.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        div.innerHTML = `
            <span class="font-bold text-xs mb-1 ${esAdmin ? 'text-blue-700' : 'text-green-700'}">
                ${msg.autor} <span class="font-normal text-gray-400 text-[10px] ml-2">${hora}</span>
            </span>
            <p class="text-gray-800 leading-snug">${msg.mensaje}</p>
        `;
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

window.enviarRespuesta = async () => {
    const txt = document.getElementById('chat-input').value;
    if (!txt.trim()) return;

    const nuevoEstado = document.getElementById('chat-nuevo-estado').value;
    
    mostrarCargando(); 
    try {
        const { data: ticket, error: getError } = await supabase
            .from('tickets')
            .select('historial')
            .eq('id', pqrSeleccionadoID)
            .single();

        if(getError) throw getError;

        let historial = ticket.historial || [];
        
        historial.push({
            autor: usuarioActual.nombre,
            rol: usuarioActual.rol,
            mensaje: txt,
            fecha: new Date().toISOString()
        });

        let updateData = { historial: historial };
        if (usuarioActual.rol === 'agente') {
            updateData.estado = nuevoEstado;
        }

        const { error: updateError } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', pqrSeleccionadoID);

        if(updateError) throw updateError;

        document.getElementById('chat-input').value = ""; 

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo enviar el mensaje', 'error');
    } finally {
        ocultarCargando(); 
    }
}

// ==========================================
//  UTILIDADES
// ==========================================

function actualizarKPIs(stats, total) {
    document.getElementById('kpi-total').innerText = total;
    document.getElementById('kpi-pendientes').innerText = stats.abiertos + stats.proceso;
    document.getElementById('kpi-resueltos').innerText = stats.cerrados;
}

function actualizarGrafica(stats) {
    const ctx = document.getElementById('myChart').getContext('2d');
    
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Abierto', 'En Proceso', 'Cerrado'],
            datasets: [{
                data: [stats.abiertos, stats.proceso, stats.cerrados],
                backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
            }
        }
    });
}

window.abrirModalCrear = () => document.getElementById('modal-crear').classList.remove('hidden');
window.cerrarModal = (id) => {
    document.getElementById(id).classList.add('hidden');
};

window.exportarExcel = async () => {
    Swal.fire('Información', 'Para habilitar exportación, integraremos SheetJS en la siguiente fase Master.', 'info');
};