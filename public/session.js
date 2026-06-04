/**
 * session.js
 *
 * Módulo de sesión — actualmente sin implementar.
 * Para sesiones reales, usar Supabase Auth y almacenar
 * el token en localStorage o cookies seguras.
 */

export class Session {

    /**
     * Devuelve el estado de la sesión actual.
     * @returns {{ active: boolean, user?: object }}
     */
    static get() {
        // TODO: implementar con supabase.auth.getSession()
        return { active: true };
    }

    /**
     * Guarda la sesión.
     * @param {object} sessionData
     */
    static save(sessionData) {
        // TODO: implementar persistencia de sesión
    }

    /**
     * Limpia la sesión guardada.
     */
    static clear() {
        // TODO: limpiar tokens
    }
}