/**
 * Controller: NfcPrepareController
 *
 * HTTP endpoint for preparing NFC payment sessions.
 * Called by the mobile app when the user opens the "Pay" screen.
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { NfcPrepareService } from '../../application/nfc-prepare.service';
import { NfcPrepareRequestDto } from '../../dto/nfc-prepare-request.dto';
import { NfcPrepareResponseDto } from '../../dto/nfc-prepare-response.dto';

@Controller('payment-tokens')
@ApiTags('NFC Payments')
@ApiBearerAuth('Bearer Token')
@UseGuards(JwtAuthGuard)
export class NfcPrepareController {
  constructor(private readonly prepareService: NfcPrepareService) {}

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare an NFC payment session',
    description:
      'Creates a payment session with a nonce, counter, and timestamp for the mobile app to build a signed NFC payment token.',
  })
  @ApiBody({ type: NfcPrepareRequestDto })
  @ApiOkResponse({
    description: 'Payment session prepared successfully',
    type: NfcPrepareResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid request data or card ID' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiNotFoundResponse({ description: 'Card not found or not enrolled for NFC' })
  @ApiInternalServerErrorResponse({ description: 'Error preparing payment session' })
  async prepare(
    @Body() dto: NfcPrepareRequestDto,
    @Request() req: any,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.prepareService.preparePaymentSession(
      req.user.actorId,
      dto.cardId,
    );
    return res.status(HttpStatus.OK).json({
      ok: true,
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Payment session prepared',
    });
  }
}
