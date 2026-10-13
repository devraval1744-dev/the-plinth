import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Property, PropertyStatus } from '../models/Property';
import { User, UserRole } from '../models/User';

export const ALL_19_LOCALITIES = [
  'Ambli',
  'Thaltej',
  'Bodakdev',
  'Bopal',
  'Shela',
  'Satellite',
  'Vastrapur',
  'Gota',
  'Prahladnagar',
  'Chandkheda',
  'Maninagar',
  'Navrangpura',
  'Nikol',
  'Tragad',
  'Makarba',
  'Vaishnodevi',
  'Jodhpur',
  'Wadaj',
  'Ghuma',
] as const;

export interface SeedPropertyDef {
  locality: string;
  projectName: string;
  title: string;
  description: string;
  propertyType: string;
  address: string;
  minPrice: number;
  maxPrice: number;
  minArea: number;
  maxArea: number;
  totalUnits: number;
  availableUnits: number;
  constructionStatus: string;
  possessionDate: Date;
  amenities: string[];
  coverImageUrl: string;
  bhkConfigurations: {
    type: string;
    areaSqFt: number;
    priceMin: number;
    priceMax: number;
    totalUnits: number;
    availableUnits: number;
  }[];
}

// 15 missing localities definitions with realistic Ahmedabad real estate details
export const MISSING_LOCALITY_PROPERTIES: SeedPropertyDef[] = [
  {
    locality: 'Ambli',
    projectName: 'Ambli Heights',
    title: 'Ultra Luxury 4 & 5 BHK Sky Mansions in Ambli',
    description: 'Ambli Heights delivers ultra-premium sky residences along the prestigious Ambli-Bopal road corridor. Featuring private elevator access, double-height sundecks, Italian marble finishes, and an exclusive rooftop infinity pool.',
    propertyType: 'Apartment',
    address: 'Ambli-Bopal Road, Near Ambli Circle, Ambli',
    minPrice: 28000000,
    maxPrice: 49000000,
    minArea: 3800,
    maxArea: 5600,
    totalUnits: 48,
    availableUnits: 19,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2027-06-30'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Clubhouse', 'CCTV', 'Security', 'Landscaped Garden', 'Private Elevator'],
    coverImageUrl: '/uploads/demo/demo_property_10.jpg',
    bhkConfigurations: [
      { type: '4 BHK', areaSqFt: 3800, priceMin: 28000000, priceMax: 35000000, totalUnits: 28, availableUnits: 12 },
      { type: '5 BHK', areaSqFt: 5600, priceMin: 42000000, priceMax: 49000000, totalUnits: 20, availableUnits: 7 },
    ],
  },
  {
    locality: 'Shela',
    projectName: 'Shela Urban Heights',
    title: 'Modern 3 & 4 BHK Contemporary Residences in Shela',
    description: 'Shela Urban Heights provides spacious, naturally lit family apartments in high-growth New West Ahmedabad with expansive sports amenities, landscaped gardens, and rapid connectivity to SG Highway and SP Ring Road.',
    propertyType: 'Apartment',
    address: 'Club O7 Road, Off SP Ring Road, Shela',
    minPrice: 8500000,
    maxPrice: 14500000,
    minArea: 1650,
    maxArea: 2500,
    totalUnits: 160,
    availableUnits: 64,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-12-31'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Children Play Area', 'Clubhouse', 'CCTV', 'Security'],
    coverImageUrl: '/uploads/demo/demo_property_11.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1650, priceMin: 8500000, priceMax: 11000000, totalUnits: 100, availableUnits: 40 },
      { type: '4 BHK', areaSqFt: 2500, priceMin: 12500000, priceMax: 14500000, totalUnits: 60, availableUnits: 24 },
    ],
  },
  {
    locality: 'Satellite',
    projectName: 'Satellite Residency',
    title: 'Exclusive 3 & 4 BHK Urban Apartments in Satellite',
    description: 'Satellite Residency is an upscale residential landmark in prime Satellite, minutes from ISRO and Shivranjani Cross Roads. Built for modern city convenience with smart home automation and dedicated basement parking.',
    propertyType: 'Apartment',
    address: 'Ramdevnagar Road, Near Shivranjani, Satellite',
    minPrice: 16500000,
    maxPrice: 26000000,
    minArea: 2100,
    maxArea: 3200,
    totalUnits: 72,
    availableUnits: 28,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-09-30'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Clubhouse', 'CCTV', 'Security', 'Intercom', 'Power Backup'],
    coverImageUrl: '/uploads/demo/demo_property_12.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 2100, priceMin: 16500000, priceMax: 20000000, totalUnits: 40, availableUnits: 16 },
      { type: '4 BHK', areaSqFt: 3200, priceMin: 22000000, priceMax: 26000000, totalUnits: 32, availableUnits: 12 },
    ],
  },
  {
    locality: 'Vastrapur',
    projectName: 'Vastrapur Elite',
    title: 'Luxury 3 & 4 BHK Lakefront Residences in Vastrapur',
    description: 'Vastrapur Elite overlooks serene city greenery moments from Vastrapur Lake and Alpha One Mall. Offering expansive master suites, modular designer kitchens, jogging tracks, and 24/7 biometric security.',
    propertyType: 'Apartment',
    address: 'Vastrapur Lake Road, Opposite IIM Ahmedabad, Vastrapur',
    minPrice: 17500000,
    maxPrice: 28500000,
    minArea: 2200,
    maxArea: 3400,
    totalUnits: 84,
    availableUnits: 31,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-11-15'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Jogging Track', 'CCTV', 'Security', 'Clubhouse'],
    coverImageUrl: '/uploads/demo/demo_property_13.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 2200, priceMin: 17500000, priceMax: 22000000, totalUnits: 48, availableUnits: 18 },
      { type: '4 BHK', areaSqFt: 3400, priceMin: 24500000, priceMax: 28500000, totalUnits: 36, availableUnits: 13 },
    ],
  },
  {
    locality: 'Gota',
    projectName: 'Gota Horizon',
    title: 'Smart 2 & 3 BHK High-Rise Living in Gota',
    description: 'Gota Horizon delivers contemporary urban residences strategically located off SG Highway with quick access to SGVP International School and Nirma University. Perfect for modern working professionals and young families.',
    propertyType: 'Apartment',
    address: 'Near Vandemataram Cross Roads, SG Highway, Gota',
    minPrice: 5800000,
    maxPrice: 9200000,
    minArea: 1150,
    maxArea: 1750,
    totalUnits: 180,
    availableUnits: 72,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-10-31'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Children Play Area', 'Clubhouse', 'CCTV', 'Security', 'Garden'],
    coverImageUrl: '/uploads/demo/demo_property_14.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1150, priceMin: 5800000, priceMax: 7200000, totalUnits: 100, availableUnits: 42 },
      { type: '3 BHK', areaSqFt: 1750, priceMin: 7800000, priceMax: 9200000, totalUnits: 80, availableUnits: 30 },
    ],
  },
  {
    locality: 'Prahladnagar',
    projectName: 'Prahladnagar Heights',
    title: 'Elite 3 & 4 BHK Corporate Residences in Prahladnagar',
    description: 'Prahladnagar Heights stands in Ahmedabad’s most vibrant business and dining district. Enjoy immediate proximity to Prahladnagar Garden, corporate hubs, premium fitness centers, and fine dining avenues.',
    propertyType: 'Apartment',
    address: 'Prahladnagar Corporate Road, Near Garden, Prahladnagar',
    minPrice: 19000000,
    maxPrice: 31000000,
    minArea: 2300,
    maxArea: 3600,
    totalUnits: 64,
    availableUnits: 22,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-08-31'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Banquet Hall', 'CCTV', 'Security', 'Intercom'],
    coverImageUrl: '/uploads/demo/demo_property_15.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 2300, priceMin: 19000000, priceMax: 24000000, totalUnits: 36, availableUnits: 12 },
      { type: '4 BHK', areaSqFt: 3600, priceMin: 26500000, priceMax: 31000000, totalUnits: 28, availableUnits: 10 },
    ],
  },
  {
    locality: 'Maninagar',
    projectName: 'Maninagar Central Homes',
    title: 'Spacious 2 & 3 BHK Heritage Living in Maninagar',
    description: 'Maninagar Central Homes offers comfortable community living in the heart of South Ahmedabad, just minutes from Kankaria Lake and Maninagar Railway Station. Featuring landscaped courtyards and dedicated covered parking.',
    propertyType: 'Apartment',
    address: 'Near Kankaria Gate No. 3, Maninagar',
    minPrice: 6200000,
    maxPrice: 9800000,
    minArea: 1200,
    maxArea: 1850,
    totalUnits: 96,
    availableUnits: 38,
    constructionStatus: 'Completed',
    possessionDate: new Date('2025-06-30'),
    amenities: ['Lift', 'Parking', 'Community Hall', 'CCTV', 'Security', 'Power Backup', 'Senior Citizen Sit-out'],
    coverImageUrl: '/uploads/demo/demo_property_16.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1200, priceMin: 6200000, priceMax: 7600000, totalUnits: 56, availableUnits: 22 },
      { type: '3 BHK', areaSqFt: 1850, priceMin: 8400000, priceMax: 9800000, totalUnits: 40, availableUnits: 16 },
    ],
  },
  {
    locality: 'Navrangpura',
    projectName: 'Navrangpura Urban Living',
    title: 'Prime 3 & 4 BHK Boutique Residences in Navrangpura',
    description: 'Navrangpura Urban Living brings refined city architecture to the cultural heart of Ahmedabad, walking distance from Gujarat University and CEPT. Designed with generous balcony views and double-height entrance lobbies.',
    propertyType: 'Apartment',
    address: 'Commerce College Road, Near St. Xavier’s Corner, Navrangpura',
    minPrice: 15500000,
    maxPrice: 24500000,
    minArea: 1950,
    maxArea: 2950,
    totalUnits: 52,
    availableUnits: 19,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-09-30'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Terrace Garden', 'CCTV', 'Security', 'EV Charging Station'],
    coverImageUrl: '/uploads/demo/demo_property_17.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1950, priceMin: 15500000, priceMax: 19500000, totalUnits: 32, availableUnits: 11 },
      { type: '4 BHK', areaSqFt: 2950, priceMin: 21500000, priceMax: 24500000, totalUnits: 20, availableUnits: 8 },
    ],
  },
  {
    locality: 'Nikol',
    projectName: 'Nikol Green Homes',
    title: 'Value-Packed 2 & 3 BHK Family Homes in Nikol',
    description: 'Nikol Green Homes offers serene, green community living in East Ahmedabad along the SP Ring Road corridor. Complete with a clubhouse, children’s playground, and ample open recreational spaces.',
    propertyType: 'Apartment',
    address: 'Nikol-Naroda Road, Near Raspan Arcade, Nikol',
    minPrice: 4500000,
    maxPrice: 7200000,
    minArea: 1050,
    maxArea: 1600,
    totalUnits: 140,
    availableUnits: 55,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-07-31'),
    amenities: ['Lift', 'Parking', 'Children Play Area', 'Clubhouse', 'CCTV', 'Security', 'Landscaped Garden'],
    coverImageUrl: '/uploads/demo/demo_property_18.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1050, priceMin: 4500000, priceMax: 5600000, totalUnits: 80, availableUnits: 32 },
      { type: '3 BHK', areaSqFt: 1600, priceMin: 6200000, priceMax: 7200000, totalUnits: 60, availableUnits: 23 },
    ],
  },
  {
    locality: 'Tragad',
    projectName: 'Tragad Heights',
    title: 'Modern 2 & 3 BHK Garden Residences in Tragad',
    description: 'Tragad Heights offers tranquil contemporary living adjacent to the SG Highway and Gandhinagar connectivity corridor. Features modern earthquake-resistant RCC architecture and scenic courtyard views.',
    propertyType: 'Apartment',
    address: 'Tragad Road, Near Nirma University, Tragad',
    minPrice: 5200000,
    maxPrice: 8400000,
    minArea: 1100,
    maxArea: 1700,
    totalUnits: 110,
    availableUnits: 46,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-11-30'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Yoga Deck', 'CCTV', 'Security', 'Jogging Track'],
    coverImageUrl: '/uploads/demo/demo_property_19.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1100, priceMin: 5200000, priceMax: 6500000, totalUnits: 60, availableUnits: 26 },
      { type: '3 BHK', areaSqFt: 1700, priceMin: 7200000, priceMax: 8400000, totalUnits: 50, availableUnits: 20 },
    ],
  },
  {
    locality: 'Makarba',
    projectName: 'Makarba Prime Residences',
    title: 'Signature 3 & 4 BHK Luxury Residences in Makarba',
    description: 'Makarba Prime Residences combines effortless access to SG Highway corporate parks with peaceful residential comfort. Featuring landscaped podium decks, infinity swimming pool, and dedicated clubhouse.',
    propertyType: 'Apartment',
    address: 'Near Corporate Road, Prahladnagar Extension, Makarba',
    minPrice: 12500000,
    maxPrice: 21000000,
    minArea: 1800,
    maxArea: 2800,
    totalUnits: 90,
    availableUnits: 34,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2027-03-31'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Clubhouse', 'CCTV', 'Security', 'Indoor Games'],
    coverImageUrl: '/uploads/demo/demo_property_20.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1800, priceMin: 12500000, priceMax: 16000000, totalUnits: 54, availableUnits: 20 },
      { type: '4 BHK', areaSqFt: 2800, priceMin: 18500000, priceMax: 21000000, totalUnits: 36, availableUnits: 14 },
    ],
  },
  {
    locality: 'Vaishnodevi',
    projectName: 'Vaishnodevi Enclave',
    title: 'Grand 3 & 4 BHK High-Rise Towers at Vaishnodevi',
    description: 'Vaishnodevi Enclave rises majestically at the intersection of SG Highway and SP Ring Road, offering panoramic skyline vistas, proximity to GIFT City route, and resort-grade lifestyle amenities.',
    propertyType: 'Apartment',
    address: 'Near Vaishnodevi Circle, SG Highway, Vaishnodevi',
    minPrice: 9800000,
    maxPrice: 17500000,
    minArea: 1700,
    maxArea: 2650,
    totalUnits: 130,
    availableUnits: 52,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2027-01-31'),
    amenities: ['Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Sky Lounge', 'CCTV', 'Security', 'Tennis Court'],
    coverImageUrl: '/uploads/demo/demo_property_21.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1700, priceMin: 9800000, priceMax: 13000000, totalUnits: 78, availableUnits: 32 },
      { type: '4 BHK', areaSqFt: 2650, priceMin: 14800000, priceMax: 17500000, totalUnits: 52, availableUnits: 20 },
    ],
  },
  {
    locality: 'Jodhpur',
    projectName: 'Jodhpur Heights',
    title: 'Peaceful 3 & 4 BHK Residences in Jodhpur Village',
    description: 'Jodhpur Heights offers serene low-density living in central Ahmedabad near ISRO and Star Bazaar. Complete with lush courtyard gardens, cross-ventilated layouts, and premium branded sanitary fittings.',
    propertyType: 'Apartment',
    address: 'Near Star Bazaar, Jodhpur Village Road, Jodhpur',
    minPrice: 14500000,
    maxPrice: 23500000,
    minArea: 1850,
    maxArea: 2750,
    totalUnits: 60,
    availableUnits: 21,
    constructionStatus: 'Ready to Move',
    possessionDate: new Date('2025-10-31'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Community Hall', 'CCTV', 'Security', 'Intercom'],
    coverImageUrl: '/uploads/demo/demo_property_1.jpg',
    bhkConfigurations: [
      { type: '3 BHK', areaSqFt: 1850, priceMin: 14500000, priceMax: 18500000, totalUnits: 36, availableUnits: 13 },
      { type: '4 BHK', areaSqFt: 2750, priceMin: 20500000, priceMax: 23500000, totalUnits: 24, availableUnits: 8 },
    ],
  },
  {
    locality: 'Wadaj',
    projectName: 'Wadaj Residency',
    title: 'Connected 2 & 3 BHK Riverfront Living in Wadaj',
    description: 'Wadaj Residency provides exceptional connectivity along the Sabarmati Riverfront and 132ft Ring Road with rapid metro transit access. Designed with spacious balconies and energy-efficient lighting.',
    propertyType: 'Apartment',
    address: 'Near Vadaj Bus Terminus, Ashram Road Ext, Wadaj',
    minPrice: 5900000,
    maxPrice: 8900000,
    minArea: 1120,
    maxArea: 1680,
    totalUnits: 100,
    availableUnits: 41,
    constructionStatus: 'Completed',
    possessionDate: new Date('2025-05-31'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Children Play Area', 'CCTV', 'Security', 'Rainwater Harvesting'],
    coverImageUrl: '/uploads/demo/demo_property_7.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1120, priceMin: 5900000, priceMax: 7100000, totalUnits: 60, availableUnits: 25 },
      { type: '3 BHK', areaSqFt: 1680, priceMin: 7800000, priceMax: 8900000, totalUnits: 40, availableUnits: 16 },
    ],
  },
  {
    locality: 'Ghuma',
    projectName: 'Ghuma Green Residences',
    title: 'Spacious 2 & 3 BHK Green Homes in Ghuma',
    description: 'Ghuma Green Residences offers peaceful suburban living in West Ahmedabad, featuring panoramic green views, landscaped community parks, and close proximity to South Bopal amenities.',
    propertyType: 'Apartment',
    address: 'Near Ghuma Bus Stand, Bopal-Ghuma Road, Ghuma',
    minPrice: 4900000,
    maxPrice: 7800000,
    minArea: 1080,
    maxArea: 1620,
    totalUnits: 120,
    availableUnits: 49,
    constructionStatus: 'Under Construction',
    possessionDate: new Date('2026-08-31'),
    amenities: ['Lift', 'Parking', 'Gymnasium', 'Jogging Track', 'CCTV', 'Security', 'Senior Citizen Sit-out'],
    coverImageUrl: '/uploads/demo/demo_property_8.jpg',
    bhkConfigurations: [
      { type: '2 BHK', areaSqFt: 1080, priceMin: 4900000, priceMax: 6100000, totalUnits: 70, availableUnits: 29 },
      { type: '3 BHK', areaSqFt: 1620, priceMin: 6800000, priceMax: 7800000, totalUnits: 50, availableUnits: 20 },
    ],
  },
];

