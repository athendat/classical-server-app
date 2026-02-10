import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { ICardPort } from '../../domain/ports/card.port';
import { CardStatusEnum } from '../../domain/enums';
import { Card, CardDocument } from '../schemas/card.schema';
import { MongoDbUsersRepository } from 'src/modules/users/infrastructure/adapters';

/**
 * Repositorio de Cards implementando el puerto ICardPort
 * Encapsula todas las operaciones de MongoDB para tarjetas
 */
@Injectable()
export class CardsRepository implements ICardPort {
  private readonly logger = new Logger(CardsRepository.name);

  constructor(
    @InjectModel(Card.name)
    private readonly cardModel: Model<CardDocument>,
    private readonly usersRepository: MongoDbUsersRepository,
  ) { }

  /**
   * Crear una nueva tarjeta
   */
  async create(cardData: Partial<Card>): Promise<Card> {
    try {
      const newCard = new this.cardModel(cardData);
      const savedCard = await newCard.save();
      return savedCard.toObject() as Card;
    } catch (error: any) {
      this.logger.error('Error creating card', error);
      throw error;
    }
  }

  /**
   * Buscar una tarjeta por su ID
   */
  async findById(cardId: string): Promise<Card | null> {
    try {
      const card = await this.cardModel.findOne({ id: cardId })
        .populate([
          {
            path: 'customer',
            model: 'User',
            select: {
              _id: 0,
              id: 1,
              fullname: 1,
              idNumber: 1,
              phone: 1,
              email: 1
            },
          },
          {
            path: 'lastTransactions',
            model: 'TransactionSchema',
            select: {
              _id: 0,
              cardId: 0,
              id: 1,
              status: 1,
              amount: 1,
              tenantName: 1,
              createdAt: 1
            },
          }
        ])
        .lean();
      return card as Card | null;
    } catch (error: any) {
      this.logger.error(`Error finding card by id: ${cardId}`, error);
      return null;
    }
  }

  /**
   * Buscar tarjetas por usuario
   */
  async findByUserId(userId: string): Promise<Card[] | null> {
    try {
      const cards = await this.cardModel.find({ userId })
        .populate({
          path: 'lastTransactions',
          model: 'TransactionSchema',
          select: {
            _id: 0,
            cardId: 0,
            id: 1,
            no: 1,
            ref: 1,
            status: 1,
            amount: 1,
            tenantName: 1,
            createdAt: 1
          },
        })
        .lean();
      return cards as Card[] | null;
    } catch (error: any) {
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
  ): Promise<{
    data: Card[];
    total: number,
    meta?: Record<string, any>;
  }> {
    try {
      this.logger.log(
        `Finding Cards with filter: ${JSON.stringify(filter)}, skip=${options.skip}, limit=${options.limit}`,
      );

      // Ejecutar query en paralelo: obtener documentos y contar total
      const [cards, total, active, blocked, expired] = await Promise.all([
        this.cardModel
          .find(filter as any)
          .sort((options.sort || { createdAt: -1 }) as any)
          .skip(options.skip)
          .limit(options.limit)
          .populate({
            path: 'customer',
            model: 'User',
            select: { _id: 0, id: 1, fullname: 1 }
          })
          .lean()
          .exec(),
        this.cardModel.countDocuments(filter as any).exec(),
        this.cardModel.countDocuments({ status: CardStatusEnum.ACTIVE } as any).exec(),
        this.cardModel.countDocuments({ status: CardStatusEnum.BLOCKED } as any).exec(),
        this.cardModel.countDocuments({ status: CardStatusEnum.EXPIRED } as any).exec(),
      ]);

      this.logger.log(
        `Found ${cards.length} Cards (total: ${total}, skip: ${options.skip}, limit: ${options.limit})`,
      );

      // Obtener listado de todos los clientes que están en las transacciones listadas (para evitar N+1)
      const customerIds = Array.from(new Set(cards.map((t) => t.userId).filter((id) => id !== undefined))) as string[];
      const customers = customerIds.length ? await this.usersRepository.findByIds(customerIds) : [];

      return {
        data: cards as Card[],
        total,
        meta: {
          active,
          blocked,
          expired,
          customers
        }
      };
    } catch (error: any) {
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
   * Obtener tarjetas por una lista de IDs.
   * @param ids 
   * @returns 
   */
  async findByIds(ids: string[]): Promise<Card[]> {
    return this.cardModel
      .find({ id: { $in: ids } })
      .select(
        {
          _id: 0,
          id: 1,
          cardType: 1,
          lastFour: 1,
        },
      )
      .exec();
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      this.logger.error(`Error deleting card: ${cardId}`, error);
      throw error;
    }
  }
}
