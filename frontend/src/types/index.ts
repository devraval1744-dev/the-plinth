// ─── Auth & User types (mirror the backend SafeUser) ─────────────────────────

export type UserRole = 'CUSTOMER' | 'BUILDER' | 'ADMIN' | 'DSA';
export type AccountStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  mustChangePassword?: boolean;
  phone?: string;
  loginCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: { field: string; message: string }[];
}

// ─── Auth forms ───────────────────────────────────────────────────────────────

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
}

export interface BuilderProfileData {
  companyName: string;
  businessType: string;
  contactPerson: string;
  yearsOfExperience: number;
  numberOfProjects: number;
  reraRegistrationNumber?: string;
  officeAddress: string;
  city: string;
  state: string;
  website?: string;
  description: string;
  applicationStatus: string;
  reviewedAt?: string;
}

export interface DSAProfileData {
  firmName?: string;
  employmentType: string;
  contactPerson: string;
  yearsOfExperience: number;
  currentOrganization?: string;
  areasOfOperation: string[];
  bankPartnerships?: string;
  address: string;
  city: string;
  state: string;
  description: string;
  applicationStatus: string;
  reviewedAt?: string;
}

export interface UserProfileResponse {
  user: User;
  builderProfile: BuilderProfileData | null;
  dsaProfile?: DSAProfileData | null;
}

export interface UpdateProfileFormData {
  name: string;
  phone?: string;
}

// ─── Application types ────────────────────────────────────────────────────────

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLARIFICATION_REQUESTED';

