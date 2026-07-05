// ================================================
// js/config.js - Configuración compartida de Supabase
// Kizme V005
// ================================================

const SUPABASE_CONFIG = {
    url: 'https://pllkctfgfspgghvlasjw.supabase.co',
    anonKey: 'sb_publishable_l0gweUZ5iGBrkPKJShCqEw_sgJ4f-Om'
};

// Constantes de la aplicación
const APP_CONFIG = {
    nombre: 'Kizme',
    version: 'V005',
    likesGratis: 10, // Cantidad de me gusta visibles gratis
    adminUsername: 'admin',
    // La contraseña se verifica contra la base de datos
};

// Métodos de pago disponibles
const METODOS_PAGO = [
    { value: 'transferencia', label: 'Transferencia bancaria' },
    { value: 'pago_movil', label: 'Pago móvil' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'otro', label: 'Otro' }
];

// Inicializar cliente Supabase (disponible globalmente)
const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

console.log('[Kizme] config.js V005 cargado - Supabase conectado');