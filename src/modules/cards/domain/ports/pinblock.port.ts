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
}
