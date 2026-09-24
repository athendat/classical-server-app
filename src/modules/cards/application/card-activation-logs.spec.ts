import { HttpStatus } from '@nestjs/common';
import { HttpService as AxiosHttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { HttpService } from 'src/common/http/http.service';
import { captureLogs, findLeakedSecrets, LogCapture } from 'src/common/testing/log-capture';
import { Result } from 'src/common/types/result.type';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { UsersRepository } from 'src/modules/users/infrastructure/adapters';

import { CardsService } from './cards.service';
import { CardStatusEnum, CardTypeEnum } from '../domain/enums';
import { CardsRepository } from '../infrastructure/adapters/card.repository';
import { CardVaultAdapter } from '../infrastructure/adapters/card-vault.adapter';
import { SgtCardAdapter } from '../infrastructure/adapters/sgt-card.adapter';
import { SgtPinblockAdapter } from '../infrastructure/adapters/sgt-pinblock.adapter';
import { Iso4PinblockService } from '../infrastructure/services/iso4-pinblock.service';

const PIN = '1234';
const PAN = '4539578763621486';
/** ISO-4 PIN block of PIN 1234 with PAN 4539578763621486 (041234FFFFFFFFFF XOR 0000578763621486) */
const ISO4_PINBLOCK = '041263789C9DEB79';
/** SGT PIN block in the clear for PIN 1234: "00" + "04" + ASCII-hex("1234") + "FF" + padding */
const SGT_PLAIN_PINBLOCK = '000431323334FF000000000000000000';
const PIN_ASCII_HEX = '31323334';
const ID_NUMBER = '85010112345';
const TML = '00012345';
const AUT = '654321';
const CARD_TOKEN = '0400000000701851';
const SGT_AES_KEY = '00112233445566778899aabbccddeeff';
const SGT_AES_IV = 'aabbccddeeff00112233445566778899';
const SGT_HMAC_SECRET = 'sgt-hmac-secret-value';
const SGT_API_KEY = 'sgt-api-key-value';

const SGT_CONFIG: Record<string, string> = {
  SGT_URL: 'https://sgt.test',
  SGT_HMAC_SECRET,
  SGT_CLIENT_ID: 'client-id',
  SGT_API_KEY,
  SGT_AES_KEY,
  SGT_AES_IV,
};

describe('Card activation writes no Card secret to the logs', () => {
  let service: CardsService;
  let axios: { post: jest.Mock };
  let auditService: { logAllow: jest.Mock; logError: jest.Mock };
  let cardVaultAdapter: Record<string, jest.Mock>;
  let cardsRepository: Record<string, jest.Mock>;
  let logs: LogCapture;

  beforeEach(async () => {
    axios = {
      post: jest.fn(() =>
        of({
          data: {
            ok: true,
            message: 'Activación exitosa',
            data: { activationCode: 'AP000', token: CARD_TOKEN, balance: '10000' },
          },
        }),
      ),
    };
    auditService = { logAllow: jest.fn(), logError: jest.fn() };
    cardVaultAdapter = {
      savePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
      deletePanAndPinblock: jest.fn().mockResolvedValue(Result.ok()),
      getPan: jest.fn().mockResolvedValue(Result.ok(PAN)),
      getPinblock: jest.fn().mockResolvedValue(Result.ok(ISO4_PINBLOCK)),
    };
    cardsRepository = {
      findByUserId: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (card) => ({ ...card, createdAt: new Date() })),
      findById: jest.fn(),
      update: jest.fn(async (id, updates) => ({ ...(await cardsRepository.findById(id)), ...updates })),
    };

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key in SGT_CONFIG) return SGT_CONFIG[key];
        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;
    const iso4PinblockService = new Iso4PinblockService();
    const sgtCardAdapter = new SgtCardAdapter(
      new HttpService(axios as unknown as AxiosHttpService),
      configService,
      new SgtPinblockAdapter(configService),
      iso4PinblockService,
    );

    const module = await Test.createTestingModule({
      providers: [
        CardsService,
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-1'),
            getActorId: jest.fn().mockReturnValue('user-1'),
          },
        },
        { provide: AuditService, useValue: auditService },
        { provide: CardsRepository, useValue: cardsRepository },
        { provide: CardVaultAdapter, useValue: cardVaultAdapter },
        { provide: Iso4PinblockService, useValue: iso4PinblockService },
        {
          provide: UsersRepository,
          useValue: { findByIdRaw: jest.fn().mockResolvedValue({ idNumber: ID_NUMBER }) },
        },
        { provide: INJECTION_TOKENS.CARD_SGT_PORT, useValue: sgtCardAdapter },
      ],
    }).compile();

    service = module.get(CardsService);
    // After compile(): the testing module overrides the Nest logger on compile
    logs = captureLogs();
  });

  afterEach(() => {
    logs.restore();
  });

  const secretsSentTo = (sgtBody: Record<string, string>): Record<string, string> => ({
    PIN,
    'PIN in ASCII-hex': PIN_ASCII_HEX,
    'ISO-4 PIN block': ISO4_PINBLOCK,
    'SGT PIN block in the clear': SGT_PLAIN_PINBLOCK,
    'SGT encrypted PIN block': sgtBody.pin,
    PAN,
    idNumber: ID_NUMBER,
    TML,
    AUT,
    'Card token': CARD_TOKEN,
    SGT_AES_KEY,
    SGT_AES_IV,
    SGT_HMAC_SECRET,
    SGT_API_KEY,
  });

  it('registering a Card with the SGT logs neither the PIN, its PIN blocks, the PAN, idNumber, TML, AUT nor the Card token', async () => {
    const response = await service.registerCard({
      pan: PAN,
      pin: PIN,
      expiryMonth: 12,
      expiryYear: 2028,
      cardType: CardTypeEnum.PERSONAL,
      tml: TML,
      aut: AUT,
    } as any);

    expect(response.statusCode).toBe(HttpStatus.CREATED);
    expect(cardVaultAdapter.savePanAndPinblock).toHaveBeenCalledWith(expect.any(String), PAN, ISO4_PINBLOCK);
    const sgtBody = axios.post.mock.calls[0][1];
    expect(sgtBody).toEqual(expect.objectContaining({ pan: PAN, idNumber: ID_NUMBER, tml: TML, aut: AUT }));
    expect(sgtBody.pin).toMatch(/^[0-9A-F]{32}$/);

    const logText = logs.text(auditService.logAllow.mock.calls, auditService.logError.mock.calls);
    expect(findLeakedSecrets(logText, secretsSentTo(sgtBody))).toEqual([]);
  });

  it('retrying the activation of a REGISTERED Card logs no Card secret either', async () => {
    cardsRepository.findById.mockResolvedValue({
      id: 'card-1',
      userId: 'user-1',
      status: CardStatusEnum.REGISTERED,
      lastFour: '1486',
      expiryMonth: 12,
      expiryYear: 2028,
      tml: TML,
      aut: AUT,
      token: CARD_TOKEN,
    });

    const response = await service.retryActivation('card-1');

    expect(response.statusCode).toBe(HttpStatus.OK);
    const sgtBody = axios.post.mock.calls[0][1];
    expect(sgtBody).toEqual(expect.objectContaining({ pan: PAN, token: CARD_TOKEN }));

    const logText = logs.text(auditService.logAllow.mock.calls, auditService.logError.mock.calls);
    expect(findLeakedSecrets(logText, secretsSentTo(sgtBody))).toEqual([]);
  });
});
