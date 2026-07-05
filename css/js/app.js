// js/app.js
const SUPABASE_URL = 'https://pllkctfgfspgghvlasjw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_l0gweUZ5iGBrkPKJShCqEw_sgJ4f-Om';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUserId = null;
let currentMatchId = null;
let realtimeChannel = null;

// ==========================================
// 1. GESTIÓN DE VISTAS Y SESIÓN
// ==========================================
async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUserId = session.user.id;
        await cargarPerfilUsuario();
    } else {
        mostrarVista('auth-view');
    }
}

function mostrarVista(idVista) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(idVista).classList.add('active');
    
    const isAuth = idVista === 'auth-view';
    document.getElementById('bottom-nav').classList.toggle('hidden', isAuth);
    document.getElementById('logout-btn').classList.toggle('hidden', isAuth);
}

function cambiarVista(idVista) {
    mostrarVista(idVista);
    if (idVista === 'discover-view') cargarPerfilesParaDescubrir();
    if (idVista === 'chat-view') cargarMatches();
}

async function cerrarSesion() {
    await sb.auth.signOut();
    currentUserId = null;
    mostrarVista('auth-view');
}

// ==========================================
// 2. AUTENTICACIÓN
// ==========================================
let isLogin = true;

function toggleAuthMode(e) {
    if(e) e.preventDefault();
    isLogin = !isLogin;
    document.getElementById('login-btn').classList.toggle('hidden', !isLogin);
    document.getElementById('register-btn').classList.toggle('hidden', isLogin);
    document.querySelectorAll('.hidden-on-login').forEach(el => el.classList.toggle('hidden', isLogin));
    document.getElementById('toggle-link').innerText = isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión';
}

async function registrarUsuario() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const nombre = document.getElementById('auth-nombre').value;
    const username = document.getElementById('auth-username').value;

    if (!email || !password || !nombre || !username) {
        document.getElementById('auth-message').innerText = "Por favor completa todos los campos.";
        return;
    }

    // Verificar si el username ya existe
    const { data: userExists } = await sb.from('perfiles').select('username').eq('username', username).single();
    if (userExists) {
        document.getElementById('auth-message').innerText = "Este nombre de usuario ya está en uso.";
        return;
    }

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
    alert("Registro exitoso. Por favor verifica tu email e inicia sesión.");
    toggleAuthMode();
}

async function iniciarSesion() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
        document.getElementById('auth-message').innerText = "Por favor ingresa email y contraseña.";
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

function obtenerRedirectUrl() {
    const currentUrl = new URL(window.location.href);
    const pathname = currentUrl.pathname.endsWith('/') ? currentUrl.pathname : `${currentUrl.pathname}/`;
    return `${currentUrl.origin}${pathname}`;
}

async function loginConGoogle() {
    try {
        document.getElementById('auth-message').innerText = "Redirigiendo a Google...";
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
            console.error("Error con Google:", error.message);
            document.getElementById('auth-message').innerText = "Error con Google: " + error.message;
        }
    } catch (error) {
        console.error("Error:", error);
        document.getElementById('auth-message').innerText = "Error al iniciar sesión con Google";
    }
}

