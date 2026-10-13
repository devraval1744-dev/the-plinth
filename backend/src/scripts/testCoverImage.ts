import http from 'http';
import express from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import FormData from 'form-data';
import cookieParser from 'cookie-parser';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import { Property, PropertyStatus } from '../models/Property';
import apiRoutes from '../routes/index';

async function runCoverImageTests() {
  console.log('--- STARTING PROPERTY COVER IMAGE & SUBMISSION SECURITY TESTS ---');
  await connectDatabase();

  let createdPropertyId: string | null = null;
  const timestamp = Date.now();
  const builder1Email = `b1_img_${timestamp}@example.com`;
  const builder2Email = `b2_img_${timestamp}@example.com`;
  const adminEmail = `admin_img_${timestamp}@example.com`;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', apiRoutes);
  const { errorHandler } = await import('../middleware/error.middleware');
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // 1. Create Users
    const b1 = await User.create({
      name: 'Builder One',
      email: builder1Email,
      passwordHash: await bcrypt.hash('Builder1Pass123', 12),
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
    });

    const b2 = await User.create({
      name: 'Builder Two',
      email: builder2Email,
      passwordHash: await bcrypt.hash('Builder2Pass123', 12),
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
    });

    const admin = await User.create({
      name: 'Admin User',
      email: adminEmail,
      passwordHash: await bcrypt.hash('AdminPass123', 12),
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    });

    // Login b1, b2, admin to get tokens
    const b1Login = await axios.post(`${baseUrl}/auth/login`, {
      email: builder1Email,
      password: 'Builder1Pass123',
    });
    const b1Token = b1Login.data.data.token;

    const b2Login = await axios.post(`${baseUrl}/auth/login`, {
      email: builder2Email,
      password: 'Builder2Pass123',
    });
    const b2Token = b2Login.data.data.token;

    const adminLogin = await axios.post(`${baseUrl}/auth/login`, {
      email: adminEmail,
      password: 'AdminPass123',
    });
    const adminToken = adminLogin.data.data.token;

    // TEST 1: Builder creates property without image -> remains DRAFT -> submit without image is REJECTED
    const createRes = await axios.post(
      `${baseUrl}/properties`,
      {
        title: 'Shivalik Heights Luxury Living',
        projectName: 'Shivalik Heights',
        description: 'Magnificent 3 BHK luxury residences in the prime neighborhood of Bodakdev.',
        propertyType: 'Apartment',
        locality: 'Bodakdev',
        city: 'Ahmedabad',
        state: 'Gujarat',
        address: 'Sindhu Bhavan Road, Bodakdev',
        minPrice: 15000000,
        maxPrice: 25000000,
        minArea: 2100,
        maxArea: 3200,
        totalUnits: 120,
        availableUnits: 45,
        constructionStatus: 'Under Construction',
      },
      { headers: { Authorization: `Bearer ${b1Token}` } }
    );

    const propertyId = createRes.data.data.property._id;
    createdPropertyId = propertyId;
    if (createRes.data.data.property.status !== 'DRAFT') {
      throw new Error('Property should be in DRAFT status');
    }
    console.log('✓ TEST 1a Passed: Builder created property without image as DRAFT');

    // Attempt to submit without image -> MUST FAIL with 422
    let submitFailed = false;
    try {
      await axios.post(
        `${baseUrl}/properties/${propertyId}/submit`,
        {},
        { headers: { Authorization: `Bearer ${b1Token}` } }
      );
    } catch (err: any) {
      if (err.response?.status === 422 && err.response?.data?.message?.includes('cover image is required')) {
        submitFailed = true;
      } else {
        throw new Error(`Unexpected error on submit without image: ${err.response?.status} - ${err.response?.data?.message}`);
      }
    }
    if (!submitFailed) throw new Error('Submission without image should have been rejected');
    console.log('✓ TEST 1b & TEST 6 Passed: Submit rejected with clear error when cover image is missing (Backend 422)');

    // TEST 7: Builder 2 tries to upload image for Builder 1 property -> REJECTED (403)
    let b2Blocked = false;
    const dummyImageBuffer = Buffer.from('fake-image-bytes-jpeg');
    const formB2 = new FormData();
    formB2.append('coverImage', dummyImageBuffer, {
      filename: 'cover.jpg',
      contentType: 'image/jpeg',
    });

    try {
      await axios.post(`${baseUrl}/properties/${propertyId}/cover-image`, formB2, {
        headers: {
          ...formB2.getHeaders(),
          Authorization: `Bearer ${b2Token}`,
        },
      });
    } catch (err: any) {
      if (err.response?.status === 403) {
        b2Blocked = true;
      }
    }
    if (!b2Blocked) throw new Error('Builder 2 should not be able to upload cover image to Builder 1 property');
    console.log('✓ TEST 7 Passed: Changing another Builder property image is blocked (403)');

    // TEST 2: Builder 1 uploads valid JPG image
    const formB1 = new FormData();
    formB1.append('coverImage', dummyImageBuffer, {
      filename: 'shivalik_cover.jpg',
      contentType: 'image/jpeg',
    });

    const uploadRes = await axios.post(`${baseUrl}/properties/${propertyId}/cover-image`, formB1, {
      headers: {
        ...formB1.getHeaders(),
        Authorization: `Bearer ${b1Token}`,
      },
    });

    const uploadedUrl = uploadRes.data.data.coverImageUrl;
    if (!uploadedUrl || !uploadedUrl.startsWith('/uploads/properties/')) {
      throw new Error(`Unexpected coverImageUrl: ${uploadedUrl}`);
    }

    // Verify stored in DB
    const propInDb = await Property.findById(propertyId);
    if (propInDb?.coverImageUrl !== uploadedUrl) {
      throw new Error('Database coverImageUrl did not match uploaded URL');
    }
    console.log('✓ TEST 2 Passed: Valid cover image uploaded, saved under uploads/properties/<id>/ and reference persisted');

    // TEST 3: Builder 1 submits property with cover image -> SUCCESS (SUBMITTED)
    const submitRes = await axios.post(
      `${baseUrl}/properties/${propertyId}/submit`,
      {},
      { headers: { Authorization: `Bearer ${b1Token}` } }
    );
    if (submitRes.data.data.property.status !== 'SUBMITTED') {
      throw new Error(`Expected status SUBMITTED, got ${submitRes.data.data.property.status}`);
    }
    console.log('✓ TEST 3 Passed: Builder submits property with cover image; status became SUBMITTED');

    // TEST 11: Public discovery should NOT show this SUBMITTED property to customers
    const publicBeforeApprove = await axios.get(`${baseUrl}/properties`);
    const foundBefore = publicBeforeApprove.data.data.properties.find((p: any) => p._id === propertyId);
    if (foundBefore) throw new Error('Customer should NOT see unapproved SUBMITTED property');
    console.log('✓ TEST 11 Passed: Customer discovery does NOT expose unapproved properties');

    // TEST 4: Admin approves property -> Customer can discover it with real cover image
    const approveRes = await axios.patch(
      `${baseUrl}/admin/properties/${propertyId}/review`,
      { action: 'approve', adminNotes: 'Approved!' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    if (approveRes.data.data.property.status !== 'APPROVED') {
      throw new Error('Admin approve failed');
    }

    const publicAfterApprove = await axios.get(`${baseUrl}/properties`);
    const foundAfter = publicAfterApprove.data.data.properties.find((p: any) => p._id === propertyId);
    if (!foundAfter) throw new Error('Customer should now see approved property');
    if (foundAfter.coverImageUrl !== uploadedUrl) {
      throw new Error(`Customer should see real uploaded cover image, got ${foundAfter.coverImageUrl}`);
    }
    console.log('✓ TEST 4 Passed: Admin approves property; Customer sees property with real uploaded cover image');

    // TEST 5: Builder edits approved property and replaces image -> snapshot logic preserves old image for customers
    const formReplace = new FormData();
    const newImageBuffer = Buffer.from('new-image-bytes-png');
    formReplace.append('coverImage', newImageBuffer, {
      filename: 'new_cover.png',
      contentType: 'image/png',
    });

    const replaceRes = await axios.post(`${baseUrl}/properties/${propertyId}/cover-image`, formReplace, {
      headers: {
        ...formReplace.getHeaders(),
        Authorization: `Bearer ${b1Token}`,
      },
    });

    const newUrl = replaceRes.data.data.coverImageUrl;
    if (newUrl === uploadedUrl) throw new Error('New image URL should differ from old image URL');

    // Verify snapshot preserved old image for public customer
    const publicDuringReApproval = await axios.get(`${baseUrl}/properties`);
    const customerView = publicDuringReApproval.data.data.properties.find((p: any) => p._id === propertyId);
    if (!customerView) throw new Error('Customer should still see property during re-approval');
    if (customerView.coverImageUrl !== uploadedUrl) {
      throw new Error('Customer must continue to see the old approved cover image until new version is approved');
    }
    console.log('✓ TEST 5 & TEST 8 Passed: Builder replaced cover image during edit; snapshot preserves previous approved image for customers');

    console.log('\n--- ALL PROPERTY COVER IMAGE & SUBMISSION SECURITY TESTS PASSED! ---');
  } finally {
    // Clean up created test entities
    try {
      if (createdPropertyId) {
        await Property.deleteMany({ _id: createdPropertyId });
      }
      await User.deleteMany({ email: { $in: [builder1Email, builder2Email, adminEmail] } });
    } catch (e) {
      console.error('Cleanup warning:', e);
    }
    server.close();
    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect();
  }
}

runCoverImageTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
