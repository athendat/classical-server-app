import { ConfigService } from '@nestjs/config';
import { createCipheriv } from 'crypto';

import { SgtPinblockAdapter } from './sgt-pinblock.adapter';

describe('SgtPinblockAdapter', () => {
  // Known test key and IV (16 bytes each, represented as 32 hex chars)
  const TEST_KEY = '00112233445566778899aabbccddeeff';
  const TEST_IV = 'aabbccddeeff00112233445566778899';

  let adapter: SgtPinblockAdapter;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SGT_AES_KEY') return TEST_KEY;
        if (key === 'SGT_AES_IV') return TEST_IV;
        throw new Error(`Unknown key: ${key}`);
      }),
    } as unknown as ConfigService;

    adapter = new SgtPinblockAdapter(configService);
  });

  describe('encode', () => {
    it('should encode PIN "1234" correctly', () => {
      const result = adapter.encode('1234');

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe('000431323334FF000000000000000000');
    });

    it('should encode PIN "123456" correctly', () => {
      const result = adapter.encode('123456');

      expect(result.isSuccess).toBe(true);
      const value = result.getValue();
      // "00" + "06" + "313233343536" + "FF" + padding
      expect(value).toBe('0006313233343536FF00000000000000');
      expect(value).toHaveLength(32);
    });

    it('should encode PIN "0000" correctly (all zeros)', () => {
      const result = adapter.encode('0000');

      expect(result.isSuccess).toBe(true);
      // '0' = 0x30
      expect(result.getValue()).toBe('000430303030FF000000000000000000');
    });

    it('should encode 5-digit PIN correctly', () => {
      const result = adapter.encode('12345');

      expect(result.isSuccess).toBe(true);
      const value = result.getValue();
      // "00" + "05" + "3132333435" + "FF" + padding
      expect(value).toBe('00053132333435FF0000000000000000');
      expect(value).toHaveLength(32);
    });

    it('should fail for PIN shorter than 4 digits', () => {
      const result = adapter.encode('12');

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('4-6 digits');
    });

    it('should fail for PIN longer than 6 digits', () => {
      const result = adapter.encode('1234567');

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('4-6 digits');
    });

    it('should fail for empty PIN', () => {
      const result = adapter.encode('');

      expect(result.isFailure).toBe(true);
    });

    it('should fail for non-numeric PIN', () => {
      const result = adapter.encode('12ab');

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('only digits');
    });

    it('should always produce a 32-character output', () => {
      for (const pin of ['1234', '12345', '123456']) {
        const result = adapter.encode(pin);
        expect(result.isSuccess).toBe(true);
        expect(result.getValue()).toHaveLength(32);
      }
    });
  });

  describe('encrypt', () => {
    it('should encrypt a pinblock with AES-128-CBC and return hex', () => {
      const pinblock = '000431323334FF000000000000000000';
      const result = adapter.encrypt(pinblock);

      expect(result.isSuccess).toBe(true);

      // Verify by decrypting with the same key/IV
      const encrypted = result.getValue();
      expect(encrypted).toMatch(/^[0-9A-F]+$/);

      // Cross-check: encrypt manually and compare
      const key = Buffer.from(TEST_KEY, 'hex');
      const iv = Buffer.from(TEST_IV, 'hex');
      const cipher = createCipheriv('aes-128-cbc', key, iv);
      const input = Buffer.from(pinblock, 'hex');
      const expected = Buffer.concat([cipher.update(input), cipher.final()])
        .toString('hex')
        .toUpperCase();

      expect(encrypted).toBe(expected);
    });

    it('should fail if config keys are missing', () => {
      const badConfig = {
        getOrThrow: jest.fn(() => {
          throw new Error('Missing config');
        }),
      } as unknown as ConfigService;

      const badAdapter = new SgtPinblockAdapter(badConfig);
      const result = badAdapter.encrypt('000431323334FF000000000000000000');

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('Missing config');
    });
  });

  describe('encodeAndEncrypt', () => {
    it('should encode and encrypt PIN "1234" in one step', () => {
      const result = adapter.encodeAndEncrypt('1234');

      expect(result.isSuccess).toBe(true);

      // Verify it matches encoding then encrypting separately
      const encoded = adapter.encode('1234').getValue();
      const encrypted = adapter.encrypt(encoded).getValue();
      expect(result.getValue()).toBe(encrypted);
    });

    it('should propagate encode errors', () => {
      const result = adapter.encodeAndEncrypt('12');

      expect(result.isFailure).toBe(true);
      expect(result.getError().message).toContain('4-6 digits');
    });

    it('should propagate encrypt errors', () => {
      const badConfig = {
        getOrThrow: jest.fn((key: string) => {
          throw new Error('Missing config');
        }),
      } as unknown as ConfigService;

      const badAdapter = new SgtPinblockAdapter(badConfig);
      const result = badAdapter.encodeAndEncrypt('1234');

      expect(result.isFailure).toBe(true);
    });
  });
});
