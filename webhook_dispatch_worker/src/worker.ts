import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import { CircuitBreaker } from './CircuitBreaker';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Initialize the Circuit Breaker (Trips after 3 consecutive failures, cools down for 30 seconds for testing)
const circuitBreaker = new CircuitBreaker(connection, 3, 30);

interface DeliveryJobData {
  eventId: string;
  endpointId: string;
  payload: Record<string, any>;
  url: string;
  secret: string;
}

console.log('Dispatch Worker is starting up with Circuit Breaker...');

const worker = new Worker<DeliveryJobData>(
  'webhook-deliveries',
  async (job: Job) => {
    const { eventId, endpointId, payload, url, secret } = job.data;
    const attemptNumber = job.attemptsMade + 1;

    // ➔ NEW: Check the Circuit Breaker BEFORE doing anything
    const isCircuitOpen = await circuitBreaker.isOpen(endpointId);
    if (isCircuitOpen) {
      console.log(`[Job ${job.id}] Circuit Breaker is OPEN for ${url}. Fast-failing.`);
      throw new Error('Circuit Breaker is OPEN. Halting delivery attempts.');
    }

    console.log(`[Job ${job.id}] Attempting delivery for Event: ${eventId} to ${url}`);

    const timestamp = Date.now().toString();
    const payloadString = JSON.stringify(payload);
    const signaturePayload = `${timestamp}.${payloadString}`;
    const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-id': eventId,
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': `v1=${signature}`,
        },
        body: payloadString,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      // ➔ NEW: Log success to the Circuit Breaker (Resets to Closed)
      await circuitBreaker.recordSuccess(endpointId);

      // Log to Ingestion API DB
      await fetch('http://localhost:3000/internal/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId, endpointId, status: 'delivered', attemptNumber,
          responseStatus: response.status, responseBody: responseBody.substring(0, 1000),
        }),
      });

      console.log(`[Job ${job.id}] Successfully delivered!`);
      return { success: true, status: response.status };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Job ${job.id}] Delivery failed:`, errorMessage);

      // ➔ NEW: Log failure to the Circuit Breaker (Increments failure count)
      await circuitBreaker.recordFailure(endpointId);

      const isFinalAttempt = attemptNumber >= (job.opts.attempts || 1);
      const status = isFinalAttempt ? 'failed' : 'pending';

      // Log to Ingestion API DB
      await fetch('http://localhost:3000/internal/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId, endpointId, status, attemptNumber, errorMessage,
        }),
      });

      throw error;
    }
  },
  { connection, concurrency: 10 }
);

worker.on('failed', (job, err) => {
  console.log(`[Job ${job?.id}] failed. Reason: ${err.message}`);
});