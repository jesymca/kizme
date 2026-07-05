-- ========================================
-- Kizme V001 - Migración principal
-- Dating App - Supabase (PostgreSQL)
-- ========================================
-- Este archivo contiene las tablas, políticas RLS y funciones
-- necesarias para la versión 001 de Kizme.
-- 
-- Tablas existentes (ya creadas en Supabase):
--   - perfiles, interacciones, matches, mensajes
-- 
-- Tablas nuevas en esta migración:
--   - genero, admin_users, accesos, pagos, suscripciones
--
-- Se asume que las tablas de ubicación venezolana ya existen:
--   - estados, municipios, parroquias, ciudades
--   (creadas por venezuela_postgres.sql)
-- ========================================

BEGIN;

-- ============================================
-- 1. TABLA GENERO
-- Opciones de género para registro y descubrimiento
-- ============================================

CREATE TABLE IF NOT EXISTS public.genero (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(200),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Datos iniciales de géneros disponibles
INSERT INTO public.genero (nombre, descripcion) VALUES
  ('Hombre',                  'Identidad masculina'),
  ('Mujer',                   'Identidad femenina'),
  ('Pareja (heterosexual)',   'Pareja compuesta por un hombre y una mujer'),
  ('Pareja (homosexual)',     'Pareja compuesta por personas del mismo género'),
  ('Transgénero masculino',   'Persona que se identifica como hombre'),
  ('Transgénero femenino',    'Persona que se identifica como mujer'),
  ('No binario',              'Identidad que no se ajusta al binario hombre/mujer'),
  ('Género fluido',           'Identidad que cambia con el tiempo'),
  ('Bigénero',                'Persona que se identifica con dos géneros'),
  ('Agénero',                 'Persona que no se identifica con ningún género'),
  ('Otro',                    'Otra identidad de género no listada');

-- ============================================
-- 2. ALTER TABLE PERFILES
-- Nuevas columnas para ubicación y referencia de género
-- ============================================

ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS id_estado INTEGER REFERENCES public.estados(id_estado) ON DELETE SET NULL;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS id_municipio INTEGER REFERENCES public.municipios(id_municipio) ON DELETE SET NULL;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS id_parroquia INTEGER REFERENCES public.parroquias(id_parroquia) ON DELETE SET NULL;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS id_ciudad INTEGER REFERENCES public.ciudades(id_ciudad) ON DELETE SET NULL;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS genero_id INTEGER REFERENCES public.genero(id) ON DELETE SET NULL;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS buscando_genero_id INTEGER REFERENCES public.genero(id) ON DELETE SET NULL;
-- NOTA: buscando_genero_id es para "Estás aquí para conocer" — el género que el usuario desea encontrar.

-- ============================================
-- 3. TABLA ADMIN_USERS
-- Control de acceso administrativo
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre_completo VARCHAR(200),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usuario administrador por defecto para el MVP
INSERT INTO public.admin_users (username, password_hash, nombre_completo) VALUES
  ('admin', '10ASR125T859UJHGD', 'Administrador Kizme');

-- ============================================
-- 4. TABLA ACCESOS
-- Planes de acceso configurables desde el dashboard
-- ============================================

CREATE TABLE IF NOT EXISTS public.accesos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  precio NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  duracion_dias INTEGER DEFAULT 30,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Plan de acceso por defecto
INSERT INTO public.accesos (nombre, descripcion, precio, duracion_dias) VALUES
  ('Desbloqueo Mensual de Me Gusta',
   'Acceso ilimitado a ver todos los me gusta recibidos por 30 días',
   5.00,
   30);

-- ============================================
-- 5. TABLA PAGOS
-- Declaraciones de pago realizadas por los usuarios
-- metodo_pago: 'transferencia', 'pago_movil', 'zelle', 'paypal', 'otro'
-- estado: 'pendiente', 'aprobado', 'rechazado'
-- ============================================

CREATE TABLE IF NOT EXISTS public.pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  acceso_id INTEGER REFERENCES public.accesos(id),
  monto NUMERIC(10,2) NOT NULL,
  metodo_pago VARCHAR(50) DEFAULT 'transferencia',
  referencia VARCHAR(200),
  banco_emisor VARCHAR(100),
  fecha_pago DATE,
  estado VARCHAR(20) DEFAULT 'pendiente',
  notas TEXT,
  verificado_por UUID,
  fecha_verificacion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. TABLA SUSCRIPCIONES
-- Suscripciones activas de los usuarios
-- estado: 'activa', 'expirada', 'cancelada'
-- ============================================

CREATE TABLE IF NOT EXISTS public.suscripciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID NOT NULL,
  acceso_id INTEGER REFERENCES public.accesos(id),
  pago_id UUID REFERENCES public.pagos(id),
  fecha_inicio TIMESTAMPTZ DEFAULT now(),
  fecha_fin TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) DEFAULT 'activa',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7. POLÍTICAS RLS (Row Level Security)
