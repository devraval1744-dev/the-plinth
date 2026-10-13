import { connectDatabase } from '../config/database';
import { Property, PropertyStatus } from '../models/Property';

const DEMO_IMAGE_POOL = [
  '/uploads/demo/demo_property_1.jpg',
  '/uploads/demo/demo_property_2.jpg',
  '/uploads/demo/demo_property_3.jpg',
  '/uploads/demo/demo_property_4.jpg',
  '/uploads/demo/demo_property_5.jpg',
  '/uploads/demo/demo_property_6.jpg',
  '/uploads/demo/demo_property_7.jpg',
  '/uploads/demo/demo_property_8.jpg',
  '/uploads/demo/demo_property_9.jpg',
];

export async function assignDemoPropertyImages(): Promise<{
  updatedCount: number;
  skippedCount: number;
  totalProperties: number;
}> {
  // Find all properties sorted by creation time
  const properties = await Property.find({}).sort({ createdAt: 1 });

  let updatedCount = 0;
  let skippedCount = 0;
  let demoImageIndex = 0;

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];

    // Priority Rule: If already has a real Builder-uploaded cover image (/uploads/properties/),
    // KEEP AND NEVER OVERWRITE
    const isBuilderUploaded =
      (prop.coverImageUrl && prop.coverImageUrl.startsWith('/uploads/properties/')) ||
      (prop.images && prop.images.some((img) => img.url && img.url.startsWith('/uploads/properties/')));

    if (isBuilderUploaded) {
      skippedCount++;
      continue;
    }

    // Assign a unique image from the demo pool to each distinct property
    const assignedImage = DEMO_IMAGE_POOL[demoImageIndex % DEMO_IMAGE_POOL.length];
    demoImageIndex++;

    prop.coverImageUrl = assignedImage;
    prop.images = [
      {
        url: assignedImage,
        caption: prop.title,
        isPrimary: true,
        uploadedAt: new Date(),
      },
    ];

    // If there is an approved snapshot, ensure snapshot has the identical unique image
    if (prop.approvedSnapshot) {
      prop.approvedSnapshot.coverImageUrl = assignedImage;
      prop.approvedSnapshot.images = [
        {
          url: assignedImage,
          caption: prop.title,
          isPrimary: true,
          uploadedAt: new Date(),
        },
      ];
    }

    await prop.save();
    updatedCount++;
  }

  return {
    updatedCount,
    skippedCount,
    totalProperties: properties.length,
  };
}

async function runStandalone() {
  await connectDatabase();
  const res = await assignDemoPropertyImages();
  console.log(`Demo property image assignment complete: ${res.updatedCount} updated, ${res.skippedCount} kept/skipped out of ${res.totalProperties} properties.`);
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
}

if (require.main === module) {
  runStandalone().catch((err) => {
    console.error('Error assigning demo images:', err);
    process.exit(1);
  });
}
