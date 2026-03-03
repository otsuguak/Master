// Importamos Supabase (Igual que en el CRM)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://rqjfaztnaktizrgllhna.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxamZhenRuYWt0aXpyZ2xsaG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzk1NjksImV4cCI6MjA4NzcxNTU2OX0.cb6LSWq5YZ7BKRdBx2VoeD-m1gUonfpU_MJemaTSB3U';
const supabase = createClient(supabaseUrl, supabaseKey);

// Guardamos las noticias en memoria para poder abrirlas en el modal
let noticiasGlobales = [];

document.addEventListener('DOMContentLoaded', () => {
    console.log("Portal Comunitario iniciado. Conectando a Supabase...");

    // Animaciones de Aparición (Scroll)
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    cargarNoticiasPublicas(); // carga noticias 
    cargarZonasComunes(); // NUEVO: Llamamos a las zonas
});

// Función que va a Supabase, trae las 8 últimas y dibuja las tarjetas
async function cargarNoticiasPublicas() {
    const contenedor = document.getElementById('contenedor-noticias');
    if (!contenedor) return;

    const { data, error } = await supabase
        .from('noticias')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(8);

    if (error) {
        console.error("Error cargando noticias:", error);
        contenedor.innerHTML = '<p class="text-red-400 col-span-full text-center py-8">No se pudieron cargar las noticias.</p>';
        return;
    }

    noticiasGlobales = data;
    contenedor.innerHTML = ''; // Limpiamos el letrero de "Cargando..."

    if (data.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 col-span-full text-center py-8">No hay avisos recientes en la comunidad.</p>';
        return;
    }

    // Dibujamos cada tarjeta que encuentre en la Base de Datos
    data.forEach((noti, index) => {
        // Asignamos el color dependiendo del tipo de noticia
        const colores = {
            'Urgente': { bg: 'bg-red-500', bgLight: 'bg-red-500/20', text: 'text-red-400', border: 'hover:border-red-500' },
            'Alerta': { bg: 'bg-orange-500', bgLight: 'bg-orange-500/20', text: 'text-orange-400', border: 'hover:border-orange-500' },
            'Exclusivo': { bg: 'bg-purple-500', bgLight: 'bg-purple-500/20', text: 'text-purple-400', border: 'hover:border-purple-500' },
            'Informativo': { bg: 'bg-blue-500', bgLight: 'bg-blue-500/20', text: 'text-blue-400', border: 'hover:border-blue-500' }
        };
        const c = colores[noti.tipo] || colores['Informativo'];

        const tarjeta = `
            <div onclick="abrirNoticiaDetalle(${index})" class="glass-card p-6 rounded-2xl hover:-translate-y-1 transition-transform cursor-pointer relative overflow-hidden group border-slate-700 ${c.border}">
                <div class="absolute top-0 left-0 w-1 h-full ${c.bg}"></div>
                <span class="px-2 py-1 ${c.bgLight} ${c.text} text-xs font-bold rounded mb-3 inline-block">${noti.tipo}</span>
                <h3 class="text-lg font-bold mb-2 text-slate-100">${noti.titulo}</h3>
                <p class="text-slate-400 text-sm mb-4 line-clamp-2">${noti.resumen}</p>
                <span class="text-xs ${c.text} font-bold group-hover:underline">Leer más <i class="fa-solid fa-arrow-right ml-1"></i></span>
            </div>
        `;
        contenedor.innerHTML += tarjeta;
    });
}

// ==========================================
//  CONTROL DE VENTANAS EMERGENTES (MODALES)
// ==========================================

// Esta función se activa cuando alguien hace clic en una tarjeta de noticia
window.abrirNoticiaDetalle = (index) => {
    const noti = noticiasGlobales[index];
    if (!noti) return;

    const colores = {
        'Urgente': { bgLight: 'bg-red-500/20', text: 'text-red-400' },
        'Alerta': { bgLight: 'bg-orange-500/20', text: 'text-orange-400' },
        'Exclusivo': { bgLight: 'bg-purple-500/20', text: 'text-purple-400' },
        'Informativo': { bgLight: 'bg-blue-500/20', text: 'text-blue-400' }
    };
    const c = colores[noti.tipo] || colores['Informativo'];

    const modal = document.getElementById('modal-noticia');
    // Si la noticia no tiene imagen, ponemos una de edificio por defecto
    const imagenSrc = noti.imagen_url || 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80'; 

    // Reemplazamos el contenido del Modal con los datos de Supabase
    modal.innerHTML = `
        <div class="glass-card bg-slate-800/90 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-600 shadow-2xl">
            <div class="h-48 bg-slate-700 relative shrink-0">
                <img src="${imagenSrc}" class="w-full h-full object-cover opacity-60">
                <button onclick="cerrarModal('modal-noticia')" class="absolute top-4 right-4 bg-black/50 hover:bg-red-500 text-white w-8 h-8 rounded-full transition-colors flex items-center justify-center"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="p-6 overflow-y-auto no-scrollbar">
                <span class="px-2 py-1 ${c.bgLight} ${c.text} text-xs font-bold rounded mb-3 inline-block">${noti.tipo}</span>
                <h2 class="text-2xl font-bold text-white mb-2">${noti.titulo}</h2>
                <p class="text-xs text-slate-400 mb-6"><i class="fa-regular fa-calendar mr-1"></i> Publicado: ${new Date(noti.fecha).toLocaleDateString()}</p>
                <div class="text-slate-300 space-y-4 text-sm leading-relaxed whitespace-pre-wrap">${noti.contenido}</div>
            </div>
        </div>
    `;

    abrirModal('modal-noticia');
};

