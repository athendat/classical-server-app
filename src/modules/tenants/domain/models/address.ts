/**
 * Subdocumento para dirección de negocio
 */
/**
 * Representa una dirección postal.
 *
 * @remarks
 * Agrupa los campos comunes necesarios para identificar una ubicación física.
 *
 * @property {string} address - Línea principal de la dirección (calle, número, departamento, etc.).
 * @property {string} city - Ciudad o localidad.
 * @property {string} state - Estado, provincia o región.
 * @property {string} zipCode - Código postal.
 * @property {string} [country] - País (opcional).
 */
export class Address {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
}