// ==========================================
// 3. GESTIÓN DE PERFIL
// ==========================================
async function cargarPerfilUsuario() {
    // Mostrar loading
    document.getElementById('auth-message').innerText = "Cargando perfil...";
    
    const { data: perfil, error } = await sb.from('perfiles').select('*').eq('id', currentUserId).single();
    
    if (error || !perfil) {
        // Si no existe perfil, crear uno con los datos del usuario
        const { data: userData } = await sb.auth.getUser();
        const userMeta = userData.user.user_metadata;
        
        // Si viene de Google, extraer datos
        const nombre = userMeta.nombre || userMeta.full_name || userMeta.name || 'Nuevo Usuario';
        const username = userMeta.username || userMeta.email?.split('@')[0] || 'user' + Math.floor(Math.random() * 1000);
        const avatarUrl = userMeta.avatar_url || userMeta.picture || null;
        
        const nuevoPerfil = {
            id: currentUserId,
            nombre: nombre,
            username: username,
            avatar_url: avatarUrl,
            bio: '',
            genero: ''
        };
        
        const { error: insertError } = await sb.from('perfiles').insert(nuevoPerfil);
        if (insertError) {
            console.error("Error al crear perfil:", insertError);
            mostrarVista('profile-setup-view');
        } else {
            // Si se creó con avatar, ir a descubrir
            if (avatarUrl) {
                mostrarVista('discover-view');
                cargarPerfilesParaDescubrir();
            } else {
                mostrarVista('profile-setup-view');
            }
        }
    } else {
        // Perfil existe, verificar si está completo
        if (!perfil.avatar_url || !perfil.bio || !perfil.genero) {
            // Si falta algún dato, mostrar setup
            if (perfil.avatar_url) {
                document.getElementById('profile-preview').src = perfil.avatar_url;
            }
            if (perfil.bio) {
                document.getElementById('setup-bio').value = perfil.bio;
            }
            if (perfil.genero) {
                document.getElementById('setup-genero').value = perfil.genero;
            }
            mostrarVista('profile-setup-view');
        } else {
            mostrarVista('discover-view');
            cargarPerfilesParaDescubrir();
        }
    }
}