-- ============================================

-- --- 7a. genero: datos de referencia, lectura pública ---
ALTER TABLE public.genero ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Generos visibles para todos"
  ON public.genero FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Solo admin puede gestionar generos"
  ON public.genero FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

-- --- 7b. estados: datos de referencia, lectura pública ---
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Estados visibles para todos"
  ON public.estados FOR SELECT
  TO anon, authenticated
  USING (true);

-- --- 7c. municipios: datos de referencia, lectura pública ---
ALTER TABLE public.municipios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Municipios visibles para todos"
  ON public.municipios FOR SELECT
  TO anon, authenticated
  USING (true);

-- --- 7d. parroquias: datos de referencia, lectura pública ---
ALTER TABLE public.parroquias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parroquias visibles para todos"
  ON public.parroquias FOR SELECT
  TO anon, authenticated
  USING (true);

-- --- 7e. ciudades: datos de referencia, lectura pública ---
ALTER TABLE public.ciudades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ciudades visibles para todos"
  ON public.ciudades FOR SELECT
  TO anon, authenticated
  USING (true);

-- --- 7f. admin_users: control de acceso administrativo ---
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Login admin"
  ON public.admin_users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Solo admin puede gestionar admins"
  ON public.admin_users FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.username = current_setting('request.header.x-admin-user', true)
      AND au.password_hash = current_setting('request.header.x-admin-pass', true)
  ));

-- --- 7g. accesos: planes visibles para todos, edición solo admin ---
ALTER TABLE public.accesos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accesos visibles para autenticados"
  ON public.accesos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin gestiona accesos"
  ON public.accesos FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

CREATE POLICY "Accesos visibles para anon"
  ON public.accesos FOR SELECT
  TO anon
  USING (true);

-- --- 7h. pagos: usuarios gestionan sus propios pagos, admin todos ---
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propios pagos"
  ON public.pagos FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuarios crean sus pagos"
  ON public.pagos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuarios actualizan sus pagos"
  ON public.pagos FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admin gestiona todos los pagos"
  ON public.pagos FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

-- --- 7i. suscripciones: usuarios ven las suyas, admin gestiona todas ---
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus suscripciones"
  ON public.suscripciones FOR SELECT
  TO authenticated
  USING (auth.uid() = usuario_id);

CREATE POLICY "Admin gestiona suscripciones"
  ON public.suscripciones FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

-- ============================================
-- 8. POLÍTICAS RLS ADICIONALES PARA PERFILES
-- Admin puede ver y actualizar cualquier perfil
-- ============================================

CREATE POLICY "Admin puede ver todos los perfiles"
  ON public.perfiles FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

CREATE POLICY "Admin puede actualizar cualquier perfil"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = 'admin'
      AND password_hash = '10ASR125T859UJHGD'
      AND activo = true
  ));

CREATE POLICY "Usuarios pueden insertar su perfil con ubicacion"
  ON public.perfiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 9. FUNCIÓN: es_admin
-- Verifica si un par usuario/contraseña corresponde a un admin activo.
-- Útil para la lógica del dashboard administrativo.
-- ============================================

CREATE OR REPLACE FUNCTION public.es_admin(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE username = p_username
      AND password_hash = p_password
      AND activo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. FUNCIÓN: tiene_suscripcion_activa
-- Verifica si un usuario tiene al menos una suscripción activa
-- cuya fecha de fin aún no ha expirado.
-- ============================================

CREATE OR REPLACE FUNCTION public.tiene_suscripcion_activa(p_usuario_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.suscripciones
    WHERE usuario_id = p_usuario_id
      AND estado = 'activa'
      AND fecha_fin > now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. FUNCIÓN: obtener_suscripcion_usuario
-- Retorna la información de la suscripción activa más reciente
-- de un usuario, incluyendo el nombre del plan de acceso.
-- ============================================

CREATE OR REPLACE FUNCTION public.obtener_suscripcion_usuario(p_usuario_id UUID)
RETURNS TABLE(
  id UUID,
  acceso_id INTEGER,
  nombre VARCHAR,
  fecha_fin TIMESTAMPTZ,
  estado VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.acceso_id, a.nombre, s.fecha_fin, s.estado
  FROM public.suscripciones s
  JOIN public.accesos a ON a.id = s.acceso_id
  WHERE s.usuario_id = p_usuario_id
    AND s.estado = 'activa'
    AND s.fecha_fin > now()
  ORDER BY s.fecha_fin DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ============================================
-- FIN DE MIGRACIÓN KIZME V001
-- ============================================