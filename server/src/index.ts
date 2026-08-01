import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db';
import routes from './routes';
import { createApiSecurityMiddleware, loadApiSecurityOptions } from './middleware/api-security';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_TOKEN = process.env.API_TOKEN?.trim();

if (!API_TOKEN) throw new Error('API_TOKEN is required');

function trustProxySetting(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === 'false') return false;
  if (normalized === 'true') return true;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
app.use(cors({ allowedHeaders: ['Content-Type', 'X-API-Token'] }));
app.use('/api', createApiSecurityMiddleware(loadApiSecurityOptions(API_TOKEN)));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

initDb();

app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
