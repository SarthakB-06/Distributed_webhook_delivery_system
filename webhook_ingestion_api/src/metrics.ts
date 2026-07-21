import client from 'prom-client';

// 1. Enable collection of default Node.js runtime metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// 2. Custom Histogram for tracking HTTP request duration & status codes
export const httpResponseTimeHistogram = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  // Buckets tailor-made for our sub-50ms latency targets:
  buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000]
});

export const register = client.register;