async function guardarPerfil() {
    const fileInput = document.getElementById('avatar-input');
    const bio = document.getElementById('setup-bio').value;
    const genero = document.getElementById('setup-genero').value;

    if (!bio || !genero) {
        alert("Por favor completa todos los campos.");
        return;
    }

    let avatarUrl = null;
    
    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUserId}.${fileExt}`;
        const filePath = `${currentUserId}/${fileName}`;

        const { error: uploadError } = await sb.storage.from('fotos_perfil').upload(filePath, file, { upsert: true });
        if (uploadError) {
            alert("Error al subir la imagen: " + uploadError.message);
            return;
        }

        const { data: publicUrlData } = sb.storage.from('fotos_perfil').getPublicUrl(filePath);
        avatarUrl = publicUrlData.publicUrl;
    } else {
        // Si no se sube nueva imagen, mantener la existente
        const { data: perfil } = await sb.from('perfiles').select('avatar_url').eq('id', currentUserId).single();
        avatarUrl = perfil?.avatar_url;
    }

    if (!avatarUrl) {
        alert("Por favor sube una foto de perfil.");
        return;
    }

    const { error: updateError } = await sb.from('perfiles')
        .update({ 
            avatar_url: avatarUrl, 
            bio: bio, 
            genero: genero 
        })
        .eq('id', currentUserId);
        
    if (updateError) {
        alert("Error al guardar perfil: " + updateError.message);
        return;
    }

    mostrarVista('discover-view');
    cargarPerfilesParaDescubrir();
}

// ==========================================
// 4. DESCUBRIR (SWIPE)
// ==========================================
async function cargarPerfilesParaDescubrir() {
    try {
        // Obtener perfiles que ya han interactuado conmigo o yo con ellos
        const { data: interacciones } = await sb.from('interacciones')
            .select('para_usuario_id')
            .eq('de_usuario_id', currentUserId);
        
        const idsInteractuados = interacciones.map(i => i.para_usuario_id);
        
        let query = sb.from('perfiles')
            .select('*')
            .neq('id', currentUserId);
        
        if (idsInteractuados.length > 0) {
            query = query.not('id', 'in', `(${idsInteractuados.join(',')})`);
        }
        
        // También excluir perfiles que me hayan dado dislike
        const { data: dislikesRecibidos } = await sb.from('interacciones')
            .select('de_usuario_id')
            .eq('para_usuario_id', currentUserId)
            .eq('tipo', 'dislike');
        
        const idsDislikes = dislikesRecibidos.map(i => i.de_usuario_id);
        if (idsDislikes.length > 0) {
            query = query.not('id', 'in', `(${idsDislikes.join(',')})`);
        }
        
        const { data: perfiles, error } = await query.limit(1);

        const card = document.getElementById('profile-card');
        const noProfiles = document.getElementById('no-profiles');

        if (error) {
            console.error("Error cargando perfiles:", error);
            return;
        }

        if (perfiles && perfiles.length > 0) {
            const perfilActual = perfiles[0];
            document.getElementById('card-img').src = perfilActual.avatar_url || 'https://via.placeholder.com/300x400?text=Sin+Imagen';
            document.getElementById('card-name').innerText = perfilActual.nombre || 'Usuario';
            document.getElementById('card-bio').innerText = perfilActual.bio || 'Sin descripción';
            card.classList.remove('hidden');
            noProfiles.classList.add('hidden');
            card.dataset.perfilId = perfilActual.id;
        } else {
            card.classList.add('hidden');
            noProfiles.classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

async function registrarInteraccion(tipo) {
    const card = document.getElementById('profile-card');
    const paraUsuarioId = card.dataset.perfilId;
    if (!paraUsuarioId) {
        await cargarPerfilesParaDescubrir();
        return;
    }

    const { error } = await sb.from('interacciones').insert({ 
        de_usuario_id: currentUserId, 
        para_usuario_id: paraUsuarioId, 
        tipo 
    });
    
    if (error) {
        console.error("Error al registrar interacción:", error);
        alert("Error: " + error.message);
        return;
    }

    // Si es like, verificar si hay match
    if (tipo === 'like') {
        // Verificar si el otro usuario ya me dio like
        const { data: likeMutuo } = await sb.from('interacciones')
            .select('*')
            .eq('de_usuario_id', paraUsuarioId)
            .eq('para_usuario_id', currentUserId)
            .eq('tipo', 'like')
            .single();
        
        if (likeMutuo) {
            // ¡Es un match!
            const matchData = {
                usuario_1: currentUserId < paraUsuarioId ? currentUserId : paraUsuarioId,
                usuario_2: currentUserId < paraUsuarioId ? paraUsuarioId : currentUserId
            };
            
            await sb.from('matches').insert(matchData);
            alert("🎉 ¡Es un match! Ahora pueden chatear.");
            
            // Recargar matches si estamos en la vista de chats
            if (document.getElementById('chat-view').classList.contains('active')) {
                cargarMatches();
            }
        }
    }

    // Animación
    card.style.transition = 'transform 0.3s, opacity 0.3s';
    card.style.transform = tipo === 'like' ? 'translateX(150%) rotate(5deg)' : 'translateX(-150%) rotate(-5deg)';
    card.style.opacity = '0';
    setTimeout(() => { 
        card.style.transform = 'translateX(0)'; 
        card.style.opacity = '1';
        card.style.transition = 'none';
        cargarPerfilesParaDescubrir(); 
    }, 300);
}

// ==========================================
// 5. CHATS Y MATCHES
// ==========================================
async function cargarMatches() {
    const { data: matches, error } = await sb.from('matches')
        .select('id, usuario_1, usuario_2, created_at')
        .or(`usuario_1.eq.${currentUserId},usuario_2.eq.${currentUserId}`)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error("Error cargando matches:", error);
        return;
    }

    const lista = document.getElementById('matches-list');
    lista.innerHTML = '';

    if (matches && matches.length > 0) {
        for (const match of matches) {
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

    // Suscribirse a nuevos mensajes
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

function cerrarChat() {
    document.getElementById('chat-room').classList.add('hidden');
    document.getElementById('matches-list').classList.remove('hidden');
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

function mostrarMensaje(msg) {
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = `message-bubble ${msg.remitente_id === currentUserId ? 'sent' : 'received'}`;
    div.innerText = msg.texto || 'Mensaje vacío';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

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
        console.error("Error al enviar mensaje:", error);
        alert("Error al enviar: " + error.message);
    } else {
        input.value = '';
    }
}

// ==========================================
// 6. MANEJAR REDIRECCIONES DE OAUTH
// ==========================================
async function handleOAuthRedirect() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error) {
        console.error("Error al obtener sesión:", error);
        return;
    }
    if (session) {
        currentUserId = session.user.id;
        await cargarPerfilUsuario();
    }
}

// ==========================================
// EVENT LISTENERS GLOBALES
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Escuchar cambios en la autenticación
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
    
    // Verificar si hay una redirección de OAuth
    handleOAuthRedirect();
    
    // Verificar sesión
    checkSession();
    
    // Event listener para enviar mensaje con Enter
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            enviarMensaje();
        }
    });
});