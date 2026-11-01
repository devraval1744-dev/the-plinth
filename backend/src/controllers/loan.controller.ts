import { Request, Response, NextFunction } from 'express';
import * as LoanService from '../services/loan.service';
import { validationGuard } from '../utils/validate';

// ─── Customer ─────────────────────────────────────────────────────────────────

// POST /api/loans
export async function createLoan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const loan = await LoanService.createLoanRequest(req.user!.id, req.body);
    res.status(201).json({ success: true, message: 'Request sent to a DSA partner', data: { loan } });
  } catch (err) { next(err); }
}

// GET /api/loans/mine
export async function listMyLoans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const loans = await LoanService.listCustomerLoans(req.user!.id);
    res.status(200).json({ success: true, data: { loans } });
  } catch (err) { next(err); }
}

// PATCH /api/loans/:id/cancel
export async function cancelLoan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const loan = await LoanService.cancelLoanRequest(req.user!.id, req.params.id);
    res.status(200).json({ success: true, message: 'Request withdrawn', data: { loan } });
  } catch (err) { next(err); }
}

// ─── DSA ──────────────────────────────────────────────────────────────────────

// GET /api/loans/leads
export async function listLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leads = await LoanService.listDsaLeads(req.user!.id);
    res.status(200).json({ success: true, data: { leads } });
  } catch (err) { next(err); }
}

// GET /api/loans/leads/counts
export async function getLeadCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const counts = await LoanService.getDsaLeadCounts(req.user!.id);
    res.status(200).json({ success: true, data: counts });
  } catch (err) { next(err); }
}

// PATCH /api/loans/:id/status
export async function updateLeadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!validationGuard(req, res)) return;
    const lead = await LoanService.updateLeadStatus(req.user!.id, req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Lead updated', data: { lead } });
  } catch (err) { next(err); }
}
