import { Redis } from 'ioredis';

export class CircuitBreaker {
  private redis: Redis;
  private maxFailures: number;
  private cooldownSeconds: number;

  constructor(redisConnection: Redis, maxFailures = 5, cooldownSeconds = 60) {
    this.redis = redisConnection;
    this.maxFailures = maxFailures;
    this.cooldownSeconds = cooldownSeconds;
  }

  // Generate unique keys per endpoint
  private getFailuresKey(endpointId: string) {
    return `cb:failures:${endpointId}`;
  }

  private getTrippedKey(endpointId: string) {
    return `cb:tripped:${endpointId}`;
  }

  /**
   * Checks if the circuit is open (tripped). 
   * If true, we should NOT make the HTTP request.
   */
  async isOpen(endpointId: string): Promise<boolean> {
    const isTripped = await this.redis.get(this.getTrippedKey(endpointId));
    return isTripped === 'true';
  }

  /**
   * Call this when an HTTP request succeeds. It resets the failure count.
   */
  async recordSuccess(endpointId: string): Promise<void> {
    await this.redis.del(this.getFailuresKey(endpointId));
    await this.redis.del(this.getTrippedKey(endpointId));
  }

  /**
   * Call this when an HTTP request fails. 
   * If failures exceed the threshold, it trips the breaker.
   */
  async recordFailure(endpointId: string): Promise<void> {
    const failuresKey = this.getFailuresKey(endpointId);
    
    // Increment the failure count
    const currentFailures = await this.redis.incr(failuresKey);
    
    // Set an expiry on the failure count so it clears out eventually if no traffic comes in
    await this.redis.expire(failuresKey, this.cooldownSeconds * 2);

    if (currentFailures >= this.maxFailures) {
      console.warn(`[Circuit Breaker] TRIPPED for endpoint ${endpointId}! Cooldown: ${this.cooldownSeconds}s`);
      
      // Trip the breaker and set an automatic expiration (the cooldown phase)
      await this.redis.set(
        this.getTrippedKey(endpointId), 
        'true', 
        'EX', 
        this.cooldownSeconds
      );
    }
  }
}