export async function seedMissingDemoProperties(): Promise<{
  createdCount: number;
  existingCount: number;
  totalApproved: number;
  localitiesCovered: string[];
}> {
  // 1. Get primary builder and admin for references
  const builder =
    (await User.findOne({ email: 'arjun@arpan.builders', role: UserRole.BUILDER })) ||
    (await User.findOne({ role: UserRole.BUILDER, accountStatus: 'ACTIVE' }));

  if (!builder) {
    throw new Error('No active Builder found in database to assign demo properties to.');
  }

  const admin = await User.findOne({ role: UserRole.ADMIN });

  // 2. Query all existing approved properties
  const existingApproved = await Property.find({ status: PropertyStatus.APPROVED }).lean();
  const existingLocalities = new Set(existingApproved.map((p) => p.locality));

  let createdCount = 0;

  for (const def of MISSING_LOCALITY_PROPERTIES) {
    // If this locality already has an approved property, preserve it and do not duplicate
    if (existingLocalities.has(def.locality)) {
      continue;
    }

    const newProperty = new Property({
      builderId: builder._id,
      title: def.title,
      projectName: def.projectName,
      description: def.description,
      propertyType: def.propertyType,
      locality: def.locality,
      city: 'Ahmedabad',
      state: 'Gujarat',
      address: def.address,
      minPrice: def.minPrice,
      maxPrice: def.maxPrice,
      minArea: def.minArea,
      maxArea: def.maxArea,
      totalUnits: def.totalUnits,
      availableUnits: def.availableUnits,
      constructionStatus: def.constructionStatus,
      possessionDate: def.possessionDate,
      amenities: def.amenities,
      coverImageUrl: def.coverImageUrl,
      images: [
        {
          url: def.coverImageUrl,
          caption: def.title,
          isPrimary: true,
          uploadedAt: new Date(),
        },
      ],
      documents: [],
      status: PropertyStatus.APPROVED,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: admin?._id || builder._id,
      adminNotes: 'Verified and approved for Ahmedabad locality showcase.',
      pendingReApproval: false,
    });

    // Populate approvedSnapshot so consistency is preserved
    newProperty.approvedSnapshot = {
      title: def.title,
      projectName: def.projectName,
      description: def.description,
      propertyType: def.propertyType,
      locality: def.locality,
      city: 'Ahmedabad',
      state: 'Gujarat',
      address: def.address,
      minPrice: def.minPrice,
      maxPrice: def.maxPrice,
      minArea: def.minArea,
      maxArea: def.maxArea,
      totalUnits: def.totalUnits,
      availableUnits: def.availableUnits,
      constructionStatus: def.constructionStatus,
      possessionDate: def.possessionDate,
      amenities: def.amenities,
      coverImageUrl: def.coverImageUrl,
      images: [
        {
          url: def.coverImageUrl,
          caption: def.title,
          isPrimary: true,
          uploadedAt: new Date(),
        },
      ],
      bhkConfigurations: def.bhkConfigurations,
    };

    newProperty.bhkConfigurations = def.bhkConfigurations;

    await newProperty.save();
    existingLocalities.add(def.locality);
    createdCount++;
  }

  const allApproved = await Property.find({ status: PropertyStatus.APPROVED }).lean();
  const coveredLocalities = Array.from(new Set(allApproved.map((p) => p.locality)));

  return {
    createdCount,
    existingCount: existingApproved.length,
    totalApproved: allApproved.length,
    localitiesCovered: coveredLocalities,
  };
}

async function runStandalone() {
  await connectDatabase();
  console.log('Seeding missing demo properties for Ahmedabad localities...');
  const res = await seedMissingDemoProperties();
  console.log(`✓ Seeding complete: Created ${res.createdCount} new properties.`);
  console.log(`Total approved properties in DB: ${res.totalApproved}`);
  console.log(`Localities covered (${res.localitiesCovered.length}):`, res.localitiesCovered);
  const mongooseInstance = (await import('mongoose')).default;
  await mongooseInstance.disconnect();
}

if (require.main === module) {
  runStandalone().catch((err) => {
    console.error('Error seeding demo properties:', err);
    process.exit(1);
  });
}
