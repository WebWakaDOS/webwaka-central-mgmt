# WebWaka OS v4: Comprehensive Shared Primitives Analysis

**Date:** March 15, 2026
**Purpose:** Identify all remaining foundational elements needed by all vertical suites before commencing vertical-specific implementation (e.g., Transport, Logistics).

## 1. Context & Rationale

To adhere to the **Build Once Use Infinitely** invariant, we must ensure that no vertical suite builds a feature that another vertical will also need. If Transport needs geolocation, Logistics will need it too. If Real Estate needs document signing, Legal will need it too.

This analysis extracts all cross-cutting concerns from the WebWaka OS v4 Blueprint (Part 10) and defines them as Shared Primitives to be built in `webwaka-core`.

## 2. Identified Shared Primitives

### 2.1. Geolocation & Mapping Engine (CORE-9)
**Required By:** Transport (10.3), Logistics (10.4), Real Estate (10.5), Agriculture (10.6)
**Description:** A vendor-neutral abstraction layer for maps, routing, and geocoding.
**Features:**
- Real-time coordinate tracking (WebSocket/Event Bus integration)
- Distance and ETA calculation
- Geofencing (e.g., restricting drivers to specific zones)
- Vendor fallback (Google Maps → Mapbox → OpenStreetMap)

### 2.2. Universal Booking & Scheduling Engine (CORE-10)
**Required By:** Transport (10.3), Health (10.7), Services (10.9), Hospitality (10.10)
**Description:** A unified system for managing time slots, availability, and reservations.
**Features:**
- Calendar sync and availability management
- Conflict resolution (preventing double bookings)
- Timezone awareness (WAT default for Nigeria First)
- Recurring bookings

### 2.3. Document & Contract Management (CORE-11)
**Required By:** Real Estate (10.5), Legal (10.12), HR (10.12), Fintech (10.11)
**Description:** A secure system for generating, signing, and storing legal documents.
**Features:**
- PDF generation from templates
- Digital signatures (e-signature compliance)
- Immutable audit trails (tied to CORE-4 Ledger)
- Secure storage (Cloudflare R2 integration)

### 2.4. Universal KYC/KYB Verification (CORE-12)
**Required By:** Fintech (10.11), Transport (10.3), Real Estate (10.5)
**Description:** A centralized identity verification system.
**Features:**
- Document upload and OCR (tied to CORE-5 AI)
- Liveness checks
- Integration with Nigerian identity databases (NIN, BVN, CAC)
- Verification status tracking

### 2.5. Real-Time Chat & Communication (CORE-13)
**Required By:** All Verticals (Customer Support, Driver-Rider, Vendor-Buyer)
**Description:** An in-app messaging system.
**Features:**
- WebSocket-based real-time messaging
- Media sharing
- Chat history and offline sync (tied to CORE-1 Sync Engine)
- Automated moderation (tied to CORE-5 AI)

## 3. Execution Strategy

Before starting the Transport vertical (Phase 4), we must implement these 5 Shared Primitives in the `webwaka-core` repository. This will ensure that the Transport vertical (and all subsequent verticals) can be built rapidly by simply composing these primitives.

**Next Step:** Design and implement CORE-9 through CORE-13 in `webwaka-core`.
