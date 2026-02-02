import { Injectable } from '@nestjs/common';
import { Result } from 'src/common/types/result.type';
import { IPinblockService } from '../../domain/ports/pinblock.port';

/**
 * ISO-4 Pinblock service
 * Converts PIN + PAN to ISO-4 format pinblock (16 bytes = 32 hex chars)
 * Format: PIN Block = (PIN_Length + PIN + Filler) XOR PAN_Block
 */
@Injectable()
export class Iso4PinblockService implements IPinblockService {
  /**
   * Convert PIN and PAN to ISO-4 pinblock
   * @param pin - 4-6 digit PIN
   * @param pan - 16 digit PAN
   * @returns Result<string, Error> - 32 hex characters or error
   */
  convertToIso4Pinblock(pin: string, pan: string): Result<string, Error> {
    try {
      // Validate inputs
      if (!pin || pin.length < 4 || pin.length > 6) {
        return Result.fail(new Error('PIN must be between 4 and 6 digits'));
      }

      if (!pan || pan.length !== 16 || !/^\d+$/.test(pan)) {
        return Result.fail(new Error('PAN must be 16 digits'));
      }

      // Step 1: Build PIN block (8 bytes / 16 hex chars)
      // Format: [PIN_Length (1 nibble) + PIN (variable) + Filler (to reach 8 bytes)]
      const pinLength = pin.length;
      let pinBlock = '0' + pinLength.toString(16); // First nibble: 0, second: length

      // Pad PIN with leading 0 if odd length
      const paddedPin = pin.length % 2 === 1 ? '0' + pin : pin;
      pinBlock += paddedPin;

      // Pad with 'F' to reach 16 hex chars (8 bytes)
      while (pinBlock.length < 16) {
        pinBlock += 'F';
      }

      // Step 2: Build PAN block from PAN (last 12 digits, rightmost 12 of 16)
      // Extract rightmost 12 digits
      const panSuffix = pan.slice(-12);
      // Pad with '0' to left to make 16 hex chars (8 bytes)
      const panBlock = '0000' + panSuffix;

      // Step 3: XOR pinBlock and panBlock
      const pinBlockBytes = Buffer.from(pinBlock, 'hex');
      const panBlockBytes = Buffer.from(panBlock, 'hex');

      const xorResult = Buffer.alloc(8);
      for (let i = 0; i < 8; i++) {
        xorResult[i] = pinBlockBytes[i] ^ panBlockBytes[i];
      }

      const iso4Pinblock = xorResult.toString('hex').toUpperCase();

      return Result.ok(iso4Pinblock);
    } catch (error) {
      return Result.fail(
        new Error(
          `Failed to convert to ISO-4 pinblock: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}
