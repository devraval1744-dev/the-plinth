/**
 * HTTP client for the FastAPI AI service.
 * The Express backend calls this — never the frontend directly.
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { env } from '../config/env';
import { SpatialAnalysis } from '../models/BlueprintAnalysis';

const AI_BASE = env.AI_SERVICE_URL;
const TIMEOUT_MS = 30_000;

export async function callAnalyzeEndpoint(
  fileUrl: string,      // local /uploads/... path relative to server root
  blueprintId: string,
  blueprintVersion: number,
  unitType?: string,
): Promise<SpatialAnalysis> {
  // Resolve the physical file path
  const filePath = path.resolve(process.cwd(), fileUrl.replace(/^\//, ''));

  if (!fs.existsSync(filePath)) {
    throw new Error(`Blueprint file not found on disk: ${filePath}`);
  }

  const fd = new FormData();
  fd.append('file', fs.createReadStream(filePath));
  fd.append('blueprint_id', blueprintId);
  fd.append('blueprint_version', String(blueprintVersion));
  if (unitType) fd.append('unit_type', unitType);

  const response = await axios.post<SpatialAnalysis>(
    `${AI_BASE}/api/blueprints/analyze`,
    fd,
    {
      headers: fd.getHeaders(),
      timeout: TIMEOUT_MS,
    }
  );

  return response.data;
}

export async function isAiServiceHealthy(): Promise<boolean> {
  try {
    const res = await axios.get(`${AI_BASE}/api/health`, { timeout: 3000 });
    return res.data?.status === 'ok';
  } catch {
    return false;
  }
}
