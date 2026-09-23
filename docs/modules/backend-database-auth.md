# Style360 - Core Backend & Database Architecture Module
**Developer:** Member 2 (Core Backend Architect)  
**Workload Allocation:** ~25%  
**Branch:** `feature/backend-database-auth`  

## Key Responsibilities & Implementations:
1. **MySQL 8.0 Relational Schema & Auto-Migrations (`backend/database.php`, `schema.sql`)**:
   - Resilient multi-host connection pooling with dynamic root fallback.
   - Dynamic column migration (`result_image_url`, `result_3d_url TEXT`).
   - Mock data purge routines ensuring strict data integrity.
2. **Authentication & Session Security (`backend/auth.php`, `check_session.php`, `logout.php`)**:
   - Industry-standard Bcrypt password hashing (`PASSWORD_DEFAULT`).
   - Timing attack-safe verification via `password_verify()`.
   - PDO prepared statements completely preventing SQL injection.
3. **Bespoke Tailoring Workflow (`backend/custom_requests.php`)**:
   - 3-stage state machine: Pending Review -> In Design -> Ready for Download.
   - User notification triggers on status transitions.
4. **Catalog REST APIs (`backend/garments.php`)**:
   - Dynamic multi-parameter filtering (gender, category, status, search).
5. **Real-Time Notification Engine (`backend/notifications.php`, `get_notifications.php`)**:
   - Unread counter badges and status tracking.
