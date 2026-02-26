// --- IMPORTACIÓN DE SUPABASE (Vía CDN para páginas estáticas) ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- 1. CONFIGURACIÓN DE SUPABASE ---
// ¡REEMPLAZA ESTAS DOS LÍNEAS CON TUS DATOS!
// Reemplaza con tu URL (la sacas de "API de datos")
const supabaseUrl = 'https://rqjfaztnaktizrgllhna.supabase.co';
// Reemplaza con tu Clave publicable (la de tu foto)
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxamZhenRuYWt0aXpyZ2xsaG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzk1NjksImV4cCI6MjA4NzcxNTU2OX0.cb6LSWq5YZ7BKRdBx2VoeD-m1gUonfpU_MJemaTSB3U';
// Configuramos Supabase con parámetros explícitos para evitar bloqueos
const supabase = createClient(supabaseUrl, supabaseKey);
//const supabase = createClient(supabaseUrl, supabaseKey, {
//    auth: {
//        storage: window.localStorage,
//        autoRefreshToken: true,
//        persistSession: true,
//        detectSessionInUrl: false
//    }
//});
// Variables Globales
let usuarioActual = null;
let pqrSeleccionadoID = null;
let chartInstance = null;
let suscripcionTickets = null; // Para el Realtime de Supabase

// ==========================================
//  SISTEMA DE AUTENTICACIÓN
// ==========================================

// Listener de sesión
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log("--> Evento de seguridad detectado:", event);
    
    if (session) {
        console.log("--> Sesión activa. Buscando datos en la tabla usuarios...");
        const { data: userData, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', session.user.id)
            .single();

        console.log("--> Datos encontrados:", userData, error);

        if (userData && !error) {
            usuarioActual = userData;
            mostrarDashboard();
        } else {
            console.error("Fallo al buscar el perfil:", error);
            Swal.fire("Error", "No se encontró tu perfil en la base de datos", "error");
            await supabase.auth.signOut();
        }
    } else {
        usuarioActual = null;
        mostrarLogin();
    }
});

window.iniciarSesion = async () => {
    console.log("1. Botón presionado");
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('pass-input').value;
    
    // Seleccionamos el botón para cambiarle el texto
    const btn = document.querySelector('#login-section button'); 

    if(!email || !pass) return Swal.fire('Error', 'Ingresa correo y contraseña', 'warning');

    // Desactivamos el botón para evitar doble clic y avisamos que está cargando
    btn.disabled = true;
    btn.innerText = "Conectando...";

    try {
        console.log("2. Autenticando con Supabase...");
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: pass,
        });

        console.log("3. Respuesta de Supabase:", data, error);

        if (error) {
            btn.disabled = false;
            btn.innerText = "Ingresar";
            if (error.message.includes("Email not confirmed")) {
                Swal.fire('Atención', 'Debes confirmar tu correo electrónico. Revisa tu bandeja.', 'warning');
            } else {
                Swal.fire('Error', 'Correo o contraseña incorrectos', 'error');
            }
        }
        // Si no hay error, el sistema automático (onAuthStateChange) tomará el control
    } catch (err) {
        console.error("Error grave de conexión:", err);
        btn.disabled = false;
        btn.innerText = "Ingresar";
        Swal.fire('Error', 'Falla de conexión con el servidor', 'error');
    }
};

window.registrarUsuario = async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const nombre = document.getElementById('reg-nombre').value;
    const rol = document.getElementById('reg-rol').value;
    const inmueble = document.getElementById('reg-inmueble').value;

    if (!email || !pass || !nombre) return Swal.fire('Campos vacíos', 'Completa todo el formulario', 'warning');

    try {
        // 1. Crear usuario en Auth de Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: pass,
        });

        if (authError) throw authError;

        // 2. Guardar perfil en la tabla 'usuarios'
        if(authData.user) {
             const { error: dbError } = await supabase
                .from('usuarios')
                .insert([
                    { 
                        id: authData.user.id, 
                        email: email, 
                        nombre: nombre, 
                        rol: rol, 
                        inmueble: inmueble 
                    }
                ]);
            
            if (dbError) throw dbError;
        }

        Swal.fire('¡Éxito!', 'Usuario creado. Revisa tu correo si pedimos confirmación (depende de configuración).', 'success');
        mostrarLogin();

    } catch (error) {
        console.error("Error original de Supabase:", error);
        
        // Nuestro traductor automático de errores
        let mensajeEspanol = "Ocurrió un error inesperado al registrar el usuario.";

        if (error.message.includes("Password should be at least")) {
            mensajeEspanol = "La contraseña es muy débil. Debe tener al menos 8 caracteres e incluir letras (mayúsculas/minúsculas) y números.";
        } else if (error.message.includes("User already registered") || error.message.includes("already exists")) {
            mensajeEspanol = "Este correo electrónico ya se encuentra registrado en el sistema.";
        } else if (error.message.includes("Email signups are disabled")) {
            mensajeEspanol = "El registro por correo está temporalmente deshabilitado.";
        } else if (error.message.includes("Invalid email")) {
            mensajeEspanol = "El formato del correo electrónico no es válido.";
        } else {
            // Si es un error raro que no hemos traducido, muestra el original
            mensajeEspanol = error.message; 
        }

        Swal.fire({
            title: '¡Registro Exitoso!',
            text: 'Tu cuenta ha sido creada. Por favor, revisa tu bandeja de entrada o carpeta de Spam para confirmar tu correo electrónico antes de iniciar sesión.',
            icon: 'success',
            confirmButtonColor: '#2563eb'
        });
    }
};

