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
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiSecurity,
} from '@nestjs/swagger';

import { OAuthScopeGuard, RequiredScopes } from 'src/modules/oauth/infrastructure/guards/oauth-scope.guard';
import { NfcAuthorizationService } from '../../application/nfc-authorization.service';
import { AuthorizePaymentRequestDto } from '../../dto/authorize-payment-request.dto';
import { AuthorizePaymentResponseDto } from '../../dto/authorize-payment-response.dto';
import { SocketGateway } from 'src/sockets/sockets.gateway';

@Controller('nfc-payments')
@ApiTags('NFC Payments')
@ApiSecurity('oauth2', ['payments:authorize'])
export class NfcAuthorizationController {
  constructor(
    private readonly authorizationService: NfcAuthorizationService,
    private readonly socketGateway: SocketGateway,
  ) {}

  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OAuthScopeGuard)
  @RequiredScopes('payments:authorize')
  @ApiOperation({
    summary: 'Authorize an NFC payment',
    description:
      'Validates a signed NFC payment token from the POS terminal and authorizes the transaction. Requires OAuth scope payments:authorize.',
  })
  @ApiBody({ type: AuthorizePaymentRequestDto })
  @ApiOkResponse({
    description: 'Payment authorization result',
    type: AuthorizePaymentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid signed payload, amount, or currency' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid OAuth token' })
  @ApiForbiddenResponse({ description: 'OAuth token lacks payments:authorize scope' })
  @ApiInternalServerErrorResponse({ description: 'Error during payment authorization' })
  async authorize(
    @Body() dto: AuthorizePaymentRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<Response> {
    const clientId = (req as any).user?.clientId;
    const result = await this.authorizationService.authorizePayment(dto, clientId);

    // Notify the phone app via WebSocket (room = NFC sessionId)
    if (result.approved && result.sessionId) {
      this.socketGateway.sendToRoom(result.sessionId, 'payment.result', {
        status: 'success',
        transactionId: result.txId,
        amount: result.amount,
        currency: result.currency,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HttpStatus.OK).json({
      ok: result.approved,
      statusCode: HttpStatus.OK,
      data: result,
      message: result.approved ? 'Payment authorized' : result.reason,
    });
  }
}
