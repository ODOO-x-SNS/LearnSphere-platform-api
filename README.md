# LearnSphere Platform API - Project Overview

## 1. Project Structure & Setup

### Entry Point
- **Main file**: `src/main.ts`
  - Bootstraps the NestJS application
  - Enables global pipes (validation, transformation)
  - Configures CORS with origins from `.env`
  - Sets up middleware and error handling

### Environment Configuration (`.env`)
- **Node Environment**: Development mode
- **Server**: Runs on port 3000
- **Database**: PostgreSQL at localhost:5433
- **Cache**: Redis at localhost:6379
- **File Storage**: MinIO (S3-compatible) at localhost:9000
- **Payments**: Stripe integration
- **Email**: SendGrid for notifications
- **Auth**: JWT with 15m access token + 7d refresh token refresh

---

## 2. Database Layer

### Setup
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Schema files**: Located in `prisma/schema.prisma`

### Key Tables
- **Users**: Authentication, profile data
- **Courses**: Course information, metadata
- **Enrollments**: User-course relationships
- **Lessons**: Course content structure
- **Badges**: Achievement system
- **Payments**: Stripe transaction records
- **Profiles**: Extended user information

### Migration Flow
```
.env DATABASE_URL → Prisma Client → Database Operations
```

---

## 3. Authentication & Authorization

### JWT Strategy
1. User logs in with credentials
2. API returns `accessToken` (15m) + `refreshToken` (7d)
3. Frontend stores tokens locally
4. Each request includes `Authorization: Bearer <token>`
5. API middleware validates token signature

### Protected Routes
- Decorated with `@UseGuards(JwtAuthGuard)`
- Extracts user from JWT payload
- Requires valid, non-expired token

### Refresh Flow
- Frontend calls `/auth/refresh` with refresh token
- API validates refresh token & issues new access token
- Keeps user logged in across sessions

---

## 4. Core Modules

### 4.1 Auth Module (`src/auth/`)
**Responsibilities**:
- User registration & login
- JWT token generation
- Password hashing (bcrypt)
- Refresh token rotation
- Email verification (optional)

**Key Files**:
- `auth.service.ts` - Business logic
- `auth.controller.ts` - Route handlers
- `jwt.strategy.ts` - Passport JWT validation
- `jwt-auth.guard.ts` - Route protection

**Flow**:
```
POST /auth/register → Validate input → Hash password → Save to DB → Return tokens
POST /auth/login → Find user → Compare password → Generate tokens
POST /auth/refresh → Validate refresh token → Issue new access token
```

---

### 4.2 Users Module (`src/users/`)
**Responsibilities**:
- User profile management
- Update/delete user data
- Fetch user details

**Key Files**:
- `users.service.ts` - Database queries
- `users.controller.ts` - API endpoints

**Endpoints**:
```
GET /users/me - Current user profile
PUT /users/:id - Update user
DELETE /users/:id - Delete account
GET /users/:id - Get user by ID
```

---

### 4.3 Courses Module (`src/courses/`)
**Responsibilities**:
- CRUD operations for courses
- Course filtering & search
- Course metadata (instructor, description, price)

**Key Files**:
- `courses.service.ts` - Business logic
- `courses.controller.ts` - Route handlers
- `course.entity.ts` - Data model

**Endpoints**:
```
GET /courses - List all courses
GET /courses/:id - Get course details
POST /courses - Create course (instructor only)
PUT /courses/:id - Update course
DELETE /courses/:id - Delete course
```

---

### 4.4 Enrollments Module (`src/enrollments/`)
**Responsibilities**:
- Manage student enrollments in courses
- Track enrollment status
- Calculate progress

**Endpoints**:
```
GET /enrollments/me - My enrolled courses
POST /enrollments/:courseId - Enroll in course
DELETE /enrollments/:courseId - Unenroll
GET /enrollments/:courseId/progress - Track progress
```

---

### 4.5 Lessons Module (`src/lessons/`)
**Responsibilities**:
- Course content structure
- Lesson metadata & ordering
- Video/resource uploads

**Endpoints**:
```
GET /lessons/:courseId - List lessons in course
POST /lessons - Create lesson
PUT /lessons/:id - Update lesson
DELETE /lessons/:id - Delete lesson
```

---

### 4.6 Badges Module (`src/badges/`)
**Responsibilities**:
- Define achievements/badges
- Award badges to users on completion
- Track user achievements

**Endpoints**:
```
GET /badges/me - My earned badges
GET /badges - All available badges
POST /badges/:id/award - Award badge to user
```

---

### 4.7 Payments Module (`src/payments/`)
**Responsibilities**:
- Stripe payment processing
- Payment history tracking
- Webhook handling for payment confirmations

**Key Files**:
- `stripe.service.ts` - Stripe API integration
- `payments.controller.ts` - Payment endpoints
- `stripe.webhook.ts` - Webhook listener

