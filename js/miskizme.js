// ==========================================
// js/miskizme.js — Página "Mis Kizme" (Me Gusta)
// Muestra la cuadrícula de personas que le dieron like al usuario.
// Usuarios gratuitos ven máximo APP_CONFIG.likesGratis perfiles;
// el resto aparece bloqueado hasta que adquieran una suscripción.
// ==========================================

(function () {
    'use strict';

    // ------------------------------------------
    // Referencias al DOM
    // ------------------------------------------
    const $likesGrid       = document.getElementById('likes-grid');
    const $likesCount      = document.getElementById('likes-count');
    const $noLikes         = document.getElementById('no-likes');
    const $unlockMessage   = document.getElementById('unlock-message');
    const $lockedCount     = document.getElementById('locked-count');
    const $progressContainer = document.getElementById('progress-bar-container');
    const $freeCount       = document.getElementById('free-count');
    const $totalCount      = document.getElementById('total-count');
    const $progressFree    = document.getElementById('progress-free');
    const $progressLocked  = document.getElementById('progress-locked');
    const $activeSub       = document.getElementById('active-subscription');
    const $subInfo         = document.getElementById('sub-info');

    // ------------------------------------------
    // Inicialización al cargar la página
    // ------------------------------------------
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        try {
            // 1. Verificar sesión activa
            const { data: { session }, error: sessionError } = await sb.auth.getSession();

            if (sessionError || !session) {
                // Sin sesión → redirigir al inicio
                window.location.href = 'index.html';
                return;
            }

            const currentUserId = session.user.id;

            // 2. Cargar los me gusta recibidos y la información de suscripción en paralelo
            const [likesData, tieneSub] = await Promise.all([
                cargarLikesRecibidos(currentUserId),
                verificarSuscripcion(currentUserId)
            ]);

            // 3. Renderizar la cuadrícula
            renderizarGrid(likesData, tieneSub, currentUserId);
        } catch (err) {
            console.error('Error inicializando Mis Kizme:', err);
            $likesCount.textContent = 'Ocurrió un error al cargar. Intenta de nuevo.';
        }
    }

    // ==========================================
    // CARGAR LIKES RECIBIDOS
    // ==========================================
    /**
     * Obtiene todas las interacciones de tipo 'like' dirigidas al usuario,
     * junto con el perfil del emisor y si existe un match mutuo.
     * Excluye perfiles bloqueados.
     *
     * @param {string} usuarioId — ID del usuario actual
     * @returns {Array} Lista de objetos { perfil, esMatch }
     */
    async function cargarLikesRecibidos(usuarioId) {
        // 2a. Consultar interacciones: quienes le dieron like al usuario
        const { data: likes, error: likesError } = await sb
            .from('interacciones')
            .select('de_usuario_id, created_at')
            .eq('para_usuario_id', usuarioId)
            .eq('tipo', 'like')
            .order('created_at', { ascending: false });

        if (likesError) {
            console.error('Error consultando likes recibidos:', likesError);
            return [];
        }

        if (!likes || likes.length === 0) {
            return [];
        }

        // Recolectar IDs de los usuarios que dieron like
        const idsEmisores = likes.map(l => l.de_usuario_id);

        // 2b. Obtener perfiles de los emisores, excluyendo bloqueados
        const { data: perfiles, error: perfilesError } = await sb
            .from('perfiles')
            .select('*')
            .in('id', idsEmisores)
            .neq('bloqueado', true);

        if (perfilesError) {
            console.error('Error consultando perfiles de emisores:', perfilesError);
            return [];
        }

        if (!perfiles || perfiles.length === 0) {
            return [];
        }

        // 2c. Verificar cuáles son matches (like mutuo)
        // Buscar matches existentes donde el usuario actual participe
        const idsPerfilesNoBloqueados = perfiles.map(p => p.id);

        const { data: matches, error: matchesError } = await sb
            .from('matches')
            .select('usuario_1, usuario_2')
            .or(`usuario_1.eq.${usuarioId},usuario_2.eq.${usuarioId}`);

        if (matchesError) {
            console.error('Error consultando matches:', matchesError);
            // No es crítico — continuamos sin info de match
        }

        // Construir un conjunto de IDs con los que hay match
        const matchIds = new Set();
        if (matches) {
            for (const m of matches) {
                const otroId = m.usuario_1 === usuarioId ? m.usuario_2 : m.usuario_1;
                matchIds.add(otroId);
            }
        }

        // 2d. Combinar datos respetando el orden original de los likes
        const resultado = [];
        for (const like of likes) {
            const perfil = perfiles.find(p => p.id === like.de_usuario_id);
            if (!perfil) continue; // perfil bloqueado o no encontrado
            resultado.push({
                perfil: perfil,
                esMatch: matchIds.has(perfil.id)
            });
        }

        return resultado;
    }

    // ==========================================
    // VERIFICAR SUSCRIPCIÓN ACTIVA
    // ==========================================
    /**
     * Llama al RPC `tiene_suscripcion_activa` para saber si el usuario
     * tiene una suscripción vigente.
     *
     * @param {string} usuarioId
     * @returns {boolean} true si tiene suscripción activa
     */
    async function verificarSuscripcion(usuarioId) {
        try {
            const { data, error } = await sb.rpc('tiene_suscripcion_activa', {
                p_usuario_id: usuarioId
            });

            if (error) {
                console.warn('No se pudo verificar suscripción (RPC no disponible):', error.message);
                return false;
            }

            return !!data;
        } catch (err) {
            console.warn('Excepción al verificar suscripción:', err);
            return false;
        }
    }

    // ==========================================
    // RENDERIZAR CUADRÍCULA
    // ==========================================
    /**
     * Genera las tarjetas de la cuadrícula y gestiona los estados
     * de la UI (vacío, progreso, desbloqueo, suscripción).
     *
     * @param {Array}  likesData  — Lista de { perfil, esMatch }
     * @param {boolean} tieneSub  — ¿Tiene suscripción activa?
     * @param {string}  _userId   — ID del usuario actual (reservado para futuro uso)
     */
    function renderizarGrid(likesData, tieneSub, _userId) {
        const totalLikes  = likesData.length;
        const likesGratis = APP_CONFIG.likesGratis || 10;
        const libresVisible = tieneSub ? totalLikes : Math.min(totalLikes, likesGratis);
        const bloqueados  = tieneSub ? 0 : Math.max(0, totalLikes - likesGratis);

        // --- Estado: sin likes ---
        if (totalLikes === 0) {
            $likesGrid.classList.add('hidden');
            $noLikes.classList.remove('hidden');
            $likesCount.textContent = '0 personas';
            $progressContainer.classList.add('hidden');
            $unlockMessage.classList.add('hidden');
            return;
        }

        // Ocultar estado vacío
        $noLikes.classList.add('hidden');
        $likesGrid.classList.remove('hidden');

        // --- Texto del encabezado ---
        if (tieneSub) {
            $likesCount.textContent = `${totalLikes} persona${totalLikes !== 1 ? 's' : ''}`;
        } else {
            $likesCount.textContent = `${libresVisible} de ${totalLikes} persona${totalLikes !== 1 ? 's' : ''} (desbloquea para ver más)`;
        }

        // --- Barra de progreso (solo para usuarios gratuitos con likes) ---
        if (!tieneSub && totalLikes > 0) {
            $progressContainer.classList.remove('hidden');
            $freeCount.textContent  = libresVisible;
            $totalCount.textContent = totalLikes;

            const pctFree   = totalLikes > 0 ? (libresVisible / totalLikes) * 100 : 0;
            const pctLocked = totalLikes > 0 ? (bloqueados / totalLikes) * 100 : 0;

            $progressFree.style.width   = pctFree + '%';
            $progressLocked.style.width = pctLocked + '%';
        } else {
            $progressContainer.classList.add('hidden');
        }

        // --- Indicador de suscripción activa ---
        if (tieneSub) {
            $activeSub.classList.remove('hidden');
            $subInfo.textContent = 'Puedes ver todos tus Kizme sin límites.';
        } else {
            $activeSub.classList.add('hidden');
        }

        // --- Mensaje de desbloqueo ---
        if (bloqueados > 0) {
            $unlockMessage.classList.remove('hidden');
            $lockedCount.textContent = bloqueados;
        } else {
            $unlockMessage.classList.add('hidden');
        }

        // --- Generar tarjetas ---
        $likesGrid.innerHTML = '';

        likesData.forEach(function (item, index) {
            const perfil = item.perfil;
            const esMatch = item.esMatch;
            // Determinar si esta tarjeta está bloqueada (sin suscripción y fuera del límite gratis)
            const estaBloqueada = !tieneSub && index >= likesGratis;

            // URL de la foto de perfil (con fallback)
            const avatarSrc = perfil.avatar_url || 'img/placeholder.jpg';

            // Nombre y edad
            const nombreEdad = [perfil.nombre, perfil.edad].filter(Boolean).join(', ') || 'Usuario';

            // Ubicación
            const ubicacion = [perfil.ciudad, perfil.pais].filter(Boolean).join(', ') || '';

            // Construir la tarjeta
            const col = document.createElement('div');
            col.className = 'col-6 col-md-4 col-lg-3';

            const card = document.createElement('div');
            card.className = 'card h-100 shadow-sm like-card' + (estaBloqueada ? ' locked' : '');

            // --- Imagen con posibles badges ---
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'card-img-top-wrapper';

            const img = document.createElement('img');
            img.src = avatarSrc;
            img.className = 'card-img-top';
            img.alt = perfil.nombre || 'Usuario';
            img.loading = 'lazy';
            // Si la imagen falla, usar placeholder
            img.onerror = function () {
                this.src = 'img/placeholder.jpg';
            };

            imgWrapper.appendChild(img);

            // Badge de match
            if (esMatch) {
                const badge = document.createElement('span');
                badge.className = 'match-badge';
                badge.innerHTML = '&#128141; Match';
                imgWrapper.appendChild(badge);
            }

            // Overlay de bloqueo
            if (estaBloqueada) {
                const overlay = document.createElement('div');
                overlay.className = 'locked-overlay';
                overlay.innerHTML = '<span>&#128274;</span>';
                imgWrapper.appendChild(overlay);
            }

            // --- Cuerpo de la tarjeta ---
            const body = document.createElement('div');
            body.className = 'card-body p-2';

            const title = document.createElement('h6');
            title.className = 'card-title mb-0 small';
            title.textContent = nombreEdad;

            const location = document.createElement('p');
            location.className = 'card-text text-muted small mb-0';
            location.textContent = ubicacion;

            // Si está bloqueada, ocultar datos personales
            if (estaBloqueada) {
                title.textContent = '???';
                location.textContent = 'Desbloquea para ver';
            }

            body.appendChild(title);
            body.appendChild(location);

            card.appendChild(imgWrapper);
            card.appendChild(body);
            col.appendChild(card);
            $likesGrid.appendChild(col);
        });
    }
})();