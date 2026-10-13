import { Request, Response, NextFunction } from 'express';
import * as AnalysisService from '../services/analysis.service';

// POST /api/properties/:propertyId/blueprints/:blueprintId/analyze
export async function triggerAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await AnalysisService.triggerAnalysis(
      req.params.blueprintId,
      req.params.propertyId,
      req.user!.id,
    );
    res.status(202).json({
      success: true,
      message: 'Blueprint analysis started',
      data: { status: job.status, jobId: job._id },
    });
  } catch (err) { next(err); }
}

// GET /api/properties/:propertyId/blueprints/:blueprintId/analysis
export async function getAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const analysis = await AnalysisService.getAnalysis(
      req.params.blueprintId,
      req.params.propertyId,
      req.user!.id,
    );
    res.status(200).json({ success: true, data: { analysis } });
  } catch (err) { next(err); }
}

// GET /api/properties/:propertyId/blueprints/:blueprintId/analysis/status
export async function getAnalysisStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await AnalysisService.getAnalysisStatus(
      req.params.blueprintId,
      req.params.propertyId,
      req.user!.id,
    );
    res.status(200).json({ success: true, data: status });
  } catch (err) { next(err); }
}

// POST /api/properties/:propertyId/blueprints/:blueprintId/analysis/retry  (alias for re-trigger)
export async function retryAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await AnalysisService.triggerAnalysis(
      req.params.blueprintId,
      req.params.propertyId,
      req.user!.id,
    );
    res.status(202).json({
      success: true,
      message: 'Blueprint analysis retrying',
      data: { status: job.status, jobId: job._id },
    });
  } catch (err) { next(err); }
}

// GET /api/properties/:propertyId/blueprints/:blueprintId/3d  (public)
export async function getPublic3D(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await AnalysisService.getPublic3D(
      req.params.blueprintId,
      req.params.propertyId,
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

// GET /api/admin/properties/:propertyId/blueprints/:blueprintId/analysis
export async function adminGetAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const analysis = await AnalysisService.adminGetAnalysis(
      req.params.blueprintId,
      req.params.propertyId,
    );
    res.status(200).json({ success: true, data: { analysis } });
  } catch (err) { next(err); }
}
