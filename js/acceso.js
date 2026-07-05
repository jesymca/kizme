// js/acceso.js — Página de acceso premium y declaración de pagos de Kizme
// Depende de config.js que exporta `sb` (cliente Supabase) y define `currentUserId`

// ==========================================
// INICIALIZACIÓN AL CARGAR LA PÁGINA
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar sesión del usuario
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        // Sin sesión, redirigir al inicio
        window.location.href = 'index.html';
        return;
    }

    // Guardar el ID del usuario actual
    currentUserId = session.user.id;

    // 2. Establecer la fecha de hoy por defecto en el campo de fecha de pago
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('pago-fecha').value = hoy;

    // 3. Cargar datos de la página en paralelo
    await Promise.all([
        verificarSuscripcion(),
        cargarPlanes(),
        cargarMisPagos()
    ]);
});

// ==========================================
// 1. VERIFICAR SUSCRIPCIÓN ACTIVA
// ==========================================

async function verificarSuscripcion() {
    const contenedor = document.getElementById('status-content');

    try {
        // Llamar al RPC para saber si el usuario tiene suscripción activa
        const { data: tieneSuscripcion, error } = await sb.rpc('tiene_suscripcion_activa', {
            p_usuario_id: currentUserId
        });

        if (error) throw error;

        if (tieneSuscripcion) {
            // Obtener los detalles de la suscripción activa
            const { data: suscripcion, error: errorDet } = await sb.rpc('obtener_suscripcion_usuario', {
                p_usuario_id: currentUserId
            });

            if (errorDet) throw errorDet;

            // Mostrar alerta verde con la información de la suscripción
            const fechaExpiracion = new Date(suscripcion.fecha_expiracion).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            contenedor.innerHTML = `
                <div class="alert alert-success mb-0">
                    <h6 class="alert-heading">✅ Acceso Premium activo</h6>
                    <p class="mb-1"><strong>Plan:</strong> ${suscripcion.nombre_plan || 'Premium'}</p>
                    <p class="mb-0"><strong>Vence el:</strong> ${fechaExpiracion}</p>
                </div>
            `;

            // Ocultar el formulario de declaración de pago si ya tiene suscripción activa
            document.getElementById('payment-form-section').classList.add('d-none');
        } else {
            // Sin suscripción activa, mostrar alerta informativa
            contenedor.innerHTML = `
                <div class="alert alert-warning mb-0">
                    <h6 class="alert-heading">🔒 Sin acceso Premium</h6>
                    <p class="mb-0">Declara tu pago abajo para desbloquear todas tus funcionalidades premium.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error al verificar suscripción:', err);
        contenedor.innerHTML = `
            <div class="alert alert-danger mb-0">
                Error al verificar tu suscripción. Intenta de nuevo.
            </div>
        `;
    }
}

// ==========================================
// 2. CARGAR PLANES DISPONIBLES
// ==========================================

async function cargarPlanes() {
    const contenedorPlanes = document.getElementById('plans-container');
    const selectPlan = document.getElementById('pago-plan');

    try {
        // Consultar planes activos en la tabla 'accesos'
        const { data: planes, error } = await sb
            .from('accesos')
            .select('*')
            .eq('activo', true)
            .order('precio', { ascending: true });

        if (error) throw error;

        // Si no hay planes disponibles
        if (!planes || planes.length === 0) {
            contenedorPlanes.innerHTML = '<p class="text-muted text-center">No hay planes disponibles en este momento.</p>';
            return;
        }

        // Limpiar el contenedor y el select antes de llenarlos
        contenedorPlanes.innerHTML = '';
        selectPlan.innerHTML = '<option value="">Selecciona un plan...</option>';

        // Iterar sobre cada plan para crear la tarjeta y la opción del select
        planes.forEach(plan => {
            // --- Tarjeta del plan en la sección de planes ---
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 col-lg-4';
            col.innerHTML = `
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body text-center">
                        <h6 class="card-title text-danger fw-bold">${plan.nombre || 'Plan Premium'}</h6>
                        <p class="display-5 fw-bold text-dark">$${parseFloat(plan.precio).toFixed(2)}</p>
                        <p class="text-muted small">${plan.descripcion || 'Acceso completo a funciones premium'}</p>
                        <p class="text-muted small mb-0">${plan.duracion_dias ? plan.duracion_dias + ' días de duración' : ''}</p>
                    </div>
                </div>
            `;
            contenedorPlanes.appendChild(col);

            // --- Opción en el select del formulario ---
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = `${plan.nombre || 'Plan Premium'} — $${parseFloat(plan.precio).toFixed(2)}`;
            option.dataset.precio = plan.precio; // Guardar el precio como atributo de datos
            selectPlan.appendChild(option);
        });

        // Evento: al seleccionar un plan, auto-llenar el monto
        selectPlan.addEventListener('change', () => {
            const opcionSeleccionada = selectPlan.options[selectPlan.selectedIndex];
            if (opcionSeleccionada.dataset.precio) {
                document.getElementById('pago-monto').value = parseFloat(opcionSeleccionada.dataset.precio).toFixed(2);
            } else {
                document.getElementById('pago-monto').value = '';
            }
        });

    } catch (err) {
        console.error('Error al cargar planes:', err);
        contenedorPlanes.innerHTML = '<p class="text-danger text-center small">Error al cargar los planes.</p>';
    }
}

// ==========================================
// 3. CARGAR HISTORIAL DE PAGOS DEL USUARIO
// ==========================================

async function cargarMisPagos() {
    const contenedor = document.getElementById('pagos-lista');

    try {
        // Consultar los pagos del usuario ordenados por fecha descendente
        const { data: pagos, error } = await sb
            .from('pagos')
            .select('*, accesos(nombre, precio)')
            .eq('usuario_id', currentUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Si no hay pagos registrados
        if (!pagos || pagos.length === 0) {
            contenedor.innerHTML = '<p class="text-muted text-center small">No tienes pagos registrados.</p>';
            return;
        }

        // Limpiar contenedor
        contenedor.innerHTML = '';

        // Mapa de colores de estado para las badges
        const coloresEstado = {
            pendiente: 'warning',
            aprobado: 'success',
            rechazado: 'danger'
        };

        // Renderizar cada pago como una tarjeta
        pagos.forEach(pago => {
            const color = coloresEstado[pago.estado] || 'secondary';
            const fechaPago = new Date(pago.fecha_pago).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
            const nombrePlan = (pago.accesos && pago.accesos.nombre) ? pago.accesos.nombre : 'Plan eliminado';

            const tarjeta = document.createElement('div');
            tarjeta.className = 'card border-0 shadow-sm mb-2';
            tarjeta.innerHTML = `
                <div class="card-body py-2 px-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong class="text-dark">${nombrePlan}</strong>
                            <br>
                            <span class="text-muted small">$${parseFloat(pago.monto).toFixed(2)} · ${pago.metodo_pago} · Ref: ${pago.referencia}</span>
                        </div>
                        <span class="badge bg-${color} text-capitalize">${pago.estado}</span>
                    </div>
                    <div class="text-muted small mt-1">${fechaPago}</div>
                </div>
            `;
            contenedor.appendChild(tarjeta);
        });

    } catch (err) {
        console.error('Error al cargar pagos:', err);
        contenedor.innerHTML = '<p class="text-danger text-center small">Error al cargar el historial de pagos.</p>';
    }
}

// ==========================================
// 4. DECLARAR UN NUEVO PAGO
// ==========================================

async function declararPago() {
    const mensajeEl = document.getElementById('pago-message');
    const botonEl = document.getElementById('btn-declarar-pago');

    // --- Recoger valores de los campos del formulario ---
    const accesoId = document.getElementById('pago-plan').value;
    const monto = document.getElementById('pago-monto').value;
    const metodo = document.getElementById('pago-metodo').value;
    const referencia = document.getElementById('pago-referencia').value.trim();
    const banco = document.getElementById('pago-banco').value.trim();
    const fecha = document.getElementById('pago-fecha').value;
    const notas = document.getElementById('pago-notas').value.trim();

    // --- Validación de campos requeridos ---
    if (!accesoId) {
        mostrarMensaje(mensajeEl, 'Selecciona un plan.', 'danger');
        return;
    }
    if (!monto || parseFloat(monto) <= 0) {
        mostrarMensaje(mensajeEl, 'Ingresa un monto válido mayor a 0.', 'danger');
        return;
    }
    if (!metodo) {
        mostrarMensaje(mensajeEl, 'Selecciona un método de pago.', 'danger');
        return;
    }
    if (!referencia) {
        mostrarMensaje(mensajeEl, 'Ingresa la referencia o número de comprobante.', 'danger');
        return;
    }
    if (!fecha) {
        mostrarMensaje(mensajeEl, 'Selecciona la fecha del pago.', 'danger');
        return;
    }

    // --- Deshabilitar botón mientras se procesa ---
    botonEl.disabled = true;
    botonEl.textContent = 'Procesando...';

    try {
        // Insertar el nuevo pago en la tabla 'pagos'
        const { error } = await sb
            .from('pagos')
            .insert([{
                usuario_id: currentUserId,
                acceso_id: accesoId,
                monto: parseFloat(monto),
                metodo_pago: metodo,
                referencia: referencia,
                banco_emisor: banco || null,
                fecha_pago: fecha,
                notas: notas || null,
                estado: 'pendiente'
            }]);

        if (error) throw error;

        // --- Éxito: limpiar formulario y mostrar mensaje ---
        limpiarFormulario();
        mostrarMensaje(mensajeEl, '✅ Pago declarado exitosamente. El administrador lo verificará pronto.', 'success');

        // Recargar el historial de pagos para mostrar el nuevo registro
        await cargarMisPagos();

        // También verificar si la suscripción cambió (por si acaso)
        await verificarSuscripcion();

    } catch (err) {
        console.error('Error al declarar pago:', err);
        mostrarMensaje(mensajeEl, 'Error al registrar el pago. Intenta de nuevo.', 'danger');
    } finally {
        // Re-habilitar el botón
        botonEl.disabled = false;
        botonEl.textContent = 'Declarar pago';
    }
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Muestra un mensaje temporal en el elemento indicado.
 * @param {HTMLElement} el - Elemento donde mostrar el mensaje.
 * @param {string} texto - Texto del mensaje.
 * @param {string} tipo - Tipo de alerta Bootstrap (success, danger, warning, info).
 */
function mostrarMensaje(el, texto, tipo) {
    el.textContent = texto;
    el.className = `text-${tipo} text-center mt-3 small`;

    // Ocultar el mensaje después de 6 segundos
    setTimeout(() => {
        el.textContent = '';
        el.className = 'text-danger text-center mt-3 small';
    }, 6000);
}

/**
 * Limpia todos los campos del formulario de declaración de pago.
 */
function limpiarFormulario() {
    document.getElementById('pago-plan').value = '';
    document.getElementById('pago-monto').value = '';
    document.getElementById('pago-metodo').value = '';
    document.getElementById('pago-referencia').value = '';
    document.getElementById('pago-banco').value = '';
    document.getElementById('pago-notas').value = '';

    // Restaurar la fecha de hoy
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('pago-fecha').value = hoy;
}