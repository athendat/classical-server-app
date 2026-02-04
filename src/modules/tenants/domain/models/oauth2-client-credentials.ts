/**
 * Representa las credenciales de un cliente OAuth2.
 *
 * Contiene el identificador público del cliente y su secreto privado usados para
 * el flujo "client credentials" en OAuth 2.0.
 *
 * @remarks
 * No almacene secretos en texto plano en producción; utilice un gestor de secretos.
 */
export class OAuth2ClientCredentials {
    
    /**
     * Identificador único del cliente OAuth2.
     *
     * Suele ser público y se utiliza para identificar la aplicación que solicita
     * tokens al servidor de autorización.
     *
     * @example
     * 'my-client-id-123'
     */
    clientId: string;
    
    /**
     * Secreto del cliente OAuth2.
     *
     * Valor privado usado para autenticar la aplicación con el servidor de autorización.
     * Debe protegerse como información sensible y no exponerse en repositorios.
     *
     * @example
     * 's3cr3tV@lu3'
     */
    clientSecret: string;
}
