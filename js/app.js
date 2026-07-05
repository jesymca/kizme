// ================================================
// js/app.js - Aplicación principal Kizme
// Kizme V005
// Requiere: config.js cargado antes que este archivo
// ================================================

console.log('[Kizme] app.js V005 cargado correctamente');

// ==========================================
// SECCIÓN 1: VARIABLES GLOBALES E INICIALIZACIÓN
// ==========================================

/** ID del usuario autenticado actualmente */
let currentUserId = null;

/** ID del match actual abierto en el chat */
let currentMatchId = null;

/** Canal de Supabase Realtime para el chat activo */
let realtimeChannel = null;

/**
 * Verifica si hay una sesión activa en Supabase.
 * Si existe, carga el perfil del usuario; si no, muestra la vista de auth.
 */
async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUserId = session.user.id;
        await cargarPerfilUsuario();
    } else {
        mostrarVista('auth-view');
    }
}

/**
 * Muestra la vista indicada y oculta las demás.
 * Controla la visibilidad de la barra inferior y el botón de cerrar sesión.
 * @param {string} idVista - ID del elemento <section> a mostrar
 */
function mostrarVista(idVista) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(idVista).classList.add('active');

    const isAuth = idVista === 'auth-view';
    document.getElementById('bottom-nav').classList.toggle('hidden', isAuth);
    document.getElementById('logout-btn').classList.toggle('hidden', isAuth);
}

/**
 * Cambia a una vista específica y dispara la carga de datos correspondiente.
 * @param {string} idVista - ID de la vista destino
 */
function cambiarVista(idVista) {
    mostrarVista(idVista);
    if (idVista === 'discover-view') cargarPerfilesParaDescubrir();
    if (idVista === 'chat-view') cargarMatches();
}

// ==========================================
// SECCIÓN 2: AUTENTICACIÓN
// ==========================================

/** Indica si el formulario de auth está en modo login (true) o registro (false) */
let isLogin = true;

/**
 * Aplica el estado visual del formulario de autenticación según el modo (login/registro).
 * Muestra u oculta campos específicos y actualiza textos de botones y enlaces.
 */
function aplicarEstadoAuth() {
    document.querySelectorAll('.hidden-on-login').forEach(el => el.classList.toggle('hidden', isLogin));
    document.getElementById('login-btn').classList.toggle('hidden', !isLogin);
    document.getElementById('register-btn').innerText = isLogin ? 'Registrarse' : 'Crear cuenta';
    document.getElementById('toggle-link').innerText = isLogin
        ? '¿No tienes cuenta? Regístrate'
        : '¿Ya tienes cuenta? Inicia sesión';
}

/**
 * Alterna entre modo login y modo registro.
 * @param {Event} e - Evento del clic (opcional)
 */
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isLogin = !isLogin;
    aplicarEstadoAuth();
    document.getElementById('auth-message').innerText = '';
}

/**
 * Registra un nuevo usuario con email, contraseña, nombre y username.
 * Verifica que el username no esté en uso antes de crear la cuenta.
 */
async function registrarUsuario() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const nombre = document.getElementById('auth-nombre').value;
    const username = document.getElementById('auth-username').value;

    // Validación de campos obligatorios
    if (!email || !password || !nombre || !username) {
        document.getElementById('auth-message').innerText = 'Por favor completa todos los campos.';
        return;
    }

    // Verificar si el username ya existe en la tabla perfiles
    const { data: userExists } = await sb.from('perfiles').select('username').eq('username', username).single();
    if (userExists) {
        document.getElementById('auth-message').innerText = 'Este nombre de usuario ya está en uso.';
        return;
    }

    // Crear cuenta en Supabase Auth con metadata
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: {
                nombre,
                username,
                full_name: nombre
            }
        }
    });

    if (error) {
        document.getElementById('auth-message').innerText = error.message;
        return;
    }

    alert('Registro exitoso. Por favor verifica tu email e inicia sesión.');
    toggleAuthMode();
}

/**
 * Inicia sesión con email y contraseña.
 */
async function iniciarSesion() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
        document.getElementById('auth-message').innerText = 'Por favor ingresa email y contraseña.';
        return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        document.getElementById('auth-message').innerText = error.message;
        return;
    }

    currentUserId = data.user.id;
    await cargarPerfilUsuario();
}

