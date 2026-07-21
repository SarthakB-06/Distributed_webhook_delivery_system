import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics for clean observability
export const errorRate = new Rate('errors');
export const ingestionLatency = new Trend('ingestion_latency_ms');

// Hardcoded Tenant ID from your database
const TENANT_ID = 'b3b8c386-8809-407b-8919-72c1cbaea15e';
const BASE_URL = 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '15s', target: 20 },  // Ramp up to 20 concurrent virtual users
    { duration: '30s', target: 50 },  // Spike up to 50 concurrent virtual users
    { duration: '45s', target: 50 },  // Sustain peak load (testing queue absorption)
    { duration: '15s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    // Pipeline fails if 99% of requests take longer than 50ms
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], 
    'errors': ['rate<0.01'],      
  },
};

export default function () {
  // Generate a randomized idempotency key so every request is treated as a unique event
  const uniqueId = `k6_test_${__VU}_{Date.now()}_${Math.random()}`;

  const payload = JSON.stringify({
    eventType: 'order.completed',
    idempotencyKey: uniqueId,
    payload: {
      orderId: Math.floor(Math.random() * 100000),
      amount: 99.99,
      timestamp: new Date().toISOString(),
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
    },
  };

  // Measure the POST request to the Ingestion API
  const startTime = new Date();
  const res = http.post(`${BASE_URL}/events`, payload, params);
  const duration = new Date() - startTime;
  if (res.status !== 200 && res.status !== 202) {
    // console.log(`[API Error ${res.status}]: ${res.body}`);  
  }
  // Record metrics
  ingestionLatency.add(duration);
  const isSuccessful = check(res, {
    'status is 200, 201, or 202': (r) => r.status === 200 || r.status === 201 || r.status === 202,
    'enqueued successfully': (r) => JSON.parse(r.body).enqueuedDeliveries >= 0,
  });

  errorRate.add(!isSuccessful);

  sleep(Math.random() * 0.05);
}