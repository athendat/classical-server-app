import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ConflictException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { CardService } from '../application/card.service';
import { CardController } from '../infrastructure/controllers/card.controller';
import { Card } from '../infrastructure/schemas/card.schema';
import { Iso4PinblockService } from '../infrastructure/services/iso4-pinblock.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { CardTypeEnum } from '../domain/enums/card-type.enum';
import { CardStatusEnum } from '../domain/enums/card-status.enum';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

describe('CardService (unit)', () => {
  let service: CardService;
  let mockCardModel: any;
  let mockCardVaultAdapter: any;
  let mockAuditService: any;
  let mockAsyncContext: any;

  beforeEach(async () => {
    // Mock Card Model
    mockCardModel = {
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      prototype: { save: jest.fn() },
    };

    // Mock Card Vault Adapter
    mockCardVaultAdapter = {
      savePanAndPinblock: jest.fn(),
    };

    // Mock Audit Service
    mockAuditService = {
      logAllow: jest.fn(),
    };

    // Mock Async Context Service
    mockAsyncContext = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardService,
        Iso4PinblockService,
        {
          provide: getModelToken(Card.name),
          useValue: mockCardModel,
        },
        {
          provide: INJECTION_TOKENS.CARD_VAULT_ADAPTER,
          useValue: mockCardVaultAdapter,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: AsyncContextService,
          useValue: mockAsyncContext,
        },
      ],
    }).compile();

    service = module.get<CardService>(CardService);
  });

  describe('registerCard', () => {
    it('should throw ConflictException if card type already exists for user', async () => {
      const userId = 'user-123';
      const createCardDto = {
        pan: '4111111111111111',
        pin: '1234',
        expiryMonth: 12,
        expiryYear: 2025,
        cardType: CardTypeEnum.PERSONAL,
        ticketReference: 'TICKET-001',
      };

      mockCardModel.findOne.mockResolvedValue({
        id: 'card-456',
        cardType: CardTypeEnum.PERSONAL,
      });

      await expect(
        service.registerCard(userId, createCardDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register a new card (Vault-First pattern)', async () => {
      const userId = 'user-123';
      const createCardDto = {
        pan: '4111111111111111',
        pin: '1234',
        expiryMonth: 12,
        expiryYear: 2025,
        cardType: CardTypeEnum.PERSONAL,
        ticketReference: 'TICKET-001',
      };

      mockCardModel.findOne.mockResolvedValue(null); // No existing card
      mockCardVaultAdapter.savePanAndPinblock.mockResolvedValue({ isSuccess: true, isFailure: false });
      mockCardModel.prototype.save = jest.fn().mockResolvedValue({
        id: 'card-789',
        userId,
        cardType: CardTypeEnum.PERSONAL,
        status: CardStatusEnum.ACTIVE,
        lastFour: '1111',
        expiryMonth: 12,
        expiryYear: 2025,
        balance: 0,
        createdAt: new Date(),
      });

      const result = await service.registerCard(userId, createCardDto);

      expect(result.statusCode).toBe(201);
      expect(result.data.mascaraPan).toBe('**** **** **** 1111');
      expect(mockCardVaultAdapter.savePanAndPinblock).toHaveBeenCalled();
      expect(mockAuditService.logAllow).toHaveBeenCalled();
    });
  });

  describe('maskPan', () => {
    it('should mask PAN correctly', () => {
      // Access private method via any type casting for testing
      const masked = (service as any).maskPan('1111');
      expect(masked).toBe('**** **** **** 1111');
    });

    it('should return default mask for empty PAN', () => {
      const masked = (service as any).maskPan(undefined);
      expect(masked).toBe('****');
    });
  });
});

describe('Iso4PinblockService (unit)', () => {
  let service: Iso4PinblockService;

  beforeEach(() => {
    service = new Iso4PinblockService();
  });

  describe('convertToIso4Pinblock', () => {
    it('should successfully convert PIN and PAN to ISO-4 pinblock', () => {
      const pin = '1234';
      const pan = '4111111111111111';

      const result = service.convertToIso4Pinblock(pin, pan);

      expect(result.isSuccess).toBe(true);
      const pinblock = result.getValue();
      expect(pinblock).toMatch(/^[0-9A-F]{32}$/); // 32 hex characters
      expect(pinblock.length).toBe(32);
    });

    it('should fail with invalid PIN (too short)', () => {
      const pin = '123';
      const pan = '4111111111111111';

      const result = service.convertToIso4Pinblock(pin, pan);

      expect(result.isFailure).toBe(true);
    });

    it('should fail with invalid PAN (not 16 digits)', () => {
      const pin = '1234';
      const pan = '41111111111111'; // 14 digits

      const result = service.convertToIso4Pinblock(pin, pan);

      expect(result.isFailure).toBe(true);
    });

    it('should produce different pinblocks for same PIN with different PANs', () => {
      const pin = '1234';
      const pan1 = '4111111111111111';
      const pan2 = '5555555555554444';

      const result1 = service.convertToIso4Pinblock(pin, pan1);
      const result2 = service.convertToIso4Pinblock(pin, pan2);

      expect(result1.getValue()).not.toBe(result2.getValue());
    });
  });
});