/**
 * Construye la URL de redirección para OAuth basándose en la ubicación actual.
 * Normaliza la ruta para asegurar que apunte al directorio correcto.
 * @returns {string} URL base para redirección OAuth
 */
function obtenerRedirectUrl() {
    const currentUrl = new URL(window.location.href);
    const pathname = currentUrl.pathname;
    let normalizedPath = pathname;

    // Si la ruta no termina en / ni en un archivo, agregar /
    if (!normalizedPath.endsWith('/') && !/\/[^/]+\.[^/]+$/.test(normalizedPath)) {
        normalizedPath = `${normalizedPath}/`;
    }
    // Si apunta a un archivo (ej. index.html), extraer el directorio
    else if (/\/[^/]+\.[^/]+$/.test(normalizedPath)) {
        normalizedPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/') + 1);
    }

    return `${currentUrl.origin}${normalizedPath}`;
}

/**
 * Inicia sesión con Google mediante OAuth redirect.
 */
async function loginConGoogle() {
    try {
        document.getElementById('auth-message').innerText = 'Redirigiendo a Google...';

        const { data, error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: obtenerRedirectUrl(),
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                }
            }
        });

        if (error) {
            console.error('Error con Google:', error.message);
            document.getElementById('auth-message').innerText = 'Error con Google: ' + error.message;
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('auth-message').innerText = 'Error al iniciar sesión con Google';
    }
}

/**
 * Cierra la sesión del usuario actual y limpia el estado.
 */
async function cerrarSesion() {
    await sb.auth.signOut();
    currentUserId = null;
    mostrarVista('auth-view');
}

// ==========================================
// SECCIÓN 3: GESTIÓN DE PERFIL
// ==========================================

/**
 * Carga el perfil del usuario actual desde Supabase.
 * Si no existe, crea uno nuevo con datos del auth metadata.
 * Si existe pero está incompleto, muestra la vista de edición con datos precargados.
 * Si hay error de BD (500, RLS, etc.), muestra la vista de setup igualmente.
 * Campos de completitud: avatar_url, bio, genero_id, buscando_genero_id, edad, id_estado, id_ciudad
 */
async function cargarPerfilUsuario() {
    console.log('[Kizme] cargarPerfilUsuario() para:', currentUserId);
    document.getElementById('auth-message').innerText = 'Cargando perfil...';

    let perfil = null;
    let perfilError = null;

    try {
        const result = await sb.from('perfiles').select('*').eq('id', currentUserId).single();
        perfilError = result.error;
        perfil = result.data;
    } catch (err) {
        console.error('[Kizme] Excepción al consultar perfil:', err);
        perfilError = err;
    }

    if (perfilError) {
        console.warn('[Kizme] Error consultando perfil (código:', perfilError.code, '):', perfilError.message);
        // No panic: el perfil probablemente ya existe pero hay un error de RLS o schema.
        // Mostramos el setup directamente sin intentar crear otro.
        cargarEstados();
        cargarGeneros();
        mostrarVista('profile-setup-view');
        return;
    }

    if (!perfil) {
        // Perfil no existe: crear uno nuevo
        console.log('[Kizme] Perfil no existe, creando...');
        try {
            const { data: userData } = await sb.auth.getUser();
            const userMeta = userData?.user?.user_metadata || {};

            const nombre = userMeta.nombre || userMeta.full_name || userMeta.name || 'Nuevo Usuario';
            const username = userMeta.username || userMeta.email?.split('@')[0] || 'user' + Math.floor(Math.random() * 1000);
            const avatarUrl = userMeta.avatar_url || userMeta.picture || null;

            const nuevoPerfil = {
                id: currentUserId,
                nombre: nombre,
                username: username,
                avatar_url: avatarUrl,
                bio: '',
                genero: '',
                edad: null,
                pais: 'Venezuela',
                ciudad: ''
            };

            const { error: insertError } = await sb.from('perfiles').insert(nuevoPerfil);
            if (insertError) {
                console.warn('[Kizme] Error al crear perfil (puede que ya exista):', insertError.message);
            }

            // Siempre cargar selects y mostrar setup, sin importar si el insert funcionó
            cargarEstados();
            cargarGeneros();
            if (avatarUrl) {
                document.getElementById('profile-preview').src = avatarUrl;
            }
            mostrarVista('profile-setup-view');
        } catch (createErr) {
            console.error('[Kizme] Excepción al crear perfil:', createErr);
            cargarEstados();
            cargarGeneros();
            mostrarVista('profile-setup-view');
        }
        return;
    }

    // Perfil existe: verificar completitud
    console.log('[Kizme] Perfil encontrado, verificando completitud...');
    const perfilCompleto =
        perfil.avatar_url &&
        perfil.bio &&
        perfil.genero_id &&
        perfil.buscando_genero_id &&
        perfil.edad !== null && perfil.edad !== undefined &&
        perfil.id_estado &&
        perfil.id_ciudad;

    if (!perfilCompleto) {
        console.log('[Kizme] Perfil incompleto, mostrando setup...');
        // Precargar datos existentes en el formulario
        if (perfil.avatar_url) {
            document.getElementById('profile-preview').src = perfil.avatar_url;
        }
        if (perfil.bio) {
            document.getElementById('setup-bio').value = perfil.bio;
        }
        if (perfil.edad !== null && perfil.edad !== undefined) {
            document.getElementById('setup-edad').value = perfil.edad;
        }

        // Cargar selects y luego precargar valores
        await Promise.all([cargarEstados(), cargarGeneros()]);

        if (perfil.genero_id) {
            document.getElementById('setup-genero').value = perfil.genero_id;
        }
        if (perfil.buscando_genero_id) {
            document.getElementById('setup-buscando-genero').value = perfil.buscando_genero_id;
        }
        if (perfil.id_estado) {
            document.getElementById('setup-estado').value = perfil.id_estado;
            await Promise.all([
                cargarMunicipios(perfil.id_estado),
                cargarCiudades(perfil.id_estado)
            ]);
            if (perfil.id_municipio) {
                document.getElementById('setup-municipio').value = perfil.id_municipio;
                await cargarParroquias(perfil.id_municipio);
            }
            if (perfil.id_parroquia) {
                document.getElementById('setup-parroquia').value = perfil.id_parroquia;
            }
            if (perfil.id_ciudad) {
                document.getElementById('setup-ciudad-select').value = perfil.id_ciudad;
            }
        }

        mostrarVista('profile-setup-view');
    } else {
        console.log('[Kizme] Perfil completo, yendo a descubrir...');
        mostrarVista('discover-view');
        cargarPerfilesParaDescubrir();
    }
}

