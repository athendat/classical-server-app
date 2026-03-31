/**
 * Controller: NfcEnrollmentController
 *
 * HTTP endpoints para enrollment y revocación NFC de tarjetas.
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { NfcEnrollmentService } from '../../application/nfc-enrollment.service';
import { NfcEnrollmentRequestDto } from '../../dto/nfc-enrollment-request.dto';

@Controller('cards')
@ApiBearerAuth('Bearer Token')
@UseGuards(JwtAuthGuard)
export class NfcEnrollmentController {
  constructor(private readonly enrollmentService: NfcEnrollmentService) {}

  @Post(':cardId/nfc-enrollment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll a card for NFC payments' })
  @ApiParam({ name: 'cardId', required: true, type: String })
  async enrollCard(
    @Param('cardId') cardId: string,
    @Body() dto: NfcEnrollmentRequestDto,
    @Request() req: any,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.enrollmentService.enrollCard(
      req.user.userId,
      cardId,
      dto.devicePublicKey,
    );
    return res.status(HttpStatus.CREATED).json({
      ok: true,
      statusCode: HttpStatus.CREATED,
      data: result,
      message: 'Card enrolled for NFC payments',
    });
  }

  @Delete(':cardId/nfc-enrollment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke NFC enrollment for a card' })
  @ApiParam({ name: 'cardId', required: true, type: String })
  async revokeEnrollment(
    @Param('cardId') cardId: string,
    @Request() req: any,
    @Res() res: Response,
  ): Promise<Response> {
    await this.enrollmentService.revokeEnrollment(cardId, req.user.userId);
    return res.status(HttpStatus.OK).json({
      ok: true,
      statusCode: HttpStatus.OK,
      message: 'NFC enrollment revoked',
    });
  }

  @Get(':cardId/nfc-enrollment/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get NFC enrollment status for a card' })
  @ApiParam({ name: 'cardId', required: true, type: String })
  async getEnrollmentStatus(
    @Param('cardId') cardId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const enrollment = await this.enrollmentService.getEnrollment(cardId);
    return res.status(HttpStatus.OK).json({
      ok: true,
      statusCode: HttpStatus.OK,
      data: {
        enrolled: !!enrollment && enrollment.status === 'active',
        counter: enrollment?.counter ?? 0,
      },
    });
  }
}
