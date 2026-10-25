import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { PaymentService } from './payment.service.js';
import { z } from 'zod';

const quoteSchema = z.object({
  credits: z.number().int().safe(),
});

const createOrderSchema = quoteSchema.extend({
  idempotencyKey: z.string().uuid(),
});

const submitSignatureSchema = z.object({
  signature: z.string().min(1).max(128),
});

@Controller('payments')
@UseGuards(SessionGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get('quote')
  async getQuote(
    @Query('credits') rawCredits: string | undefined,
  ) {
    const credits = Number(rawCredits);
    const parse = quoteSchema.safeParse({ credits });
    if (!parse.success) {
      throw new BadRequestException('Credit amount must be a whole number.');
    }
    return this.payments.quote(parse.data.credits);
  }

  @Post('orders')
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const parse = createOrderSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException('Invalid payment order request.');
    }
    return this.payments.createOrder(
      request.authenticatedWallet,
      parse.data.credits,
      parse.data.idempotencyKey,
    );
  }

  @Post('orders/:orderId/submit')
  async submitSignature(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const parse = submitSignatureSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException('Invalid payment signature submission.');
    }
    return this.payments.submitSignature(
      request.authenticatedWallet.id,
      orderId,
      parse.data.signature,
    );
  }

  @Get('orders/:orderId')
  getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.payments.getOrder(request.authenticatedWallet.id, orderId);
  }

  @Get('mine')
  getHistory(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.payments.getHistory(request.authenticatedWallet.id, limit);
  }
}
