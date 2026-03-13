import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AuditService } from 'src/modules/audit/application/audit.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Iso4PinblockService } from '../infrastructure/services/iso4-pinblock.service';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

import { CardsRepository } from '../infrastructure/adapters/card.repository';
import { CardVaultAdapter } from '../infrastructure/adapters';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { Card } from '../infrastructure/schemas/card.schema';

import { CreateCardDto } from '../dto/create-card.dto';
import { CardResponseDto } from '../dto/card-response.dto';

import { CardStatusEnum } from '../domain/enums/card-status.enum';
import { ApiResponse } from 'src/common/types/api-response.type';
import { PaginationMeta, QueryParams } from 'src/common/types';
import { buildMongoQuery } from 'src/common/helpers';
import type { ISgtCardPort } from '../domain/ports/sgt-card.port';
import { ACTIVATION_CODES } from '../domain/constants/activation-codes.constant';

/**
 * Card Service - Application layer for card operations
 * Handles business logic for card registration, listing, and retrieval
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly asyncContextService: AsyncContextService,
    private readonly auditService: AuditService,
    private readonly cardsRepository: CardsRepository,
    private readonly cardVaultAdapter: CardVaultAdapter,
    private readonly iso4PinblockService: Iso4PinblockService,
    private readonly usersRepository: UsersRepository,
    @Inject(INJECTION_TOKENS.CARD_SGT_PORT)
    private readonly sgtCardPort: ISgtCardPort,
  ) { }

  /**
   * Register a new card for a user
   * Vault-First pattern: save secrets first, then create document
   */
  async registerCard(
    dto: CreateCardDto,
  ): Promise<ApiResponse<CardResponseDto>> {
    // ⭐ OBTENER del contexto en lugar de generar
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    let cardId: string | null = null;
    let vaultSaved = false;
    try {
      this.logger.log(`[${requestId}] Creating card: cardType=${dto.cardType}`);

      // Step 1: Check if user already has a card of this type
      const existingCards = await this.cardsRepository.findByUserId(userId);
      const cardTypeExists = existingCards?.some(
        (card) => card.cardType === dto.cardType,
      );

      if (cardTypeExists) {
        const errorMsg = `Card already exists with cardType: ${dto.cardType.toLowerCase()}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.CONFLICT,
          'El usuario ya tiene una tarjeta de este tipo registrada',
          'Tarjeta duplicada',
        );
      }

      // Step 2: Extract last four digits
      const lastFour = dto.pan.slice(-4);

      // Step 3: Generate card ID
      cardId = uuidv4();

      // Step 4: Convert PIN to ISO-4 pinblock
      const pinblockResult = this.iso4PinblockService.convertToIso4Pinblock(
        dto.pin,
        dto.pan,
      );

      if (pinblockResult.isFailure) {
        this.logger.error('Failed to convert PIN to pinblock');
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error al generar pinblock',
          'Error interno',
        );
      }

      const pinblock = pinblockResult.getValue();

      // Step 5: Save to Vault (Vault-First)
      const vaultResult = await this.cardVaultAdapter.savePanAndPinblock(
        cardId,
        dto.pan,
        pinblock,
      );

      if (vaultResult.isFailure) {
        this.logger.error('Failed to save PAN to Vault');
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Error al almacenar PAN en Vault',
          'Error interno',
        );
      }

      vaultSaved = true;

      // Step 6: Verify card with SGT (módulo emisor)
      this.logger.log(`[${requestId}] Calling SGT to verify cardId=${cardId}`);

      const resolveUser = await this.usersRepository.findByIdRaw(userId);

      const sgtResult = await this.sgtCardPort.activatePin(
        cardId,
        dto.pan,
        pinblock,
        resolveUser!.idNumber,
        dto.tml,
        dto.aut,
      );

      if (sgtResult.isFailure) {
        const sgtError = sgtResult.getError();

        this.logger.warn(
          `[${requestId}] SGT rejected card ${cardId}: ${sgtError.message}`,
        );

        this.auditService.logError(
          'SGT_ACTIVATE_PIN_FAILED',
          'card',
          cardId,
          sgtError,
          {
            module: 'cards',
            severity: 'HIGH',
            tags: ['card', 'sgt', 'verification', 'failed'],
            actorId: userId,
          },
        );

        await this.rollbackVaultSecrets(cardId, requestId, userId);

        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.BAD_REQUEST,
          sgtError.message,
          'La tarjeta no pudo ser registrada',
        );
      }

      const sgtResponse = sgtResult.getValue();
      const activationCode = sgtResponse.data?.activationCode;

      this.logger.log(
        `[${requestId}] SGT responded for card ${cardId}: activationCode=${activationCode}`,
      );

      // AP001: Registro rechazado por el emisor
      if (activationCode === ACTIVATION_CODES.AP001.code) {
        this.logger.warn(`[${requestId}] SGT registration rejected for card ${cardId}`);
        await this.rollbackVaultSecrets(cardId, requestId, userId);
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.BAD_REQUEST,
          ACTIVATION_CODES.AP001.message,
          ACTIVATION_CODES.AP001.description,
        );
      }

      // AP004: Error de comunicación con el emisor
      if (activationCode === ACTIVATION_CODES.AP004.code) {
        this.logger.error(`[${requestId}] SGT communication error for card ${cardId}`);
        await this.rollbackVaultSecrets(cardId, requestId, userId);
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.BAD_GATEWAY,
          ACTIVATION_CODES.AP004.message,
          ACTIVATION_CODES.AP004.description,
        );
      }

      // Determinar estado según código de activación
      // AP002: Registro exitoso, activación fallida → REGISTERED (reintento pendiente)
      // AP000/AP003: Activación exitosa → ACTIVE
      const isRegisteredOnly = activationCode === ACTIVATION_CODES.AP002.code;
      const cardStatus = isRegisteredOnly
        ? CardStatusEnum.REGISTERED
        : CardStatusEnum.ACTIVE;

      // Parsear balance si viene en la respuesta (viene en centavos como string)
      const sgtBalance = sgtResponse.data?.balance
        ? parseInt(sgtResponse.data.balance, 10) || 0
        : 0;

      this.logger.log(
        `[${requestId}] SGT card ${cardId} → ${cardStatus}${isRegisteredOnly ? ' (pendiente reintento activación)' : ''}`,
      );

      // Step 7: Create document in MongoDB after SGT response
      const cardData: Partial<Card> = {
        id: cardId,
        userId,
        cardType: dto.cardType,
        status: cardStatus,
        lastFour,
        expiryMonth: dto.expiryMonth,
        expiryYear: dto.expiryYear,
        tml: dto.tml,
        aut: dto.aut,
        token: sgtResponse.data?.token,
        balance: sgtBalance,
      };

      const savedCard = await this.cardsRepository.create(cardData);

      // Step 8: Audit log
      this.auditService.logAllow('CREATE_CARD', 'card', cardId, {
        module: 'cards',
        severity: 'LOW',
        tags: ['card', 'read', 'list', 'successful'],
        actorId: userId,
        changes: {
          after: {
            card: savedCard,
          },
        },
      });

      const responseDto = this.mapCardToResponse(savedCard);

      const responseMessage = isRegisteredOnly
        ? ACTIVATION_CODES.AP002.message
        : 'Tarjeta creada exitosamente';

      return ApiResponse.ok<CardResponseDto>(
        HttpStatus.CREATED,
        responseDto,
        responseMessage,
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (vaultSaved && cardId) {
        await this.rollbackVaultSecrets(cardId, requestId, userId);
      }

      this.logger.error(
        `[${requestId}] Failed to create card: ${errorMsg}`,
        error,
      );

      this.auditService.logError(
        'CARD_CREATION_FAILED',
        'card',
        'unknown',
        error instanceof Error ? error : new Error(String(error)),
        {
          module: 'cards',
          severity: 'HIGH',
          tags: ['card', 'creation', 'error'],
          actorId: userId,
        },
      );

      return ApiResponse.fail<CardResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Error interno del servidor',
        'Error desconocido',
      );
    }
  }

  /**
   * Get card details by ID (without sensitive data)
   * Includes last transactions and customer info via virtuals
   * @param id - ID of the card to retrieve
   */
  async findById(id: string): Promise<ApiResponse<CardResponseDto | null>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    this.logger.log(`[${requestId}] Fetching card details by user=${userId}`);
    try {
      const card = await this.cardsRepository.findById(id);

      if (!card) {
        const errorMsg = `Card not found: ${id}`;
        this.logger.warn(`[${requestId}] ${errorMsg}`);
        return ApiResponse.fail<CardResponseDto>(
          HttpStatus.NOT_FOUND,
          'Tarjeta no encontrada',
          errorMsg,
          { requestId },
        );
      }

      this.logger.log(
        `[${requestId}] Retrieved card ${id} for user ${userId}`,
      );

      // Registrar lectura exitosa
      this.auditService.logAllow('CARD_DETAILS_FETCHED', 'card', 'details', {
        module: 'cards',
        severity: 'MEDIUM',
        tags: ['card', 'read', 'details', 'successful'],
        actorId: userId,
      });

      return ApiResponse.ok<CardResponseDto>(
        HttpStatus.OK,
        this.mapCardToResponse(card),
        'Detalles de la tarjeta obtenidos',
        { requestId },
      );

    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to fetch card details: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'CARD_DETAILS_FETCHED',
        'card',
        'details',
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['card', 'read', 'details', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<CardResponseDto>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener detalles de la tarjeta',
        { requestId, id },
      );
    }
  }

  /**
   * List all cards for a user with pagination
   */
  async listCardsForUser(id?: string): Promise<ApiResponse<CardResponseDto[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = id ? id : this.asyncContextService.getActorId()!;
    this.logger.log(`[${requestId}] Fetching all cards for user=${userId}`);
    try {
      const cards = await this.cardsRepository.findByUserId(userId);

      this.logger.log(
        `[${requestId}] Retrieved ${cards?.length || 0} cards for user ${userId}`,
      );

      // Registrar lectura exitosa
      this.auditService.logAllow('CARD_LIST_FETCHED', 'card', 'list', {
        module: 'cards',
        severity: 'LOW',
        tags: ['card', 'read', 'list', 'successful'],
        actorId: userId,
        changes: {
          after: {
            count: cards?.length || 0,
          },
        },
      });

      return ApiResponse.ok<CardResponseDto[]>(
        HttpStatus.OK,
        cards?.map((card) => this.mapCardToResponse(card)) || [],
        cards ? 'Tarjetas recuperadas' : 'No se encontraron tarjetas',
        { requestId },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to fetch cards: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'CARD_LIST_FETCHED',
        'card',
        'list',
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['card', 'read', 'list', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<CardResponseDto[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener tarjetas',
        { requestId },
      );
    }
  }

  /**
   * List all cards for a user with pagination
   */
  async list(queryParams: QueryParams): Promise<ApiResponse<CardResponseDto[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = this.asyncContextService.getActorId()!;
    this.logger.log(`[${requestId}] Fetching all cards for user=${userId}`);
    try {

      // Campos permitidos para búsqueda
      const searchFields = [
        'cardType',
        'status',
        'lastFour',
        'ticketReference',
      ];

      // Construir query de MongoDB
      const { mongoFilter, options } = buildMongoQuery(
        queryParams,
        searchFields,
      );

      this.logger.log(
        `[${requestId}] MongoDB filter: ${JSON.stringify(mongoFilter)}`,
      );
      this.logger.log(
        `[${requestId}] Query options: ${JSON.stringify(options)}`,
      );

      // Ejecutar consulta directamente en MongoDB
      const { data: cards, total, meta } = await this.cardsRepository.findAll(
        mongoFilter,
        options,
      );

      const limit = options.limit;
      const page = queryParams.page || 1;
      const totalPages = Math.ceil(total / limit);
      const skip = options.skip;
      const hasMore = skip + limit < total;

      this.logger.log(
        `[${requestId}] Retrieved ${cards.length} cards from page ${page} (total: ${total})`,
      );

      // Registrar lectura exitosa
      this.auditService.logAllow('CARD_LIST_FETCHED', 'card', 'list', {
        module: 'cards',
        severity: 'LOW',
        tags: ['card', 'read', 'list', 'successful'],
        actorId: userId,
        changes: {
          after: {
            count: cards.length,
            total,
            page,
            hasMore,
          },
        },
      });

      return ApiResponse.ok<CardResponseDto[]>(
        HttpStatus.OK,
        cards.map((card) => this.mapCardToResponse(card)),
        `${cards.length} de ${total} cards encontradas`,
        {
          requestId,
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore,
          } as PaginationMeta,
          ...meta
        },
      );
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${requestId}] Failed to fetch tenants: ${errorMsg}`,
        error,
      );
      // Registrar error
      this.auditService.logError(
        'TENANT_LIST_FETCHED',
        'tenant',
        'list',
        error instanceof Error ? error : new Error(errorMsg),
        {
          severity: 'MEDIUM',
          tags: ['tenant', 'read', 'list', 'error'],
          actorId: userId,
        },
      );
      return ApiResponse.fail<CardResponseDto[]>(
        HttpStatus.INTERNAL_SERVER_ERROR,
        errorMsg,
        'Error al obtener tarjetas',
        { requestId },
      );
    }
  }

  /**
   * Mask PAN for response (last 4 digits visible)
   */
  private maskPan(lastFour: string | undefined): string {
    if (!lastFour) return '****';
    return `**** **** **** ${lastFour}`;
  }

  /**
   * Map card document to CardResponseDto
   */
  private mapCardToResponse(card: any): CardResponseDto {
    return {
      id: card.id || card._id?.toString(),
      maskedPan: this.maskPan(card.lastFour),
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      expiration: `${card.expiryMonth.toString().padStart(2, '0')}/${card.expiryYear}`,
      cardType: card.cardType,
      balance: card.balance,
      status: card.status,
      tml: card.tml,
      aut: card.aut,
      token: card.token,
      createdAt: card.createdAt,
      lastTransactions: card.lastTransactions
        ? this.convertTransactionsAmounts(card.lastTransactions)
        : undefined,
      ticketReference: card.ticketReference,
      customer: card.customer,
    };
  }

  /**
   * Convert transaction amounts from centavos to pesos (multiply by 0.01)
   * @param transactions Array of transactions with amounts in centavos
   * @returns Array of transactions with amounts in pesos
   */
  private convertTransactionsAmounts(transactions: any[]): any[] {
    return transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount * 0.01,
    }));
  }

  private async rollbackVaultSecrets(
    cardId: string,
    requestId: string,
    userId: string,
  ): Promise<void> {
    const rollbackResult = await this.cardVaultAdapter.deletePanAndPinblock(cardId);

    if (rollbackResult.isFailure) {
      const rollbackError = rollbackResult.getError();

      this.logger.error(
        `[${requestId}] Failed to rollback Vault data for cardId=${cardId}: ${rollbackError.message}`,
      );

      this.auditService.logError(
        'CARD_VAULT_ROLLBACK_FAILED',
        'card',
        cardId,
        rollbackError,
        {
          module: 'cards',
          severity: 'HIGH',
          tags: ['card', 'vault', 'rollback', 'failed'],
          actorId: userId,
        },
      );
    }
  }
}
