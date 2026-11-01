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
  // Public endpoints only expose the builder's name; owner/admin views include contact details
  builderId: string | { _id: string; name: string; email?: string; phone?: string };
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
  polygon?: number[][];       // true room outline in metres (x/y/width/height is its box)
  printed_size?: string;      // size printed in the drawing, e.g. 14'5" x 12'10"
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
  glb_ready?:    boolean;
  glb_filename?: string;
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


// ─── Customer experience ─────────────────────────────────────────────────────

export interface SearchQuery {
  search?: string;
  locality?: string;
  propertyType?: string;
  bhk?: string;
  minPrice?: number;
  maxPrice?: number;
  constructionStatus?: string;
}

export interface RecentSearch {
  query: SearchQuery;
  createdAt: string;
}

export interface ProfileInsights {
  profileStrength: number; // 0..100
  signalCount: number;
  topLocalities: string[];
  topTypes: string[];
  topBhks: string[];
  budget: { min: number; max: number } | null;
}

export interface Recommendation {
  property: Property;
  score: number;
  matchScore: number | null; // null when the feed isn't personalised yet
  reasons: string[];
}

export interface RecommendationFeed {
  isPersonalized: boolean;
  items: Recommendation[];
  insights: ProfileInsights;
}

export interface PropertyExplanation {
  isPersonalized: boolean;
  matchScore: number | null;
  reasons: string[];
}

export interface TrendingProperty extends Property {
  trending: { viewers: number; score: number };
}

export interface SimilarProperty extends Property {
  similarity: number;
}

export interface SavedProperty extends Property {
  savedAt: string;
}

export interface SearchSuggestions {
  projects: { id: string; name: string; locality: string }[];
  localities: { name: string; count: number }[];
  builders: { name: string; count: number }[];
}

export interface LocalityStat {
  locality: string;
  count: number;
  minPrice: number;
  maxPrice: number;
  avgPricePerSqFt: number;
  coverImageUrl?: string;
}

// ─── Site visits ─────────────────────────────────────────────────────────────

export type VisitStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RESCHEDULE_PROPOSED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'COMPLETED';

export type VisitSlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

export const VISIT_SLOTS: { value: VisitSlot; label: string; hint: string }[] = [
  { value: 'MORNING',   label: 'Morning',   hint: '10:00 AM – 12:00 PM' },
  { value: 'AFTERNOON', label: 'Afternoon', hint: '12:00 PM – 4:00 PM' },
  { value: 'EVENING',   label: 'Evening',   hint: '4:00 PM – 7:00 PM' },
];

export interface SiteVisit {
  _id: string;
  status: VisitStatus;
  visitDate: string;
  timeSlot: VisitSlot;
  timeSlotLabel: string;
  proposedDate?: string;
  proposedSlot?: VisitSlot;
  proposedSlotLabel?: string;
  visitors: number;
  contactName: string;
  contactPhone: string;
  notes?: string;
  builderNote?: string;
  respondedAt?: string;
  createdAt: string;
  property: {
    _id: string; projectName: string; title: string; locality: string; city: string;
    address: string; coverImageUrl?: string;
  } | null;
  builder?: { name: string; phone?: string };
  customer?: { name: string; email?: string };
}

export interface CreateVisitPayload {
  propertyId: string;
  visitDate: string;
  timeSlot: VisitSlot;
  visitors: number;
  contactName: string;
  contactPhone: string;
  notes?: string;
}

export type VisitAction = 'confirm' | 'decline' | 'reschedule' | 'complete';

export interface RespondVisitPayload {
  action: VisitAction;
  note?: string;
  newDate?: string;
  newSlot?: VisitSlot;
}

// ─── DSA connection requests (type names kept from the original loan flow) ─────────────────────────────────────────────────────────

export type LoanStatus =
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'DOCUMENTS_REQUIRED'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export interface LoanRequest {
  _id: string;
  status: LoanStatus;
  contactName: string;
  contactPhone: string;
  notes?: string;
  dsaNote?: string;
  consentAt: string;
  assignedAt?: string;
  statusUpdatedAt: string;
  createdAt: string;
  property: {
    _id: string; projectName: string; title: string; locality: string; city: string;
    coverImageUrl?: string; minPrice: number; maxPrice: number;
  } | null;
  dsa?: { name: string; phone?: string };
  customer?: { name: string; email?: string };
}

export interface CreateLoanPayload {
  propertyId?: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
  consent: boolean;
}

export type DsaLeadStatus = 'IN_PROGRESS' | 'DOCUMENTS_REQUIRED' | 'COMPLETED' | 'CLOSED';

// ─── Notifications & dashboard ───────────────────────────────────────────────

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export interface CustomerDashboard {
  counts: {
    saved: number;
    visitsUpcoming: number;
    visitsTotal: number;
    loansActive: number;
    loansTotal: number;
    unreadNotifications: number;
  };
  nextVisit: SiteVisit | null;
  latestLoan: LoanRequest | null;
  insights: ProfileInsights;
  recentViews: Property[];
  recentSearches: RecentSearch[];
}
