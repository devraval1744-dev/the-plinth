import { Request, Response } from 'express';
import { validationResult } from 'express-validator';

/** Sends a 422 and returns false when express-validator found errors. */
export function validationGuard(req: Request, res: Response): boolean {
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
