import express from 'express';
import { webhook } from './payments/webhook.js';
import { checkout } from './payments/checkout.js';

const app = express();
app.post('/checkout', express.json(), checkout);
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), webhook);
app.listen(3000);
