import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('src/modules/audit/application/audit.service', () => ({
  AuditService: class AuditService {
    logAllow = jest.fn();
    logError = jest.fn();
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('card-123'),
}));

jest.mock('src/modules/users/infrastructure/adapters', () => ({
  UsersRepository: class UsersRepository {
    findByIdRaw = jest.fn();
  },
}));

jest.mock('../infrastructure/adapters/card.repository', () => ({
  CardsRepository: class CardsRepository {
    findByUserId = jest.fn();
    create = jest.fn();
  },
}));

jest.mock('../infrastructure/adapters/card-vault.adapter', () => ({
  CardVaultAdapter: class CardVaultAdapter {
    savePanAndPinblock = jest.fn();
    deletePanAndPinblock = jest.fn();
  },
}));

jest.mock('../infrastructure/services/iso4-pinblock.service', () => ({
  Iso4PinblockService: class Iso4PinblockService {
    convertToIso4Pinblock = jest.fn();
  },
}));

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { CardsService } from './cards.service';
import { CreateCardDto } from '../dto/create-card.dto';
import { CardStatusEnum, CardTypeEnum } from '../domain/enums';
import { CardsRepository } from '../infrastructure/adapters/card.repository';
import { CardVaultAdapter } from '../infrastructure/adapters/card-vault.adapter';
import { Iso4PinblockService } from '../infrastructure/services/iso4-pinblock.service';

describe('CardsService', () => {
  let service: CardsService;
  let cardsRepository: jest.Mocked<CardsRepository>;
  let cardVaultAdapter: jest.Mocked<CardVaultAdapter>;
  let sgtCardPort: {
    activatePin: jest.Mock;
  };
  let auditService: jest.Mocked<AuditService>;

  const createCardDto: CreateCardDto = {
    pan: '4242424242424242',
    pin: '1234',
    expiryMonth: 12,
    expiryYear: 26,
    cardType: CardTypeEnum.PERSONAL,
    ticketReference: 'TICKET-123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-123'),
            getActorId: jest.fn().mockReturnValue('user-123'),
          },
        },
        {
          provide: AuditService,
          useValue: {
            logAllow: jest.fn(),
            logError: jest.fn(),
          },
        },
        {
          provide: CardsRepository,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: CardVaultAdapter,
          useValue: {
            savePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
            deletePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
            getPan: jest.fn().mockResolvedValue(Result.ok('4242424242424242')),
            getPinblock: jest.fn().mockResolvedValue(Result.ok('pinblock')),
          },
        },
        {
          provide: Iso4PinblockService,
          useValue: {
            convertToIso4Pinblock: jest.fn().mockReturnValue(Result.ok('pinblock')),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findByIdRaw: jest.fn().mockResolvedValue({ idNumber: '12345678' }),
          },
        },
        {
          provide: INJECTION_TOKENS.CARD_SGT_PORT,
          useValue: {
            activatePin: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
    cardsRepository = module.get(CardsRepository);
    cardVaultAdapter = module.get(CardVaultAdapter);
    sgtCardPort = module.get(INJECTION_TOKENS.CARD_SGT_PORT);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('answers 502 with the AP004 message, rolls Vault back and saves no Card when the Issuer gives no answer', async () => {
    sgtCardPort.activatePin.mockResolvedValue(
      Result.fail(new Error('No se recibió respuesta del servidor')),
    );

    const response = await service.registerCard(createCardDto);

    expect(response.ok).toBe(false);
    expect(response.statusCode).toBe(HttpStatus.BAD_GATEWAY);
    expect(response.errors).toBe('Error de comunicación');
    expect(response.message).toBe('No se pudo establecer comunicación con el emisor');
    expect(JSON.stringify(response)).not.toContain('No se recibió respuesta');
    expect(cardsRepository.create).not.toHaveBeenCalled();
    expect(cardVaultAdapter.deletePanAndPinblock).toHaveBeenCalledTimes(1);
    expect(auditService.logError).toHaveBeenCalledWith(
      'SGT_ACTIVATE_PIN_FAILED',
      'card',
      expect.any(String),
      expect.any(Error),
      expect.objectContaining({
        module: 'cards',
        actorId: 'user-123',
      }),
    );
  });

  it('debe persistir la tarjeta solo después de una validación exitosa en SGT', async () => {
    sgtCardPort.activatePin.mockResolvedValue(
      Result.ok({ success: true, message: 'OK' }),
    );
    cardsRepository.create.mockResolvedValue({
      id: 'card-123',
      lastFour: '4242',
      expiryMonth: 12,
      expiryYear: 26,
      cardType: CardTypeEnum.PERSONAL,
      balance: 0,
      status: CardStatusEnum.ACTIVE,
      ticketReference: 'TICKET-123',
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
    } as any);

    const response = await service.registerCard(createCardDto);

    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(cardsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CardStatusEnum.ACTIVE,
        lastFour: '4242',
      }),
    );
    expect(cardVaultAdapter.deletePanAndPinblock).not.toHaveBeenCalled();
  });

  it("answers an Issuer rejection (AP001) with the controlled message, rolls Vault back and audits the Issuer's codes", async () => {
    sgtCardPort.activatePin.mockResolvedValue(
      Result.ok({
        ok: false,
        message: 'Registro rechazado por el emisor: datos inválidos',
        data: { activationCode: 'AP001', isoResponseCode: '14' },
      }),
    );

    const response = await service.registerCard(createCardDto);

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(response.errors).toBe('Registro rechazado');
    expect(response.message).toBe('El emisor rechazó el registro de la tarjeta');
    expect(JSON.stringify(response)).not.toContain('datos inválidos');
    expect(cardsRepository.create).not.toHaveBeenCalled();
    expect(cardVaultAdapter.deletePanAndPinblock).toHaveBeenCalledWith('card-123');
    expect(auditService.logError).toHaveBeenCalledWith(
      'SGT_ACTIVATE_PIN_REJECTED',
      'card',
      'card-123',
      { code: 'AP001', message: 'Registro rechazado por el emisor: datos inválidos' },
      expect.objectContaining({
        module: 'cards',
        actorId: 'user-123',
        changes: { after: { sgt: { activationCode: 'AP001', isoResponseCode: '14' } } },
      }),
    );
  });

  describe('retryActivation of a REGISTERED Card', () => {
    beforeEach(() => {
      cardsRepository.findById.mockResolvedValue({
        id: 'card-123',
        userId: 'user-123',
        status: CardStatusEnum.REGISTERED,
        tml: '00012345',
        aut: '654321',
        token: 'CARDTOKEN0001',
      } as any);
    });

    it("answers an Issuer rejection (AP001) with the controlled message and audits the Issuer's codes", async () => {
      sgtCardPort.activatePin.mockResolvedValue(
        Result.ok({
          ok: false,
          message: 'Activación rechazada por el emisor: PIN inválido',
          data: { activationCode: 'AP001', isoResponseCode: '55' },
        }),
      );

      const response = await service.retryActivation('card-123');

      expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(response.errors).toBe('Registro rechazado');
      expect(response.message).toBe('El emisor rechazó el registro de la tarjeta');
      expect(JSON.stringify(response)).not.toContain('PIN inválido');
      expect(cardsRepository.update).not.toHaveBeenCalled();
      expect(auditService.logError).toHaveBeenCalledWith(
        'SGT_RETRY_ACTIVATE_PIN_REJECTED',
        'card',
        'card-123',
        { code: 'AP001', message: 'Activación rechazada por el emisor: PIN inválido' },
        expect.objectContaining({
          module: 'cards',
          actorId: 'user-123',
          changes: { after: { sgt: { activationCode: 'AP001', isoResponseCode: '55' } } },
        }),
      );
    });
  });
});