/**
 * Guarda el perfil del usuario con todos los campos, incluyendo la ubicación geográfica de Venezuela.
 * Sube la imagen de avatar si se seleccionó una nueva.
 * Lee de los selectores de geografía y género.
 */
async function guardarPerfil() {
    const fileInput = document.getElementById('avatar-input');
    const bio = document.getElementById('setup-bio').value.trim();
    const edad = document.getElementById('setup-edad').value;

    // Campos de geografía venezolana
    const idEstado = document.getElementById('setup-estado').value;
    const idMunicipio = document.getElementById('setup-municipio').value;
    const idParroquia = document.getElementById('setup-parroquia').value;
    const idCiudad = document.getElementById('setup-ciudad-select').value;

    // Campos de género
    const generoId = document.getElementById('setup-genero').value;
    const buscandoGeneroId = document.getElementById('setup-buscando-genero').value;

    // Validación de campos obligatorios
    if (!bio || !generoId || !buscandoGeneroId || !edad || !idEstado || !idCiudad) {
        alert('Por favor completa todos los campos obligatorios: bio, género, género buscado, edad, estado y ciudad.');
        return;
    }

    // Subir avatar si se seleccionó uno nuevo
    let avatarUrl = null;

    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUserId}.${fileExt}`;
        const filePath = `${currentUserId}/${fileName}`;

        const { error: uploadError } = await sb.storage
            .from('fotos_perfil')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            alert('Error al subir la imagen: ' + uploadError.message);
            return;
        }

        const { data: publicUrlData } = sb.storage.from('fotos_perfil').getPublicUrl(filePath);
        avatarUrl = publicUrlData.publicUrl;
    } else {
        // Mantener avatar existente si no se sube uno nuevo
        const { data: perfil } = await sb.from('perfiles').select('avatar_url').eq('id', currentUserId).single();
        avatarUrl = perfil?.avatar_url;
    }

    if (!avatarUrl) {
        alert('Por favor sube una foto de perfil.');
        return;
    }

    // Construir objeto de actualización con campos nuevos
    const datosPerfil = {
        avatar_url: avatarUrl,
        bio: bio,
        genero_id: Number(generoId),
        buscando_genero_id: Number(buscandoGeneroId),
        edad: Number(edad),
        id_estado: Number(idEstado),
        id_municipio: idMunicipio ? Number(idMunicipio) : null,
        id_parroquia: idParroquia ? Number(idParroquia) : null,
        id_ciudad: Number(idCiudad),
        pais: 'Venezuela'
    };

    const { error: updateError } = await sb.from('perfiles')
        .update(datosPerfil)
        .eq('id', currentUserId);

    if (updateError) {
        alert('Error al guardar perfil: ' + updateError.message);
        return;
    }

    mostrarVista('discover-view');
    cargarPerfilesParaDescubrir();
}

// ==========================================
// SECCIÓN 4: GEOGRAFÍA DE VENEZUELA (SELECTS EN CASCADA)
// ==========================================

/** Evita registrar eventos change duplicados en los selects */
let estadosListenerListo = false;
let municipiosListenerListo = false;

/**
 * Carga la lista de estados venezolanos desde la tabla `estados` en Supabase
 * y la popula en el selector #setup-estado.
 */
async function cargarEstados() {
    console.log('[Kizme] cargarEstados() iniciando...');
    const select = document.getElementById('setup-estado');
    if (!select) { console.warn('[Kizme] cargarEstados(): no encontré #setup-estado'); return; }

    const { data: estados, error } = await sb
        .from('estados')
        .select('id_estado, estado')
        .order('estado', { ascending: true });

    if (error) {
        console.error('[Kizme] Error cargando estados:', error.message);
        return;
    }
    console.log('[Kizme] Estados cargados:', estados?.length, 'registros');

    // Conservar la opción por defecto
    select.innerHTML = '<option value="">Selecciona tu estado</option>';

    if (estados) {
        estados.forEach(est => {
            const option = document.createElement('option');
            option.value = est.id_estado;
            option.textContent = est.estado;
            select.appendChild(option);
        });
    }

    // Registrar evento change SOLO una vez
    if (!estadosListenerListo) {
        estadosListenerListo = true;
        select.addEventListener('change', async function () {
            const idEstado = this.value;
            console.log('[Kizme] Estado seleccionado:', idEstado);

            // Deshabilitar selects dependientes y limpiar
            const munSelect = document.getElementById('setup-municipio');
            const parSelect = document.getElementById('setup-parroquia');
            const ciuSelect = document.getElementById('setup-ciudad-select');
            if (munSelect) { munSelect.disabled = true; munSelect.innerHTML = '<option value="">Selecciona tu municipio</option>'; }
            if (parSelect) { parSelect.disabled = true; parSelect.innerHTML = '<option value="">Selecciona tu parroquia</option>'; }
            if (ciuSelect) { ciuSelect.disabled = true; ciuSelect.innerHTML = '<option value="">Selecciona tu ciudad</option>'; }

            if (idEstado) {
                await Promise.all([
                    cargarMunicipios(idEstado),
                    cargarCiudades(idEstado)
                ]);
            }
        });
    }
}

/**
 * Carga los municipios filtrados por estado en el selector #setup-municipio.
 * @param {number|string} idEstado - ID del estado seleccionado
 */
async function cargarMunicipios(idEstado) {
    const select = document.getElementById('setup-municipio');
    if (!select) return;

    select.innerHTML = '<option value="">Cargando municipios...</option>';
    select.disabled = true;

    const { data: municipios, error } = await sb
        .from('municipios')
        .select('id_municipio, municipio')
        .eq('id_estado', idEstado)
        .order('municipio', { ascending: true });

    if (error) {
        console.error('[Kizme] Error cargando municipios:', error);
        select.innerHTML = '<option value="">Error al cargar municipios</option>';
        return;
    }
    console.log('[Kizme] Municipios cargados:', municipios?.length, 'para estado', idEstado);

    select.innerHTML = '<option value="">Selecciona tu municipio</option>';

    if (municipios) {
        municipios.forEach(mun => {
            const option = document.createElement('option');
            option.value = mun.id_municipio;
            option.textContent = mun.municipio;
            select.appendChild(option);
        });
    }

    // HABILITAR el select para que el usuario pueda elegir
    select.disabled = false;

    // Registrar evento change SOLO una vez
    if (!municipiosListenerListo) {
        municipiosListenerListo = true;
        select.addEventListener('change', async function () {
            const idMunicipio = this.value;
            console.log('[Kizme] Municipio seleccionado:', idMunicipio);

            const parSelect = document.getElementById('setup-parroquia');
            if (parSelect) { parSelect.disabled = true; parSelect.innerHTML = '<option value="">Selecciona tu parroquia</option>'; }

            if (idMunicipio) {
                await cargarParroquias(idMunicipio);
            }
        });
    }
}

/**
 * Carga las parroquias filtradas por municipio en el selector #setup-parroquia.
 * @param {number|string} idMunicipio - ID del municipio seleccionado
 */
async function cargarParroquias(idMunicipio) {
    const select = document.getElementById('setup-parroquia');
    if (!select) return;

    select.innerHTML = '<option value="">Cargando parroquias...</option>';
    select.disabled = true;

    const { data: parroquias, error } = await sb
        .from('parroquias')
        .select('id_parroquia, parroquia')
        .eq('id_municipio', idMunicipio)
        .order('parroquia', { ascending: true });

    if (error) {
        console.error('[Kizme] Error cargando parroquias:', error);
        select.innerHTML = '<option value="">Error al cargar parroquias</option>';
        return;
    }
    console.log('[Kizme] Parroquias cargadas:', parroquias?.length, 'para municipio', idMunicipio);

    select.innerHTML = '<option value="">Selecciona tu parroquia</option>';

    if (parroquias) {
        parroquias.forEach(par => {
            const option = document.createElement('option');
            option.value = par.id_parroquia;
            option.textContent = par.parroquia;
            select.appendChild(option);
        });
    }

    // HABILITAR el select
    select.disabled = false;
}

/**
 * Carga las ciudades filtradas por estado en el selector #setup-ciudad-select.
 * @param {number|string} idEstado - ID del estado seleccionado
 */
async function cargarCiudades(idEstado) {
    const select = document.getElementById('setup-ciudad-select');
    if (!select) return;

    select.innerHTML = '<option value="">Cargando ciudades...</option>';
    select.disabled = true;

    const { data: ciudades, error } = await sb
        .from('ciudades')
        .select('id_ciudad, ciudad')
        .eq('id_estado', idEstado)
        .order('ciudad', { ascending: true });

    if (error) {
        console.error('[Kizme] Error cargando ciudades:', error);
        select.innerHTML = '<option value="">Error al cargar ciudades</option>';
        return;
    }
    console.log('[Kizme] Ciudades cargadas:', ciudades?.length, 'para estado', idEstado);

    select.innerHTML = '<option value="">Selecciona tu ciudad</option>';

    if (ciudades) {
        ciudades.forEach(ciudad => {
            const option = document.createElement('option');
            option.value = ciudad.id_ciudad;
            option.textContent = ciudad.ciudad;
            select.appendChild(option);
        });
    }

    // HABILITAR el select
    select.disabled = false;
}

/**
 * Carga la lista de géneros desde la tabla `genero` en Supabase
 * y la popula en los selectores #setup-genero y #setup-buscando-genero.
 */
async function cargarGeneros() {
    console.log('[Kizme] cargarGeneros() iniciando...');
    const selectGenero = document.getElementById('setup-genero');
    const selectBuscando = document.getElementById('setup-buscando-genero');
    if (!selectGenero || !selectBuscando) {
        console.warn('[Kizme] cargarGeneros(): no encontré los selectores');
        return;
    }

    const { data: generos, error } = await sb
        .from('genero')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });

    if (error) {
        console.error('[Kizme] Error cargando géneros:', error.message);
        return;
    }
    console.log('[Kizme] Géneros cargados:', generos?.length, 'registros');

    const opcionesBase = '<option value="">Selecciona tu género</option>';
    const opcionesBuscandoBase = '<option value="">¿Qué género buscas?</option>';

    selectGenero.innerHTML = opcionesBase;
    selectBuscando.innerHTML = opcionesBuscandoBase;

    if (generos) {
        generos.forEach(gen => {
            const opt1 = document.createElement('option');
            opt1.value = gen.id;
            opt1.textContent = gen.nombre;
            selectGenero.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = gen.id;
            opt2.textContent = gen.nombre;
            selectBuscando.appendChild(opt2);
        });
    }
}

/**
 * Limpia un elemento <select> dejando solo una opción placeholder.
 * @param {string} selectId - ID del elemento select a limpiar
 * @param {string} placeholderText - Texto de la opción por defecto
 */
function limpiarSelect(selectId, placeholderText) {
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = `<option value="">${placeholderText}</option>`;
    }
}

// ==========================================
// SECCIÓN 5: DESCUBRIR (SWIPE)
// ==========================================

/**
 * Carga un perfil para descubrir, excluyendo:
 * - Al usuario actual
 * - Perfiles con los que ya hubo interacción
 * - Perfiles que dieron dislike al usuario actual
 * - Perfiles bloqueados (bloqueado = true)
 *
 * Muestra la ciudad obtenida de la tabla `ciudades` via FK, con fallback al campo texto.
 */
async function cargarPerfilesParaDescubrir() {
    try {
        // Obtener IDs de usuarios con los que ya interactué
        const { data: interacciones } = await sb.from('interacciones')
            .select('para_usuario_id')
            .eq('de_usuario_id', currentUserId);

        const idsInteractuados = interacciones ? interacciones.map(i => i.para_usuario_id) : [];

        // IDs de usuarios que me dieron dislike
        const { data: dislikesRecibidos } = await sb.from('interacciones')
            .select('de_usuario_id')
            .eq('para_usuario_id', currentUserId)
            .eq('tipo', 'dislike');

        const idsDislikes = dislikesRecibidos ? dislikesRecibidos.map(i => i.de_usuario_id) : [];

        // Construir query base: excluir propio perfil y bloqueados
        let query = sb.from('perfiles')
            .select('*, ciudades(ciudad)')
            .neq('id', currentUserId)
            .neq('bloqueado', true);

        // Excluir perfiles ya interactuados
        const idsExcluidos = [...idsInteractuados, ...idsDislikes];
        if (idsExcluidos.length > 0) {
            query = query.not('id', 'in', `(${idsExcluidos.join(',')})`);
        }

        const { data: perfiles, error } = await query.limit(1);

        const card = document.getElementById('profile-card');
        const noProfiles = document.getElementById('no-profiles');

        if (error) {
            console.error('Error cargando perfiles:', error);
            return;
        }

        if (perfiles && perfiles.length > 0) {
            const p = perfiles[0];

            // Imagen de perfil con fallback
            document.getElementById('card-img').src = p.avatar_url || 'https://via.placeholder.com/300x400?text=Sin+Imagen';

            // Nombre y edad
            document.getElementById('card-name').innerText = p.edad
                ? `${p.nombre || 'Usuario'}, ${p.edad}`
                : (p.nombre || 'Usuario');

            // Ubicación: priorizar nombre de ciudad desde FK, fallback a campo texto
            const nombreCiudad = p.ciudades?.ciudad || p.ciudad || '';
            document.getElementById('card-location').innerText = nombreCiudad || 'Ubicación no disponible';

            // Biografía
            document.getElementById('card-bio').innerText = p.bio || 'Sin descripción';

            // Mostrar tarjeta, ocultar mensaje "no hay perfiles"
            card.classList.remove('hidden');
            noProfiles.classList.add('hidden');
            card.dataset.perfilId = p.id;
        } else {
            // No hay más perfiles
            card.classList.add('hidden');
            noProfiles.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error al cargar perfiles para descubrir:', error);
    }
}

/**
 * Registra una interacción (like o dislike) con el perfil actual visible.
 * Si es un like mutuo, crea un match y notifica al usuario.
 * Aplica una animación de salida a la tarjeta.
 * @param {string} tipo - 'like' o 'dislike'
 */
async function registrarInteraccion(tipo) {
    const card = document.getElementById('profile-card');
    const paraUsuarioId = card.dataset.perfilId;

    if (!paraUsuarioId) {
        await cargarPerfilesParaDescubrir();
        return;
    }

    // Registrar interacción en la base de datos
    const { error } = await sb.from('interacciones').insert({
        de_usuario_id: currentUserId,
        para_usuario_id: paraUsuarioId,
        tipo
    });

    if (error) {
        console.error('Error al registrar interacción:', error);
        alert('Error: ' + error.message);
        return;
    }

    // Si es like, verificar si hay match mutuo
    if (tipo === 'like') {
        const { data: likeMutuo } = await sb.from('interacciones')
            .select('*')
            .eq('de_usuario_id', paraUsuarioId)
            .eq('para_usuario_id', currentUserId)
            .eq('tipo', 'like')
            .single();

        if (likeMutuo) {
            // Crear match (usuario_1 siempre el ID menor para consistencia)
            const matchData = {
                usuario_1: currentUserId < paraUsuarioId ? currentUserId : paraUsuarioId,
                usuario_2: currentUserId < paraUsuarioId ? paraUsuarioId : currentUserId
            };

            await sb.from('matches').insert(matchData);
            alert('🎉 ¡Es un match! Ahora pueden chatear.');

            // Actualizar lista de matches si estamos en la vista de chats
            if (document.getElementById('chat-view').classList.contains('active')) {
                cargarMatches();
            }
        }
    }

    // Animación de salida de la tarjeta
    card.style.transition = 'transform 0.3s, opacity 0.3s';
    card.style.transform = tipo === 'like'
        ? 'translateX(150%) rotate(5deg)'
        : 'translateX(-150%) rotate(-5deg)';
    card.style.opacity = '0';

    setTimeout(() => {
        card.style.transform = 'translateX(0)';
        card.style.opacity = '1';
        card.style.transition = 'none';
        cargarPerfilesParaDescubrir();
    }, 300);
}

// ==========================================
// SECCIÓN 6: CHATS Y MATCHES
// ==========================================

/**
 * Carga la lista de matches del usuario actual.
 * Por cada match, obtiene el perfil del otro usuario y muestra avatar, nombre y fecha.
 */
async function cargarMatches() {
    const { data: matches, error } = await sb.from('matches')
        .select('id, usuario_1, usuario_2, created_at')
        .or(`usuario_1.eq.${currentUserId},usuario_2.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error cargando matches:', error);
        return;
    }

    const lista = document.getElementById('matches-list');
    lista.innerHTML = '';

    if (matches && matches.length > 0) {
        for (const match of matches) {
            // Determinar cuál es el otro usuario en el match
            const otroUsuarioId = match.usuario_1 === currentUserId ? match.usuario_2 : match.usuario_1;

            const { data: otroPerfil } = await sb.from('perfiles')
                .select('nombre, avatar_url, username')
                .eq('id', otroUsuarioId)
                .single();

            if (otroPerfil) {
                const div = document.createElement('div');
                div.className = 'list-group-item list-group-item-action d-flex align-items-center';
                div.innerHTML = `
                    <img src="${otroPerfil.avatar_url || 'https://via.placeholder.com/40'}"
                         class="rounded-circle me-3"
                         width="40" height="40"
                         style="object-fit:cover;">
                    <div>
                        <strong>${otroPerfil.nombre || otroPerfil.username}</strong>
                        <br>
                        <small class="text-muted">${new Date(match.created_at).toLocaleDateString()}</small>
                    </div>
                `;
                div.onclick = () => abrirChat(match.id, otroPerfil.nombre || otroPerfil.username);
                lista.appendChild(div);
            }
        }
    } else {
        lista.innerHTML = '<p class="text-muted text-center">Aún no tienes matches. ¡Sigue descubriendo perfiles!</p>';
    }
}

