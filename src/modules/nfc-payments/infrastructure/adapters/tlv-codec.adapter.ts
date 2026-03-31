/**
 * Infrastructure Adapter: TlvCodecAdapter
 *
 * Implementación de codificación/decodificación TLV (Tag-Length-Value)
 * para payloads de pago NFC. Tag: 1 byte, Length: 2 bytes UInt16BE, Value: N bytes.
 */

import { Injectable, Logger } from '@nestjs/common';

import { ITlvCodecPort, TlvField } from '../../domain/ports/tlv-codec.port';

@Injectable()
export class TlvCodecAdapter implements ITlvCodecPort {
  private readonly logger = new Logger(TlvCodecAdapter.name);

  encode(fields: TlvField[]): Buffer {
    const buffers: Buffer[] = [];
    const sorted = [...fields].sort((a, b) => a.tag - b.tag);

    for (const field of sorted) {
      const tagBuf = Buffer.alloc(1);
      tagBuf.writeUInt8(field.tag, 0);

      const lenBuf = Buffer.alloc(2);
      lenBuf.writeUInt16BE(field.value.length, 0);

      buffers.push(tagBuf, lenBuf, field.value);
    }

    return Buffer.concat(buffers);
  }

  decode(buffer: Buffer): TlvField[] {
    const fields: TlvField[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      const tag = buffer.readUInt8(offset);
      offset += 1;

      const length = buffer.readUInt16BE(offset);
      offset += 2;

      const value = buffer.subarray(offset, offset + length);
      offset += length;

      fields.push({ tag, value: Buffer.from(value) });
    }

    return fields;
  }
}
