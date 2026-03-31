/**
 * Domain Port: TlvCodec
 *
 * Contrato para codificación/decodificación TLV (Tag-Length-Value).
 * Usado para serializar payloads de pago NFC.
 */

export interface TlvField {
  tag: number; // 1 byte (0x00-0xFF)
  value: Buffer;
}

export interface ITlvCodecPort {
  encode(fields: TlvField[]): Buffer;
  decode(buffer: Buffer): TlvField[];
}