export interface BuilderApplication {
  _id: string;
  applicantName: string;
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
  yearsOfExperience: number;
  numberOfProjects: number;
  reraRegistrationNumber?: string;
  officeAddress: string;
  city: string;
  state: string;
  website?: string;
  description: string;
  status: ApplicationStatus;
  adminNotes?: string;
  clarificationMessage?: string;
  reviewedAt?: string;
  reviewedBy?: { _id: string; name: string; email: string } | null;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DSAApplication {
  _id: string;
  applicantName: string;
  email: string;
  phone: string;
  firmName?: string;
  employmentType: string;
  yearsOfExperience: number;
  currentOrganization?: string;
  areasOfOperation: string[];
  bankPartnerships?: string;
  address: string;
  city: string;
  state: string;
  description: string;
  status: ApplicationStatus;
  adminNotes?: string;
  clarificationMessage?: string;
  reviewedAt?: string;
  reviewedBy?: { _id: string; name: string; email: string } | null;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationCounts {
  builderPending: number;
  dsaPending: number;
  builderTotal: number;
  dsaTotal: number;
}

// ─── Application form types ───────────────────────────────────────────────────

export interface BuilderApplicationFormData {
  applicantName: string;
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
  yearsOfExperience: string;
  numberOfProjects: string;
  reraRegistrationNumber: string;
  officeAddress: string;
  city: string;
  state: string;
  website: string;
  description: string;
}

export interface DSAApplicationFormData {
  applicantName: string;
  email: string;
  phone: string;
  firmName: string;
  employmentType: string;
  yearsOfExperience: string;
  currentOrganization: string;
  areasOfOperation: string;
  bankPartnerships: string;
  address: string;
  city: string;
  state: string;
  description: string;
}

// ─── Review action ────────────────────────────────────────────────────────────

export interface ReviewActionPayload {
  action: 'approve' | 'reject' | 'request_clarification';
  adminNotes?: string;
  clarificationMessage?: string;
}

// ─── Property types ───────────────────────────────────────────────────────────

export type PropertyStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED';

export const PROPERTY_TYPES = [
  'Apartment', 'Villa', 'Bungalow', 'Penthouse', 'Studio',
  'Plot', 'Commercial', 'Office', 'Shop', 'Warehouse',
] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export const CONSTRUCTION_STATUSES = [
  'Under Construction', 'Ready to Move', 'New Launch', 'Completed',
] as const;
export type ConstructionStatus = typeof CONSTRUCTION_STATUSES[number];

export const BHK_TYPES = [
  'Studio', '1 BHK', '1.5 BHK', '2 BHK', '2.5 BHK',
  '3 BHK', '4 BHK', '5 BHK', '5+ BHK',
] as const;
export type BHKType = typeof BHK_TYPES[number];

export const AHMEDABAD_LOCALITIES = [
  'Ambli', 'Thaltej', 'Bodakdev', 'Bopal', 'Shela',
  'Satellite', 'Vastrapur', 'Gota', 'Prahladnagar', 'Chandkheda',
  'Maninagar', 'Navrangpura', 'Nikol', 'Tragad', 'Makarba',
  'Vaishnodevi', 'Jodhpur', 'Wadaj', 'Ghuma',
] as const;

export interface BHKConfig {
  type: string;
  areaSqFt: number;
  priceMin: number;
  priceMax: number;
  totalUnits: number;
  availableUnits: number;
}

export interface PropertyImage {
  url: string;
  caption?: string;
  isPrimary: boolean;
  uploadedAt: string;
}

export interface PropertyDocument {
  name: string;
  fileType: string;
  url: string;
  isPublic: boolean;
  uploadedAt: string;
}

export interface Property {
  _id: string;
  builderId: string | { _id: string; name: string; email: string; phone?: string };
  title: string;
  projectName: string;
  description: string;
  propertyType: string;
  locality: string;
  city: string;
  state: string;
  address: string;
  latitude?: number;
  longitude?: number;
  bhkConfigurations: BHKConfig[];
  minPrice: number;
  maxPrice: number;
  minArea: number;
  maxArea: number;
  totalUnits: number;
  availableUnits: number;
  constructionStatus: string;
  possessionDate?: string;
  amenities: string[];
  coverImageUrl?: string;
  images: PropertyImage[];
  documents: PropertyDocument[];
  status: PropertyStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: { _id: string; name: string; email: string } | null;
  adminNotes?: string;
  rejectionReason?: string;
  pendingReApproval?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyCounts {
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  changesRequested: number;
  total: number;
}

export interface PropertyDiscoveryQuery {
  search?: string;
  locality?: string;
  city?: string;
  propertyType?: string;
  bhk?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  constructionStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'area_asc';
}

export interface PaginatedProperties {
  properties: Property[];
  total: number;
  page: number;
  pages: number;
}

// ─── Property form ────────────────────────────────────────────────────────────

export interface PropertyFormData {
  title: string;
  projectName: string;
  description: string;
  propertyType: string;
  locality: string;
  city: string;
  state: string;
  address: string;
  latitude: string;
  longitude: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  totalUnits: string;
  availableUnits: string;
  constructionStatus: string;
  possessionDate: string;
  amenities: string;   // comma-separated
  // BHK configs managed separately as structured array
  bhkConfigurations: BHKConfigForm[];
}

export interface BHKConfigForm {
  type: string;
  areaSqFt: string;
  priceMin: string;
  priceMax: string;
  totalUnits: string;
  availableUnits: string;
}

// ─── Admin property review ────────────────────────────────────────────────────

export interface PropertyReviewPayload {
  action: 'approve' | 'reject' | 'request_changes';
  adminNotes?: string;
  rejectionReason?: string;
}

// ─── Blueprint types ──────────────────────────────────────────────────────────

export type BlueprintLevel  = 'PROPERTY' | 'UNIT';
export type BlueprintStatus = 'ACTIVE' | 'ARCHIVED';

export const BLUEPRINT_TYPES = [
  'Site Plan',
  'Floor Plan',
  'Unit Plan',
  'Elevation',
  'Section',
  'Electrical Layout',
  'Plumbing Layout',
  'Other',
] as const;
export type BlueprintType = typeof BLUEPRINT_TYPES[number];

export interface Blueprint {
  _id: string;
  propertyId:   string;
  builderId:    string;
  level:        BlueprintLevel;
  blueprintType: string;
  unitType?:    string;
  unitLabel?:   string;
  title:        string;
  description?: string;
  fileUrl:      string;
  fileName:     string;
  fileMimeType: string;
  fileSizeBytes: number;
  version:      number;
  status:       BlueprintStatus;
  uploadedBy:   string;
  createdAt:    string;
  updatedAt:    string;
}

// Grouped view used by the Builder management UI
export interface BlueprintSlot {
  level:     BlueprintLevel;
  unitType?: string;
  unitLabel?: string;
  label:     string;          // Display label e.g. "Full Property" or "2 BHK – Type A"
  active:    Blueprint | null;
  history:   Blueprint[];
}

// ─── Blueprint Analysis / AI types ───────────────────────────────────────────

export type AnalysisStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'STRUCTURE_EXTRACTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'NEEDS_REVIEW';

export interface SpatialRoom {
  id: string; name: string; type: string;
  x: number; y: number; width: number; height: number;
  area_sqft?: number;
}
export interface SpatialWall {
  id: string;
  start_x: number; start_y: number;
  end_x: number;   end_y: number;
  thickness: number;
}
export interface SpatialDoor {
  id: string; x: number; y: number; width: number;
  orientation: string; connects_to?: string;
}
export interface SpatialWindow {
  id: string; x: number; y: number; width: number;
  orientation: string; connects_to?: string;
}
export interface SpatialBalcony {
  id: string; x: number; y: number; width: number; height: number;
}

export interface SpatialAnalysis {
  blueprint_id:      string;
  unit_type?:        string;
  blueprint_version: number;
  provider:          string;
  is_demo:           boolean;
  canvas_width:      number;
  canvas_height:     number;
  rooms:     SpatialRoom[];
  walls:     SpatialWall[];
  doors:     SpatialDoor[];
  windows:   SpatialWindow[];
  balconies: SpatialBalcony[];
}

export interface BlueprintAnalysisJob {
  _id:              string;
  blueprintId:      string;
  propertyId:       string;
  unitType?:        string;
  blueprintVersion: number;
  provider:         string;
  isDemo:           boolean;
  status:           AnalysisStatus;
  analysis?:        SpatialAnalysis;
  errorMessage?:    string;
  startedAt?:       string;
  completedAt?:     string;
  createdAt:        string;
  updatedAt:        string;
}

export interface Public3DResult {
  analysis: SpatialAnalysis;
  isDemo:   boolean;
  provider: string;
}

// ─── Nearby Amenities / Location Intelligence ────────────────────────────────
export interface NearbyAmenity {
  id: string;
  name: string;
  category: 'education' | 'healthcare' | 'shopping' | 'transit';
  categoryLabel: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  type: string;
}

export interface NearbyAmenitiesData {
  hasCoordinates: boolean;
  propertyCoordinates?: {
    latitude: number;
    longitude: number;
  };
  searchRadiusKm?: number;
  amenities: NearbyAmenity[];
  counts: {
    education: number;
    healthcare: number;
    shopping: number;
    transit: number;
    total: number;
  };
  cached?: boolean;
  attribution?: string;
  isUnavailable?: boolean;
  message?: string;
}