/**
 * Abre la sala de chat para un match específico.
 * Carga los mensajes existentes y se suscribe a nuevos mensajes en tiempo real.
 * @param {string} matchId - ID del match
 * @param {string} nombreOtro - Nombre del otro usuario para mostrar en el header
 */
async function abrirChat(matchId, nombreOtro) {
    currentMatchId = matchId;
    document.getElementById('chat-room').classList.remove('hidden');
    document.getElementById('chat-with').innerText = `Chat con ${nombreOtro}`;
    document.getElementById('messages-container').innerHTML = '';
    document.getElementById('matches-list').classList.add('hidden');

    // Cargar mensajes existentes
    const { data: mensajes } = await sb.from('mensajes')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

    if (mensajes) mensajes.forEach(msg => mostrarMensaje(msg));

    // Suscripción a nuevos mensajes en tiempo real
    if (realtimeChannel) sb.removeChannel(realtimeChannel);

    realtimeChannel = sb.channel(`chat-${matchId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'mensajes',
            filter: `match_id=eq.${matchId}`
        }, payload => {
            mostrarMensaje(payload.new);
        })
        .subscribe();
}

/**
 * Cierra la sala de chat activa y cancela la suscripción realtime.
 */
function cerrarChat() {
    document.getElementById('chat-room').classList.add('hidden');
    document.getElementById('matches-list').classList.remove('hidden');

    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

/**
 * Renderiza un mensaje como burbuja en el contenedor de mensajes.
 * Alinea a la derecha si es mensaje propio (sent), izquierda si es recibido (received).
 * @param {Object} msg - Objeto mensaje con remitente_id y texto
 */
function mostrarMensaje(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = `message-bubble ${msg.remitente_id === currentUserId ? 'sent' : 'received'}`;
    div.innerText = msg.texto || 'Mensaje vacío';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

/**
 * Envía un mensaje al chat activo.
 * Limpia el campo de entrada tras el envío exitoso.
 */
async function enviarMensaje() {
    const input = document.getElementById('message-input');
    const texto = input.value.trim();
    if (!texto || !currentMatchId) return;

    const { error } = await sb.from('mensajes').insert({
        match_id: currentMatchId,
        remitente_id: currentUserId,
        texto: texto
    });

    if (error) {
        console.error('Error al enviar mensaje:', error);
        alert('Error al enviar: ' + error.message);
    } else {
        input.value = '';
    }
}

// ==========================================
// SECCIÓN 7: EVENT LISTENERS
// ==========================================

/**
 * Maneja la selección de una nueva imagen de avatar.
 * Muestra una vista previa de la imagen seleccionada.
 * @param {Event} event - Evento de cambio del input file
 */
function manejarCambioAvatar(event) {
    const file = event.target.files?.[0];
    const preview = document.getElementById('profile-preview');

    if (!file || !file.type.startsWith('image/')) {
        return;
    }

    preview.src = URL.createObjectURL(file);
}

/**
 * Maneja redirecciones de OAuth (Google).
 * Verifica si la URL contiene parámetros de autenticación y procesa la sesión.
 */
async function handleOAuthRedirect() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) {
        console.error('Error al obtener sesión:', error);
        return;
    }
    if (session) {
        currentUserId = session.user.id;
        await cargarPerfilUsuario();
    }
}

// ==========================================
// SECCIÓN 8: NAVEGACIÓN INFERIOR
// ==========================================

/**
 * Agrega enlaces adicionales a la barra de navegación inferior.
 * Incluye acceso a miskizme.html y acceso.html.
 * Se ejecuta al cargar el DOM para garantizar que el nav exista.
 */
function inicializarNavegacionInferior() {
    const bottomNav = document.getElementById('bottom-nav');
    if (!bottomNav) return;

    // Crear enlace a "Mis Kizme"
    const btnMisKizme = document.createElement('button');
    btnMisKizme.className = 'btn btn-link text-decoration-none text-muted';
    btnMisKizme.innerHTML = '<span style="font-size: 1.5rem;">👤</span><br><small>Mis Kizme</small>';
    btnMisKizme.addEventListener('click', () => {
        window.location.href = 'miskizme.html';
    });

    // Crear enlace a "Acceso" (admin)
    const btnAcceso = document.createElement('button');
    btnAcceso.className = 'btn btn-link text-decoration-none text-muted';
    btnAcceso.innerHTML = '<span style="font-size: 1.5rem;">⚙️</span><br><small>Acceso</small>';
    btnAcceso.addEventListener('click', () => {
        window.location.href = 'acceso.html';
    });

    // Agregar los nuevos botones al nav
    bottomNav.appendChild(btnMisKizme);
    bottomNav.appendChild(btnAcceso);
}

// ==========================================
// PUNTO DE ENTRADA PRINCIPAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Listener para cambio de avatar
    document.getElementById('avatar-input').addEventListener('change', manejarCambioAvatar);

    // Aplicar estado inicial del formulario de auth (modo login)
    aplicarEstadoAuth();

    // Escuchar cambios en el estado de autenticación de Supabase
    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUserId = session.user.id;
            await cargarPerfilUsuario();
        }
        if (event === 'SIGNED_OUT') {
            currentUserId = null;
            mostrarVista('auth-view');
        }
    });

    // Verificar si hay una redirección pendiente de OAuth (Google)
    handleOAuthRedirect();

    // Verificar sesión existente al cargar la página
    checkSession();

    // Listener para enviar mensaje con la tecla Enter
    document.getElementById('message-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            enviarMensaje();
        }
    });

    // Inicializar enlaces adicionales en la navegación inferior
    inicializarNavegacionInferior();
});
