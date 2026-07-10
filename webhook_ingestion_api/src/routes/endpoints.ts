import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const endpointsRouter = Router();

const createEndpointSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16), // Used later for HMAC signing
  eventTypes: z.array(z.string()).min(1),
});

endpointsRouter.post('/', async (req: Request, res: Response) => {
  try {
    // 1. Validate payload
    const parsed = createEndpointSchema.parse(req.body);
    
    // 2. Extract Mock Tenant ID (we will replace this when we build the Auth service)
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(401).json({ error: 'Missing x-tenant-id header' });
    }

    // 3. Save to database
    const endpoint = await prisma.endpoint.create({
      data: {
        tenantId,
        url: parsed.url,
        secret: parsed.secret,
        eventTypes: parsed.eventTypes,
      },
    });

    res.status(201).json(endpoint);
  } catch (error) {
    if (error instanceof z.ZodError) {
        
      return res.status(400).json({ errors: error.issues });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});