import express from 'express';
import { endpointsRouter } from './routes/endpoints';
import { Request, Response, NextFunction } from 'express';
import { eventsRouter } from './routes/events';
import { internalRouter } from './routes/internal';
import { deliveriesRouter } from './routes/deliveries';
import { register, httpResponseTimeHistogram } from './metrics';
import cors from 'cors';


const app = express();
app.use(cors())
app.use(express.json());


app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Record duration with labels
    httpResponseTimeHistogram.labels(
      req.method, 
      req.route ? req.route.path : req.path, 
      res.statusCode.toString()
    ).observe(duration);
  });

  
  
  next();
});

// Prometheus Scrape Endpoint
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

app.use('/endpoints', endpointsRouter);
app.use('/events', eventsRouter);
app.use('/internal', internalRouter);
app.use('/deliveries', deliveriesRouter);


const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
  console.log(`Ingestion API is running on http://localhost:${PORT}`);
});