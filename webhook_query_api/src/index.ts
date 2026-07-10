import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
const app = express();
app.use(cors());
const prisma = new PrismaClient();
app.use(express.json());

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

// GET /events - List all events for a tenant with their delivery statuses
app.get('/events', async (req: Request, res: Response) => {
  const tenantId = firstQueryValue(req.headers['x-tenant-id']);
  const status = firstQueryValue(req.query.status);
  const limit = firstQueryValue(req.query.limit) ?? '20';
  const offset = firstQueryValue(req.query.offset) ?? '0';

  if (!tenantId) {
    return res.status(401).json({ error: 'Missing x-tenant-id header' });
  }

  try {
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        // If a status filter is provided (e.g., ?status=failed), filter the related deliveries
        deliveries: status ? { some: { status: String(status) } } : undefined,
      },
      include: {
        deliveries: {
          select: { id: true, endpointId: true, status: true, attemptCount: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    res.status(200).json(events);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /events/:id/attempts - View the exact HTTP logs for a specific event
app.get('/events/:id/attempts', async (req: Request, res: Response) => {
  const tenantId = firstQueryValue(req.headers['x-tenant-id']);
  const eventId = String(req.params.id);

  if (!tenantId) {
    return res.status(401).json({ error: 'Missing x-tenant-id header' });
  }

  try {
    // 1. Verify the event belongs to this tenant
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event || event.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // 2. Fetch all attempts across all endpoints for this event
    const attempts = await prisma.deliveryAttempt.findMany({
      where: {
        delivery: { eventId: eventId }
      },
      orderBy: { attemptedAt: 'desc' },
      include: {
        delivery: { select: { endpoint: { select: { url: true } } } }
      }
    });

    res.status(200).json(attempts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch attempts' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Query API is running on http://localhost:${PORT}`);
});