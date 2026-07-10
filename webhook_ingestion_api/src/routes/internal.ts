import { Router, Request, Response } from 'express';
import { prisma } from '../db';

export const internalRouter = Router();

internalRouter.post('/attempts', async (req: Request, res: Response) => {
  const { eventId, endpointId, status, attemptNumber, responseStatus, responseBody, errorMessage } = req.body;

  try {
    // 1. Find the parent Delivery record, or create it if this is the first attempt
    let delivery = await prisma.delivery.findFirst({
      where: { eventId, endpointId }
    });

    if (!delivery) {
      delivery = await prisma.delivery.create({
        data: { eventId, endpointId, status: 'pending' }
      });
    }

    // 2. Update the Delivery's overall status and attempt count
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status, attemptCount: attemptNumber }
    });

    // 3. Create the detailed Delivery Attempt audit log
    await prisma.deliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        responseStatus,
        responseBody,
        errorMessage,
      }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to log attempt to database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});