# SALESFLOW — E-Commerce Sales, Orders, Profit & Business Intelligence System

SALESFLOW is a production-ready, multi-tenant web application engineered for e-commerce companies selling physical products through moderators and sales agents.

## 🚀 Key Modules & Capabilities

1. **Multi-Tenant Architecture**: Complete tenant data isolation with `companyId` across all products, batches, customers, orders, financials, and audit logs.
2. **Role-Based Access Control (RBAC)**:
   - `SUPER_ADMIN`: Platform-wide governance.
   - `COMPANY_ADMIN`: Full company administration.
   - `MANAGER`: Product, batch, moderator, order, and report management.
   - `MODERATOR`: Isolated view of assigned orders, call recording, customer CRM.
   - `ACCOUNTANT`: Revenue, COGS, expenses, and net profit ledger.
   - `DELIVERY_MANAGER`: Shipping fulfillment and inventory movements.
3. **Products & Manufacturing Batches**:
   - Production cost formula: `Total Production Cost = Manufacturing + Packaging + Raw Materials + Other Costs`
   - Unit cost formula: `Cost Per Unit = Total Production Cost / Quantity Produced`
4. **Inventory Management**:
   - Movement history tracking for `PRODUCTION`, `SALE`, `RETURN`, and `MANUAL_ADJUSTMENT`.
5. **Promotional Offers**:
   - Volume tier bundling, quantity overrides, selling prices, and free delivery flags.
   - Autocompletes price and quantity in the order form.
6. **Customer CRM & Duplicate Detection**:
   - Phone normalization prevents duplicate records across varying international and local formats.
   - Customer lifetime metrics (total orders, delivered orders, purchase value).
7. **Order Follow-up & Activity Timeline**:
   - 13-stage order lifecycle: `NEW`, `CONTACTING`, `NO_ANSWER`, `CONFIRMED`, `POSTPONED`, `REJECTED`, `READY_FOR_SHIPPING`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURNED`, `FAILED_DELIVERY`.
   - Call log history with callback scheduling and automated status synchronization.
   - Complete audit activity timeline.
8. **Real Profit Financial Engine**:
   - `Real Net Profit = Delivered Revenue - Cost of Sold Units - Shipping Cost - Moderator Commissions - Operating Expenses`
   - Strictly ignores unfulfilled, rejected, or cancelled orders as revenue.
9. **Top Product Performance & Ranking**:
   - Ranks most requested, most confirmed, most delivered, and most profitable products.
   - Differentiates between demand volume and actual net profit yield.
10. **Moderator Performance & Leaderboard**:
    - Confirmation rate, delivery conversion rate, delivered sales volume, and commission ledger.
11. **OpenRouter AI Business Intelligence**:
    - Zero hallucination: sends structured, ground-truth financial context to OpenRouter models.
    - AI Daily Executive Briefing (Summary, Observations, Operational Risks, Recommendations).
    - Contextual Chat Assistant with strategic query presets.
12. **Bilingual & Responsive UI**:
    - Seamless toggle between English (LTR) and Arabic (RTL).
    - Modern desktop-first SaaS layout with responsive mobile navigation.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Server Actions, Route Handlers)
- **Language**: TypeScript (Strict Mode)
- **Database & ORM**: PostgreSQL / SQLite with Prisma ORM
- **Styling**: Tailwind CSS with custom RTL support
- **Auth & Security**: Stateless JWT via `jose`, bcrypt password hashing, HTTP-only secure cookies
- **AI Integration**: OpenRouter API (`OPENROUTER_API_KEY`)
- **Deployment**: Docker, Docker Compose, Coolify, VPS

---

## 📦 Quick Start & Local Execution

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Sync & Seed
```bash
npx prisma db push
node --experimental-strip-types prisma/seed.ts
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 🔑 Demo Seed Accounts (Password: `password123`)

| Role | Email | Capabilities |
| :--- | :--- | :--- |
| **Company Admin** | `admin@bioderma.com` | Complete company access & financial visibility |
| **Sales Manager** | `manager@bioderma.com` | Manage moderators, orders, products, batches |
| **Moderator (Sara)** | `sara@bioderma.com` | Dedicated moderator view, call logs, assigned orders |
| **Moderator (Omar)** | `omar@bioderma.com` | Dedicated moderator view, call logs, assigned orders |
| **Accountant** | `finance@bioderma.com` | Financial reports, revenue, COGS, expenses |
| **Delivery Manager** | `shipping@bioderma.com` | Orders dispatch, couriers, inventory movements |
| **Super Admin** | `superadmin@salesflow.io` | Platform-wide master administration |

*Note: Use the "Role" switcher in the top navigation bar to switch between any role instantly during evaluation.*

---

## 🚢 Docker & Production Deployment

### Using Docker Compose (PostgreSQL 16)
```bash
docker-compose up -d --build
```

### Coolify / VPS Deployment
1. Set Environment Variables:
   - `DATABASE_URL=postgresql://user:password@host:5432/salesflow`
   - `JWT_SECRET=your_production_secret`
   - `OPENROUTER_API_KEY=your_openrouter_api_key`
2. Select Dockerfile build in Coolify.
3. Deploy port `3000`.

---

## 🧪 Automated End-to-End Verification

To execute the test suite covering all 20 critical business workflows:
```bash
npx tsx tests/verify-all-workflows.ts
```
