# The Plinth

Ahmedabad's Premier Real Estate Intelligence Platform.

## Project Structure

```
the-plinth/
├── backend/          Node.js + TypeScript + Express + MongoDB
├── frontend/         React + TypeScript + Tailwind CSS
├── ai-service/       Python + FastAPI  (Day 5)
├── .env.example      Root env reference
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm 9+

### Backend

```bash
cd backend
cp .env.example .env       # edit values
npm install
npm run dev                # http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## Environment Variables

| Variable         | Required | Description                         |
|------------------|----------|-------------------------------------|
| MONGODB_URI      | ✓        | MongoDB connection string           |
| JWT_SECRET       | ✓        | JWT signing secret (min 32 chars)   |
| JWT_EXPIRES_IN   |          | Token lifetime (default: 7d)        |
| COOKIE_SECRET    | ✓        | Cookie signing secret               |
| FRONTEND_URL     | ✓        | CORS origin for frontend            |
| PORT             |          | Backend port (default: 5000)        |

## API Endpoints (Day 1)

| Method | Path              | Auth | Description              |
|--------|-------------------|------|--------------------------|
| POST   | /api/auth/signup  | —    | Customer registration    |
| POST   | /api/auth/login   | —    | Login (all roles)        |
| POST   | /api/auth/logout  | —    | Clear session cookie     |
| GET    | /api/auth/me      | ✓    | Get current user         |
| GET    | /api/health       | —    | Health check             |

## User Roles

| Role     | Registration               | Status on creation |
|----------|----------------------------|--------------------|
| CUSTOMER | Public /signup             | ACTIVE             |
| BUILDER  | Application flow (Day 2)   | PENDING → ACTIVE   |
| DSA      | Application flow (Day 2)   | PENDING → ACTIVE   |
| ADMIN    | Seeded / manual (Day 2)    | ACTIVE             |

## Development Phases

- **Day 1** ✅ Foundation + Authentication + RBAC
- **Day 2** Builder/DSA onboarding + Admin approval
- **Day 3** Property management + Customer discovery
- **Day 4** Blueprint system
- **Day 5** AI blueprint analysis + 3D visualisation
- **Day 6** Integration + Plinth Intelligence + Polish
