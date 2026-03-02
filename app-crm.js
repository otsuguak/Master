// --- IMPORTACIÓN DE SUPABASE ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://rqjfaztnaktizrgllhna.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxamZhenRuYWt0aXpyZ2xsaG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzk1NjksImV4cCI6MjA4NzcxNTU2OX0.cb6LSWq5YZ7BKRdBx2VoeD-m1gUonfpU_MJemaTSB3U';

// 1. ALMACENAMIENTO SEGURO
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

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        storage: almacenamientoSeguro,
        autoRefreshToken: true,
        persistSession: true, 
        detectSessionInUrl: true
    }
});

// Variables Globales
let usuarioActual = null;
let pqrSeleccionadoID = null;
let chartInstance = null;
let suscripcionTickets = null; 
let ticketsGlobales = [];

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

    // 🌟 ESTE BOTÓN AHORA SE MUESTRA PARA TODOS
    document.getElementById('btn-chat-linea')?.classList.remove('hidden');

    if (usuarioActual.rol === 'agente') {
        // Vista Administrador
        document.getElementById('btn-nuevo-pqr').classList.add('hidden');
        document.getElementById('btn-exportar').classList.remove('hidden');
        document.getElementById('btn-config-index')?.classList.remove('hidden');
    } else {
        // Vista Residente
        document.getElementById('btn-nuevo-pqr').classList.remove('hidden');
        document.getElementById('btn-exportar').classList.add('hidden');
        document.getElementById('btn-config-index')?.classList.add('hidden');
    }

    cargarDatosRealtime();
}

window.mostrarRegistro = () => {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('register-section').classList.remove('hidden');
};
window.mostrarLogin = () => mostrarLogin();

// ==========================================
//  SISTEMA DE AUTENTICACIÓN DIRECTO (SIN EVENTOS TÓXICOS)
// ==========================================

// Función central para buscar perfil y entrar
async function procesarEntradaUsuario(user) {
    try {
        const { data: userData, error: dbError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (dbError) throw dbError;

        if (userData) {
            usuarioActual = userData;
            mostrarDashboard();
        } else {
            Swal.fire("Error", "Tu sesión es válida, pero no tienes perfil en la base de datos.", "error");
            await supabase.auth.signOut();
            mostrarLogin();
        }
    } catch (err) {
        console.error("Fallo al buscar datos del usuario:", err);
        Swal.fire("Error de Conexión", "No pudimos cargar tus datos. Revisa tu internet.", "error");
        mostrarLogin();
    }
}

// 1. INICIAR SESIÓN (Flujo Lineal)
window.iniciarSesion = async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('pass-input').value;
    
    if(!email || !pass) return Swal.fire('Error', 'Ingresa correo y contraseña', 'warning');

    mostrarCargando();
    
    try {
        // Paso A: Login
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        
        // Paso B: Cargar perfil de inmediato
        if (data.user) {
            await procesarEntradaUsuario(data.user);
        }
    } catch (err) {
        console.error("Fallo Login:", err);
        if (err.message && err.message.includes("Invalid login")) {
            Swal.fire('Error', 'Correo o contraseña incorrectos', 'error');
        } else {
            Swal.fire('Error', 'Falla de conexión con el servidor', 'error');
        }
    } finally {
        ocultarCargando(); // Garantía inquebrantable de apagar el spinner
    }
};

// 2. CERRAR SESIÓN (A prueba de balas)
window.cerrarSesion = async () => {
    mostrarCargando();
    try {
        if(suscripcionTickets) supabase.removeChannel(suscripcionTickets);
        await supabase.auth.signOut();
    } catch (e) {
        console.warn("Fallo silencioso en el servidor al cerrar sesión, forzando salida local:", e);
    } finally {
        // El bloque "finally" asegura que ESTO SIEMPRE SE EJECUTE, falle o no la red
        usuarioActual = null;
        window.sessionStorage.clear(); // Limpiamos rastro local
        mostrarLogin();
        ocultarCargando();
    }
};

