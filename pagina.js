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

    // DISPARAMOS LA BÚSQUEDA DE NOTICIAS
    cargarNoticiasPublicas();
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