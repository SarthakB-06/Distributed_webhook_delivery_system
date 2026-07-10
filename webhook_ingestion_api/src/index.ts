import express from 'express';
import { endpointsRouter } from './routes/endpoints';
import { eventsRouter } from './routes/events';
import { internalRouter } from './routes/internal';
import { deliveriesRouter } from './routes/deliveries';
import cors from 'cors';


const app = express();
app.use(cors())
app.use(express.json());

app.use('/endpoints', endpointsRouter);
app.use('/events', eventsRouter);
app.use('/internal', internalRouter);
app.use('/deliveries', deliveriesRouter);


const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
  console.log(`Ingestion API is running on http://localhost:${PORT}`);
});