// 3. AUTO-LOGIN Y RECUPERACIÓN (Interceptor Profesional)
async function inicializarApp() {
    
    // --- 1. INTERCEPTOR MÁXIMO ---
    if (window.location.hash.includes('type=recovery')) {
        ocultarCargando();
        
        await Swal.fire({
            title: 'Nueva Contraseña',
            input: 'password',
            inputLabel: 'Escribe tu nueva contraseña',
            inputPlaceholder: 'Mínimo 8 caracteres (letras y números)',
            inputAttributes: { minlength: 8 },
            allowOutsideClick: false,
            confirmButtonText: 'Guardar Contraseña',
            confirmButtonColor: '#2563eb',
            showLoaderOnConfirm: true,
            // EL CADENERO: No deja cerrar la ventana hasta que Supabase diga que SÍ
            preConfirm: async (nuevaClave) => {
                const { error } = await supabase.auth.updateUser({ password: nuevaClave });
                if (error) {
                    let mensajeEspanol = "Error al actualizar la contraseña.";
                    // Atrapamos cualquier variante del error en inglés de Supabase
                    if (error.message.includes("Password") || error.message.toLowerCase().includes("weak") || error.message.includes("characters")) {
                        mensajeEspanol = "Contraseña débil: Usa al menos 8 caracteres, combinando letras y números.";
                    } else {
                        mensajeEspanol = error.message;
                    }
                    // Muestra el error en rojo SIN cerrar la ventana
                    Swal.showValidationMessage(mensajeEspanol);
                    return false; 
                }
                return true; // Si todo sale bien, la deja pasar
            }
        }).then(async (result) => {
            // Solo llegamos aquí si el cadenero (preConfirm) dio luz verde
            if (result.isConfirmed) {
                await Swal.fire('¡Éxito!', 'Tu contraseña ha sido actualizada. Ya puedes ingresar.', 'success');
                // Limpiamos la URL y cerramos la sesión temporal
                window.history.replaceState(null, null, window.location.pathname);
                await supabase.auth.signOut();
                mostrarLogin();
            }
        });
        
        return; // Detenemos la ejecución aquí
    }

    // --- 2. FLUJO NORMAL DE INICIO ---
    mostrarCargando();
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            await procesarEntradaUsuario(session.user);
        } else {
            mostrarLogin();
        }
    } catch (e) {
        mostrarLogin();
    } finally {
        ocultarCargando();
    }
}

// 4. ESCUDO DE RESPALDO (Solo para cerrar sesión)
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        usuarioActual = null;
        mostrarLogin();
    }
});

// ==========================================
//  RESTO DE FUNCIONES (Registro, Recuperar Clave, PQR)
// ==========================================

window.registrarUsuario = async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const nombre = document.getElementById('reg-nombre').value;
    const rol = document.getElementById('reg-rol').value;
    const inmueble = document.getElementById('reg-inmueble').value;

    if (!email || !pass || !nombre) return Swal.fire('Campos vacíos', 'Completa todo el formulario', 'warning');

    mostrarCargando();

    // NUEVO: Validación estricta para el Administrador
    if (rol === 'agente') {
        const { data: adminData, error: adminErr } = await supabase
            .from('usuarios')
            .select('id')
            .eq('rol', 'agente')
            .limit(1);
            
        if (adminData && adminData.length > 0) {
            ocultarCargando();
            return Swal.fire('Acceso Denegado', 'Ya existe un administrador en el sistema. Solo se permite uno.', 'error');
        }
    }

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

window.recuperarClave = async () => {
    const { value: email } = await Swal.fire({
        title: 'Recuperar Contraseña',
        input: 'email',
        inputLabel: 'Ingresa tu correo registrado',
        showCancelButton: true
    });

    if (email) {
        mostrarCargando();
        
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'https://otsuguak.github.io/Master/crm.html'
        });
        
        ocultarCargando();
        
        if (error) {
            // TRADUCCIÓN DEL ERROR ANTI-SPAM
            if (error.message.includes("rate limit")) {
                Swal.fire('Demasiados intentos', 'Por seguridad, hemos pausado los envíos a este correo. Espera alrededor de una hora para volver a intentarlo.', 'warning');
            } else {
                Swal.fire('Error', error.message, 'error');
            }
        } else {
            Swal.fire('Enviado', 'Revisa tu correo para recuperar la contraseña', 'success');
        }
    }
}

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
    // Actualizamos nuestra memoria global para los filtros
    ticketsGlobales = tickets; 

    let stats = { abiertos: 0, proceso: 0, cerrados: 0 };
    tickets.forEach(t => {
        if (t.estado === 'Abierto') stats.abiertos++;
        // Incluimos Escalado dentro de En Proceso para las métricas si lo deseas, 
        // o puedes separar el KPI si luego quieres una gráfica de 4 partes
        else if (t.estado === 'En Proceso' || t.estado === 'Escalado') stats.proceso++;
        else if (t.estado === 'Cerrado') stats.cerrados++;
    });

    actualizarKPIs(stats, tickets.length);
    actualizarGrafica(stats);
    
    // En lugar de pintar todo de golpe, llamamos a aplicarFiltros para que respete si hay filtros activos
    aplicarFiltros(); 
}