// Funciones globales para abrir y cerrar ventanas
window.abrirModal = (id) => document.getElementById(id).classList.remove('hidden');
window.cerrarModal = (id) => document.getElementById(id).classList.add('hidden');

// ==========================================
//  MÓDULO 2: ZONAS COMUNES (RESIDENTE)
// ==========================================

window.enviarReserva = async () => {
    const zona = document.getElementById('res-zona').value;
    const fecha = document.getElementById('res-fecha').value;
    const apto = document.getElementById('res-apto').value.trim();
    const email = document.getElementById('res-email').value.trim();

    if (!fecha || !apto || !email) {
        return Swal.fire({ icon: 'warning', title: 'Faltan datos', text: 'Por favor completa todos los campos.', background: '#1e293b', color: '#fff' });
    }

    // 1. Validar si la fecha ya pasó
    const fechaElegida = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    if (fechaElegida < hoy) {
        return Swal.fire({ icon: 'error', title: 'Fecha inválida', text: 'No puedes reservar en el pasado.', background: '#1e293b', color: '#fff' });
    }

    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, background: '#1e293b', color: '#fff', didOpen: () => Swal.showLoading() });

    try {
        // 2. Revisar si ALGUIEN MÁS ya tiene aprobada esa zona en esa fecha
        const { data: ocupado } = await supabase
            .from('reservas')
            .select('id')
            .eq('zona', zona)
            .eq('fecha', fecha)
            .eq('estado', 'Aprobada');

        if (ocupado && ocupado.length > 0) {
            return Swal.fire({ icon: 'error', title: 'No Disponible', text: `La ${zona} ya está reservada para esa fecha. Elige otra.`, background: '#1e293b', color: '#fff' });
        }

        // 3. Enviar la solicitud a la base de datos
        const { error } = await supabase.from('reservas').insert([{
            zona: zona, fecha: fecha, apto: apto, email: email, estado: 'Pendiente'
        }]);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'Solicitud Enviada', text: 'El administrador revisará tu solicitud y te notificará.', background: '#1e293b', color: '#fff' });
        
        // Limpiar y cerrar
        document.getElementById('res-fecha').value = '';
        document.getElementById('res-apto').value = '';
        document.getElementById('res-email').value = '';
        cerrarModal('modal-reserva');

    } catch (e) {
        console.error(e);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un problema de conexión.', background: '#1e293b', color: '#fff' });
    }
};

// Función para traer Zonas Comunes desde Supabase
async function cargarZonasComunes() {
    const contenedor = document.getElementById('contenedor-zonas');
    const selectZona = document.getElementById('res-zona');
    if (!contenedor || !selectZona) return;

    const { data, error } = await supabase.from('zonas_comunes').select('*');

    if (error || !data || data.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 col-span-full text-center py-4">No hay zonas comunes configuradas aún.</p>';
        selectZona.innerHTML = '<option value="">Sin zonas disponibles</option>';
        return;
    }

    contenedor.innerHTML = '';
    selectZona.innerHTML = '<option value="">Selecciona una zona...</option>';

    data.forEach(zona => {
        // 1. Dibujar la tarjeta en la pantalla principal
        const tarjeta = `
            <div onclick="abrirModalReservaConZona('${zona.nombre}')" class="glass-card rounded-2xl p-5 flex flex-col items-center text-center hover:bg-slate-800 transition-colors cursor-pointer border-slate-700 hover:border-purple-500">
                <div class="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400 text-2xl">
                    <i class="fa-solid ${zona.icono || 'fa-tree-city'}"></i>
                </div>
                <h4 class="font-bold text-white">${zona.nombre}</h4>
                ${zona.aforo ? `<p class="text-xs text-slate-400 mt-2">Aforo: ${zona.aforo}</p>` : ''}
            </div>
        `;
        contenedor.innerHTML += tarjeta;

        // 2. Añadir la opción al desplegable del Modal
        selectZona.innerHTML += `<option value="${zona.nombre}">${zona.nombre}</option>`;
    });
}

// Pequeño truco para que si le das clic a "Piscina", el select ya aparezca en "Piscina"
window.abrirModalReservaConZona = (nombreZona) => {
    document.getElementById('res-zona').value = nombreZona;
    abrirModal('modal-reserva');
};