/**
 * End-to-end API checks for the customer experience: public-API hardening, favourites,
 * activity tracking, recommendations, trending, similar, site visits, loans, notifications
 * and the dashboard. Builds its own fixtures and removes them afterwards.
 *
 *   MONGODB_URI=mongodb://localhost:27017/plinth_dev npx ts-node src/scripts/testCustomerExperience.ts
 *
 * Refuses to run against a non-local database (set ALLOW_REMOTE_TEST=true to override).
 */
import http from 'http';
import express from 'express';
import axios, { AxiosResponse } from 'axios';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import { Property, PropertyStatus } from '../models/Property';
import { Favorite } from '../models/Favorite';
import { UserActivity, ActivityType } from '../models/UserActivity';
import { SiteVisit } from '../models/SiteVisit';
import { LoanRequest } from '../models/LoanRequest';
import { Notification } from '../models/Notification';
import apiRoutes from '../routes/index';
import { errorHandler } from '../middleware/error.middleware';
import { todayIST } from '../services/visit.service';
import { getRecommendations } from '../services/recommendation.service';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      → ${JSON.stringify(detail)?.slice(0, 400)}` : ''}`);
  }
}
const section = (title: string) => console.log(`\n${title}`);

const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main(): Promise<void> {
  const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(env.MONGODB_URI);
  if (!isLocal && process.env.ALLOW_REMOTE_TEST !== 'true') {
    console.error('Refusing to run: MONGODB_URI is not local. This test creates and deletes data.');
    process.exit(1);
  }
  await connectDatabase();

  const startedAt = new Date();
  const tag = `${Date.now()}`;
  const createdUsers: mongoose.Types.ObjectId[] = [];
  const extraNotifyUsers = new Set<string>();

  const mkUser = async (name: string, role: UserRole, extra: Record<string, unknown> = {}) => {
    const u = await User.create({
      name,
      email: `${role.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '')}_${tag}@test.dev`,
      passwordHash: 'x'.repeat(20),
      role,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
      ...extra,
    });
    createdUsers.push(u._id);
    return u;
  };
  const tokenFor = (u: { _id: mongoose.Types.ObjectId; role: UserRole }) =>
    jwt.sign({ userId: String(u._id), role: u.role }, env.JWT_SECRET, { expiresIn: '1h' });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', apiRoutes);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as { port: number }).port}/api`;

  const call = (method: string, url: string, token?: string, data?: unknown): Promise<AxiosResponse> =>
    axios.request({
      method,
      url: `${base}${url}`,
      data,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      validateStatus: () => true,
    });

  try {
    // ─── Fixtures ──────────────────────────────────────────────────────────────
    const builder = await mkUser('Zenith Builders', UserRole.BUILDER, { phone: '9876501234' });
    const builder2 = await mkUser('Other Builders', UserRole.BUILDER);
    const dsa = await mkUser('Dsa One', UserRole.DSA, { phone: '9876505555' });
    const custA = await mkUser('Cust Alpha', UserRole.CUSTOMER, { phone: '9876500001' });
    const custB = await mkUser('Cust Beta', UserRole.CUSTOMER);
    const [tB, tB2, tD, tA, tBeta] = [builder, builder2, dsa, custA, custB].map(tokenFor);
    void tD;

    const locA = `TestLocA${tag}`;
    const locB = `TestLocB${tag}`;
    const mkProp = (over: Record<string, unknown>) =>
      Property.create({
        builderId: builder._id,
        title: 'Test property listing',
        projectName: `Test Project ${Math.random().toString(36).slice(2, 7)}`,
        description: 'A fixture property created by the customer experience API test for verification.',
        propertyType: 'Apartment',
        locality: locA,
        city: 'Ahmedabad',
        state: 'Gujarat',
        address: 'Test Road, Test Area',
        minPrice: 5000000,
        maxPrice: 7000000,
        minArea: 1000,
        maxArea: 1300,
        totalUnits: 50,
        availableUnits: 20,
        constructionStatus: 'Ready to Move',
        amenities: ['Lift', 'Parking', 'Gymnasium'],
        bhkConfigurations: [{ type: '2 BHK', areaSqFt: 1100, priceMin: 5000000, priceMax: 7000000, totalUnits: 50, availableUnits: 20 }],
        status: PropertyStatus.APPROVED,
        ...over,
      });

    const p1 = await mkProp({ projectName: `Alpha Heights ${tag}` });
    const p2 = await mkProp({
      projectName: `Alpha Crest ${tag}`, minPrice: 7000000, maxPrice: 9000000,
      bhkConfigurations: [{ type: '3 BHK', areaSqFt: 1500, priceMin: 7000000, priceMax: 9000000, totalUnits: 40, availableUnits: 15 }],
    });
    const p5 = await mkProp({ projectName: `Alpha Twin ${tag}`, minPrice: 5200000, maxPrice: 6800000 });
    const p4 = await mkProp({
      projectName: `Royal Villa ${tag}`, locality: locB, propertyType: 'Villa',
      minPrice: 25000000, maxPrice: 40000000, constructionStatus: 'Under Construction',
      bhkConfigurations: [{ type: '4 BHK', areaSqFt: 3500, priceMin: 25000000, priceMax: 40000000, totalUnits: 10, availableUnits: 4 }],
      amenities: ['Swimming Pool', 'Clubhouse'],
    });
    const p6 = await mkProp({ projectName: `Co-viewed Gem ${tag}`, locality: locB, minPrice: 5100000, maxPrice: 6900000 });
    const p7 = await mkProp({ projectName: `Unviewed Twin ${tag}`, locality: locB, minPrice: 5100000, maxPrice: 6900000 });
    const draft = await mkProp({ projectName: `Draft Hidden ${tag}`, status: PropertyStatus.DRAFT });
    const secret = await mkProp({
      projectName: `Secret Sauce ${tag}`,
      adminNotes: 'INTERNAL-NOTE-DO-NOT-LEAK',
      rejectionReason: 'internal reason',
      documents: [
        { name: 'Public brochure', fileType: 'application/pdf', url: '/uploads/x/public.pdf', isPublic: true },
        { name: 'Internal RERA draft', fileType: 'application/pdf', url: '/uploads/x/private.pdf', isPublic: false },
      ],
    });

    // ─── A. Public API hardening ───────────────────────────────────────────────
    section('A. Public API hardening');
    let r = await call('GET', '/properties?locality=(');
    check('malformed regex in ?locality no longer crashes (200)', r.status === 200, r.data);
    r = await call('GET', '/properties?search=%5B%28%2A&minPrice=abc&limit=zzz&sortBy=%7B%24ne%7D');
    check('junk search/number/sort params are tolerated (200)', r.status === 200, r.data);
    r = await call('GET', `/properties/${secret._id}`);
    const pub = r.data?.data?.property;
    check('public detail hides adminNotes / rejectionReason / reviewedBy', pub && !('adminNotes' in pub) && !('rejectionReason' in pub) && !('reviewedBy' in pub), pub);
    check('public detail exposes only public documents', pub?.documents?.length === 1 && pub.documents[0].isPublic === true, pub?.documents);
    check('public detail does not leak builder email', pub?.builderId && !('email' in pub.builderId), pub?.builderId);
    r = await call('GET', `/properties?search=${encodeURIComponent('Secret Sauce')}`);
    check('discovery list also strips admin-only fields', r.data?.data?.properties?.every((p: any) => !('adminNotes' in p)), r.data?.data?.properties?.[0]);
    r = await call('GET', `/properties?search=Zenith`);
    // 7 public fixtures by this builder (p1,p2,p5,p4,p6,p7 + "secret"); the DRAFT must not count
    check('search matches builder name (placeholder promised it)', r.data?.data?.total === 7, r.data?.data?.total);
    r = await call('GET', `/properties?search=${locA.slice(0, 10)}`);
    check('search matches partial words', r.data?.data?.total >= 1, r.data?.data?.total);
    r = await call('GET', `/properties?search=${tag}`);
    const ids = new Set(r.data?.data?.properties?.map((p: any) => p._id));
    check('DRAFT listings never appear publicly', !ids.has(String(draft._id)));
    r = await call('GET', `/properties/${draft._id}`);
    check('DRAFT detail → 404', r.status === 404);

    // ─── B. Favourites ─────────────────────────────────────────────────────────
    section('B. Favourites');
    r = await call('GET', '/customer/favorites');
    check('unauthenticated → 401', r.status === 401);
    r = await call('GET', '/customer/favorites', tB);
    check('builder cannot use customer endpoints → 403', r.status === 403);
    r = await call('POST', `/customer/favorites/${p2._id}`, tA);
    check('save property → 200', r.status === 200, r.data);
    r = await call('POST', `/customer/favorites/${p2._id}`, tA);
    check('saving twice is idempotent → 200', r.status === 200, r.data);
    check('…and creates exactly one favourite', (await Favorite.countDocuments({ userId: custA._id })) === 1);
    check('…and exactly one SAVE activity', (await UserActivity.countDocuments({ userId: custA._id, type: ActivityType.SAVE })) === 1);
    r = await call('GET', '/customer/favorites/ids', tA);
    check('ids endpoint lists the saved property', r.data?.data?.ids?.includes(String(p2._id)), r.data);
    r = await call('GET', '/customer/favorites', tA);
    check('list returns the property with savedAt', r.data?.data?.properties?.[0]?._id === String(p2._id) && !!r.data.data.properties[0].savedAt, r.data);
    r = await call('POST', `/customer/favorites/${draft._id}`, tA);
    check('cannot save a non-public (DRAFT) property → 404', r.status === 404);
    r = await call('POST', '/customer/favorites/not-an-id', tA);
    check('invalid id → 422', r.status === 422);

    // ─── C. Activity tracking ──────────────────────────────────────────────────
    section('C. Activity tracking');
    await call('GET', `/properties/${p1._id}`); // anonymous
    check('anonymous view is not recorded', (await UserActivity.countDocuments({ propertyId: p1._id, type: ActivityType.VIEW })) === 0);
    await call('GET', `/properties/${p1._id}`, tA);
    await call('GET', `/properties/${p1._id}`, tA);
    check('customer view recorded once (re-open within 30 min de-duplicated)', (await UserActivity.countDocuments({ userId: custA._id, type: ActivityType.VIEW, propertyId: p1._id })) === 1);
    await call('GET', `/properties/${p1._id}`, tB);
    check('builder previewing does not record a view', (await UserActivity.countDocuments({ userId: builder._id })) === 0);
    r = await call('POST', '/customer/activity/search', tA, { locality: locA, maxPrice: 8000000, bhk: '2 BHK' });
    check('search recorded', r.data?.data?.recorded === true, r.data);
    r = await call('POST', '/customer/activity/search', tA, { bhk: '2 BHK', maxPrice: 8000000, locality: locA.toLowerCase() });
    check('identical search (any key order / case) de-duplicated', r.data?.data?.recorded === false, r.data);
    r = await call('POST', '/customer/activity/search', tA, {});
    check('empty search ignored', r.data?.data?.recorded === false);
    r = await call('POST', '/customer/activity/search', tA, { search: '$where', locality: { $ne: 1 }, maxPrice: -5 });
    check('hostile search payload sanitised (stored without objects/negatives)', r.status === 200);
    const hostile = await UserActivity.findOne({ userId: custA._id, 'query.search': '$where' }).lean();
    check('…only valid fields were persisted', !!hostile && hostile.query?.locality === undefined && hostile.query?.maxPrice === undefined, hostile?.query);

    // ─── D. Recommendations ────────────────────────────────────────────────────
    section('D. Recommendations');
    r = await call('GET', '/customer/recommendations', tBeta);
    check('cold start is flagged non-personalised', r.data?.data?.isPersonalized === false, r.data?.data?.isPersonalized);
    check('cold start still returns properties with a reason', r.data?.data?.items?.length > 0 && r.data.data.items.every((i: any) => i.reasons.length > 0));

    // B also views p1 and p6 → p6 is "co-viewed" with p1; p7 is an identical listing nobody viewed
    await call('GET', `/properties/${p1._id}`, tBeta);
    await call('GET', `/properties/${p6._id}`, tBeta);

    const feed = await getRecommendations(String(custA._id), 500);
    const rank = (id: unknown) => feed.items.findIndex((i) => String(i.property._id) === String(id));
    const item = (id: unknown) => feed.items.find((i) => String(i.property._id) === String(id));
    check('feed is personalised once the customer has activity', feed.isPersonalized === true);
    check('saved property is excluded from recommendations', rank(p2._id) === -1);
    check('every item has ≥1 reason and a 1–99 match score', feed.items.every((i) => i.reasons.length > 0 && i.matchScore !== null && i.matchScore >= 0 && i.matchScore <= 99));
    check('same-locality twin outranks a far-budget villa elsewhere', rank(p5._id) !== -1 && rank(p4._id) !== -1 && rank(p5._id) < rank(p4._id), { twin: rank(p5._id), villa: rank(p4._id) });
    check('already-viewed listing is demoted below its unseen twin', rank(p5._id) < rank(p1._id), { twin: rank(p5._id), viewed: rank(p1._id) });
    check('collaborative filtering lifts the co-viewed listing above an identical unviewed one', (item(p6._id)?.score ?? 0) > (item(p7._id)?.score ?? 0), { coViewed: item(p6._id)?.score, unviewed: item(p7._id)?.score });
    check('insights expose a budget band and top locality', !!feed.insights.budget && feed.insights.topLocalities.some((l) => l.toLowerCase() === locA.toLowerCase()), feed.insights);
    r = await call('GET', '/customer/recommendations?limit=3', tA);
    check('HTTP endpoint honours limit', r.data?.data?.items?.length === 3, r.data?.data?.items?.length);
    r = await call('GET', `/customer/recommendations/${p5._id}/explain`, tA);
    check('explain returns a personalised score + reasons', r.data?.data?.isPersonalized === true && r.data.data.reasons.length > 0 && typeof r.data.data.matchScore === 'number', r.data);
    r = await call('GET', `/customer/recommendations/${p5._id}/explain`, tBeta);
    check('explain is personalised for another customer too', r.data?.data?.isPersonalized === true, r.data);

    // ─── E. Similar + trending ────────────────────────────────────────────────
    section('E. Similar & trending');
    r = await call('GET', `/properties/${p1._id}/similar?limit=3`);
    const sim = r.data?.data?.properties || [];
    check('similar excludes the property itself', sim.every((p: any) => p._id !== String(p1._id)));
    // "secret" has attributes identical to p1, p5 is a near-twin: both beat the pricier 3 BHK (p2) and the villa (p4)
    const topTwo = sim.slice(0, 2).map((p: any) => p._id).sort();
    check('the two closest matches are the same-locality, same-budget listings', topTwo.join() === [String(secret._id), String(p5._id)].sort().join(), sim.map((p: any) => `${p.projectName} (${p.similarity})`));
    check('a far-budget villa elsewhere is not in the top 3', !sim.some((p: any) => p._id === String(p4._id)));
    check('similar results carry a similarity score', sim.every((p: any) => typeof p.similarity === 'number'));
    r = await call('GET', '/properties/trending?limit=24');
    const tr = r.data?.data;
    check('trending reports real activity', tr?.hasActivity === true);
    const trP1 = tr?.properties?.find((p: any) => p._id === String(p1._id));
    check('property viewed by two customers shows 2 engaged', trP1?.trending?.viewers === 2, trP1?.trending);

    // ─── F. Site visits ────────────────────────────────────────────────────────
    section('F. Site visits');
    const today = todayIST();
    const tomorrow = addDays(today, 1);
    const visitBody = (over: Record<string, unknown> = {}) => ({
      propertyId: String(p1._id), visitDate: tomorrow, timeSlot: 'MORNING', visitors: 2,
      contactName: 'Cust Alpha', contactPhone: '9876500001', ...over,
    });
    r = await call('POST', '/visits', undefined, visitBody());
    check('unauthenticated → 401', r.status === 401);
    r = await call('POST', '/visits', tB, visitBody());
    check('builder cannot request a visit → 403', r.status === 403);
    r = await call('POST', '/visits', tA, visitBody({ visitDate: addDays(today, -1) }));
    check('past date → 422', r.status === 422, r.data);
    r = await call('POST', '/visits', tA, visitBody({ visitDate: addDays(today, 90) }));
    check('beyond 60-day window → 422', r.status === 422, r.data);
    r = await call('POST', '/visits', tA, visitBody({ visitDate: '2026-02-31' }));
    check('impossible calendar date → 422', r.status === 422, r.data);
    r = await call('POST', '/visits', tA, visitBody({ contactPhone: '12345' }));
    check('invalid phone → 422', r.status === 422);
    r = await call('POST', '/visits', tA, visitBody({ timeSlot: 'MIDNIGHT' }));
    check('invalid slot → 422', r.status === 422);
    r = await call('POST', '/visits', tA, visitBody({ propertyId: String(draft._id) }));
    check('cannot book a non-public property → 404', r.status === 404);

    r = await call('POST', '/visits', tA, visitBody());
    const v1 = r.data?.data?.visit;
    check('request visit → 201 PENDING', r.status === 201 && v1?.status === 'PENDING', r.data);
    check('…with a human-readable slot label', v1?.timeSlotLabel === '10:00 AM – 12:00 PM', v1);
    check('…builder phone is hidden until confirmed', v1?.builder && v1.builder.phone === undefined, v1?.builder);
    r = await call('POST', '/visits', tA, visitBody());
    check('second live request for same property → 409', r.status === 409, r.data);
    check('builder was notified', (await Notification.countDocuments({ userId: builder._id, type: 'VISIT_REQUESTED' })) === 1);

    r = await call('GET', '/visits/builder', tB);
    check('builder sees the request with customer details', r.data?.data?.visits?.some((v: any) => v._id === v1._id && v.customer?.name === 'Cust Alpha'), r.data);
    r = await call('GET', '/visits/builder', tB2);
    check('another builder does not see it', !r.data?.data?.visits?.some((v: any) => v._id === v1._id));
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB2, { action: 'confirm' });
    check('another builder cannot respond → 404', r.status === 404);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tA, { action: 'confirm' });
    check('customer cannot respond → 403', r.status === 403);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'explode' });
    check('unknown action → 422', r.status === 422);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'complete' });
    check('cannot complete a pending visit → 409', r.status === 409, r.data);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'confirm', note: 'See you at the gate' });
    check('builder confirms → CONFIRMED', r.data?.data?.visit?.status === 'CONFIRMED', r.data);
    r = await call('GET', '/visits/mine', tA);
    const mine = r.data?.data?.visits?.find((v: any) => v._id === v1._id);
    check('customer now sees builder contact + note', mine?.builder?.phone === '9876501234' && mine?.builderNote === 'See you at the gate', mine);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'complete' });
    check('cannot complete before the visit date → 409', r.status === 409, r.data);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'reschedule' });
    check('reschedule without date/slot → 422', r.status === 422);
    const resched = addDays(today, 3);
    r = await call('PATCH', `/visits/${v1._id}/respond`, tB, { action: 'reschedule', newDate: resched, newSlot: 'EVENING' });
    check('builder proposes a new time → RESCHEDULE_PROPOSED', r.data?.data?.visit?.status === 'RESCHEDULE_PROPOSED' && r.data.data.visit.proposedDate?.startsWith(resched), r.data);
    r = await call('PATCH', `/visits/${v1._id}/accept-reschedule`, tBeta);
    check('another customer cannot accept → 404', r.status === 404);
    r = await call('PATCH', `/visits/${v1._id}/accept-reschedule`, tA);
    check('customer accepts → CONFIRMED on the new date', r.data?.data?.visit?.status === 'CONFIRMED' && r.data.data.visit.visitDate.startsWith(resched) && r.data.data.visit.timeSlot === 'EVENING', r.data);
    r = await call('PATCH', `/visits/${v1._id}/accept-reschedule`, tA);
    check('nothing left to accept → 409', r.status === 409);
    r = await call('PATCH', `/visits/${v1._id}/cancel`, tBeta);
    check('another customer cannot cancel → 404', r.status === 404);
    r = await call('PATCH', `/visits/${v1._id}/cancel`, tA);
    check('customer cancels → CANCELLED', r.data?.data?.visit?.status === 'CANCELLED', r.data);
    r = await call('PATCH', `/visits/${v1._id}/cancel`, tA);
    check('cancelling twice → 409', r.status === 409);
    r = await call('POST', '/visits', tA, visitBody());
    check('may re-request after cancelling', r.status === 201, r.data);
    const v2 = r.data?.data?.visit;
    r = await call('PATCH', `/visits/${v2._id}/respond`, tB, { action: 'decline', note: 'Site closed' });
    check('builder declines → DECLINED', r.data?.data?.visit?.status === 'DECLINED', r.data);
    r = await call('POST', '/visits', tA, visitBody());
    check('may re-request after a decline', r.status === 201, r.data);

    const hourIST = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();
    if (hourIST >= 12) {
      r = await call('POST', '/visits', tA, visitBody({ propertyId: String(p2._id), visitDate: today, timeSlot: 'MORNING' }));
      check('a slot that already passed today → 422', r.status === 422, r.data);
    } else {
      console.log('  – skipped “passed slot” check (it is before noon IST)');
    }
    if (hourIST < 19) {
      r = await call('POST', '/visits', tA, visitBody({ propertyId: String(p2._id), visitDate: today, timeSlot: 'EVENING' }));
      const v3 = r.data?.data?.visit;
      check('same-day evening visit accepted', r.status === 201, r.data);
      await call('PATCH', `/visits/${v3?._id}/respond`, tB, { action: 'confirm' });
      r = await call('PATCH', `/visits/${v3?._id}/respond`, tB, { action: 'complete' });
      check('builder can complete a visit on its date → COMPLETED', r.data?.data?.visit?.status === 'COMPLETED', r.data);
      r = await call('PATCH', `/visits/${v3?._id}/cancel`, tA);
      check('completed visit cannot be cancelled → 409', r.status === 409);
    } else {
      console.log('  – skipped same-day completion (it is after 7 PM IST)');
    }
    r = await call('GET', '/visits/builder/counts', tB);
    check('builder counts endpoint works', typeof r.data?.data?.total === 'number', r.data);

    // ─── G. Loans ──────────────────────────────────────────────────────────────
    section('G. Loan assistance');
    const loanBody = (over: Record<string, unknown> = {}) => ({
      propertyId: String(p1._id), contactName: 'Cust Alpha', contactPhone: '9876500001', consent: true, ...over,
    });
    r = await call('POST', '/loans', tA, loanBody({ consent: false }));
    check('consent is mandatory → 422', r.status === 422, r.data);
    r = await call('POST', '/loans', tA, loanBody({ contactPhone: '123' }));
    check('invalid phone → 422', r.status === 422);
    r = await call('POST', '/loans', tA, loanBody({ contactName: '  ' }));
    check('blank name → 422', r.status === 422);
    r = await call('POST', '/loans', tA, loanBody({ loanAmount: 4000000, monthlyIncome: 1 }));
    check('financial fields are not stored even if sent', r.status === 201 && !('loanAmount' in (r.data?.data?.loan || {})), r.data);
    await call('PATCH', `/loans/${r.data?.data?.loan?._id}/cancel`, tA);
    r = await call('POST', '/loans', tB, loanBody());
    check('builder cannot request a loan → 403', r.status === 403);
    r = await call('POST', '/loans', tA, loanBody({ propertyId: String(draft._id) }));
    check('loan against a non-public property → 404', r.status === 404);
    r = await call('POST', '/loans', tA, loanBody());
    const loan1 = r.data?.data?.loan;
    check('create DSA connection request → 201', r.status === 201, r.data);
    check('…routed to a DSA automatically (ASSIGNED)', loan1?.status === 'ASSIGNED' && !!loan1.dsa?.name, loan1);
    r = await call('POST', '/loans', tA, loanBody());
    check('duplicate open request for same property → 409', r.status === 409, r.data);

    const stored = await LoanRequest.findById(loan1._id).lean();
    const assignedDsa = stored?.dsaId ? await User.findById(stored.dsaId) : null;
    check('stored with explicit consent timestamp', stored?.consentGiven === true && !!stored.consentAt);
    if (assignedDsa) extraNotifyUsers.add(String(assignedDsa._id));
    const tAssigned = assignedDsa ? tokenFor(assignedDsa) : '';
    const tOtherDsa = tokenFor(dsa._id.equals(assignedDsa?._id) ? await mkUser('Dsa Two', UserRole.DSA) : dsa);

    r = await call('GET', '/loans/leads', tAssigned);
    check('assigned DSA sees the lead with customer details', r.data?.data?.leads?.some((l: any) => l._id === loan1._id && l.customer?.name === 'Cust Alpha'), r.data);
    r = await call('GET', '/loans/leads', tOtherDsa);
    check('a different DSA does not see it', !r.data?.data?.leads?.some((l: any) => l._id === loan1._id));
    r = await call('GET', '/loans/leads', tA);
    check('customer cannot read the DSA lead list → 403', r.status === 403);
    r = await call('PATCH', `/loans/${loan1._id}/status`, tOtherDsa, { status: 'IN_PROGRESS' });
    check('another DSA cannot update the lead → 404', r.status === 404);
    r = await call('PATCH', `/loans/${loan1._id}/status`, tAssigned, { status: 'CANCELLED' });
    check('DSA cannot set CANCELLED → 422', r.status === 422);
    r = await call('PATCH', `/loans/${loan1._id}/status`, tAssigned, { status: 'DOCUMENTS_REQUIRED', note: 'Please share 3 months of payslips' });
    check('DSA requests documents → DOCUMENTS_REQUIRED', r.data?.data?.lead?.status === 'DOCUMENTS_REQUIRED', r.data);
    r = await call('GET', '/loans/mine', tA);
    const myLoan = r.data?.data?.loans?.find((l: any) => l._id === loan1._id);
    check('customer sees the status and DSA note', myLoan?.status === 'DOCUMENTS_REQUIRED' && myLoan.dsaNote?.includes('payslips'), myLoan);
    check('customer was notified of the update', (await Notification.countDocuments({ userId: custA._id, type: 'LOAN_UPDATED', message: /documents/i })) === 1);
    r = await call('GET', '/loans/leads/counts', tAssigned);
    check('DSA counts endpoint reflects the active lead', r.data?.data?.active >= 1, r.data);
    r = await call('PATCH', `/loans/${loan1._id}/status`, tAssigned, { status: 'COMPLETED' });
    check('DSA completes the lead', r.data?.data?.lead?.status === 'COMPLETED', r.data);
    r = await call('PATCH', `/loans/${loan1._id}/status`, tAssigned, { status: 'IN_PROGRESS' });
    check('a completed lead is final → 409', r.status === 409);
    r = await call('PATCH', `/loans/${loan1._id}/cancel`, tA);
    check('completed request cannot be withdrawn → 409', r.status === 409);

    r = await call('POST', '/loans', tA, loanBody({ propertyId: undefined }));
    const loan2 = r.data?.data?.loan;
    check('general (no property) loan request → 201', r.status === 201, r.data);
    r = await call('POST', '/loans', tA, loanBody({ propertyId: undefined }));
    check('second open general request → 409', r.status === 409);
    r = await call('PATCH', `/loans/${loan2._id}/cancel`, tBeta);
    check('another customer cannot withdraw → 404', r.status === 404);
    r = await call('PATCH', `/loans/${loan2._id}/cancel`, tA);
    check('customer withdraws an open request → CANCELLED', r.data?.data?.loan?.status === 'CANCELLED', r.data);
    const l2 = await LoanRequest.findById(loan2._id).lean();
    if (l2?.dsaId) extraNotifyUsers.add(String(l2.dsaId));

    // ─── H. Notifications ──────────────────────────────────────────────────────
    section('H. Notifications');
    r = await call('GET', '/notifications', tA);
    const notes = r.data?.data?.notifications || [];
    check('customer has notifications with titles and links', notes.length >= 3 && notes.every((n: any) => n.title && n.message), notes.length);
    check('unread count matches list', r.data?.data?.unreadCount === notes.filter((n: any) => !n.readAt).length, r.data?.data?.unreadCount);
    const firstUnread = notes.find((n: any) => !n.readAt);
    r = await call('PATCH', `/notifications/${firstUnread._id}/read`, tBeta);
    check("cannot mark someone else's notification read → 404", r.status === 404);
    r = await call('PATCH', `/notifications/${firstUnread._id}/read`, tA);
    check('mark one read', r.status === 200);
    r = await call('GET', '/notifications/unread-count', tA);
    const before = r.data?.data?.count;
    r = await call('PATCH', '/notifications/read-all', tA);
    check('mark all read', r.status === 200 && r.data?.data?.updated === before, r.data);
    r = await call('GET', '/notifications/unread-count', tA);
    check('unread count is now 0', r.data?.data?.count === 0, r.data);
    r = await call('GET', '/notifications');
    check('notifications require auth → 401', r.status === 401);

    // ─── I. Dashboard + search suggestions + compare + localities ─────────────
    section('I. Dashboard & discovery extras');
    r = await call('GET', '/customer/dashboard', tA);
    const d = r.data?.data;
    check('dashboard counts: 1 saved', d?.counts?.saved === 1, d?.counts);
    check('dashboard counts: visits total reflects bookings', d?.counts?.visitsTotal >= 3, d?.counts);
    check('dashboard counts: DSA requests total 3 / 0 active', d?.counts?.loansTotal === 3 && d.counts.loansActive === 0, d?.counts);
    check('dashboard: next visit is the live pending request', d?.nextVisit?.status === 'PENDING' || d?.nextVisit?.status === 'CONFIRMED', d?.nextVisit);
    check('dashboard: recent views + searches present', d?.recentViews?.length >= 1 && d?.recentSearches?.length >= 1, { v: d?.recentViews?.length, s: d?.recentSearches?.length });
    check('dashboard: insights have a strength score', d?.insights?.profileStrength > 0, d?.insights);
    r = await call('DELETE', '/customer/activity/history', tA);
    check('clearing history succeeds', r.status === 200, r.data);
    r = await call('GET', '/customer/dashboard', tA);
    check('…views & searches are gone, saves/visits/loans stay', r.data?.data?.recentViews?.length === 0 && r.data.data.recentSearches.length === 0 && r.data.data.counts.saved === 1 && r.data.data.counts.loansTotal === 3, r.data?.data);

    r = await call('GET', `/properties/suggest?q=${encodeURIComponent('Alpha')}`);
    check('suggest returns matching projects', r.data?.data?.projects?.length >= 1, r.data);
    r = await call('GET', `/properties/suggest?q=Zenith`);
    check('suggest returns matching builders', r.data?.data?.builders?.some((b: any) => b.name === 'Zenith Builders'), r.data);
    r = await call('GET', `/properties/suggest?q=${locA.slice(0, 12)}`);
    check('suggest returns matching localities', r.data?.data?.localities?.some((l: any) => l.name === locA), r.data);
    r = await call('GET', '/properties/suggest?q=a');
    check('suggest ignores 1-character queries', r.data?.data?.projects?.length === 0);
    r = await call('GET', '/properties/suggest?q=(((');
    check('suggest survives regex metacharacters', r.status === 200);
    r = await call('GET', `/properties/compare?ids=${p1._id},${p4._id},${draft._id}`);
    check('compare returns requested public properties only, in order', r.data?.data?.properties?.map((p: any) => p._id).join() === `${p1._id},${p4._id}`, r.data);
    r = await call('GET', `/properties/compare?ids=${p1._id}`);
    check('compare needs ≥2 properties → 400', r.status === 400);
    r = await call('GET', '/properties/localities');
    const loc = r.data?.data?.localities?.find((l: any) => l.locality === locA);
    check('locality stats aggregate count + price range', loc?.count === 4 && loc.minPrice === 5000000 && loc.maxPrice === 9000000 && loc.avgPricePerSqFt > 0, loc);

    // keep linter quiet about fixtures only used for setup
    void p7;
  } finally {
    // ─── Cleanup ───────────────────────────────────────────────────────────────
    const owned = [...createdUsers];
    await Promise.all([
      Property.deleteMany({ builderId: { $in: owned } }),
      Favorite.deleteMany({ userId: { $in: owned } }),
      UserActivity.deleteMany({ userId: { $in: owned } }),
      SiteVisit.deleteMany({ $or: [{ customerId: { $in: owned } }, { builderId: { $in: owned } }] }),
      LoanRequest.deleteMany({ $or: [{ customerId: { $in: owned } }, { dsaId: { $in: owned } }] }),
      Notification.deleteMany({
        $or: [
          { userId: { $in: owned } },
          { userId: { $in: [...extraNotifyUsers].map((id) => new mongoose.Types.ObjectId(id)) }, createdAt: { $gte: startedAt } },
        ],
      }),
    ]);
    await User.deleteMany({ _id: { $in: owned } });
    server.close();
    await mongoose.disconnect();
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Test run crashed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
