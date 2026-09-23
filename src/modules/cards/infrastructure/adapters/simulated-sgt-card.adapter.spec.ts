import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { CardsService } from '../../application/cards.service';
import { CreateCardDto } from '../../dto/create-card.dto';
import { CardStatusEnum, CardTypeEnum } from '../../domain/enums';
import { CardsRepository } from './card.repository';
import { CardVaultAdapter } from './card-vault.adapter';
import { Iso4PinblockService } from '../services/iso4-pinblock.service';
import { SimulatedSgtCardAdapter } from './simulated-sgt-card.adapter';

/**
 * Issue #60 — SGT_MODE=simulated: the Issuer is simulated behind the
 * CARD_SGT_PORT; everything else runs for real.
 */

const fakeConfig = (values: Record<string, string | undefined> = {}) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

describe('SimulatedSgtCardAdapter — Card activation through CardsService', () => {
  const createCardDto: CreateCardDto = {
    pan: '4242424242424242',
    pin: '1234',
    expiryMonth: 12,
    expiryYear: 26,
    cardType: CardTypeEnum.PERSONAL,
    ticketReference: 'TICKET-123',
    tml: 'TML-1',
    aut: 'AUT-1',
  } as CreateCardDto;

  async function buildCardsService(config: ConfigService) {
    const cardsRepository = {
      findByUserId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (card) => ({
        ...card,
        createdAt: new Date('2026-09-23T00:00:00.000Z'),
      })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-1'),
            getActorId: jest.fn().mockReturnValue('user-1'),
          },
        },
        { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn() } },
        { provide: CardsRepository, useValue: cardsRepository },
        {
          provide: CardVaultAdapter,
          useValue: {
            savePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
            deletePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
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
          useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: '85010112345' }) },
        },
        {
          provide: INJECTION_TOKENS.CARD_SGT_PORT,
          useValue: new SimulatedSgtCardAdapter(config),
        },
      ],
    }).compile();

    return { service: module.get(CardsService), cardsRepository };
  }

  it('activates the Card (AP000) with a Card token and the configured initial Balance', async () => {
    const { service, cardsRepository } = await buildCardsService(
      fakeConfig({ SGT_SIMULATED_INITIAL_BALANCE: '250000' }),
    );

    const response = await service.registerCard(createCardDto);

    expect(response.ok).toBe(true);
    const persisted = cardsRepository.create.mock.calls[0][0];
    expect(persisted.status).toBe(CardStatusEnum.ACTIVE);
    expect(typeof persisted.token).toBe('string');
    expect(persisted.token.length).toBeGreaterThan(0);
    // 250000 minor units → 2500.00 major units (ADR-0008)
    expect(persisted.balance).toBe(2500);
  });

  it('answers activation with AP000 and a Card token that is deterministic per Card', async () => {
    const adapter = new SimulatedSgtCardAdapter(fakeConfig());

    const first = await adapter.activatePin('card-A', '4242424242424242', 'pb', '85010112345', 't', 'a');
    const again = await adapter.activatePin('card-A', '4242424242424242', 'pb', '85010112345', 't', 'a');
    const other = await adapter.activatePin('card-B', '4242424242424242', 'pb', '85010112345', 't', 'a');

    expect(first.getValue().data?.activationCode).toBe('AP000');
    expect(first.getValue().data?.token).toBe(again.getValue().data?.token);
    expect(first.getValue().data?.token).not.toBe(other.getValue().data?.token);
  });
});