window.cerrarSesion = async () => {
    if(suscripcionTickets) supabase.removeChannel(suscripcionTickets); // Apagar listener
    await supabase.auth.signOut();
};

window.recuperarClave = async () => {
    const { value: email } = await Swal.fire({
        title: 'Recuperar Contraseña',
        input: 'email',
        inputLabel: 'Ingresa tu correo registrado',
        showCancelButton: true
    });

    if (email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error.message.includes("Email not confirmed")) {
        Swal.fire('Atención', 'Debes confirmar tu correo electrónico primero. Revisa tu bandeja de entrada.', 'warning');
    } else {
        Swal.fire('Error', 'Correo o contraseña incorrectos', 'error');
    }
    }
}

// ==========================================
//  LÓGICA DE INTERFAZ (UI)
// ==========================================

function mostrarLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('register-section').classList.add('hidden');
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
//  LÓGICA DEL NEGOCIO (PQRS) CON SUPABASE
// ==========================================

async function cargarDatosRealtime() {
    // 1. Carga inicial de datos
    let query = supabase.from('tickets').select('*').order('fecha', { ascending: false });
    
    // Si no es admin, filtramos por su ID
    if (usuarioActual.rol !== 'agente') {
        query = query.eq('usuario_id', usuarioActual.id);
    }

    const { data: tickets, error } = await query;
    
    if(!error && tickets) {
        procesarYRenderizarTickets(tickets);
    }

    // 2. Suscripción a cambios en Tiempo Real
    // ¡Esta es la magia de Supabase Realtime!
    if(suscripcionTickets) supabase.removeChannel(suscripcionTickets);

    let channelFilter = '*';
    if(usuarioActual.rol !== 'agente'){
        channelFilter = `usuario_id=eq.${usuarioActual.id}`;
    }

    suscripcionTickets = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Escucha inserts, updates y deletes
          schema: 'public',
          table: 'tickets',
          filter: channelFilter
        },
        async (payload) => {
          // Cuando algo cambia, volvemos a pedir la lista completa (forma fácil de mantener sincronizado)
          const { data: newData } = await query;
          if(newData) procesarYRenderizarTickets(newData);
          
          // Si el detalle abierto se actualizó, recargarlo
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
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay casos registrados.</td></tr>';
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
                <td class="p-3"><span class="px-2 py-1 rounded-md text-xs font-bold ${badgeColor}">${t.estado}</span></td>
                <td class="p-3 text-gray-600">${fecha}</td>
                <td class="p-3 font-medium">${t.nombre_usuario}</td>
                <td class="p-3 text-gray-600">
                    <span class="block text-xs font-bold text-blue-500">${t.categoria}</span>
                    ${t.tipo}
                </td>
                <td class="p-3 text-right">
                    <i class="fas fa-chevron-right text-gray-400"></i>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

window.crearPQR = async () => {
    const btn = document.getElementById('btn-enviar');
    const tipo = document.getElementById('pqr-tipo').value;
    const cat = document.getElementById('pqr-categoria').value;
    const desc = document.getElementById('pqr-desc').value;
    const fileInput = document.getElementById('pqr-file');

    if (!desc) return Swal.fire('Atención', 'Describe tu caso', 'warning');

    btn.disabled = true;
    btn.innerText = "Subiendo...";

    try {
        let fileUrl = null;

        // 1. Subir archivo a Supabase Storage
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage
              .from('evidencias')
              .upload(fileName, file);
              
            if(error) throw error;
            
            // Obtener URL pública
            const { data: { publicUrl } } = supabase.storage
              .from('evidencias')
              .getPublicUrl(fileName);
              
            fileUrl = publicUrl;
        }

        // 2. Guardar en tabla tickets
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
                historial: nuevoHistorial // JSONB nativo
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
        btn.disabled = false;
        btn.innerText = "Enviar Caso";
    }
};

window.abrirDetalle = async (id) => {
    pqrSeleccionadoID = id;
    const modal = document.getElementById('modal-detalle');
    modal.classList.remove('hidden');

    // Obtener datos iniciales
    const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single();
    if(data) renderizarModalDetalle(data);
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
    
    try {
        // 1. Obtener historial actual
        const { data: ticket, error: getError } = await supabase
            .from('tickets')
            .select('historial')
            .eq('id', pqrSeleccionadoID)
            .single();

        if(getError) throw getError;

        let historial = ticket.historial || [];
        
        // 2. Agregar nuevo mensaje
        historial.push({
            autor: usuarioActual.nombre,
            rol: usuarioActual.rol,
            mensaje: txt,
            fecha: new Date().toISOString()
        });

        // 3. Preparar update
        let updateData = { historial: historial };
        if (usuarioActual.rol === 'agente') {
            updateData.estado = nuevoEstado;
        }

        // 4. Actualizar tabla
        const { error: updateError } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', pqrSeleccionadoID);

        if(updateError) throw updateError;

        document.getElementById('chat-input').value = ""; 

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo enviar el mensaje', 'error');
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