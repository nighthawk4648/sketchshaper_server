# SketchShaper - Backend API Server

High-performance REST API backend powering **SketchShaper** (3D architectural models, materials, textures, and blogs).

Built with **Node.js**, **Express**, **MariaDB / MySQL**, and **Prisma ORM**, featuring **Patreon OAuth 2.0** for member authentication and paid asset gating.

---

## 🛠️ Technology Stack

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Database:** MariaDB / MySQL
- **ORM:** Prisma v5.15.0
- **Authentication:** JWT & Patreon OAuth 2.0
- **Process Manager:** PM2

---

## 📁 Project Structure

```text
src/
├── config/             # Environment & app configurations
├── middlewares/        # Authentication, CORS, error handling
│   ├── auth/           # verifyAdminAuth, verifyPatreonAuth
│   └── errors/         # Global error handler
├── modules/            # Domain feature modules
│   ├── admin/          # Admin authentication & management
│   ├── asset/          # 3D assets, uploads, and download gating
│   ├── blog/           # Blog posts, metadata & articles
│   ├── category/       # 3D model categories
│   ├── sub-category/   # Subcategories & filtering
│   ├── patreon/        # Patreon OAuth flow & webhook handling
│   ├── slider/         # Homepage banners & sliders
│   ├── gallery/        # Visual showcase assets
│   ├── footer-page/    # Terms, privacy, license pages
│   └── general/        # App settings & stats
├── routes/             # API routing definitions
│   └── api/            # Versioned API routes (/api/v1)
└── server.mjs          # Server entry point & static asset serving
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
MODE=dev
DEV_PORT=5000
PROD_PORT=5000
DEV_HOST=localhost
PROD_HOST=0.0.0.0

# Database Configuration
DATABASE_URL="mysql://<user>:<password>@localhost:3306/sketchshaper_dev"
SHADOW_DATABASE_URL="mysql://<user>:<password>@localhost:3306/sketchshaper_shadow"

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here

# Patreon OAuth Configuration
PATREON_CLIENT_ID=your_patreon_client_id
PATREON_CLIENT_SECRET=your_patreon_client_secret
PATREON_REDIRECT_URI=http://localhost:5000/api/patreon/callback
PATREON_CAMPAIGN_ID=your_patreon_campaign_id

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Prisma Client

```bash
npx prisma generate
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start at `http://localhost:5000`.

---

## 🚢 Production Deployment (PM2)

```bash
# Pull latest code
git pull origin noyon

# Install dependencies if updated
npm install --production

# Generate Prisma client
npx prisma generate

# Restart PM2 process
pm2 restart api
```

---

## 🔒 Security Best Practices

- **Never commit `.env`** to version control.
- Uploads directory (`/uploads/`) is ignored from Git to protect user assets and optimize repository size.
- Admin write operations and downloads are protected via token verification middlewares.
