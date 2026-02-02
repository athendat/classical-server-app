import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { ICardPort } from '../../domain/ports/card.port';
import { CardStatusEnum } from '../../domain/enums';
import { Card, CardDocument } from '../schemas/card.schema';

/**
 * Repositorio de Cards implementando el puerto ICardPort
 * Encapsula todas las operaciones de MongoDB para tarjetas
 */
@Injectable()
export class CardRepository implements ICardPort {
  private readonly logger = new Logger(CardRepository.name);

  constructor(
    @InjectModel(Card.name)
    private readonly cardModel: Model<CardDocument>,
  ) {}

  /**
   * Crear una nueva tarjeta
   */
  async create(cardData: Partial<Card>): Promise<Card> {
    try {
      const newCard = new this.cardModel(cardData);
      const savedCard = await newCard.save();
      return savedCard.toObject() as Card;
    } catch (error) {
      this.logger.error('Error creating card', error);
      throw error;
    }
  }

  /**
   * Buscar una tarjeta por su ID
   */
  async findById(cardId: string): Promise<Card | null> {
    try {
      const card = await this.cardModel.findOne({ id: cardId }).lean();
      return card as Card | null;
    } catch (error) {
      this.logger.error(`Error finding card by id: ${cardId}`, error);
      return null;
    }
  }

  /**
   * Buscar tarjetas por usuario
   */
  async findByUserId(userId: string): Promise<Card[] | null> {
    try {
      const cards = await this.cardModel.find({ userId }).lean();
      return cards as Card[] | null;
    } catch (error) {
      this.logger.error(`Error finding cards by userId: ${userId}`, error);
      return null;
    }
  }

  /**
   * Listar tarjetas con filtros y paginación
   */
  async findAll(
    filter: QueryFilter<Card>,
    options: {
      skip: number;
      limit: number;
      sort?: Record<string, number>;
    },
  ): Promise<{ data: Card[]; total: number }> {
    try {
      this.logger.debug(
        `Finding Cards with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [cards, total] = await Promise.all([
        this.cardModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .lean()
          .exec(),
        this.cardModel.countDocuments(filter as any).exec(),
      ]);

      this.logger.debug(
        `Found ${cards.length} Cards (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      return {
        data: cards as Card[],
        total,
      };
    } catch (error) {
      this.logger.error(
        `Error finding Cards with filter: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw new Error(
        `Find with filter failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Actualizar una tarjeta existente
   */
  async update(cardId: string, updates: Partial<Card>): Promise<Card> {
    try {
      const updated = await this.cardModel
        .findOneAndUpdate(
          { id: cardId },
          { ...updates, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Card not found: ${cardId}`);
      }
      return updated as Card;
    } catch (error) {
      this.logger.error(`Error updating card: ${cardId}`, error);
      throw error;
    }
  }

  /**
   * Cambiar el estado de una tarjeta
   */
  async updateStatus(cardId: string, status: CardStatusEnum): Promise<Card> {
    try {
      const updated = await this.cardModel
        .findOneAndUpdate(
          { id: cardId },
          { status, updatedAt: new Date() },
          { new: true },
        )
        .lean();
      if (!updated) {
        throw new Error(`Card not found: ${cardId}`);
      }
      return updated as Card;
    } catch (error) {
      this.logger.error(
        `Error updating card status: ${cardId} to ${status}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Eliminar una tarjeta
   */
  async delete(cardId: string): Promise<void> {
    try {
      await this.cardModel.deleteOne({ id: cardId });
    } catch (error) {
      this.logger.error(`Error deleting card: ${cardId}`, error);
      throw error;
    }
  }
}
