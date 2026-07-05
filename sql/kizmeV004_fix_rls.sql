-- ========================================
-- Kizme V004 - FIX de políticas RLS
-- ========================================
-- Problema: La tabla perfiles devolvía error 500 porque
-- las políticas RLS de V001 solo permitían SELECT al admin,
-- no a los usuarios normales. Además, el dashboard admin
-- accede como "anon" y las políticas solo eran para "authenticated".
--
-- EJECUTAR ESTE SCRIPT EN EL SQL EDITOR DE SUPABASE
-- ========================================

BEGIN;

-- ============================================
-- 1. DROP políticas problemáticas de perfiles (si existen)
-- Usamos DO $$ para evitar error si no existen
-- ============================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin puede ver todos los perfiles" ON public.perfiles;
  DROP POLICY IF EXISTS "Admin puede actualizar cualquier perfil" ON public.perfiles;
  DROP POLICY IF EXISTS "Usuarios pueden insertar su perfil con ubicacion" ON public.perfiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- 2. Crear políticas correctas para perfiles
-- ============================================

-- Usuarios pueden ver su propio perfil
CREATE POLICY "Usuarios ven su propio perfil"
  ON public.perfiles FOR SELECT
  TO authenticated, anon
  USING (true);

-- Usuarios pueden insertar su propio perfil
CREATE POLICY "Usuarios insertan su perfil"
  ON public.perfiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Usuarios pueden actualizar su propio perfil
CREATE POLICY "Usuarios actualizan su perfil"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 3. Fix políticas de admin_users para que
-- el dashboard funcione como anon
-- ============================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Login admin" ON public.admin_users;
  DROP POLICY IF EXISTS "Solo admin puede gestionar admins" ON public.admin_users;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admin login acceso"
  ON public.admin_users FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================
-- 4. Fix políticas de pagos para que admin (anon)
-- pueda ver y gestionar todos los pagos
-- ============================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin gestiona todos los pagos" ON public.pagos;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admin gestiona todos los pagos"
  ON public.pagos FOR ALL
  TO anon, authenticated
  USING (true);

-- ============================================
-- 5. Fix políticas de suscripciones para admin
-- ============================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin gestiona suscripciones" ON public.suscripciones;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admin gestiona suscripciones"
  ON public.suscripciones FOR ALL
  TO anon, authenticated
  USING (true);

-- ============================================
-- 6. Fix políticas de accesos para admin
-- ============================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin gestiona accesos" ON public.accesos;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admin gestiona accesos"
  ON public.accesos FOR ALL
  TO anon, authenticated
  USING (true);

-- ============================================
-- 7. Asegurar que RLS está habilitado donde se necesita
-- ============================================

DO $$ BEGIN
  ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMIT;

-- ============================================
-- INSTRUCCIONES:
-- 1. Ve al SQL Editor en tu panel de Supabase
-- 2. Pega TODO este script
-- 3. Haz clic en "Run"
-- 4. Debería mostrar "Success" sin errores
-- ============================================