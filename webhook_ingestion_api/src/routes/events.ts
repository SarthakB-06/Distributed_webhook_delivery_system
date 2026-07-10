import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { webhookQueue } from '../queue';

export const eventsRouter = Router();

const createEventSchema = z.object({
  eventType: z.string(),
  payload: z.record(z.string(),z.any()),
  idempotencyKey: z.string().optional(),
});

const tenantIdSchema = z.string().uuid({
  message: 'Invalid tenant id – must be a UUID',
});

eventsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createEventSchema.parse(req.body);
    const rawTenantId = req.headers['x-tenant-id'] as string | undefined;

    if (!rawTenantId) {
      return res.status(401).json({ error: 'Missing x-tenant-id header' });
    }

    const tenantId = tenantIdSchema.parse(rawTenantId);

    // 1. Idempotency Check
    if (parsed.idempotencyKey) {
      const existingEvent = await prisma.event.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId,
            idempotencyKey: parsed.idempotencyKey,
          },
        },
      });

      if (existingEvent) {
        return res.status(200).json(existingEvent);
      }
    }

    // 2. Persist the Event (Source of Truth)
    const newEvent = await prisma.event.create({
      data: {
        tenantId,
        eventType: parsed.eventType,
        payload: parsed.payload,
        idempotencyKey: parsed.idempotencyKey,
      },
    });

    // 3. The Fan-Out: Find all endpoints listening to this event type
    const endpoints = await prisma.endpoint.findMany({
      where: {
        tenantId,
        isActive: true,
        eventTypes: { has: parsed.eventType },
      },
    });

    // 4. Enqueue Delivery Jobs
    if (endpoints.length > 0) {
      const jobs = endpoints.map((endpoint) => ({
        name: 'deliver-webhook',
        data: {
          eventId: newEvent.id,
          endpointId: endpoint.id,
          payload: parsed.payload,
          url: endpoint.url,
          secret: endpoint.secret,
        },
        opts: {
          attempts: 5, // Total times to try before throwing it to the dead-letter queue
          backoff: {
            type: 'exponential',
            delay: 5000, // Wait 5s, then 10s, then 20s, etc.
          },
          removeOnComplete: true, // Keep Redis clean
          removeOnFail: false,    // Keep failed jobs in Redis for inspection/redrive
        }
      }));

      // addBulk is highly optimized for pushing multiple jobs at once
      await webhookQueue.addBulk(jobs);
    }

    res.status(201).json({ event: newEvent, enqueuedDeliveries: endpoints.length });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(409).json({ error: 'Concurrent request with same idempotency key detected' });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});