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
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { NfcPrepareService } from '../../application/nfc-prepare.service';
import { NfcPrepareRequestDto } from '../../dto/nfc-prepare-request.dto';

@Controller('payment-tokens')
@ApiBearerAuth('Bearer Token')
@UseGuards(JwtAuthGuard)
export class NfcPrepareController {
  constructor(private readonly prepareService: NfcPrepareService) {}

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare an NFC payment session' })
  async prepare(
    @Body() dto: NfcPrepareRequestDto,
    @Request() req: any,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.prepareService.preparePaymentSession(
      req.user.userId,
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
