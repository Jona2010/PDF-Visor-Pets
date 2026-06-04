/**
 * auth.js
 *
 * Módulo de autenticación — actualmente sin implementar.
 * Para añadir login real, conecta aquí con Supabase Auth:
 *
 *   import { createClient } from "@supabase/supabase-js";
 *   const supabase = createClient(URL, KEY);
 *   const { data, error } = await supabase.auth.signInWithPassword({ email, password });
 */

export class Auth {

    /**
     * Valida si el usuario está autenticado.
     * @returns {Promise<boolean>}
     */
    static async validate() {
        // TODO: implementar validación real con Supabase Auth
        return true;
    }

    /**
     * Cierra la sesión del usuario.
     * @returns {Promise<void>}
     */
    static async logout() {
        // TODO: supabase.auth.signOut()
    }
}