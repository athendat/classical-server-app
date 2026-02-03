import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { AuditService } from 'src/modules/audit/application/audit.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Iso4PinblockService } from '../infrastructure/services/iso4-pinblock.service';

import { CardRepository } from '../infrastructure/adapters/card.repository';

import type { ICardVaultPort } from '../domain/ports/card-vault.port';

import { Card } from '../infrastructure/schemas/card.schema';

import { CreateCardDto } from '../dto/create-card.dto';
import { CardResponseDto } from '../dto/card-response.dto';
import { CardStatusEnum } from '../domain/enums/card-status.enum';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { ApiResponse } from 'src/common/types/api-response.type';
import { CardVaultAdapter } from '../infrastructure/adapters';

/**
 * Card Service - Application layer for card operations
 * Handles business logic for card registration, listing, and retrieval
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly cardRepository: CardRepository,
    private readonly iso4PinblockService: Iso4PinblockService,
    private readonly cardVaultAdapter: CardVaultAdapter,
    private readonly auditService: AuditService,
    private readonly asyncContextService: AsyncContextService,
  ) {}

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
    try {
      this.logger.log(`[${requestId}] Creating card: cardType=${dto.cardType}`);

      // Step 1: Check if user already has a card of this type
      const existingCards = await this.cardRepository.findByUserId(userId);
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
      const cardId = uuidv4();

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

      // Step 6: Create document in MongoDB using repository
      const cardData: Partial<Card> = {
        id: cardId,
        userId,
        cardType: dto.cardType,
        status: CardStatusEnum.ACTIVE,
        lastFour,
        expiryMonth: dto.expiryMonth,
        expiryYear: dto.expiryYear,
        ticketReference: dto.ticketReference,
      };

      const savedCard = await this.cardRepository.create(cardData);

      // Step 7: Audit log
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

      return ApiResponse.ok<CardResponseDto>(
        HttpStatus.CREATED,
        responseDto,
        'Tarjeta creada exitosamente',
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
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
   * List all cards for a user with pagination
   */
  async listCardsForUser(id?: string): Promise<ApiResponse<CardResponseDto[]>> {
    const requestId = this.asyncContextService.getRequestId();
    const userId = id ? id :this.asyncContextService.getActorId()!;
    this.logger.debug(`[${requestId}] Fetching all cards for user=${userId}`);
    try {
      const cards = await this.cardRepository.findByUserId(userId);

      this.logger.debug(
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
    } catch (error) {
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
      cardType: card.cardType,
      balance: card.balance,
      status: card.status,
      createdAt: card.createdAt,
    };
  }
}
