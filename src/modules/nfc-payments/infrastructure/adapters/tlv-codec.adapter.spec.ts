/**
 * Unit Tests: TlvCodecAdapter
 *
 * Tests for TLV (Tag-Length-Value) encoding and decoding operations.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TlvCodecAdapter } from './tlv-codec.adapter';

describe('TlvCodecAdapter (Unit Tests)', () => {
  let adapter: TlvCodecAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TlvCodecAdapter],
    }).compile();

    adapter = module.get<TlvCodecAdapter>(TlvCodecAdapter);
  });

  describe('encode', () => {
    it('should encode a single field to correct TLV bytes', () => {
      const fields = [{ tag: 0x01, value: Buffer.from('hello') }];
      const result = adapter.encode(fields);

      // tag=0x01, length=0x0005 (UInt16BE), value='hello'
      const expected = Buffer.from([0x01, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(result).toEqual(expected);
    });

    it('should encode fields sorted by tag regardless of input order', () => {
      const fields = [
        { tag: 0x03, value: Buffer.from('cc') },
        { tag: 0x01, value: Buffer.from('aa') },
      ];
      const result = adapter.encode(fields);

      // First field should be tag 0x01, then 0x03
      expect(result[0]).toBe(0x01);
      // tag(1) + len(2) + value(2) = 5 bytes for first field, second field starts at offset 5
      expect(result[5]).toBe(0x03);
    });

    it('should handle empty value', () => {
      const fields = [{ tag: 0x01, value: Buffer.alloc(0) }];
      const result = adapter.encode(fields);

      const expected = Buffer.from([0x01, 0x00, 0x00]);
      expect(result).toEqual(expected);
    });
  });

  describe('decode', () => {
    it('should decode TLV bytes back to fields', () => {
      const input = Buffer.from([0x01, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      const result = adapter.decode(input);

      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe(0x01);
      expect(result[0].value).toEqual(Buffer.from('hello'));
    });
  });

  describe('round-trip', () => {
    it('should round-trip multiple fields', () => {
      const fields = [
        { tag: 0x05, value: Buffer.from('tx-ref-001') },
        { tag: 0x01, value: Buffer.from('card-123') },
        { tag: 0x03, value: Buffer.from('USD') },
        { tag: 0x02, value: Buffer.from('1000') },
        { tag: 0x06, value: Buffer.alloc(16, 0xab) },
      ];

      const encoded = adapter.encode(fields);
      const decoded = adapter.decode(encoded);

      // Should have 5 fields, sorted by tag
      expect(decoded).toHaveLength(5);
      expect(decoded[0].tag).toBe(0x01);
      expect(decoded[0].value).toEqual(Buffer.from('card-123'));
      expect(decoded[1].tag).toBe(0x02);
      expect(decoded[1].value).toEqual(Buffer.from('1000'));
      expect(decoded[2].tag).toBe(0x03);
      expect(decoded[2].value).toEqual(Buffer.from('USD'));
      expect(decoded[3].tag).toBe(0x05);
      expect(decoded[3].value).toEqual(Buffer.from('tx-ref-001'));
      expect(decoded[4].tag).toBe(0x06);
      expect(decoded[4].value).toEqual(Buffer.alloc(16, 0xab));
    });
  });
});
