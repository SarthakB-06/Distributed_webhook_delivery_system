import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { webhookQueue } from '../queue';

export const deliveriesRouter = Router();

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

deliveriesRouter.post('/:id/redrive', async (req: Request, res: Response) => {
  const tenantHeader = req.header('x-tenant-id');
  
  // FIX: Explicitly cast to string to prevent the cascading type failure
  const deliveryId = req.params.id as string;

  if (Array.isArray(tenantHeader)) {
    return res.status(400).json({ error: 'Invalid x-tenant-id header format' });
  }

  const tenantId = tenantHeader;

  if (!tenantId) {
    return res.status(401).json({ error: 'Missing x-tenant-id header' });
  }

  if (!uuidRegex.test(deliveryId)) {
    return res.status(400).json({ error: 'Invalid delivery ID format' });
  }

  try {
    // Because deliveryId is strictly a string now, the include block will successfully infer types!
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        event: true,
        endpoint: true,
      },
    });

    if (!delivery || delivery.event.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    if (delivery.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot redrive a successful delivery' });
    }

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'pending',
        attemptCount: 0,
      },
    });

    await webhookQueue.add(
      'deliver-webhook',
      {
        eventId: delivery.event.id,
        endpointId: delivery.endpoint.id,
        payload: delivery.event.payload,
        url: delivery.endpoint.url,
        secret: delivery.endpoint.secret,
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return res.status(200).json({ success: true, message: 'Delivery queued for redrive' });
  } catch (error) {
    console.error('Redrive failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});