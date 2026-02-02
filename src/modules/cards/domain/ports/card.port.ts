import { QueryFilter } from 'mongoose';
import { Card } from '../../infrastructure/schemas/card.schema';
import { CardStatusEnum } from '../enums';

/**
 * Puerto (interfaz de puerto) que define las operaciones disponibles para cards
 * Implementado por CardRepository en la capa de infraestructura
 */
export interface ICardPort {
  /**
   * Buscar una tarjeta por su ID
   */
  findById(cardId: string): Promise<Card | null>;

  /**
   * Buscar tarjetas por usuario
   */
  findByUserId(userId: string): Promise<Card[] | null>;

  /**
   * Listar tarjetas con filtros y paginación
   */
  findAll(
    filter: QueryFilter<Card>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Card[]; total: number }>;

  /**
   * Crear una nueva tarjeta
   */
  create(cardData: Partial<Card>): Promise<Card>;

  /**
   * Actualizar una tarjeta existente
   */
  update(cardId: string, updates: Partial<Card>): Promise<Card>;

  /**
   * Cambiar el estado de una tarjeta
   */
  updateStatus(cardId: string, status: CardStatusEnum): Promise<Card>;

  /**
   * Eliminar una tarjeta
   */
  delete(cardId: string): Promise<void>;
}
