/**
 * Controller: NfcAuthorizationController
 *
 * HTTP endpoint for authorizing NFC payments.
 * Called by the POS terminal after receiving a signed payment token.
 * Protected by OAuth scope guard (payments:authorize).
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation } from '@nestjs/swagger';

import { OAuthScopeGuard, RequiredScopes } from 'src/modules/oauth/infrastructure/guards/oauth-scope.guard';
import { NfcAuthorizationService } from '../../application/nfc-authorization.service';
import { AuthorizePaymentRequestDto } from '../../dto/authorize-payment-request.dto';

@Controller('payments')
export class NfcAuthorizationController {
  constructor(
    private readonly authorizationService: NfcAuthorizationService,
  ) {}

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OAuthScopeGuard)
  @RequiredScopes('payments:authorize')
  @ApiOperation({ summary: 'Authorize an NFC payment' })
  async authorize(
    @Body() dto: AuthorizePaymentRequestDto,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.authorizationService.authorizePayment(dto);
    return res.status(HttpStatus.OK).json({
      ok: result.approved,
      statusCode: HttpStatus.OK,
      data: result,
      message: result.approved ? 'Payment authorized' : result.reason,
    });
  }
}
