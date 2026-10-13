import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import * as BlueprintService from '../services/blueprint.service';
import { BlueprintLevel } from '../models/Blueprint';

function validationGuard(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
    });
    return false;
  }
  return true;
}

// ─── Builder: POST /api/properties/:propertyId/blueprints ─────────────────────

export async function createBlueprint(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;

    if (!req.file) {
      res.status(422).json({ success: false, message: 'Blueprint file is required' });
      return;
    }

    const blueprint = await BlueprintService.createBlueprint(
      req.params.propertyId,
      req.user!.id,
      {
        level:         req.body.level as BlueprintLevel,
        blueprintType: req.body.blueprintType,
        unitType:      req.body.unitType,
        unitLabel:     req.body.unitLabel,
        title:         req.body.title,
        description:   req.body.description,
      },
      {
        fieldname:    req.file.fieldname,
        originalname: req.file.originalname,
        encoding:     req.file.encoding,
        mimetype:     req.file.mimetype,
        buffer:       req.file.buffer,
        size:         req.file.size,
      }
    );

    res.status(201).json({
      success: true,
      message: 'Blueprint uploaded successfully',
      data: { blueprint },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Builder: GET /api/properties/:propertyId/blueprints ─────────────────────

export async function getPropertyBlueprints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprints = await BlueprintService.getPropertyBlueprintsForBuilder(
      req.params.propertyId,
      req.user!.id
    );
    res.status(200).json({ success: true, data: { blueprints } });
  } catch (err) {
    next(err);
  }
}

// ─── Builder: GET /api/properties/:propertyId/blueprints/:blueprintId ────────

export async function getBlueprintById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprint = await BlueprintService.getBlueprintForBuilder(
      req.params.propertyId,
      req.params.blueprintId,
      req.user!.id
    );
    res.status(200).json({ success: true, data: { blueprint } });
  } catch (err) {
    next(err);
  }
}

// ─── Builder: POST /api/properties/:propertyId/blueprints/:blueprintId/replace

export async function replaceBlueprint(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(422).json({ success: false, message: 'Replacement blueprint file is required' });
      return;
    }

    const blueprint = await BlueprintService.replaceBlueprint(
      req.params.propertyId,
      req.params.blueprintId,
      req.user!.id,
      {
        title:         req.body.title,
        description:   req.body.description,
        blueprintType: req.body.blueprintType,
      },
      {
        fieldname:    req.file.fieldname,
        originalname: req.file.originalname,
        encoding:     req.file.encoding,
        mimetype:     req.file.mimetype,
        buffer:       req.file.buffer,
        size:         req.file.size,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Blueprint replaced. Previous version archived.',
      data: { blueprint },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Builder: PATCH /api/properties/:propertyId/blueprints/:blueprintId ──────

export async function updateBlueprintMetadata(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const blueprint = await BlueprintService.updateBlueprintMetadata(
      req.params.propertyId,
      req.params.blueprintId,
      req.user!.id,
      {
        title:         req.body.title,
        description:   req.body.description,
        blueprintType: req.body.blueprintType,
      }
    );
    res.status(200).json({ success: true, message: 'Blueprint updated', data: { blueprint } });
  } catch (err) {
    next(err);
  }
}

// ─── Builder: POST /api/properties/:propertyId/blueprints/:blueprintId/archive

export async function archiveBlueprint(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprint = await BlueprintService.archiveBlueprint(
      req.params.propertyId,
      req.params.blueprintId,
      req.user!.id
    );
    res.status(200).json({ success: true, message: 'Blueprint archived', data: { blueprint } });
  } catch (err) {
    next(err);
  }
}

// ─── Public: GET /api/properties/:propertyId/blueprints/public ───────────────

export async function getPublicBlueprints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprints = await BlueprintService.getPublicBlueprints(req.params.propertyId);
    res.status(200).json({ success: true, data: { blueprints } });
  } catch (err) {
    next(err);
  }
}

// ─── Public: GET /api/properties/:propertyId/blueprints/public/:blueprintId ──

export async function getPublicBlueprintById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprint = await BlueprintService.getPublicBlueprint(
      req.params.propertyId,
      req.params.blueprintId
    );
    res.status(200).json({ success: true, data: { blueprint } });
  } catch (err) {
    next(err);
  }
}

// ─── Admin: GET /api/admin/properties/:propertyId/blueprints ─────────────────

export async function getAdminPropertyBlueprints(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blueprints = await BlueprintService.getAdminPropertyBlueprints(
      req.params.propertyId
    );
    res.status(200).json({ success: true, data: { blueprints } });
  } catch (err) {
    next(err);
  }
}
