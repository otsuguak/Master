// Esperamos a que la página cargue por completo
document.addEventListener('DOMContentLoaded', () => {
    console.log("Página de aterrizaje Master cargada con éxito.");

    // Creamos un observador para las animaciones de aparición (Fade-up)
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15 // Se activa cuando el 15% del elemento es visible
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            // Si el elemento entra en la pantalla
            if (entry.isIntersecting) {
                entry.target.classList.add('active'); // Le agrega la clase que lo hace visible
                observer.unobserve(entry.target); // Deja de observarlo para que no se anime 2 veces
            }
        });
    }, observerOptions);

    // Buscamos todos los elementos con la clase "reveal" y los ponemos bajo observación
    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach(el => {
        observer.observe(el);
    });
});