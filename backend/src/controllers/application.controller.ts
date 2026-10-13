import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import * as AppService from '../services/application.service';

// ─── POST /api/applications/builder ──────────────────────────────────────────

export async function submitBuilderApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
      });
      return;
    }

    const {
      applicantName,
      email,
      phone,
      companyName,
      businessType,
      yearsOfExperience,
      numberOfProjects,
      reraRegistrationNumber,
      officeAddress,
      city,
      state,
      website,
      description,
    } = req.body;

    const application = await AppService.submitBuilderApplication({
      applicantName,
      email,
      phone,
      companyName,
      businessType,
      yearsOfExperience: Number(yearsOfExperience),
      numberOfProjects: Number(numberOfProjects),
      reraRegistrationNumber,
      officeAddress,
      city,
      state,
      website,
      description,
    });

    res.status(201).json({
      success: true,
      message:
        'Your builder application has been submitted successfully. Our team will review it and get back to you.',
      data: {
        applicationId: application._id,
        status: application.status,
        email: application.email,
        submittedAt: application.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/applications/dsa ───────────────────────────────────────────────

export async function submitDSAApplication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => ({ field: (e as any).path, message: e.msg })),
      });
      return;
    }

    const {
      applicantName,
      email,
      phone,
      firmName,
      employmentType,
      yearsOfExperience,
      currentOrganization,
      areasOfOperation,
      bankPartnerships,
      address,
      city,
      state,
      description,
    } = req.body;

    const application = await AppService.submitDSAApplication({
      applicantName,
      email,
      phone,
      firmName,
      employmentType,
      yearsOfExperience: Number(yearsOfExperience),
      currentOrganization,
      areasOfOperation: Array.isArray(areasOfOperation) ? areasOfOperation : [],
      bankPartnerships,
      address,
      city,
      state,
      description,
    });

    res.status(201).json({
      success: true,
      message:
        'Your DSA application has been submitted successfully. Our team will review it and get back to you.',
      data: {
        applicationId: application._id,
        status: application.status,
        email: application.email,
        submittedAt: application.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}