// NUEVA FUNCIÓN: Se ejecuta cada vez que mueves un filtro
window.aplicarFiltros = () => {
    const fEstado = document.getElementById('filtro-estado')?.value.toLowerCase() || '';
    const fUsuario = document.getElementById('filtro-usuario')?.value.toLowerCase() || '';
    const fTipo = document.getElementById('filtro-tipo')?.value.toLowerCase() || '';
    const fCat = document.getElementById('filtro-categoria')?.value.toLowerCase() || '';

    const filtrados = ticketsGlobales.filter(t => {
        const coincideEstado = fEstado === '' || t.estado.toLowerCase() === fEstado;
        const coincideUsuario = fUsuario === '' || t.nombre_usuario.toLowerCase().includes(fUsuario);
        const coincideTipo = fTipo === '' || t.tipo.toLowerCase() === fTipo;
        const coincideCat = fCat === '' || t.categoria.toLowerCase() === fCat;

        return coincideEstado && coincideUsuario && coincideTipo && coincideCat;
    });

    actualizarTabla(filtrados);
};

function actualizarTabla(tickets) {
    const tbody = document.getElementById('tabla-body');
    tbody.innerHTML = '';

    if (tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-500">No hay casos que coincidan.</td></tr>';
        return;
    }

    tickets.forEach(t => {
        let badgeColor = 'bg-gray-100 text-gray-800';
        if (t.estado === 'Abierto') badgeColor = 'bg-red-100 text-red-700 ring-1 ring-red-600/20';
        if (t.estado === 'En Proceso') badgeColor = 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-600/20';
        if (t.estado === 'Escalado') badgeColor = 'bg-orange-100 text-orange-700 ring-1 ring-orange-600/20';
        if (t.estado === 'Cerrado') badgeColor = 'bg-green-100 text-green-700 ring-1 ring-green-600/20';

        const fecha = new Date(t.fecha).toLocaleDateString();

        // TRUCO DE MAGIA: Convertimos el fragmento de UUID (letras y números) a un número real
        // y le ponemos ceros a la izquierda para que luzca súper corporativo.
        let numeroId = parseInt(t.id.slice(0, 8), 16).toString().slice(0, 8).padStart(8, '0');

        const row = `
            <tr class="border-b hover:bg-slate-50 transition cursor-pointer" onclick="abrirDetalle('${t.id}')">
                <td class="p-3 font-mono text-xs text-blue-600 font-bold uppercase">CASO-${numeroId}</td>
                <td class="p-3"><span class="px-2 py-1 rounded-md text-xs font-bold ${badgeColor}">${t.estado}</span></td>
                <td class="p-3 text-gray-600">${fecha}</td>
                <td class="p-3 font-medium text-gray-800">${t.nombre_usuario}</td>
                <td class="p-3 font-semibold text-slate-600">${t.tipo}</td>
                <td class="p-3 text-gray-600">${t.categoria}</td>
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

// --- NUEVA LÓGICA DE RESOLUCIÓN Y ESCALAMIENTO ---

// Mostrar/Ocultar lista de usuarios si se elige "Escalado"
window.evaluarEstadoEscalamiento = async () => {
    const estado = document.getElementById('gestion-estado').value;
    const divEscalar = document.getElementById('zona-escalar');
    
    if (estado === 'Escalado') {
        divEscalar.classList.remove('hidden');
        // Cargar lista de usuarios que NO son el usuario actual ni el residente que creó el PQR
        const { data: usuarios, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol')
            .neq('id', usuarioActual.id);
            
        const select = document.getElementById('gestion-asignado');
        select.innerHTML = '<option value="">Seleccione a quién escalar...</option>';
        if (usuarios) {
            usuarios.forEach(u => {
                select.innerHTML += `<option value="${u.id}">${u.nombre} (${u.rol}) - ${u.email}</option>`;
            });
        }
    } else {
        divEscalar.classList.add('hidden');
    }
};

window.guardarGestionPQR = async () => {
    const estado = document.getElementById('gestion-estado').value;
    const notas = document.getElementById('gestion-notas').value;
    const asignadoA = document.getElementById('gestion-asignado').value;

    if (estado === 'Escalado' && !asignadoA) {
        return Swal.fire('Atención', 'Debes seleccionar a un usuario para escalar el caso.', 'warning');
    }
    if (!notas.trim()) {
        return Swal.fire('Atención', 'Debes escribir una nota de resolución.', 'warning');
    }

    mostrarCargando();
    try {
        let updateData = {
            estado: estado,
            descripcion: document.getElementById('det-descripcion').innerText + '\n\n-- ACTUALIZACIÓN --\n' + notas
        };

        if (estado === 'Escalado') {
            updateData.asignado_a = asignadoA;
        }

        const { error } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', pqrSeleccionadoID);

        if (error) throw error;

        Swal.fire('Gestión Guardada', 'El caso ha sido actualizado exitosamente.', 'success');
        window.cerrarModal('modal-detalle');
        
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudo actualizar el caso', 'error');
    } finally {
        ocultarCargando();
    }
};


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

// ==========================================
//  ¡ARRANQUE INICIAL DE LA APP!
// ==========================================
// Esta línea final verifica la sesión al abrir/recargar la página
inicializarApp();