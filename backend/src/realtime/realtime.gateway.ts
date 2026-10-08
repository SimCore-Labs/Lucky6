import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import type { RealtimeEvent } from '@lucky-six/contracts';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriber: Redis | null = null;

  afterInit() {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.subscriber = new Redis(redisUrl, {
      tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
    });

    this.subscriber.subscribe('lucky-six:events', (err) => {
      if (err) {
        this.logger.error(`Failed to subscribe to Redis events: ${String(err)}`);
      } else {
        this.logger.log('Subscribed to Redis Pub/Sub channel [lucky-six:events]');
      }
    });

    this.subscriber.on('message', (channel, message) => {
      if (channel === 'lucky-six:events') {
        try {
          const parsed = JSON.parse(message);
          if (parsed.event && parsed.payload) {
            this.emitEvent(parsed.event as RealtimeEvent, parsed.payload);
          }
        } catch (e) {
          this.logger.warn(`Could not parse Redis message: ${String(e)}`);
        }
      }
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcasts real-time Lucky Six events to all connected clients.
   */
  emitEvent(event: RealtimeEvent, payload: unknown) {
    this.logger.log(`Emitting event '${event}' to clients`);
    if (this.server) {
      this.server.emit(event, payload);
    }
  }
}
