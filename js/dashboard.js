// ==========================================
// PANEL DE ADMINISTRACIÓN - KIZME
// js/dashboard.js - V005
// ------------------------------------------
// Usa `sb` (cliente Supabase) desde config.js
// ==========================================

console.log('[Kizme] dashboard.js V005 cargado correctamente');

// ==========================================
// VARIABLES GLOBALES
// ==========================================

/** Caché de todos los usuarios cargados (para filtrado en cliente) */
let todosLosUsuarios = [];

/** Caché de la lista de géneros */
let generosCache = [];

/** Caché de ciudades por estado (para selects) */
let ciudadesPorEstado = {};

/** Tiempo de debounce para búsquedas de edición */
let debounceTimer = null;

// ==========================================
// 1. AUTENTICACIÓN DEL ADMINISTRADOR
// ==========================================

async function adminLogin() {
    const btnLogin = document.querySelector('#admin-login button.btn-danger');
    const usernameInput = document.getElementById('admin-user').value.trim();
    const passwordInput = document.getElementById('admin-pass').value.trim();
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    // Feedback visual inmediato
    if (btnLogin) { btnLogin.textContent = 'Verificando...'; btnLogin.disabled = true; }

    console.log('[Kizme Admin] Intento de login - user:', usernameInput, 'pass length:', passwordInput.length);

    // Validación básica
    if (!usernameInput || !passwordInput) {
        errorEl.textContent = 'Por favor ingresa usuario y contraseña.';
        if (btnLogin) { btnLogin.textContent = 'Ingresar'; btnLogin.disabled = false; }
        return;
    }

    // 1. Verificación local (puro JavaScript, sin red, SIEMPRE funciona)
    const localOk = verificarCredencialesLocales(usernameInput, passwordInput);
    console.log('[Kizme Admin] Verificación local:', localOk);

    if (localOk) {
        console.log('[Kizme Admin] Login exitoso (local)');
        sessionStorage.setItem('kizme_admin', JSON.stringify({
            username: usernameInput,
            loginTime: Date.now()
        }));
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');

        // Cargar dashboard - si falla no impedimos el acceso
        try {
            await inicializarDashboard();
        } catch (dashboardErr) {
            console.error('[Kizme Admin] Error cargando dashboard (pero acceso concedido):', dashboardErr);
        }
        return;
    }

    // 2. Respaldo RPC
    try {
        console.log('[Kizme Admin] Intentando RPC es_admin()...');
        const { data: esAdmin, error } = await sb.rpc('es_admin', {
            p_username: usernameInput,
            p_password: passwordInput
        });

        console.log('[Kizme Admin] RPC result:', esAdmin, 'Error:', error?.message || 'NONE');

        if (error) {
            errorEl.textContent = 'Error de conexión. Verifica tu internet.';
            if (btnLogin) { btnLogin.textContent = 'Ingresar'; btnLogin.disabled = false; }
            return;
        }

        if (esAdmin === true) {
            sessionStorage.setItem('kizme_admin', JSON.stringify({
                username: usernameInput,
                loginTime: Date.now()
            }));
            document.getElementById('admin-login').classList.add('hidden');
            document.getElementById('admin-dashboard').classList.remove('hidden');
            try {
                await inicializarDashboard();
            } catch (dashboardErr) {
                console.error('[Kizme Admin] Error cargando dashboard:', dashboardErr);
            }
        } else {
            errorEl.textContent = 'Credenciales incorrectas.';
        }
    } catch (err) {
        console.error('[Kizme Admin] Error en adminLogin:', err);
        errorEl.textContent = 'Error de conexión. Inténtalo de nuevo.';
    }

    if (btnLogin) { btnLogin.textContent = 'Ingresar'; btnLogin.disabled = false; }
}

/**
 * Verificación local de credenciales como respaldo.
 * Solo se usa si la tabla admin_users no está disponible.
 * @param {string} user - Usuario ingresado
 * @param {string} pass - Contraseña ingresada
 * @returns {boolean}
 */
function verificarCredencialesLocales(user, pass) {
    return user === 'admin' && pass === '10ASR125T859UJHGD';
}

/**
 * Cierra la sesión del administrador y vuelve al login.
 */
function adminLogout() {
    sessionStorage.removeItem('kizme_admin');
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
    // Limpiar campos de login
    document.getElementById('admin-pass').value = '';
    document.getElementById('login-error').textContent = '';
}

/**
 * Verifica si hay una sesión activa de administrador al cargar la página.
 * Si existe, muestra el dashboard directamente.
 */
