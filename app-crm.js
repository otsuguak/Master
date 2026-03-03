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
    // Funciones internas de seguridad para mostrar/ocultar sin romper el código
    const ocultar = (id) => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); };
    const mostrar = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); };

    ocultar('login-section');
    ocultar('register-section');
    mostrar('dashboard');

    const dashNombre = document.getElementById('dash-nombre');
    if (dashNombre) dashNombre.innerText = usuarioActual.nombre;

    const dashRol = document.getElementById('dash-rol');
    if (dashRol) dashRol.innerText = usuarioActual.rol === 'agente' ? 'Administrador' : 'Residente';

    // Botón general de direcotrio
    mostrar('btn-directorio');

    if (usuarioActual.rol === 'agente') {
        document.getElementById('menu-admin-extra')?.classList.remove('hidden');
        ocultar('btn-nuevo-pqr');
        mostrar('btn-exportar');
        mostrar('btn-config-index');
    } else {
        mostrar('btn-nuevo-pqr');
        ocultar('btn-exportar');
        ocultar('btn-config-index');
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
    // 🪄 EL MISMO TRUCO DE MAGIA, AHORA EN EL MODAL
    let numeroId = parseInt(data.id.slice(0, 8), 16).toString().slice(0, 8).padStart(8, '0');
    document.getElementById('det-titulo').innerText = `CASO-${numeroId}`;
    
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

    // Buscamos las nuevas zonas de la interfaz de resolución
    const panelGestion = document.getElementById('zona-gestion');
    const pieModal = document.querySelector('#modal-detalle .border-t.shrink-0'); 

    if (usuarioActual.rol === 'agente') {
        // El administrador ve los controles para cambiar estado y escalar
        const selectEstado = document.getElementById('gestion-estado');
        if (selectEstado) {
            selectEstado.value = data.estado === 'Abierto' ? 'En Proceso' : data.estado;
            evaluarEstadoEscalamiento(); 
        }
        
        const notas = document.getElementById('gestion-notas');
        if (notas) notas.value = ''; 

        if (panelGestion) panelGestion.classList.remove('hidden');
        if (pieModal) pieModal.classList.remove('hidden');
    } else {
        // El residente solo ve el detalle del caso, no puede auto-gestionarlo
        if (panelGestion) panelGestion.classList.add('hidden');
        if (pieModal) pieModal.classList.add('hidden');
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

// ==========================================
//  MÓDULO 1: CARTELERA DIGITAL (ADMIN)
// ==========================================

window.abrirModalNoticias = () => {
    document.getElementById('modal-admin-noticias').classList.remove('hidden');
    // Ponemos la fecha de hoy por defecto
    document.getElementById('noti-fecha').valueAsDate = new Date();
    cargarNoticiasAdmin();
};

window.guardarNoticia = async () => {
    const tipo = document.getElementById('noti-tipo').value;
    const fecha = document.getElementById('noti-fecha').value;
    const titulo = document.getElementById('noti-titulo').value.trim();
    const resumen = document.getElementById('noti-resumen').value.trim();
    const contenido = document.getElementById('noti-contenido').value.trim();
    const fileInput = document.getElementById('noti-imagen');

    if (!titulo || !resumen || !contenido || !fecha) {
        return Swal.fire('Campos incompletos', 'Por favor llena todos los campos de texto y fecha.', 'warning');
    }

    mostrarCargando();
    try {
        let imageUrl = null;

        // Subir imagen si se seleccionó una
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const fileName = `noticia_${Date.now()}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage
                .from('noticias') // Asegúrate de haber creado este bucket
                .upload(fileName, file);
                
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('noticias')
                .getPublicUrl(fileName);
                
            imageUrl = publicUrl;
        }

        // Insertar en la base de datos
        const { error: dbError } = await supabase.from('noticias').insert([{
            tipo: tipo,
            fecha: fecha,
            titulo: titulo,
            resumen: resumen,
            contenido: contenido,
            imagen_url: imageUrl
        }]);

        if (dbError) throw dbError;

        Swal.fire('¡Publicada!', 'La noticia ya está visible en la Cartelera Digital.', 'success');
        
        // Limpiar formulario
        document.getElementById('noti-titulo').value = '';
        document.getElementById('noti-resumen').value = '';
        document.getElementById('noti-contenido').value = '';
        document.getElementById('noti-imagen').value = '';
        
        // Recargar la tabla
        cargarNoticiasAdmin();

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Hubo un problema al publicar la noticia.', 'error');
    } finally {
        ocultarCargando();
    }
};

async function cargarNoticiasAdmin() {
    const tbody = document.getElementById('tabla-noticias-admin');
    tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center">Cargando...</td></tr>';

    const { data, error } = await supabase
        .from('noticias')
        .select('id, titulo, tipo, fecha')
        .order('fecha', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-red-500">Error al cargar</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-500">No hay noticias publicadas</td></tr>';
        return;
    }

    data.forEach(noti => {
        let colorType = 'bg-blue-100 text-blue-700';
        if(noti.tipo === 'Urgente') colorType = 'bg-red-100 text-red-700';
        if(noti.tipo === 'Alerta') colorType = 'bg-orange-100 text-orange-700';
        if(noti.tipo === 'Exclusivo') colorType = 'bg-purple-100 text-purple-700';

        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-gray-600">${noti.fecha}</td>
                <td class="p-3 font-bold text-gray-800">${noti.titulo}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-bold rounded ${colorType}">${noti.tipo}</span></td>
                <td class="p-3 text-center">
                    <button onclick="borrarNoticia('${noti.id}')" class="text-red-500 hover:text-red-700 p-2" title="Borrar Noticia">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

window.borrarNoticia = async (id) => {
    const result = await Swal.fire({
        title: '¿Borrar Noticia?',
        text: "Esta acción la quitará de la Cartelera Digital",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, borrar'
    });

    if (result.isConfirmed) {
        mostrarCargando();
        try {
            const { error } = await supabase.from('noticias').delete().eq('id', id);
            if (error) throw error;
            cargarNoticiasAdmin();
            Swal.fire('Borrada', 'La noticia fue eliminada.', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudo borrar.', 'error');
        } finally {
            ocultarCargando();
        }
    }
};

// ==========================================
//  MÓDULO 2: ZONAS COMUNES (ADMIN)
// ==========================================

// ==========================================
//  MÓDULO 2: ZONAS COMUNES (ADMIN)
// ==========================================

window.abrirModalReservas = () => {
    document.getElementById('modal-admin-reservas').classList.remove('hidden');
    cargarReservasAdmin();
};

async function cargarReservasAdmin() {
    const tbody = document.getElementById('tabla-reservas-admin');
    tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center">Cargando reservas...</td></tr>';

    const { data, error } = await supabase
        .from('reservas')
        .select('*')
        .order('fecha', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-red-500">Error al cargar.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-500">No hay reservas registradas.</td></tr>';
        return;
    }

    data.forEach(res => {
        let badgeColor = 'bg-yellow-100 text-yellow-700';
        if(res.estado === 'Aprobada') badgeColor = 'bg-green-100 text-green-700';
        if(res.estado === 'Rechazada') badgeColor = 'bg-red-100 text-red-700';

        let botonesAccion = '';
        if (res.estado === 'Pendiente') {
            botonesAccion = `
                <button onclick="gestionarReserva('${res.id}', 'Aprobada', '${res.email}', '${res.zona}')" class="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded text-xs font-bold mr-1 transition">Aprobar</button>
                <button onclick="gestionarReserva('${res.id}', 'Rechazada', '${res.email}', '${res.zona}')" class="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-xs font-bold mr-2 transition">Rechazar</button>
            `;
        } else {
            botonesAccion = `<span class="text-gray-400 text-xs italic mr-3">Gestionada</span>`;
        }

        // NUEVO: Botón de eliminar visible siempre
        botonesAccion += `
            <button onclick="borrarReserva('${res.id}')" class="text-red-500 hover:text-red-700 p-1" title="Eliminar del historial">
                <i class="fas fa-trash text-sm"></i>
            </button>
        `;

        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-medium text-gray-800">${new Date(res.fecha).toLocaleDateString()}</td>
                <td class="p-3 text-purple-600 font-bold">${res.zona}</td>
                <td class="p-3 text-gray-600">${res.apto} <br> <span class="text-xs text-gray-400">${res.email}</span></td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-bold rounded ${badgeColor}">${res.estado}</span></td>
                <td class="p-3 text-right">${botonesAccion}</td>
            </tr>
        `;
    });
}

window.gestionarReserva = async (id, nuevoEstado, email, zona) => {
    let motivo = "";

    // NUEVO: Si rechaza, le pedimos una justificación
    if (nuevoEstado === 'Rechazada') {
        const { value: text, isConfirmed } = await Swal.fire({
            title: 'Rechazar Reserva',
            input: 'text',
            inputLabel: `¿Por qué rechazas la reserva de la ${zona}?`,
            inputPlaceholder: 'Ej: Está en mantenimiento, aforo lleno...',
            showCancelButton: true,
            confirmButtonText: 'Rechazar y Notificar',
            cancelButtonText: 'Cancelar'
        });
        
        if (!isConfirmed) return; // Si cancela, no hacemos nada
        motivo = text || "No cumple con las políticas o el horario ya no está disponible.";
    } else {
        const { isConfirmed } = await Swal.fire({
            title: `¿Aprobar Reserva?`,
            text: `Se aprobará la reserva de la ${zona} y se notificará al residente.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, Aprobar'
        });
        if (!isConfirmed) return;
        motivo = "¡Tu reserva ha sido confirmada con éxito! Te esperamos.";
    }

    mostrarCargando();
    try {
        const { error } = await supabase.from('reservas').update({ estado: nuevoEstado }).eq('id', id);
        if (error) throw error;
        
        // REEMPLAZAR CON TUS DATOS DE EMAILJS
        const serviceID = 'service_yy0gcdm'; 
        const templateID = 'template_0kwz3ij';
        
        const templateParams = {
            to_email: email,             
            zona_reservada: zona,        
            estado_reserva: nuevoEstado, 
            mensaje_adicional: motivo    // Enviamos el motivo al correo
        };

        // Si ya tienes tu cuenta de EmailJS configurada, descomenta esta línea:
        // await emailjs.send(serviceID, templateID, templateParams);
        
        cargarReservasAdmin();
        
        Swal.fire({
            title: '¡Gestión Completada!',
            text: `El estado se guardó y se notificó a ${email} la decisión.`,
            icon: 'success'
        });

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Se guardó el estado, pero falló el envío del correo.', 'warning');
    } finally {
        ocultarCargando();
    }
};

// NUEVA FUNCIÓN: Eliminar Reserva
window.borrarReserva = async (id) => {
    const result = await Swal.fire({
        title: '¿Eliminar registro?',
        text: "Esto borrará la reserva del historial de forma permanente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, borrar'
    });

    if (result.isConfirmed) {
        mostrarCargando();
        try {
            const { error } = await supabase.from('reservas').delete().eq('id', id);
            if (error) throw error;
            
            cargarReservasAdmin();
            Swal.fire('Eliminada', 'El registro fue borrado exitosamente.', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudo eliminar de la base de datos.', 'error');
        } finally {
            ocultarCargando();
        }
    }
};

// ==========================================
//  PARAMETRIZACIÓN DE ZONAS COMUNES (ADMIN)
// ==========================================

window.abrirModalConfigZonas = () => {
    document.getElementById('modal-admin-config-zonas').classList.remove('hidden');
    cargarZonasConfigAdmin();
};

window.guardarZonaComun = async () => {
    const nombre = document.getElementById('conf-zona-nombre').value.trim();
    const aforo = document.getElementById('conf-zona-aforo').value.trim();
    const icono = document.getElementById('conf-zona-icono').value;

    if (!nombre) return Swal.fire('Atención', 'El nombre de la zona es obligatorio', 'warning');

    mostrarCargando();
    try {
        const { error } = await supabase.from('zonas_comunes').insert([{ nombre, aforo, icono }]);
        if (error) throw error;

        Swal.fire('¡Éxito!', 'La zona ha sido creada y ya es visible en la página principal.', 'success');
        
        document.getElementById('conf-zona-nombre').value = '';
        document.getElementById('conf-zona-aforo').value = '';
        cargarZonasConfigAdmin();
    } catch (e) {
        Swal.fire('Error', 'No se pudo guardar la zona. Revisa tu conexión o Supabase.', 'error');
    } finally {
        ocultarCargando();
    }
};

async function cargarZonasConfigAdmin() {
    const tbody = document.getElementById('tabla-config-zonas');
    tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center">Cargando zonas...</td></tr>';

    const { data, error } = await supabase.from('zonas_comunes').select('*');

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-red-500">Error al cargar datos.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-500">Aún no has creado zonas comunes.</td></tr>';
        return;
    }

    data.forEach(zona => {
        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-purple-600 text-lg"><i class="fa-solid ${zona.icono}"></i></td>
                <td class="p-3 font-bold text-gray-800">${zona.nombre}</td>
                <td class="p-3 text-gray-600">${zona.aforo || 'Sin límite definido'}</td>
                <td class="p-3 text-center">
                    <button onclick="borrarZonaComun('${zona.id}')" class="text-red-500 hover:text-red-700 p-2" title="Borrar Zona">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

window.borrarZonaComun = async (id) => {
    const result = await Swal.fire({
        title: '¿Borrar esta zona?',
        text: "Desaparecerá de la página principal y los residentes no podrán reservarla.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, borrar'
    });

    if (result.isConfirmed) {
        mostrarCargando();
        try {
            const { error } = await supabase.from('zonas_comunes').delete().eq('id', id);
            if (error) throw error;
            cargarZonasConfigAdmin();
            Swal.fire('Borrada', 'La zona fue eliminada exitosamente.', 'success');
        } catch (e) {
            Swal.fire('Error', 'No se pudo borrar la zona.', 'error');
        } finally {
            ocultarCargando();
        }
    }
};

// ==========================================
//  MÓDULO 3: MERCADO INMOBILIARIO (ADMIN)
// ==========================================

window.abrirModalInmuebles = () => {
    document.getElementById('modal-admin-inmuebles').classList.remove('hidden');
    cargarInmueblesAdmin();
};

window.guardarInmueble = async () => {
    const tipo = document.getElementById('inm-tipo').value;
    const precio = document.getElementById('inm-precio').value;
    const titulo = document.getElementById('inm-titulo').value.trim();
    const hab = document.getElementById('inm-hab').value;
    const banos = document.getElementById('inm-banos').value;
    const area = document.getElementById('inm-area').value;
    const parq = document.getElementById('inm-parq').value;
    const desc = document.getElementById('inm-desc').value.trim();
    const nombre = document.getElementById('inm-nombre').value.trim();
    const tel = document.getElementById('inm-tel').value.trim();
    const archivos = document.getElementById('inm-fotos').files;
    const destacado = document.getElementById('inm-destacado').checked;
    
    
    if (!titulo || !precio || !tel || !desc) {
        return Swal.fire('Faltan Datos', 'El título, precio, descripción y teléfono son obligatorios.', 'warning');
    }
    if (archivos.length === 0) {
        return Swal.fire('Sin fotos', 'Debes subir al menos una foto del inmueble.', 'warning');
    }
    if (archivos.length > 6) {
        return Swal.fire('Límite excedido', 'Solo puedes subir un máximo de 6 fotos por inmueble.', 'warning');
    }

    // NUEVO: Validar límite de 8 destacados
    if (destacado) {
        const { count } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).eq('destacado', true);
        if (count >= 8) {
            return Swal.fire('Límite Alcanzado', 'Solo puedes tener un máximo de 8 inmuebles destacados. Por favor, borra o edita uno existente.', 'warning');
        }
    }

    Swal.fire({ title: 'Subiendo Inmueble y Fotos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        let urlsImagenes = [];

        // MAGIA: Bucle para subir múltiples imágenes a Supabase Storage
        for (let i = 0; i < archivos.length; i++) {
            const file = archivos[i];
            const fileName = `inmueble_${Date.now()}_${i}_${file.name}`;
            
            const { error: uploadError } = await supabase.storage.from('inmuebles').upload(fileName, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('inmuebles').getPublicUrl(fileName);
            urlsImagenes.push(publicUrl);
        }

        // Insertar todos los datos en la tabla inmuebles
        const { error: dbError } = await supabase.from('inmuebles').insert([{
            tipo_oferta: tipo,
            titulo: titulo,
            precio: parseFloat(precio),
            habitaciones: parseInt(hab) || 0,
            banos: parseInt(banos) || 0,
            area: parseFloat(area) || 0,
            parqueadero: parseInt(parq) || 0,
            descripcion: desc,
            contacto_nombre: nombre,
            contacto_tel: tel,
            destacado: destacado,
            imagenes: urlsImagenes // Guardamos el Array de URLs
        }]);

        if (dbError) throw dbError;

        Swal.fire('¡Publicado!', 'El inmueble ya está en el catálogo del conjunto.', 'success');
        
        // Limpiar formulario
        document.getElementById('inm-titulo').value = '';
        document.getElementById('inm-precio').value = '';
        document.getElementById('inm-desc').value = '';
        document.getElementById('inm-tel').value = '';
        document.getElementById('inm-fotos').value = '';
        
        cargarInmueblesAdmin();

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Hubo un problema al subir el inmueble.', 'error');
    }
    document.getElementById('inm-destacado').checked = false;
};

async function cargarInmueblesAdmin() {
    const tbody = document.getElementById('tabla-inmuebles-admin');
    tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center">Cargando catálogo...</td></tr>';

    const { data, error } = await supabase.from('inmuebles').select('*').order('id', { ascending: false });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-red-500">Error al cargar datos.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-500">No hay inmuebles publicados.</td></tr>';
        return;
    }

    data.forEach(inm => {
        // Formato moneda colombiana
        const precioFormat = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(inm.precio);
        const colorTipo = inm.tipo_oferta === 'Se Arrienda' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
        
        // Sacamos la primera foto del array para mostrarla en la tablita
        const fotoPortada = (inm.imagenes && inm.imagenes.length > 0) ? inm.imagenes[0] : 'https://via.placeholder.com/50';

        tbody.innerHTML += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 flex items-center gap-3">
                    <img src="${fotoPortada}" class="w-12 h-12 rounded object-cover shadow-sm">
                    <span class="font-bold text-gray-800">${inm.titulo}</span>
                </td>
                <td class="p-3">
                    <span class="px-2 py-1 text-[10px] font-bold uppercase rounded ${colorTipo} block w-max mb-1">${inm.tipo_oferta}</span>
                    <span class="font-semibold text-gray-700">${precioFormat}</span>
                </td>
                <td class="p-3 text-gray-600 text-sm">
                    ${inm.contacto_nombre}<br>
                    <a href="https://wa.me/57${inm.contacto_tel}" target="_blank" class="text-green-500 hover:underline"><i class="fab fa-whatsapp"></i> ${inm.contacto_tel}</a>
                </td>
                <td class="p-3 text-center">
                    <button onclick="borrarInmueble('${inm.id}')" class="text-red-500 hover:text-red-700 p-2">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;

    });
}

window.borrarInmueble = async (id) => {
    const result = await Swal.fire({ title: '¿Borrar inmueble?', text: "Se eliminará del catálogo y sus fotos se borrarán del servidor.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, borrar' });
    
    if (result.isConfirmed) {
        mostrarCargando();
        try {
            // 1. Traer las URLs de las fotos antes de borrar el registro
            const { data: inm } = await supabase.from('inmuebles').select('imagenes').eq('id', id).single();
            
            // 2. Borrar el registro de la Base de Datos
            const { error } = await supabase.from('inmuebles').delete().eq('id', id);
            if (error) throw error;

            // 3. Destruir las fotos del Storage para no acumular basura
            if (inm && inm.imagenes && inm.imagenes.length > 0) {
                // Extraemos solo el nombre final del archivo (ej: inmueble_123.jpg)
                const rutasArchivos = inm.imagenes.map(url => url.split('/').pop());
                await supabase.storage.from('inmuebles').remove(rutasArchivos);
            }

            cargarInmueblesAdmin();
            Swal.fire('Borrado', 'El inmueble y sus fotos fueron eliminados.', 'success');
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'No se pudo eliminar completamente.', 'error');
        } finally {
            ocultarCargando();
        }
    }
};

// ==========================================
//  CONFIGURACIÓN GENERAL (PORTADA Y DIRECTORIO)
// ==========================================

window.abrirModalPortada = async () => {
    document.getElementById('modal-admin-portada').classList.remove('hidden');
    mostrarCargando();
    const { data } = await supabase.from('configuracion').select('*').eq('id', 1).single();
    if (data) {
        document.getElementById('conf-hero-titulo').value = data.titulo_hero || '';
        document.getElementById('conf-hero-desc').value = data.desc_hero || '';
        document.getElementById('conf-tel-admin').value = data.tel_admin || '';
        document.getElementById('conf-tel-porteria').value = data.tel_porteria || '';
        document.getElementById('conf-tel-policia').value = data.tel_policia || '';
    }
    ocultarCargando();
};

window.guardarPortada = async () => {
    const titulo = document.getElementById('conf-hero-titulo').value.trim();
    const desc = document.getElementById('conf-hero-desc').value.trim();
    const telAdmin = document.getElementById('conf-tel-admin').value.trim();
    const telPorteria = document.getElementById('conf-tel-porteria').value.trim();
    const telPolicia = document.getElementById('conf-tel-policia').value.trim();
    
    if(!titulo) return Swal.fire('Atención', 'El título principal es obligatorio.', 'warning');

    mostrarCargando();
    try {
        const { error } = await supabase.from('configuracion').upsert({ 
            id: 1, 
            titulo_hero: titulo, 
            desc_hero: desc,
            tel_admin: telAdmin,
            tel_porteria: telPorteria,
            tel_policia: telPolicia
        });
        
        if (error) throw error;
        
        Swal.fire('Guardado', 'La configuración ha sido actualizada exitosamente.', 'success');
        cerrarModal('modal-admin-portada');
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'No se pudieron guardar los cambios en la base de datos.', 'error');
    } finally { 
        ocultarCargando(); 
    }
};

// ==========================================
//  DIRECTORIO Y SOPORTE (DINÁMICO)
// ==========================================
window.abrirDirectorio = async () => {
    mostrarCargando();
    try {
        // Consultamos la configuración maestra
        const { data, error } = await supabase.from('configuracion').select('*').eq('id', 1).single();
        
        // Si hay datos los usamos, sino ponemos unos genéricos de respaldo
        const telAdmin = data?.tel_admin || "570000000000"; 
        const telPorteria = data?.tel_porteria || "0000000";
        const telPolicia = data?.tel_policia || "123";

        ocultarCargando();

        Swal.fire({
            title: '<strong>Directorio del Conjunto</strong>',
            html: `
                <div class="space-y-4 mt-4 text-left">
                    <a href="https://wa.me/${telAdmin}" target="_blank" class="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition cursor-pointer text-gray-800 no-underline">
                        <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white mr-4 shadow-md">
                            <i class="fab fa-whatsapp text-xl"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-green-800 m-0">Administración</h4>
                            <p class="text-xs text-green-600 m-0">Lunes a Viernes (8am - 5pm)</p>
                        </div>
                    </a>

                    <a href="tel:${telPorteria}" class="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition cursor-pointer text-gray-800 no-underline">
                        <div class="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white mr-4 shadow-md">
                            <i class="fas fa-phone-alt"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-blue-800 m-0">Portería Principal</h4>
                            <p class="text-xs text-blue-600 m-0">Atención 24/7</p>
                        </div>
                    </a>

                    <a href="tel:${telPolicia}" class="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition cursor-pointer text-gray-800 no-underline">
                        <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white mr-4 shadow-md">
                            <i class="fas fa-shield-alt"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-red-800 m-0">Cuadrante Policía</h4>
                            <p class="text-xs text-red-600 m-0">Solo emergencias</p>
                        </div>
                    </a>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            width: '400px'
        });
    } catch (e) {
        ocultarCargando();
        Swal.fire('Error', 'No se pudo cargar la información del directorio.', 'error');
    }
};