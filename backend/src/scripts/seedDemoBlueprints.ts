import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Property, PropertyStatus } from '../models/Property';
import { Blueprint, BlueprintLevel, BlueprintType, BlueprintStatus } from '../models/Blueprint';

// Master blueprint asset catalog mapped to unit type / level
const BLUEPRINT_ASSET_MAP: Record<
  string,
  {
    fileName: string;
    fileUrl: string;
    blueprintType: string;
    mimeType: string;
    sizeBytes: number;
  }
> = {
  PROPERTY: {
    fileName: 'blueprint_site_plan.png',
    fileUrl: '/uploads/demo/blueprints/blueprint_site_plan.png',
    blueprintType: BlueprintType.SITE_PLAN,
    mimeType: 'image/png',
    sizeBytes: 2524292,
  },
  '2 BHK': {
    fileName: 'blueprint_2bhk.png',
    fileUrl: '/uploads/demo/blueprints/blueprint_2bhk.png',
    blueprintType: BlueprintType.UNIT_PLAN,
    mimeType: 'image/png',
    sizeBytes: 1949063,
  },
  '3 BHK': {
    fileName: 'blueprint_3bhk.png',
    fileUrl: '/uploads/demo/blueprints/blueprint_3bhk.png',
    blueprintType: BlueprintType.UNIT_PLAN,
    mimeType: 'image/png',
    sizeBytes: 1957579,
  },
  '4 BHK': {
    fileName: 'blueprint_4bhk.png',
    fileUrl: '/uploads/demo/blueprints/blueprint_4bhk.png',
    blueprintType: BlueprintType.UNIT_PLAN,
    mimeType: 'image/png',
    sizeBytes: 2001036,
  },
  '5 BHK': {
    fileName: 'blueprint_5bhk.png',
    fileUrl: '/uploads/demo/blueprints/blueprint_5bhk.png',
    blueprintType: BlueprintType.UNIT_PLAN,
    mimeType: 'image/png',
    sizeBytes: 1979118,
  },
};

export async function seedDemoBlueprints(): Promise<{
  propertiesProcessed: number;
  fullPropertyBlueprintsCreated: number;
  unitBlueprintsCreated: number;
  totalCreated: number;
  totalActiveBlueprints: number;
}> {
  const approvedProperties = await Property.find({ status: PropertyStatus.APPROVED }).lean();

  let fullPropertyCreated = 0;
  let unitBlueprintsCreated = 0;
  let propertiesProcessed = 0;

  for (const property of approvedProperties) {
    propertiesProcessed++;
    const propertyId = property._id;
    const builderId = property.builderId;

    // 1. Check if an ACTIVE PROPERTY-level blueprint already exists
    const existingPropertyBp = await Blueprint.findOne({
      propertyId,
      level: BlueprintLevel.PROPERTY,
      status: BlueprintStatus.ACTIVE,
    });

    if (!existingPropertyBp) {
      const asset = BLUEPRINT_ASSET_MAP['PROPERTY'];
      await Blueprint.create({
        propertyId,
        builderId,
        level: BlueprintLevel.PROPERTY,
        blueprintType: asset.blueprintType,
        title: `${property.projectName} - Master Site & Floor Layout`,
        description: `Complete site plan, building layout, and circulation blueprint for ${property.projectName}.`,
        fileUrl: asset.fileUrl,
        fileName: asset.fileName,
        fileMimeType: asset.mimeType,
        fileSizeBytes: asset.sizeBytes,
        version: 1,
        status: BlueprintStatus.ACTIVE,
        uploadedBy: builderId,
      });
      fullPropertyCreated++;
    }

    // 2. Iterate each BHK configuration that actually exists on this property
    for (const bhkConfig of property.bhkConfigurations) {
      const rawType = bhkConfig.type.trim(); // e.g. "2 BHK", "3 BHK", "2 BHK Type A"

      // Check if an ACTIVE UNIT blueprint already exists for this unitType
      const existingUnitBp = await Blueprint.findOne({
        propertyId,
        level: BlueprintLevel.UNIT,
        unitType: rawType,
        status: BlueprintStatus.ACTIVE,
      });

      if (existingUnitBp) {
        // Keep existing builder or demo blueprint untouched
        continue;
      }

      // Determine corresponding asset template
      let assetKey = '3 BHK';
      if (rawType.includes('2')) assetKey = '2 BHK';
      else if (rawType.includes('3')) assetKey = '3 BHK';
      else if (rawType.includes('4')) assetKey = '4 BHK';
      else if (rawType.includes('5')) assetKey = '5 BHK';

      const asset = BLUEPRINT_ASSET_MAP[assetKey] || BLUEPRINT_ASSET_MAP['3 BHK'];

      await Blueprint.create({
        propertyId,
        builderId,
        level: BlueprintLevel.UNIT,
        blueprintType: asset.blueprintType,
        unitType: rawType,
        unitLabel: rawType.includes('Type') ? undefined : 'Type A',
        title: `${rawType} Floor Plan (${bhkConfig.areaSqFt} sq.ft)`,
        description: `Architectural unit blueprint layout for ${rawType} residential configuration at ${property.projectName}.`,
        fileUrl: asset.fileUrl,
        fileName: asset.fileName,
        fileMimeType: asset.mimeType,
        fileSizeBytes: asset.sizeBytes,
        version: 1,
        status: BlueprintStatus.ACTIVE,
        uploadedBy: builderId,
      });

      unitBlueprintsCreated++;
    }
  }

  const totalActiveBlueprints = await Blueprint.countDocuments({ status: BlueprintStatus.ACTIVE });

  return {
    propertiesProcessed,
    fullPropertyBlueprintsCreated: fullPropertyCreated,
    unitBlueprintsCreated,
    totalCreated: fullPropertyCreated + unitBlueprintsCreated,
    totalActiveBlueprints,
  };
}

async function runStandalone() {
  await connectDatabase();
  console.log('Seeding demo blueprints for all approved properties...');
  const result = await seedDemoBlueprints();
  console.log('✓ Blueprint seeding completed:');
  console.log(`- Approved properties processed: ${result.propertiesProcessed}`);
  console.log(`- Full-property blueprints created: ${result.fullPropertyBlueprintsCreated}`);
  console.log(`- Unit-level BHK blueprints created: ${result.unitBlueprintsCreated}`);
  console.log(`- Total new blueprints created: ${result.totalCreated}`);
  console.log(`- Total active blueprints in system: ${result.totalActiveBlueprints}`);

  const mongooseInstance = (await import('mongoose')).default;
  await mongooseInstance.disconnect();
}

if (require.main === module) {
  runStandalone().catch((err) => {
    console.error('Failed to seed demo blueprints:', err);
    process.exit(1);
  });
}