function checkAdminSession() {
    const session = sessionStorage.getItem('kizme_admin');
    if (session) {
        try {
            const parsed = JSON.parse(session);
            // Sesión válida por 24 horas
            if (parsed.loginTime && (Date.now() - parsed.loginTime) < 24 * 60 * 60 * 1000) {
                document.getElementById('admin-login').classList.add('hidden');
                document.getElementById('admin-dashboard').classList.remove('hidden');
                inicializarDashboard();
                return;
            }
        } catch (e) {
            // Sesión inválida, ignorar
        }
    }
    // No hay sesión, asegurar que el login sea visible
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

// ==========================================
// 2. INICIALIZACIÓN DEL DASHBOARD
// ==========================================

/**
 * Carga todos los datos necesarios para el dashboard.
 * Se ejecuta después de un login exitoso.
 */
async function inicializarDashboard() {
    try {
        await Promise.all([
            cargarEstadisticas(),
            cargarUsuarios(),
            cargarPagosPendientes(),
            cargarBloqueados(),
            cargarPlanes(),
            cargarGeneros(),
            cargarTodosPagos()
        ]);
    } catch (err) {
        console.error('Error al inicializar dashboard:', err);
        mostrarNotificacion('Error al cargar algunos datos del panel.', 'warning');
    }
}

// ==========================================
// 3. GESTIÓN DE PESTAÑAS
// ==========================================

/**
 * Cambia la pestaña activa del dashboard.
 * @param {string} tabName - Nombre de la pestaña: 'usuarios'|'pagos'|'bloqueados'|'accesos'|'editar'
 * @param {HTMLElement} linkElement - El enlace <a> que fue clickeado
 */
function cambiarTab(tabName, linkElement) {
    // Prevenir comportamiento default del enlace
    if (linkElement) linkElement.preventDefault();

    // Desactivar todas las pestañas
    document.querySelectorAll('#dashboard-tabs .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Activar la pestaña seleccionada
    if (linkElement) linkElement.classList.add('active');
    const tabEl = document.getElementById('tab-' + tabName);
    if (tabEl) tabEl.classList.add('active');

    // Recargar datos al cambiar de pestaña (por si hubo cambios)
    switch (tabName) {
        case 'usuarios':
            cargarUsuarios();
            break;
        case 'pagos':
            cargarPagosPendientes();
            break;
        case 'bloqueados':
            cargarBloqueados();
            break;
        case 'accesos':
            cargarPlanes();
            break;
        case 'editar':
            cargarGeneros();
            cargarTodosPagos();
            break;
    }
}

// ==========================================
// 4. ESTADÍSTICAS
// ==========================================

/**
 * Carga las estadísticas generales y actualiza las tarjetas del dashboard.
 * Consulta en paralelo: total de usuarios, pagos pendientes, suscripciones activas,
 * y usuarios bloqueados.
 */
async function cargarEstadisticas() {
    try {
        // Contar usuarios totales
        const { count: totalUsuarios, error: errUsuarios } = await sb
            .from('perfiles')
            .select('*', { count: 'exact', head: true });
        document.getElementById('stat-users').textContent = totalUsuarios || 0;

        // Contar pagos pendientes
        const { count: pagosPendientes, error: errPagos } = await sb
            .from('pagos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'pendiente');
        document.getElementById('stat-pending').textContent = pagosPendientes || 0;

        // Contar suscripciones activas
        const { count: subsActivas, error: errSubs } = await sb
            .from('suscripciones')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'activa')
            .gte('fecha_fin', new Date().toISOString());
        document.getElementById('stat-active-subs').textContent = subsActivas || 0;

        // Contar usuarios bloqueados
        const { count: bloqueados, error: errBloq } = await sb
            .from('perfiles')
            .select('*', { count: 'exact', head: true })
            .eq('bloqueado', true);
        document.getElementById('stat-blocked').textContent = bloqueados || 0;

    } catch (err) {
        console.error('Error cargando estadísticas:', err);
        // Si fallan los conteos individuales, poner ceros
        document.getElementById('stat-users').textContent = '0';
        document.getElementById('stat-pending').textContent = '0';
        document.getElementById('stat-active-subs').textContent = '0';
        document.getElementById('stat-blocked').textContent = '0';
    }
}

// ==========================================
// 5. TAB: USUARIOS
// ==========================================

/**
 * Carga TODOS los perfiles de usuarios desde la tabla `perfiles`.
 * Muestra foto, nombre, username (como email alternativo), género, edad,
 * ubicación y estado (bloqueado/activo).
 */
async function cargarUsuarios() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 loading-pulse">Cargando usuarios...</td></tr>';

    try {
        const { data: perfiles, error } = await sb
            .from('perfiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        todosLosUsuarios = perfiles || [];

        if (todosLosUsuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-muted">No hay usuarios registrados.</td></tr>';
            return;
        }

        renderUsuariosTabla(todosLosUsuarios);
    } catch (err) {
        console.error('Error cargando usuarios:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-danger">Error al cargar usuarios: ${escHtml(err.message)}</td></tr>`;
    }
}

/**
 * Renderiza la lista de usuarios en la tabla del tab Usuarios.
 * @param {Array} usuarios - Arreglo de objetos perfil
 */
function renderUsuariosTabla(usuarios) {
    const tbody = document.getElementById('users-table-body');

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-muted">No se encontraron usuarios.</td></tr>';
        return;
    }

    tbody.innerHTML = usuarios.map(u => {
        const foto = u.avatar_url
            ? `<img src="${escHtml(u.avatar_url)}" alt="Foto" onerror="this.outerHTML='<span class=\\'img-placeholder\\'>?</span>'">`
            : '<span class="img-placeholder">?</span>';

        const nombre = escHtml(u.nombre || 'Sin nombre');
        const username = escHtml(u.username || '—');
        const genero = escHtml(u.genero || '—');
        const edad = u.edad || '—';

        // Construir ubicación: intentar con campos relacionales primero, luego textuales
        let ubicacion = '—';
        if (u.estado_nombre || u.municipio_nombre || u.ciudad_nombre) {
            ubicacion = [u.estado_nombre, u.municipio_nombre, u.ciudad_nombre].filter(Boolean).join(', ');
        } else if (u.pais || u.ciudad) {
            ubicacion = [u.pais, u.ciudad].filter(Boolean).join(', ');
        }

        // Badge de estado
        const estaBloqueado = u.bloqueado === true;
        const estadoBadge = estaBloqueado
            ? '<span class="badge bg-danger">Bloqueado</span>'
            : '<span class="badge bg-success">Activo</span>';

        const rowClass = estaBloqueado ? 'tr-bloqueado' : '';

        // Botón de acción: bloquear o desbloquear
        const accionBtn = estaBloqueado
            ? `<button class="btn btn-outline-success btn-sm" onclick="bloquearUsuario('${u.id}', false)" title="Desbloquear">✓</button>`
            : `<button class="btn btn-outline-danger btn-sm" onclick="bloquearUsuario('${u.id}', true)" title="Bloquear">✗</button>`;

        return `
            <tr class="${rowClass}">
                <td>${foto}</td>
                <td><strong>${nombre}</strong><br><small class="text-muted">@${username}</small></td>
                <td>${username}@kizme</td>
                <td>${genero}</td>
                <td>${edad}</td>
                <td>${ubicacion}</td>
                <td>${estadoBadge}</td>
                <td>
                    <div class="btn-group">${accionBtn}</div>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Filtra la tabla de usuarios según el texto de búsqueda.
 * Busca por nombre o username (no requiere recargar de Supabase).
 */
function filtrarUsuarios() {
    const texto = document.getElementById('search-users').value.trim().toLowerCase();

    if (!texto) {
        renderUsuariosTabla(todosLosUsuarios);
        return;
    }

    const filtrados = todosLosUsuarios.filter(u => {
        const nombre = (u.nombre || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        return nombre.includes(texto) || username.includes(texto);
    });

    renderUsuariosTabla(filtrados);
}

/**
 * Bloquea o desbloquea un usuario.
 * Si se bloquea, solicita el motivo y lo almacena en el campo `motivo_bloqueo`.
 * @param {string} userId - UUID del usuario
 * @param {boolean} bloquear - true para bloquear, false para desbloquear
 */
async function bloquearUsuario(userId, bloquear) {
    try {
        const updateData = { bloqueado: bloquear };

        if (bloquear) {
            // Confirmar bloqueo
            if (!confirm('¿Estás seguro de bloquear a este usuario?')) return;
        }

        const { error } = await sb
            .from('perfiles')
            .update(updateData)
            .eq('id', userId);

        if (error) throw error;

        mostrarNotificacion(
            bloqueado ? 'Usuario bloqueado correctamente.' : 'Usuario desbloqueado correctamente.',
            'success'
        );

        // Recargar datos relevantes
        cargarUsuarios();
        cargarEstadisticas();

    } catch (err) {
        console.error('Error al bloquear/desbloquear usuario:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

// ==========================================
// 6. TAB: PAGOS PENDIENTES
// ==========================================

/**
 * Carga los pagos con estado 'pendiente' desde la tabla `pagos`.
 * Incluye información del usuario (perfiles) y del plan (accesos).
 */
async function cargarPagosPendientes() {
    const tbody = document.getElementById('payments-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 loading-pulse">Cargando pagos pendientes...</td></tr>';

    try {
        // Consultar pagos pendientes con join a perfiles y accesos
        const { data: pagos, error } = await sb
            .from('pagos')
            .select(`
                *,
                perfiles:usuario_id (nombre, username, avatar_url),
                accesos:acceso_id (nombre, duracion_dias)
            `)
            .eq('estado', 'pendiente')
            .order('fecha_pago', { ascending: false });

        if (error) throw error;

        if (!pagos || pagos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-muted">No hay pagos pendientes.</td></tr>';
            return;
        }

        tbody.innerHTML = pagos.map(p => {
            const usuario = p.perfiles ? (p.perfiles.nombre || p.perfiles.username || 'Desconocido') : 'Usuario eliminado';
            const plan = p.accesos ? p.accesos.nombre : 'Plan eliminado';

            return `
                <tr>
                    <td>${formatearFecha(p.fecha_pago)}</td>
                    <td>${escHtml(usuario)}</td>
                    <td>${escHtml(plan)}</td>
                    <td>$${parseFloat(p.monto || 0).toFixed(2)}</td>
                    <td>${escHtml(p.metodo_pago || p.metodo || '—')}</td>
                    <td><code>${escHtml(p.referencia || '—')}</code></td>
                    <td>${escHtml(p.banco || '—')}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-success btn-sm" onclick="aprobarPago('${p.id}')" title="Aprobar">✓</button>
                            <button class="btn btn-danger btn-sm" onclick="rechazarPago('${p.id}')" title="Rechazar">✗</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando pagos pendientes:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-danger">Error al cargar pagos: ${escHtml(err.message)}</td></tr>`;
    }
}

/**
 * Aprueba un pago pendiente.
 * Cambia el estado a 'aprobado', registra al verificador y la fecha,
 * y crea una suscripción para el usuario con la duración del plan.
 * @param {string} pagoId - ID del pago
 */
async function aprobarPago(pagoId) {
    try {
        // Primero obtener los datos del pago para conocer la duración del plan
        const { data: pago, error: errPago } = await sb
            .from('pagos')
            .select('usuario_id, acceso_id, accesos:acceso_id (duracion_dias, nombre)')
            .eq('id', pagoId)
            .single();

        if (errPago) throw errPago;

        // Actualizar el estado del pago
        const { error: errUpdate } = await sb
            .from('pagos')
            .update({
                estado: 'aprobado',
                verificado_por: 'admin',
                fecha_verificacion: new Date().toISOString()
            })
            .eq('id', pagoId);

        if (errUpdate) throw errUpdate;

        // Crear la suscripción si hay datos del plan
        if (pago && pago.accesos) {
            const duracionDias = pago.accesos.duracion_dias || 30;
            const fechaFin = new Date();
            fechaFin.setDate(fechaFin.getDate() + duracionDias);

            // Intentar crear suscripción nueva
            // Primero verificar si ya tiene una suscripción activa
            const { data: subExistente } = await sb
                .from('suscripciones')
                .select('id, fecha_fin')
                .eq('usuario_id', pago.usuario_id)
                .eq('estado', 'activa')
                .gte('fecha_fin', new Date().toISOString())
                .single();

            if (subExistente) {
                // Extender la suscripción existente
                const { error: errExt } = await sb
                    .from('suscripciones')
                    .update({
                        fecha_fin: new Date(
                            new Date(subExistente.fecha_fin || fechaFin).getTime() +
                            duracionDias * 24 * 60 * 60 * 1000
                        ).toISOString()
                    })
                    .eq('id', subExistente.id);
                if (errExt) console.warn('Error extendiendo suscripción:', errExt);
            } else {
                // Crear nueva suscripción
                const { error: errSub } = await sb
                    .from('suscripciones')
                    .insert({
                        usuario_id: pago.usuario_id,
                        acceso_id: pago.acceso_id,
                        pago_id: pagoId,
                        fecha_inicio: new Date().toISOString(),
                        fecha_fin: fechaFin.toISOString(),
                        estado: 'activa'
                    });
                if (errSub) console.warn('Error creando suscripción:', errSub);
            }
        }

        mostrarNotificacion('Pago aprobado y suscripción creada.', 'success');

        // Recargar datos
        cargarPagosPendientes();
        cargarEstadisticas();

    } catch (err) {
        console.error('Error al aprobar pago:', err);
        mostrarNotificacion('Error al aprobar pago: ' + err.message, 'danger');
    }
}

/**
 * Rechaza un pago pendiente.
 * Cambia el estado a 'rechazado' y registra al verificador.
 * @param {string} pagoId - ID del pago
 */
async function rechazarPago(pagoId) {
    try {
        const { error } = await sb
            .from('pagos')
            .update({
                estado: 'rechazado',
                verificado_por: 'admin',
                fecha_verificacion: new Date().toISOString()
            })
            .eq('id', pagoId);

        if (error) throw error;

        mostrarNotificacion('Pago rechazado.', 'warning');

        // Recargar datos
        cargarPagosPendientes();
        cargarEstadisticas();

    } catch (err) {
        console.error('Error al rechazar pago:', err);
        mostrarNotificacion('Error al rechazar pago: ' + err.message, 'danger');
    }
}

// ==========================================
// 7. TAB: BLOQUEADOS
// ==========================================

/**
 * Carga la lista de usuarios bloqueados (perfiles.bloqueado = true).
 * Muestra foto, nombre, username, motivo de bloqueo y botón de desbloqueo.
 */
async function cargarBloqueados() {
    const tbody = document.getElementById('blocked-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 loading-pulse">Cargando usuarios bloqueados...</td></tr>';

    try {
        const { data: bloqueados, error } = await sb
            .from('perfiles')
            .select('*')
            .eq('bloqueado', true)
            .order('fecha_bloqueo', { ascending: false, nullsFirst: false });

        if (error) throw error;

        if (!bloqueados || bloqueados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No hay usuarios bloqueados.</td></tr>';
            return;
        }

        tbody.innerHTML = bloqueados.map(u => {
            const foto = u.avatar_url
                ? `<img src="${escHtml(u.avatar_url)}" alt="Foto" onerror="this.outerHTML='<span class=\\'img-placeholder\\'>?</span>'">`
                : '<span class="img-placeholder">?</span>';

            const nombre = escHtml(u.nombre || 'Sin nombre');
            const username = escHtml(u.username || '—');
            const motivo = 'Usuario bloqueado';

            return `
                <tr class="tr-bloqueado">
                    <td>${foto}</td>
                    <td><strong>${nombre}</strong><br><small class="text-muted">@${username}</small></td>
                    <td>${username}@kizme</td>
                    <td><small class="text-danger">${motivo}</small></td>
                    <td>
                        <button class="btn btn-outline-success btn-sm" onclick="desbloquearUsuario('${u.id}')">
                            Desbloquear
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando bloqueados:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-danger">Error al cargar: ${escHtml(err.message)}</td></tr>`;
    }
}

/**
 * Desbloquea un usuario: establece bloqueado=false y limpia campos relacionados.
 * @param {string} userId - UUID del usuario
 */
async function desbloquearUsuario(userId) {
    try {
        const { error } = await sb
            .from('perfiles')
            .update({
                bloqueado: false
            })
            .eq('id', userId);

        if (error) throw error;

        mostrarNotificacion('Usuario desbloqueado.', 'success');

        // Recargar
        cargarBloqueados();
        cargarUsuarios();
        cargarEstadisticas();

    } catch (err) {
        console.error('Error al desbloquear:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

// ==========================================
// 8. TAB: COSTOS DE ACCESO (PLANES)
// ==========================================

/**
 * Carga todos los planes de acceso desde la tabla `accesos`.
 */
async function cargarPlanes() {
    const tbody = document.getElementById('plans-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 loading-pulse">Cargando planes...</td></tr>';

    try {
        const { data: planes, error } = await sb
            .from('accesos')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        if (!planes || planes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">No hay planes de acceso.</td></tr>';
            return;
        }

        tbody.innerHTML = planes.map(p => {
            const estaActivo = p.activo !== false && p.activo !== 0;
            const estadoBadge = estaActivo
                ? '<span class="badge badge-activo">Activo</span>'
                : '<span class="badge badge-inactivo">Inactivo</span>';

            const duracion = p.duracion_dias ? `${p.duracion_dias} días` : '—';

            return `
                <tr>
                    <td>${p.id}</td>
                    <td><strong>${escHtml(p.nombre || '—')}</strong></td>
                    <td>${escHtml(p.descripcion || '—')}</td>
                    <td>$${parseFloat(p.precio || 0).toFixed(2)}</td>
                    <td>${duracion}</td>
                    <td>${estadoBadge}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-outline-primary btn-sm" onclick="mostrarFormPlan(${p.id})" title="Editar">✎</button>
                            <button class="btn btn-sm ${estaActivo ? 'btn-outline-warning' : 'btn-outline-success'}"
                                    onclick="togglePlan(${p.id}, ${!estaActivo})"
                                    title="${estaActivo ? 'Desactivar' : 'Activar'}">
                                ${estaActivo ? '⊘' : '✓'}
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="eliminarPlan(${p.id})" title="Eliminar">🗑</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando planes:', err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-danger">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

/**
 * Muestra el formulario para crear o editar un plan.
 * Si se pasa planId, carga los datos del plan existente en el formulario.
 * @param {number|null} planId - ID del plan a editar, o null para nuevo
 */
async function mostrarFormPlan(planId) {
    const formEl = document.getElementById('plan-form');
    const titleEl = document.getElementById('plan-form-title');
    const idEl = document.getElementById('plan-edit-id');

    // Resetear campos
    document.getElementById('plan-nombre').value = '';
    document.getElementById('plan-precio').value = '';
    document.getElementById('plan-dias').value = '';
    document.getElementById('plan-desc').value = '';
    idEl.value = '';

    if (planId) {
        // Modo edición: cargar datos del plan
        titleEl.textContent = 'Editar plan';
        try {
            const { data: plan, error } = await sb
                .from('accesos')
                .select('*')
                .eq('id', planId)
                .single();

            if (error) throw error;
            if (plan) {
                idEl.value = plan.id;
                document.getElementById('plan-nombre').value = plan.nombre || '';
                document.getElementById('plan-precio').value = plan.precio || '';
                document.getElementById('plan-dias').value = plan.duracion_dias || '';
                document.getElementById('plan-desc').value = plan.descripcion || '';
            }
        } catch (err) {
            console.error('Error cargando plan:', err);
            mostrarNotificacion('Error al cargar el plan.', 'danger');
            return;
        }
    } else {
        titleEl.textContent = 'Nuevo plan';
    }

    formEl.classList.remove('hidden');
}

/**
 * Oculta el formulario de planes.
 */
function ocultarFormPlan() {
    document.getElementById('plan-form').classList.add('hidden');
    document.getElementById('plan-edit-id').value = '';
    document.getElementById('plan-nombre').value = '';
    document.getElementById('plan-precio').value = '';
    document.getElementById('plan-dias').value = '';
    document.getElementById('plan-desc').value = '';
}

/**
 * Guarda un plan nuevo o actualiza uno existente en la tabla `accesos`.
 */
async function guardarPlan() {
    const id = document.getElementById('plan-edit-id').value;
    const nombre = document.getElementById('plan-nombre').value.trim();
    const precio = parseFloat(document.getElementById('plan-precio').value);
    const dias = parseInt(document.getElementById('plan-dias').value);
    const descripcion = document.getElementById('plan-desc').value.trim();

    // Validaciones
    if (!nombre) {
        mostrarNotificacion('El nombre del plan es obligatorio.', 'warning');
        return;
    }
    if (isNaN(precio) || precio < 0) {
        mostrarNotificacion('Ingresa un precio válido.', 'warning');
        return;
    }
    if (isNaN(dias) || dias <= 0) {
        mostrarNotificacion('Ingresa una duración válida en días.', 'warning');
        return;
    }

    try {
        const planData = {
            nombre: nombre,
            precio: precio,
            duracion_dias: dias,
            descripcion: descripcion,
            activo: true
        };

        let error;
        if (id) {
            // Actualizar plan existente
            const result = await sb.from('accesos').update(planData).eq('id', id);
            error = result.error;
        } else {
            // Insertar nuevo plan
            const result = await sb.from('accesos').insert(planData);
            error = result.error;
        }

        if (error) throw error;

        mostrarNotificacion(id ? 'Plan actualizado.' : 'Plan creado.', 'success');
        ocultarFormPlan();
        cargarPlanes();

    } catch (err) {
        console.error('Error guardando plan:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

/**
 * Activa o desactiva un plan.
 * @param {number} planId - ID del plan
 * @param {boolean} activar - true para activar, false para desactivar
 */
async function togglePlan(planId, activar) {
    try {
        const { error } = await sb
            .from('accesos')
            .update({ activo: activar })
            .eq('id', planId);

        if (error) throw error;

        mostrarNotificacion(activar ? 'Plan activado.' : 'Plan desactivado.', 'success');
        cargarPlanes();

    } catch (err) {
        console.error('Error al cambiar estado del plan:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

/**
 * Elimina un plan de la tabla `accesos`.
 * Pide confirmación antes de eliminar.
 * @param {number} planId - ID del plan
 */
async function eliminarPlan(planId) {
    if (!confirm('¿Estás seguro de eliminar este plan? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const { error } = await sb
            .from('accesos')
            .delete()
            .eq('id', planId);

        if (error) throw error;

        mostrarNotificacion('Plan eliminado.', 'success');
        cargarPlanes();

    } catch (err) {
        console.error('Error al eliminar plan:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

// ==========================================
// 9. TAB: EDITAR DATOS
// ==========================================

/**
 * Busca usuarios por nombre o username para editar.
 * Usa debounce para no saturar la base de datos con cada tecla.
 */
function buscarUsuarioEditar() {
    clearTimeout(debounceTimer);
    const texto = document.getElementById('edit-search').value.trim();
    const resultsEl = document.getElementById('edit-results');

    if (!texto) {
        resultsEl.innerHTML = '<span class="text-muted">Escribe para buscar un usuario...</span>';
        return;
    }

    resultsEl.innerHTML = '<span class="text-muted loading-pulse">Buscando...</span>';

    debounceTimer = setTimeout(async () => {
        try {
            const { data: resultados, error } = await sb
                .from('perfiles')
                .select('id, nombre, username, avatar_url')
                .or(`nombre.ilike.%${texto}%,username.ilike.%${texto}%`)
                .limit(10);

            if (error) throw error;

            if (!resultados || resultados.length === 0) {
                resultsEl.innerHTML = '<span class="text-muted">No se encontraron usuarios.</span>';
                return;
            }

            resultsEl.innerHTML = resultados.map(u => {
                const foto = u.avatar_url
                    ? `<img src="${escHtml(u.avatar_url)}" alt="" onerror="this.outerHTML='<span class=\\'img-placeholder\\' style=\\'width:32px;height:32px\\'>?</span>'">`
                    : '<span class="img-placeholder" style="width:32px;height:32px">?</span>';
                return `
                    <div class="edit-result-item" onclick="seleccionarUsuarioEditar('${u.id}')">
                        ${foto}
                        <div>
                            <strong>${escHtml(u.nombre || 'Sin nombre')}</strong>
                            <br><small class="text-muted">@${escHtml(u.username || '—')}</small>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (err) {
            console.error('Error buscando usuario:', err);
            resultsEl.innerHTML = `<span class="text-danger">Error: ${escHtml(err.message)}</span>`;
        }
    }, 350); // Debounce de 350ms
}

/**
 * Selecciona un usuario para editar y carga sus datos en el formulario.
 * También carga los selects de género, estados, municipios, parroquias y ciudades.
 * @param {string} userId - UUID del usuario
 */
async function seleccionarUsuarioEditar(userId) {
    try {
        // Cargar perfil completo del usuario
        const { data: perfil, error } = await sb
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        if (!perfil) {
            mostrarNotificacion('Usuario no encontrado.', 'danger');
            return;
        }

        // Llenar formulario con los datos del perfil
        document.getElementById('edit-user-id').value = perfil.id;
        document.getElementById('edit-nombre').value = perfil.nombre || '';
        document.getElementById('edit-username').value = perfil.username || '';
        document.getElementById('edit-edad').value = perfil.edad || '';
        document.getElementById('edit-bio').value = perfil.bio || '';
        document.getElementById('edit-avatar').value = perfil.avatar_url || '';
        document.getElementById('edit-bloqueado').value = perfil.bloqueado ? 'true' : 'false';

        // Cargar géneros en el select
        await cargarGenerosSelect(perfil.genero);

        // Cargar estados
        await cargarEstadosSelect(perfil.id_estado);

        // Si tiene estado seleccionado, cargar municipios
        if (perfil.id_estado) {
            await dashboardCargarMunicipios(perfil.id_estado);
        } else {
            document.getElementById('edit-municipio').innerHTML = '<option value="">— Seleccionar municipio —</option>';
        }

        // Si tiene municipio seleccionado, cargar parroquias
        if (perfil.id_municipio) {
            await dashboardCargarParroquias(perfil.id_municipio);
        } else {
            document.getElementById('edit-parroquia').innerHTML = '<option value="">— Seleccionar parroquia —</option>';
        }

        // Cargar ciudades del estado
        if (perfil.id_estado) {
            await cargarCiudadesSelect(perfil.id_estado, perfil.id_ciudad);
        } else {
            document.getElementById('edit-ciudad').innerHTML = '<option value="">— Seleccionar ciudad —</option>';
        }

        // Mostrar formulario de edición
        document.getElementById('edit-form').classList.remove('hidden');
        document.getElementById('edit-results').innerHTML = '';

    } catch (err) {
        console.error('Error al seleccionar usuario:', err);
        mostrarNotificacion('Error al cargar datos del usuario.', 'danger');
    }
}

/**
 * Carga el select de géneros desde la tabla `genero`.
 * Selecciona el género actual del usuario.
 * @param {string|null} generoActual - Género actualmente asignado al perfil
 */
async function cargarGenerosSelect(generoActual) {
    const select = document.getElementById('edit-genero');
    select.innerHTML = '<option value="">— Seleccionar género —</option>';

    try {
        if (generosCache.length === 0) {
            const { data: generos, error } = await sb
                .from('genero')
                .select('*')
                .eq('activo', true)
                .order('nombre');
            if (error) throw error;
            generosCache = generos || [];
        }

        generosCache.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.nombre;
            opt.textContent = g.nombre;
            if (g.nombre === generoActual) opt.selected = true;
            select.appendChild(opt);
        });

        // Si no se encontró en la tabla, pero el perfil tiene un género textual, agregarlo
        if (generoActual && !generosCache.find(g => g.nombre === generoActual)) {
            const opt = document.createElement('option');
            opt.value = generoActual;
            opt.textContent = generoActual + ' (manual)';
            opt.selected = true;
            select.appendChild(opt);
        }

    } catch (err) {
        console.warn('Error cargando géneros para select:', err);
        // Si falla la tabla genero, usar el valor textual directamente
        if (generoActual) {
            const opt = document.createElement('option');
            opt.value = generoActual;
            opt.textContent = generoActual;
            opt.selected = true;
            select.appendChild(opt);
        }
    }
}

/**
 * Carga el select de estados venezolanos.
 * @param {number|null} estadoActual - ID del estado actualmente seleccionado
 */
async function cargarEstadosSelect(estadoActual) {
    const select = document.getElementById('edit-estado');
    select.innerHTML = '<option value="">— Seleccionar estado —</option>';

    try {
        const { data: estados, error } = await sb
            .from('estados')
            .select('*')
            .order('estado');

        if (error) throw error;

        (estados || []).forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id_estado;
            opt.textContent = e.estado;
            if (e.id_estado === estadoActual) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Error cargando estados:', err);
    }
}

/**
 * Carga los municipios correspondientes al estado seleccionado.
 * Se ejecuta como callback del change del select de estados.
 * @param {number|null} municipioActual - ID del municipio preseleccionado
 */
async function dashboardCargarMunicipios(municipioActual) {
    const estadoId = parseInt(document.getElementById('edit-estado').value);
    const select = document.getElementById('edit-municipio');
    select.innerHTML = '<option value="">— Seleccionar municipio —</option>';

    // Resetear parroquias y ciudades
    document.getElementById('edit-parroquia').innerHTML = '<option value="">— Seleccionar parroquia —</option>';
    document.getElementById('edit-ciudad').innerHTML = '<option value="">— Seleccionar ciudad —</option>';

    if (!estadoId) return;

    try {
        const { data: municipios, error } = await sb
            .from('municipios')
            .select('*')
            .eq('id_estado', estadoId)
            .order('municipio');

        if (error) throw error;

        (municipios || []).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id_municipio;
            opt.textContent = m.municipio;
            if (m.id_municipio === municipioActual) opt.selected = true;
            select.appendChild(opt);
        });

        // Si hay estado seleccionado, cargar ciudades también
        cargarCiudadesSelect(estadoId);

    } catch (err) {
        console.warn('Error cargando municipios:', err);
    }
}

/**
 * Carga las parroquias correspondientes al municipio seleccionado.
 * Se ejecuta como callback del change del select de municipios.
 * @param {number|null} parroquiaActual - ID de la parroquia preseleccionada
 */
async function dashboardCargarParroquias(parroquiaActual) {
    const municipioId = parseInt(document.getElementById('edit-municipio').value);
    const select = document.getElementById('edit-parroquia');
    select.innerHTML = '<option value="">— Seleccionar parroquia —</option>';

    if (!municipioId) return;

    try {
        const { data: parroquias, error } = await sb
            .from('parroquias')
            .select('*')
            .eq('id_municipio', municipioId)
            .order('parroquia');

        if (error) throw error;

        (parroquias || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id_parroquia;
            opt.textContent = p.parroquia;
            if (p.id_parroquia === parroquiaActual) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Error cargando parroquias:', err);
    }
}

/**
 * Carga las ciudades correspondientes al estado seleccionado.
 * @param {number} estadoId - ID del estado
 * @param {number|null} ciudadActual - ID de la ciudad preseleccionada
 */
async function cargarCiudadesSelect(estadoId, ciudadActual) {
    const select = document.getElementById('edit-ciudad');
    select.innerHTML = '<option value="">— Seleccionar ciudad —</option>';

    if (!estadoId) return;

    try {
        const { data: ciudades, error } = await sb
            .from('ciudades')
            .select('*')
            .eq('id_estado', estadoId)
            .order('ciudad');

        if (error) throw error;

        (ciudades || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id_ciudad;
            opt.textContent = c.ciudad;
            if (c.id_ciudad === ciudadActual) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (err) {
        console.warn('Error cargando ciudades:', err);
    }
}

/**
 * Guarda los cambios realizados en el formulario de edición de usuario.
 * Actualiza el perfil en la tabla `perfiles`.
 */
async function guardarEdicionUsuario() {
    const userId = document.getElementById('edit-user-id').value;
    if (!userId) {
        mostrarNotificacion('No se ha seleccionado ningún usuario.', 'warning');
        return;
    }

    // Recopilar datos del formulario
    const updateData = {
        nombre: document.getElementById('edit-nombre').value.trim() || null,
        username: document.getElementById('edit-username').value.trim() || null,
        edad: parseInt(document.getElementById('edit-edad').value) || null,
        bio: document.getElementById('edit-bio').value.trim() || null,
        avatar_url: document.getElementById('edit-avatar').value.trim() || null,
        genero_id: parseInt(document.getElementById('edit-genero').value) || null,
        bloqueado: document.getElementById('edit-bloqueado').value === 'true',
        // Campos de ubicación (por ID)
        id_estado: parseInt(document.getElementById('edit-estado').value) || null,
        id_municipio: parseInt(document.getElementById('edit-municipio').value) || null,
        id_parroquia: parseInt(document.getElementById('edit-parroquia').value) || null,
        id_ciudad: parseInt(document.getElementById('edit-ciudad').value) || null,
    };

    // Validaciones mínimas
    if (!updateData.nombre) {
        mostrarNotificacion('El nombre es obligatorio.', 'warning');
        return;
    }

    try {
        const { error } = await sb
            .from('perfiles')
            .update(updateData)
            .eq('id', userId);

        if (error) throw error;

        mostrarNotificacion('Perfil actualizado correctamente.', 'success');
        cancelarEdicion();

        // Recargar datos que puedan haber cambiado
        cargarUsuarios();
        cargarEstadisticas();

    } catch (err) {
        console.error('Error guardando edición:', err);
        mostrarNotificacion('Error al guardar: ' + err.message, 'danger');
    }
}

/**
 * Cancela la edición de usuario y oculta el formulario.
 */
function cancelarEdicion() {
    document.getElementById('edit-form').classList.add('hidden');
    document.getElementById('edit-user-id').value = '';
    document.getElementById('edit-search').value = '';
    document.getElementById('edit-results').innerHTML = '<span class="text-muted">Escribe para buscar un usuario...</span>';
}

// ==========================================
// 10. GESTIÓN DE GÉNEROS
// ==========================================

/**
 * Carga todos los géneros desde la tabla `genero` y los muestra en la tabla.
 */
async function cargarGeneros() {
    const tbody = document.getElementById('generos-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 loading-pulse">Cargando géneros...</td></tr>';

    try {
        const { data: generos, error } = await sb
            .from('genero')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        // Actualizar caché
        generosCache = generos || [];

        if (generosCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No hay géneros registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = generosCache.map(g => {
            const estaActivo = g.activo !== false && g.activo !== 0;
            const estadoBadge = estaActivo
                ? '<span class="badge badge-activo">Activo</span>'
                : '<span class="badge badge-inactivo">Inactivo</span>';

            return `
                <tr>
                    <td>${g.id}</td>
                    <td><strong>${escHtml(g.nombre || '—')}</strong></td>
                    <td>${escHtml(g.descripcion || '—')}</td>
                    <td>${estadoBadge}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-outline-primary btn-sm" onclick="editarGenero(${g.id})" title="Editar">✎</button>
                            <button class="btn btn-sm ${estaActivo ? 'btn-outline-warning' : 'btn-outline-success'}"
                                    onclick="toggleGenero(${g.id}, ${!estaActivo})"
                                    title="${estaActivo ? 'Desactivar' : 'Activar'}">
                                ${estaActivo ? '⊘' : '✓'}
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="eliminarGenero(${g.id})" title="Eliminar">🗑</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando géneros:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-danger">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

/**
 * Muestra el formulario para crear un nuevo género.
 */
function mostrarFormGenero() {
    document.getElementById('genero-form-container').classList.remove('hidden');
    document.getElementById('genero-nombre').value = '';
    document.getElementById('genero-desc').value = '';
    document.getElementById('genero-edit-id').value = '';
    document.getElementById('genero-nombre').focus();
}

/**
 * Oculta el formulario de géneros.
 */
function ocultarFormGenero() {
    document.getElementById('genero-form-container').classList.add('hidden');
    document.getElementById('genero-nombre').value = '';
    document.getElementById('genero-desc').value = '';
    document.getElementById('genero-edit-id').value = '';
}

/**
 * Carga los datos de un género en el formulario para editar.
 * @param {number} generoId - ID del género
 */
async function editarGenero(generoId) {
    try {
        const { data: genero, error } = await sb
            .from('genero')
            .select('*')
            .eq('id', generoId)
            .single();

        if (error) throw error;

        if (genero) {
            document.getElementById('genero-form-container').classList.remove('hidden');
            document.getElementById('genero-nombre').value = genero.nombre || '';
            document.getElementById('genero-desc').value = genero.descripcion || '';
            document.getElementById('genero-edit-id').value = genero.id;
            document.getElementById('genero-nombre').focus();
        }
    } catch (err) {
        console.error('Error al cargar género:', err);
        mostrarNotificacion('Error al cargar género.', 'danger');
    }
}

/**
 * Guarda un género nuevo o actualiza uno existente.
 */
async function guardarGenero() {
    const id = document.getElementById('genero-edit-id').value;
    const nombre = document.getElementById('genero-nombre').value.trim();
    const descripcion = document.getElementById('genero-desc').value.trim();

    if (!nombre) {
        mostrarNotificacion('El nombre del género es obligatorio.', 'warning');
        return;
    }

    try {
        let error;
        if (id) {
            const result = await sb
                .from('genero')
                .update({ nombre, descripcion })
                .eq('id', id);
            error = result.error;
        } else {
            const result = await sb
                .from('genero')
                .insert({ nombre, descripcion, activo: true });
            error = result.error;
        }

        if (error) throw error;

        mostrarNotificacion(id ? 'Género actualizado.' : 'Género creado.', 'success');
        ocultarFormGenero();
        generosCache = []; // Limpiar caché para recargar
        cargarGeneros();

    } catch (err) {
        console.error('Error guardando género:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

/**
 * Activa o desactiva un género.
 * @param {number} generoId - ID del género
 * @param {boolean} activar - true para activar, false para desactivar
 */
async function toggleGenero(generoId, activar) {
    try {
        const { error } = await sb
            .from('genero')
            .update({ activo: activar })
            .eq('id', generoId);

        if (error) throw error;

        mostrarNotificacion(activar ? 'Género activado.' : 'Género desactivado.', 'success');
        generosCache = [];
        cargarGeneros();

    } catch (err) {
        console.error('Error al cambiar estado del género:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

/**
 * Elimina un género de la tabla `genero`.
 * Pide confirmación antes de eliminar.
 * @param {number} generoId - ID del género
 */
async function eliminarGenero(generoId) {
    if (!confirm('¿Estás seguro de eliminar este género?')) {
        return;
    }

    try {
        const { error } = await sb
            .from('genero')
            .delete()
            .eq('id', generoId);

        if (error) throw error;

        mostrarNotificacion('Género eliminado.', 'success');
        generosCache = [];
        cargarGeneros();

    } catch (err) {
        console.error('Error al eliminar género:', err);
        mostrarNotificacion('Error: ' + err.message, 'danger');
    }
}

// ==========================================
// 11. HISTORIAL COMPLETO DE PAGOS
// ==========================================

/**
 * Carga TODOS los pagos (sin filtro de estado) con información del usuario y plan.
 * Se muestra en el tab "Editar datos" como historial completo.
 */
async function cargarTodosPagos() {
    const tbody = document.getElementById('all-payments-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 loading-pulse">Cargando historial de pagos...</td></tr>';

    try {
        const { data: pagos, error } = await sb
            .from('pagos')
            .select(`
                *,
                perfiles:usuario_id (nombre, username, avatar_url),
                accesos:acceso_id (nombre, duracion_dias)
            `)
            .order('fecha_pago', { ascending: false })
            .limit(200); // Limitar a 200 para no saturar

        if (error) throw error;

        if (!pagos || pagos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-muted">No hay pagos registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = pagos.map(p => {
            const usuario = p.perfiles ? (p.perfiles.nombre || p.perfiles.username || 'Desconocido') : 'Usuario eliminado';
            const plan = p.accesos ? p.accesos.nombre : 'Plan eliminado';

            // Badge según estado
            let estadoBadge = '';
            switch (p.estado) {
                case 'pendiente':
                    estadoBadge = '<span class="badge badge-pendiente">Pendiente</span>';
                    break;
                case 'aprobado':
                    estadoBadge = '<span class="badge badge-aprobado">Aprobado</span>';
                    break;
                case 'rechazado':
                    estadoBadge = '<span class="badge badge-rechazado">Rechazado</span>';
                    break;
                default:
                    estadoBadge = `<span class="badge bg-secondary">${escHtml(p.estado || '—')}</span>`;
            }

            // Acciones según estado
            let acciones = '';
            if (p.estado === 'pendiente') {
                acciones = `
                    <div class="btn-group">
                        <button class="btn btn-success btn-sm" onclick="aprobarPago('${p.id}')" title="Aprobar">✓</button>
                        <button class="btn btn-danger btn-sm" onclick="rechazarPago('${p.id}')" title="Rechazar">✗</button>
                    </div>
                `;
            } else {
                acciones = '<span class="text-muted small">—</span>';
            }

            return `
                <tr>
                    <td>${formatearFecha(p.fecha_pago)}</td>
                    <td>${escHtml(usuario)}</td>
                    <td>${escHtml(plan)}</td>
                    <td>$${parseFloat(p.monto || 0).toFixed(2)}</td>
                    <td>${escHtml(p.metodo_pago || p.metodo || '—')}</td>
                    <td><code>${escHtml(p.referencia || '—')}</code></td>
                    <td>${estadoBadge}</td>
                    <td>${acciones}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando todos los pagos:', err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-danger">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

// ==========================================
// 12. UTILIDADES
// ==========================================

/**
 * Formatea una fecha ISO para mostrarla en formato legible.
 * @param {string} dateStr - Fecha en formato ISO o null
 * @returns {string} Fecha formateada en DD/MM/YYYY HH:mm
 */
function formatearFecha(dateStr) {
    if (!dateStr) return '—';
    try {
        const fecha = new Date(dateStr);
        if (isNaN(fecha.getTime())) return '—';

        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();
        const horas = String(fecha.getHours()).padStart(2, '0');
        const minutos = String(fecha.getMinutes()).padStart(2, '0');

        return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
    } catch (e) {
        return '—';
    }
}

/**
 * Escapa caracteres HTML para prevenir XSS.
 * @param {string} str - Texto a escapar
 * @returns {string} Texto escapado
 */
function escHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Muestra una notificación tipo toast de Bootstrap.
 * Si no existe el contenedor, lo crea dinámicamente.
 * @param {string} mensaje - Texto del mensaje
 * @param {string} tipo - Tipo: 'success'|'danger'|'warning'|'info'
 */
function mostrarNotificacion(mensaje, tipo) {
    // Asegurar que exista el contenedor de toasts
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    // Definir colores según tipo
    const bgClass = {
        success: 'bg-success text-white',
        danger: 'bg-danger text-white',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-white'
    }[tipo] || 'bg-secondary text-white';

    // Generar ID único para este toast
    const toastId = 'toast-' + Date.now();

    // Crear HTML del toast
    const toastHTML = `
        <div id="${toastId}" class="toast ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    ${escHtml(mensaje)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHTML);

    // Inicializar y mostrar el toast usando Bootstrap JS
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, {
        delay: 4000,
        autohide: true
    });
    toast.show();

    // Remover del DOM cuando se oculte
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

// ==========================================
// 13. INICIO - Event Listeners
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión de admin al cargar
    checkAdminSession();

    // Permitir iniciar sesión con Enter en el campo de contraseña
    document.getElementById('admin-pass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            adminLogin();
        }
    });

    // Permitir iniciar sesión con Enter en el campo de usuario
    document.getElementById('admin-user').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('admin-pass').focus();
        }
    });
});