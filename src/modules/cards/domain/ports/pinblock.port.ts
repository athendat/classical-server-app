import { Result } from 'src/common/types/result.type';

/**
 * Port (interface) for pinblock generation and validation.
 * Implements ISO-4 pinblock standard.
 */
export interface IPinblockService {
  /**
   * Convert PIN and PAN to ISO-4 pinblock
   * @param pin - Personal Identification Number (4-6 digits)
   * @param pan - Primary Account Number (16 digits)
   * @returns Result<string, Error> - 32 hex characters (16 bytes)
   * Format: PIN Block = (PIN_Length + PIN + Filler) XOR PAN_Block
   */
  convertToIso4Pinblock(pin: string, pan: string): Result<string, Error>;

  /**
   * Decode an ISO-4 pinblock back to the plain PIN using the PAN
   * Reverses the XOR operation: PIN_Block = ISO4_Pinblock XOR PAN_Block
   * Then extracts the plain PIN from the resulting PIN block
   * @param pinblock - ISO-4 pinblock (16 hex characters)
   * @param pan - Primary Account Number (16 digits)
   * @returns Result<string, Error> - Plain PIN (4-6 digits)
   */
  decodeIso4Pinblock(pinblock: string, pan: string): Result<string, Error>;
}
