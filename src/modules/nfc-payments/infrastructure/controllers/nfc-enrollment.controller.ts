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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { NfcEnrollmentService } from '../../application/nfc-enrollment.service';
import { NfcEnrollmentRequestDto } from '../../dto/nfc-enrollment-request.dto';
import { NfcEnrollmentResponseDto } from '../../dto/nfc-enrollment-response.dto';

@Controller('cards')
@ApiTags('NFC Enrollment')
@ApiBearerAuth('Bearer Token')
@UseGuards(JwtAuthGuard)
export class NfcEnrollmentController {
  constructor(private readonly enrollmentService: NfcEnrollmentService) {}

  @Post(':cardId/nfc-enrollment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a card for NFC payments',
    description:
      'Registers a card for contactless NFC payments by exchanging ECDH public keys between the device and server.',
  })
  @ApiParam({
    name: 'cardId',
    required: true,
    type: String,
    description: 'The unique identifier of the card to enroll',
  })
  @ApiBody({ type: NfcEnrollmentRequestDto })
  @ApiCreatedResponse({
    description: 'Card enrolled successfully for NFC payments',
    type: NfcEnrollmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid request data or device public key' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiNotFoundResponse({ description: 'Card not found' })
  @ApiInternalServerErrorResponse({ description: 'Error during enrollment process' })
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
  @ApiOperation({
    summary: 'Revoke NFC enrollment for a card',
    description: 'Revokes the NFC enrollment for a card, disabling contactless payments.',
  })
  @ApiParam({
    name: 'cardId',
    required: true,
    type: String,
    description: 'The unique identifier of the card to revoke enrollment',
  })
  @ApiOkResponse({ description: 'NFC enrollment revoked successfully' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiNotFoundResponse({ description: 'Card or enrollment not found' })
  @ApiInternalServerErrorResponse({ description: 'Error during revocation process' })
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
  @ApiOperation({
    summary: 'Get NFC enrollment status for a card',
    description:
      'Returns whether the card is currently enrolled for NFC payments and its transaction counter.',
  })
  @ApiParam({
    name: 'cardId',
    required: true,
    type: String,
    description: 'The unique identifier of the card to check enrollment status',
  })
  @ApiOkResponse({ description: 'Enrollment status retrieved successfully' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  @ApiNotFoundResponse({ description: 'Card not found' })
  @ApiInternalServerErrorResponse({ description: 'Error retrieving enrollment status' })
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
