import { CardStatusEnum, CardTypeEnum } from "../enums";

/**
 * Representa una tarjeta asociada a un usuario dentro del sistema.
 *
 * Contiene los datos esenciales para identificarla, su estado, vencimiento,
 * referencia de token/registro y saldo disponible.
 *
 * @public
 *
 * @property {string} id - Identificador único de la tarjeta (por ejemplo UUID).
 * @property {string} userId - Identificador del usuario propietario de la tarjeta.
 * @property {CardTypeEnum} cardType - Tipo de tarjeta (ej. débito, crédito) según CardTypeEnum.
 * @property {CardStatusEnum} status - Estado actual de la tarjeta según CardStatusEnum (activo, bloqueado, etc.).
 * @property {string} lastFour - Últimos cuatro dígitos del número de la tarjeta (para visualización/identificación).
 * @property {number} expiryMonth - Mes de expiración (1-12).
 * @property {number} expiryYear - Año de expiración (formato de cuatro dígitos, p. ej. 2028).
 * @property {string} ticketReference - Referencia o token asociado al registro/provisión de la tarjeta.
 * @property {number} balance - Saldo asociado a la tarjeta (unidad monetaria según contexto del sistema).
 * @property {Date} createdAt - Fecha y hora en que se creó o registró la tarjeta en el sistema.
 */
export class Card {
    id: string;
    userId: string;
    cardType: CardTypeEnum;
    status: CardStatusEnum;
    lastFour: string;
    expiryMonth: number;
    expiryYear: number;
    ticketReference: string;
    balance: number;
    createdAt: Date;
}