**Flow**:
```
1. Frontend: User clicks "Enroll" (paid course)
2. API: Create Stripe PaymentIntent
3. Frontend: Redirect to Stripe checkout
4. Stripe: Process payment
5. Webhook: Stripe → API notifies payment status
6. API: Mark enrollment as paid
```

---

### 4.8 Storage Module (`src/storage/`)
**Responsibilities**:
- Upload files to MinIO (S3-compatible)
- Generate presigned URLs
- Manage file access

**Key Service**:
- `s3.service.ts` - MinIO client wrapper

**Flow**:
```
POST /upload - Receive file → Upload to MinIO → Return URL
GET /files/:id - Retrieve presigned URL from MinIO
```

---

### 4.9 Email Module (`src/email/`)
**Responsibilities**:
- Send transactional emails via SendGrid
- Welcome emails, password reset, enrollment confirmation

**Key Files**:
- `email.service.ts` - SendGrid wrapper

**Events**:
```
User registers → Send welcome email
Password reset → Send reset link
Course enrolled → Send confirmation
Badge earned → Send achievement notification
```

---

## 5. Caching Strategy (Redis)

### Usage
- Cache frequently accessed data (courses, user profiles)
- Session management
- Rate limiting

### Pattern
```
1. Request comes in
2. Check Redis cache
3. If found → Return cached data
4. If not → Query DB → Cache result → Return
5. On updates → Invalidate cache
```

### Example
```
GET /courses → Check Redis → If miss, query DB → Cache for 1 hour
```

---

## 6. Core Libraries & Tools

| Library | Purpose |
|---------|---------|
| **@nestjs/core** | NestJS framework |
| **@nestjs/jwt** | JWT generation/validation |
| **@nestjs/passport** | Authentication strategies |
| **prisma** | ORM for PostgreSQL |
| **redis** | Caching layer |
| **stripe** | Payment processing |
| **aws-sdk** | MinIO/S3 integration |
| **@sendgrid/mail** | Email sending |
| **bcrypt** | Password hashing |
| **class-validator** | Input validation |
| **class-transformer** | DTO transformation |

---

## 7. Request/Response Flow (Example: Enroll in Course)

```
Frontend (localhost:5173)
  ↓
POST /enrollments/:courseId with Authorization header
  ↓
API Server (localhost:3000)
  ├─ JwtAuthGuard validates token
  ├─ EnrollmentsController receives request
  ├─ EnrollmentsService:
  │   ├─ Check if user already enrolled
  │   ├─ Verify course exists
  │   ├─ Create enrollment record in PostgreSQL
  │   ├─ Invalidate Redis cache
  │   └─ Query SendGrid to send confirmation email
  ├─ Return { enrollmentId, status, enrolledAt }
  ↓
Frontend displays "Enrollment successful"
```

---

## 8. Error Handling

### Global Exception Filter
- Catches all exceptions
- Returns standardized error format
- Logs to Sentry (if configured)

### Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad request (validation)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `500` - Server error

---

## 9. Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **JWT Validation**: Signature verification on each request
3. **CORS**: Limited to `localhost:5173` and `localhost:3000`
4. **Input Validation**: Class-validator on all DTOs
5. **Rate Limiting**: (Optional) Prevent abuse
6. **HTTPS**: Required in production

---

## 10. Testing & Deployment

### Unit Tests
- Located in `src/**/*.spec.ts`
- Use Jest framework
- Test services, controllers, guards

### Integration Tests
- Test end-to-end API flows
- Mock external services (Stripe, SendGrid)

### Production Checklist
- [ ] Update `JWT_SECRET` & `REFRESH_TOKEN_SECRET`
- [ ] Enable HTTPS
- [ ] Configure real Stripe keys
- [ ] Set up SendGrid API key
- [ ] Point PostgreSQL to production database
- [ ] Configure Sentry DSN for error tracking
- [ ] Set `NODE_ENV=production`
- [ ] Update `FRONTEND_URL` to production domain

---

## 11. Local Development Setup

```bash
# Start PostgreSQL
docker run -e POSTGRES_PASSWORD=learnsphere -p 5433:5432 postgres

# Start Redis
docker run -p 6379:6379 redis

# Start MinIO
docker run -p 9000:9000 -p 9001:9001 minio/minio server /minio

# Install dependencies
npm install

# Run migrations
npx prisma migrate dev

# Start API
npm run start:dev

# Frontend runs on http://localhost:5173
# API runs on http://localhost:3000
```

---

## 12. Key Concepts Summary

| Concept | Explanation |
|---------|-------------|
| **Middleware** | Runs before route handlers (CORS, auth checks) |
| **Guards** | Protect routes (JWT validation) |
| **Controllers** | Handle HTTP requests/responses |
| **Services** | Business logic & database queries |
| **DTOs** | Define request/response shapes |
| **Entities** | Define database models |
| **Modules** | Organize code by feature |
| **Decorators** | `@Controller`, `@Post`, `@UseGuards`, etc. |