/**
 * Seeds a LOCAL development database with demo accounts and Ahmedabad listings so every
 * role and the whole customer journey can be exercised end to end.
 *
 *   MONGODB_URI=mongodb://localhost:27017/plinth_dev npx ts-node src/scripts/seedDevData.ts
 *
 * Idempotent (safe to re-run). Refuses to run against a non-local database unless
 * ALLOW_REMOTE_SEED=true is set, so demo credentials can't leak into a shared/real DB.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { env } from '../config/env';
import { User, UserRole, AccountStatus } from '../models/User';
import { Property } from '../models/Property';
import {
  seedMissingDemoProperties,
  MISSING_LOCALITY_PROPERTIES,
  SeedPropertyDef,
} from './seedMissingDemoProperties';

const DEV_PASSWORD = 'Plinth@12345';

const DEV_USERS = [
  { name: 'Plinth Admin', email: 'admin@plinth.dev', role: UserRole.ADMIN },
  { name: 'Arjun Arpan', email: 'arjun@arpan.builders', role: UserRole.BUILDER, phone: '9876500001' },
  { name: 'Shivalik Developers', email: 'builder@shivalik.dev', role: UserRole.BUILDER, phone: '9876500002' },
  { name: 'Meera Shah', email: 'meera@dsa.plinth.dev', role: UserRole.DSA, phone: '9876500003' },
  { name: 'Rohan Desai', email: 'rohan@dsa.plinth.dev', role: UserRole.DSA, phone: '9876500004' },
  { name: 'Heet Demo', email: 'heet@customer.dev', role: UserRole.CUSTOMER, phone: '9876500010' },
  { name: 'Priya Demo', email: 'priya@customer.dev', role: UserRole.CUSTOMER, phone: '9876500011' },
  { name: 'Karan Demo', email: 'karan@customer.dev', role: UserRole.CUSTOMER, phone: '9876500012' },
] as const;

// The shared demo set covers 15 localities — these four complete the 19
const EXTRA_DEFS: SeedPropertyDef[] = [
  {
    locality: 'Thaltej',
    projectName: 'Thaltej Skyline',
    title: 'Premium 3 & 4 BHK Residences in Thaltej',
    description: 'Thaltej Skyline offers expansive residences minutes from Thaltej Cross Roads and SG Highway, with a rooftop lounge, EV charging, smart-home wiring and generous green cover.',
    propertyType: 'Apartment',
    address: 'Thaltej-Shilaj Road, Near Thaltej Cross Roads, Thaltej',
    minPrice: 13500000, maxPrice: 22000000, minArea: 1850, maxArea: 2900,
    totalUnits: 96, availableUnits: 38,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2027-04-30'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Clubhouse', 'CCTV', 'Security', 'EV Charging Station'],
    coverImageUrl: '/uploads/demo/demo_property_2.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1850, priceMin: 13500000, priceMax: 17000000, totalUnits: 56, availableUnits: 22 },
      { type: '4 BHK', areaSqFt: 2900, priceMin: 18500000, priceMax: 22000000, totalUnits: 40, availableUnits: 16 },
    ],
  },
  {
    locality: 'Bodakdev',
    projectName: 'Bodakdev Crest',
    title: 'Luxury 3 & 4 BHK Residences in Bodakdev',
    description: 'Bodakdev Crest sits in the heart of the city’s premium dining and retail district, with concierge services, a landscaped podium, a private cinema and double-height lobbies.',
    propertyType: 'Apartment',
    address: 'Sarkhej-Gandhinagar Highway, Near Iscon Cross Roads, Bodakdev',
    minPrice: 21000000, maxPrice: 36000000, minArea: 2400, maxArea: 3800,
    totalUnits: 60, availableUnits: 18,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-12-31'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Clubhouse', 'CCTV', 'Security', 'Concierge'],
    coverImageUrl: '/uploads/demo/demo_property_3.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 2400, priceMin: 21000000, priceMax: 27000000, totalUnits: 36, availableUnits: 12 },
      { type: '4 BHK', areaSqFt: 3800, priceMin: 29000000, priceMax: 36000000, totalUnits: 24, availableUnits: 6 },
    ],
  },
  {
    locality: 'Bopal',
    projectName: 'Bopal Greens',
    title: 'Affordable 2 & 3 BHK Family Homes in Bopal',
    description: 'Bopal Greens delivers value-packed family living in fast-growing Bopal with a children’s play zone, jogging track, rainwater harvesting and quick access to the SP Ring Road.',
    propertyType: 'Apartment',
    address: 'Bopal-Ghuma Road, Near Bopal Cross Roads, Bopal',
    minPrice: 5600000, maxPrice: 9400000, minArea: 1100, maxArea: 1700,
    totalUnits: 150, availableUnits: 66,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-09-30'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Children Play Area', 'Jogging Track', 'CCTV', 'Security', 'Clubhouse'],
    coverImageUrl: '/uploads/demo/demo_property_4.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1100, priceMin: 5600000, priceMax: 7000000, totalUnits: 90, availableUnits: 40 },
      { type: '3 BHK', areaSqFt: 1700, priceMin: 7800000, priceMax: 9400000, totalUnits: 60, availableUnits: 26 },
    ],
  },
  {
    locality: 'Chandkheda',
    projectName: 'Chandkheda Meadows',
    title: 'Budget-Friendly 1 & 2 BHK Homes in Chandkheda',
    description: 'Chandkheda Meadows offers compact, well-planned homes close to the metro corridor and Sabarmati — ideal for first-time buyers, with covered parking and a community hall.',
    propertyType: 'Apartment',
    address: 'Visat-Gandhinagar Highway, Near Chandkheda Metro Station, Chandkheda',
    minPrice: 3200000, maxPrice: 5600000, minArea: 620, maxArea: 1050,
    totalUnits: 120, availableUnits: 58,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-06-30'),
    amenities: ['Lift', 'Parking', 'Community Hall', 'CCTV', 'Security', 'Power Backup'],
    coverImageUrl: '/uploads/demo/demo_property_5.jpg',
    bhkConfigurations: [
      { type: '1 BHK', areaSqFt: 620, priceMin: 3200000, priceMax: 3900000, totalUnits: 60, availableUnits: 30 },
      { type: '2 BHK', areaSqFt: 1050, priceMin: 4600000, priceMax: 5600000, totalUnits: 60, availableUnits: 28 },
    ],
  },
];

function assertLocalDatabase(): void {
  const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(env.MONGODB_URI);
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
    console.error(
      '[SEED] Refusing to seed: MONGODB_URI is not a local database.\n' +
        '       Point MONGODB_URI at localhost (e.g. mongodb://localhost:27017/plinth_dev),\n' +
        '       or set ALLOW_REMOTE_SEED=true if you really mean it.'
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();
  await connectDatabase();

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  for (const u of DEV_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) continue;
    await User.create({
      ...u,
      passwordHash,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
      loginCount: 1,
    });
    console.log(`[SEED] Created ${u.role.padEnd(8)} ${u.email}`);
  }

  const result = await seedMissingDemoProperties([...MISSING_LOCALITY_PROPERTIES, ...EXTRA_DEFS]);
  console.log(`[SEED] Properties created: ${result.createdCount} (approved total: ${result.totalApproved})`);

  // Spread listings across two builders so builder-affinity scoring has something to chew on
  const second = await User.findOne({ email: 'builder@shivalik.dev' });
  if (second) {
    const res = await Property.updateMany(
      { locality: { $in: ['Shela', 'Bopal', 'Thaltej', 'Gota', 'Tragad', 'Ghuma', 'Nikol', 'Chandkheda'] } },
      { $set: { builderId: second._id } }
    );
    if (res.modifiedCount > 0) console.log(`[SEED] Reassigned ${res.modifiedCount} listings to ${second.name}`);
  }

  console.log(`\n[SEED] Done. All dev accounts use password: ${DEV_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[SEED] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
