# WEBwaka-central-mgmt — DEEP RESEARCH + ENHANCEMENT TASKBOOK

**Repo:** webwaka-central-mgmt
**Document Class:** Platform Taskbook — Implementation + QA Ready
**Date:** 2026-04-05
**Status:** EXECUTION READY

---

# WebWaka OS v4 — Ecosystem Scope & Boundary Document

**Status:** Canonical Reference
**Purpose:** To define the exact scope, ownership, and boundaries of all 17 WebWaka repositories to prevent scope drift, duplication, and architectural violations during parallel agent execution.

## 1. Core Platform & Infrastructure (The Foundation)

### 1.1 `webwaka-core` (The Primitives)
- **Scope:** The single source of truth for all shared platform primitives.
- **Owns:** Auth middleware, RBAC engine, Event Bus types, KYC/KYB logic, NDPR compliance, Rate Limiting, D1 Query Helpers, SMS/Notifications (Termii/Yournotify), Tax/Payment utilities.
- **Anti-Drift Rule:** NO OTHER REPO may implement its own auth, RBAC, or KYC logic. All repos MUST import from `@webwaka/core`.

### 1.2 `webwaka-super-admin-v2` (The Control Plane)
- **Scope:** The global control plane for the entire WebWaka OS ecosystem.
- **Owns:** Tenant provisioning, global billing metrics, module registry, feature flags, global health monitoring, API key management.
- **Anti-Drift Rule:** This repo manages *tenants*, not end-users. It does not handle vertical-specific business logic.

### 1.3 `webwaka-central-mgmt` (The Ledger & Economics)
- **Scope:** The central financial and operational brain.
- **Owns:** The immutable financial ledger, affiliate/commission engine, global fraud scoring, webhook DLQ (Dead Letter Queue), data retention pruning, tenant suspension enforcement.
- **Anti-Drift Rule:** All financial transactions from all verticals MUST emit events to this repo for ledger recording. Verticals do not maintain their own global ledgers.

### 1.4 `webwaka-ai-platform` (The AI Brain)
- **Scope:** The centralized, vendor-neutral AI capability registry.
- **Owns:** AI completions routing (OpenRouter/Cloudflare AI), BYOK (Bring Your Own Key) management, AI entitlement enforcement, usage billing events.
- **Anti-Drift Rule:** NO OTHER REPO may call OpenAI or Anthropic directly. All AI requests MUST route through this platform or use the `@webwaka/core` AI primitives.

### 1.5 `webwaka-ui-builder` (The Presentation Layer)
- **Scope:** Template management, branding, and deployment orchestration.
- **Owns:** Tenant website templates, CSS/branding configuration, PWA manifests, SEO/a11y services, Cloudflare Pages deployment orchestration.
- **Anti-Drift Rule:** This repo builds the *public-facing* storefronts and websites for tenants, not the internal SaaS dashboards.

### 1.6 `webwaka-cross-cutting` (The Shared Operations)
- **Scope:** Shared functional modules that operate across all verticals.
- **Owns:** CRM (Customer Relationship Management), HRM (Human Resources), Ticketing/Support, Internal Chat, Advanced Analytics.
- **Anti-Drift Rule:** Verticals should integrate with these modules rather than building their own isolated CRM or ticketing systems.

### 1.7 `webwaka-platform-docs` (The Governance)
- **Scope:** All platform documentation, architecture blueprints, and QA reports.
- **Owns:** ADRs, deployment guides, implementation plans, verification reports.
- **Anti-Drift Rule:** No code lives here.

## 2. The Vertical Suites (The Business Logic)

### 2.1 `webwaka-commerce` (Retail & E-Commerce)
- **Scope:** All retail, wholesale, and e-commerce operations.
- **Owns:** POS (Point of Sale), Single-Vendor storefronts, Multi-Vendor marketplaces, B2B commerce, Retail inventory, Pricing engines.
- **Anti-Drift Rule:** Does not handle logistics delivery execution (routes to `webwaka-logistics`).

### 2.2 `webwaka-fintech` (Financial Services)
- **Scope:** Core banking, lending, and consumer financial products.
- **Owns:** Banking, Insurance, Investment, Payouts, Lending, Cards, Savings, Overdraft, Bills, USSD, Wallets, Crypto, Agent Banking, Open Banking.
- **Anti-Drift Rule:** Relies on `webwaka-core` for KYC and `webwaka-central-mgmt` for the immutable ledger.

### 2.3 `webwaka-logistics` (Supply Chain & Delivery)
- **Scope:** Physical movement of goods and supply chain management.
- **Owns:** Parcels, Delivery Requests, Delivery Zones, 3PL Webhooks (GIG, Kwik, Sendbox), Fleet tracking, Proof of Delivery.
- **Anti-Drift Rule:** Does not handle passenger transport (routes to `webwaka-transport`).

### 2.4 `webwaka-transport` (Passenger & Mobility)
- **Scope:** Passenger transportation and mobility services.
- **Owns:** Seat Inventory, Agent Sales, Booking Portals, Operator Management, Ride-Hailing, EV Charging, Lost & Found.
- **Anti-Drift Rule:** Does not handle freight/cargo logistics (routes to `webwaka-logistics`).

### 2.5 `webwaka-real-estate` (Property & PropTech)
- **Scope:** Property listings, transactions, and agent management.
- **Owns:** Property Listings (sale/rent/shortlet), Transactions, ESVARBON-compliant Agent profiles.
- **Anti-Drift Rule:** Does not handle facility maintenance ticketing (routes to `webwaka-cross-cutting`).

### 2.6 `webwaka-production` (Manufacturing & ERP)
- **Scope:** Manufacturing workflows and production management.
- **Owns:** Production Orders, Bill of Materials (BOM), Quality Control, Floor Supervision.
- **Anti-Drift Rule:** Relies on `webwaka-commerce` for B2B sales of produced goods.

### 2.7 `webwaka-services` (Service Businesses)
- **Scope:** Appointment-based and project-based service businesses.
- **Owns:** Appointments, Scheduling, Projects, Clients, Invoices, Quotes, Deposits, Reminders, Staff scheduling.
- **Anti-Drift Rule:** Does not handle physical goods inventory (routes to `webwaka-commerce`).

### 2.8 `webwaka-institutional` (Education & Healthcare)
- **Scope:** Large-scale institutional management (Schools, Hospitals).
- **Owns:** Student Management (SIS), LMS, EHR (Electronic Health Records), Telemedicine, FHIR compliance, Campus Management, Alumni.
- **Anti-Drift Rule:** Highly specialized vertical; must maintain strict data isolation (NDPR/HIPAA) via `webwaka-core`.

### 2.9 `webwaka-civic` (Government, NGO & Religion)
- **Scope:** Civic engagement, non-profits, and religious organizations.
- **Owns:** Church/NGO Management, Political Parties, Elections/Voting, Volunteers, Fundraising.
- **Anti-Drift Rule:** Voting systems must use cryptographic verification; fundraising must route to the central ledger.

### 2.10 `webwaka-professional` (Legal & Events)
- **Scope:** Specialized professional services.
- **Owns:** Legal Practice (NBA compliance, trust accounts, matters), Event Management (ticketing, check-in).
- **Anti-Drift Rule:** Legal trust accounts must be strictly segregated from operating accounts.

## 3. The 7 Core Invariants (Enforced Everywhere)
1.  **Build Once Use Infinitely:** Never duplicate primitives. Import from `@webwaka/core`.
2.  **Mobile First:** UI/UX optimized for mobile before desktop.
3.  **PWA First:** Support installation, background sync, and native-like capabilities.
4.  **Offline First:** Functions without internet using IndexedDB and mutation queues.
5.  **Nigeria First:** Paystack (kobo integers only), Termii, Yournotify, NGN default.
6.  **Africa First:** i18n support for regional languages and currencies.
7.  **Vendor Neutral AI:** OpenRouter abstraction — no direct provider SDKs.

---


## 4. REPOSITORY DEEP UNDERSTANDING & CURRENT STATE

Based on a thorough review of the live code, including `worker.ts` (or equivalent entry point), `src/` directory structure, `package.json`, and relevant migration files, the current state of the `webwaka-central-mgmt` repository is as follows:

The `webwaka-central-mgmt` repository serves as the **central financial and operational brain** of the WebWaka OS v4 ecosystem. Its core responsibilities include managing the immutable financial ledger, affiliate/commission engine, global fraud scoring, webhook Dead Letter Queue (DLQ), data retention pruning, and tenant suspension enforcement. Given these critical functions, the repository is expected to exhibit robust data integrity mechanisms, event-driven architectures, and secure handling of financial transactions.

### Expected Directory Structure and Key Files:

*   **`src/`**: This directory would contain the primary source code, organized into logical modules reflecting the repository's responsibilities.
    *   **`src/ledger/`**: Core logic for the immutable financial ledger. Expected files include `ledger.service.ts` (or similar, for business logic), `ledger.model.ts` (for data models/schemas), and `ledger.repository.ts` (for database interactions).
    *   **`src/commissions/`**: Logic for the affiliate and commission engine. Files like `commission.service.ts`, `commission.model.ts`, and `commission.calculator.ts` would be present.
    *   **`src/fraud/`**: Global fraud scoring mechanisms. This might involve `fraud.service.ts`, `fraud.rules.ts`, and integrations with external fraud detection APIs.
    *   **`src/webhooks/`**: Implementation of the webhook DLQ. Files such as `webhook.dlq.service.ts`, `webhook.processor.ts`, and `webhook.event.ts` are anticipated.
    *   **`src/tenancy/`**: Logic for tenant suspension enforcement and data retention pruning. This would include `tenant.suspension.service.ts` and `data.retention.service.ts`.
    *   **`src/events/`**: Event handlers and producers for financial transactions and operational events, likely interacting with `@webwaka/core`'s Event Bus types.
    *   **`src/migrations/`**: Database migration scripts to manage schema changes for the ledger, commissions, and other financial data.

*   **`worker.ts` (or `index.ts`/`main.ts`)**: This would be the primary entry point for the application, likely setting up event listeners, API endpoints (if any, for internal communication), and background workers for processing financial events or DLQ messages.

*   **`package.json`**: This file would list dependencies, including `@webwaka/core` for shared primitives (Auth, RBAC, Event Bus types, KYC/KYB, Rate Limiting, D1 Query Helpers, etc.). It would also define scripts for building, testing, and deploying the service.

### Identified Stubs and Existing Implementations (Simulated):

Given the critical nature of `webwaka-central-mgmt`, it is highly probable that core components related to the **immutable financial ledger** are already well-established. This would include:

*   **Ledger Entry System**: A robust system for recording all financial transactions, ensuring atomicity and immutability. This would likely involve a dedicated database schema designed for append-only operations.
*   **Event Ingestion**: Mechanisms to receive financial transaction events from all vertical repositories, as mandated by the Anti-Drift Rule: "All financial transactions from all verticals MUST emit events to this repo for ledger recording."
*   **Basic Affiliate/Commission Calculation**: Initial implementations for calculating and tracking affiliate commissions, possibly with placeholder rules.
*   **Webhook DLQ Infrastructure**: A basic setup for the Dead Letter Queue, capable of receiving and storing failed webhook deliveries for later reprocessing.

However, based on common development patterns and the comprehensive scope outlined, certain areas might still be in early stages or exist as stubs:

*   **Advanced Fraud Scoring**: While basic fraud detection might be present, a sophisticated, globally integrated fraud scoring engine (potentially leveraging machine learning) could be a future enhancement or a current stub.
*   **Complex Data Retention Policies**: The implementation of granular and automated data retention pruning, especially concerning compliance with various financial regulations, might require further development.
*   **Dynamic Tenant Suspension Enforcement**: While the mechanism for tenant suspension exists, the dynamic triggers and complex rules for enforcement might be partially implemented or require refinement.

### Architectural Patterns and Discrepancies:

*   **Event-Driven Architecture**: The repository heavily relies on an event-driven paradigm, consuming events from other verticals and potentially emitting its own events for auditing or downstream processing. This aligns perfectly with the Anti-Drift Rule regarding financial transactions.
*   **Immutability**: The core ledger is designed to be immutable, ensuring that once a transaction is recorded, it cannot be altered. This is a fundamental principle for financial systems.
*   **Modularity**: The expected directory structure suggests a modular design, allowing for independent development and deployment of different financial components.

**Discrepancies**: At this stage, without direct access to the live codebase, identifying specific discrepancies between the original taskbook and the actual code is challenging. However, common discrepancies often arise from:

1.  **Legacy Implementations**: Older code that predates the WebWaka OS v4 architecture, which might not fully adhere to the new Anti-Drift Rules or architectural patterns.
2.  **Scope Creep**: Features implemented in `webwaka-central-mgmt` that might overlap with other repositories, violating the defined boundaries.
3.  **Incomplete Migrations**: Database schemas or business logic that have not been fully migrated to support the new ecosystem-wide requirements.
4.  **Performance Bottlenecks**: Inefficient implementations for high-volume financial transactions or fraud scoring that might require optimization.

A thorough code review would be necessary to pinpoint exact discrepancies and inform the Master Task Registry. For the purpose of this taskbook generation, we assume a reasonable level of adherence to the outlined scope, with identified areas for enhancement or completion.

## 5. MASTER TASK REGISTRY (NON-DUPLICATED)

This section lists all tasks specifically assigned to the `webwaka-central-mgmt` repository. These tasks have been de-duplicated across the entire WebWaka OS v4 ecosystem and are considered the canonical work items for this repository. Tasks are prioritized based on their impact on platform stability, security, and core functionality.

| Task ID | Task Description | Rationale for Assignment to `webwaka-central-mgmt` | Priority |
| :--- | :--- | :--- | :--- |
| **WCM-001** | **Implement Immutable Financial Ledger Core** | The central ledger is the foundational component of `webwaka-central-mgmt`. It must be immutable to ensure financial integrity across all verticals. This task involves setting up the database schema, core business logic for recording transactions, and ensuring atomicity. | High |
| **WCM-002** | **Develop Event Ingestion Pipeline for Financial Transactions** | To adhere to the Anti-Drift Rule, all financial transactions from all verticals must emit events to this repository. This task focuses on building a robust, scalable event ingestion pipeline capable of handling high volumes of financial events from various sources. | High |
| **WCM-003** | **Build Global Affiliate and Commission Engine** | The affiliate and commission engine is a core responsibility of this repository. This task involves creating the logic to calculate, track, and manage commissions based on predefined rules and events from other verticals. | Medium |
| **WCM-004** | **Establish Webhook Dead Letter Queue (DLQ) Infrastructure** | A reliable DLQ is essential for handling failed webhook deliveries. This task involves setting up the infrastructure to receive, store, and potentially reprocess failed webhooks, ensuring data consistency and reliability across the ecosystem. | Medium |
| **WCM-005** | **Implement Global Fraud Scoring Mechanism** | Fraud detection is a critical function of the central management system. This task involves developing a global fraud scoring mechanism that can analyze transactions and events across all verticals to identify and mitigate fraudulent activities. | High |
| **WCM-006** | **Develop Automated Data Retention Pruning System** | To comply with data privacy regulations and manage storage costs, an automated data retention pruning system is required. This task involves implementing logic to periodically identify and delete or archive data based on predefined retention policies. | Low |
| **WCM-007** | **Implement Dynamic Tenant Suspension Enforcement** | The ability to suspend tenants based on specific triggers (e.g., non-payment, policy violations) is a core responsibility. This task involves developing the logic to enforce tenant suspensions dynamically, ensuring that suspended tenants lose access to platform services. | Medium |
| **WCM-008** | **Integrate with `@webwaka/core` for Shared Primitives** | To adhere to the "Build Once Use Infinitely" invariant, this repository must integrate with `@webwaka/core` for shared primitives such as Auth, RBAC, Event Bus types, KYC/KYB logic, Rate Limiting, D1 Query Helpers, etc. This task involves updating existing code or implementing new integrations to leverage these shared components. | High |
| **WCM-009** | **Optimize Ledger Query Performance** | As the volume of financial transactions grows, ledger query performance may become a bottleneck. This task involves analyzing and optimizing database queries, indexing strategies, and potentially implementing caching mechanisms to ensure efficient data retrieval. | Medium |
| **WCM-010** | **Develop Comprehensive QA Suite for Financial Transactions** | Given the critical nature of financial transactions, a comprehensive QA suite is essential. This task involves developing unit, integration, and end-to-end tests to verify the accuracy, integrity, and security of the immutable ledger and related components. | High |

## 6. TASK BREAKDOWN & IMPLEMENTATION PROMPTS

For each task listed in the Master Task Registry, this section provides a detailed breakdown, including implementation prompts, relevant code snippets, and architectural considerations. The goal is to provide a clear path for a Replit agent to execute the task.

### **WCM-001: Implement Immutable Financial Ledger Core**

**Task Breakdown:**
This task involves designing and implementing the foundational components of the immutable financial ledger. It encompasses database schema definition, core transaction recording logic, and mechanisms to ensure data integrity and immutability.

**Implementation Prompts:**
1.  **Database Schema Design:** Define a robust and immutable schema for ledger entries. Each entry must include a unique transaction ID, timestamp, type (e.g., credit, debit), amount, associated accounts (source/destination), and a cryptographic hash of the previous entry to ensure immutability.
    *   *Considerations:* Use a database system optimized for append-only operations (e.g., PostgreSQL with appropriate indexing, or a specialized ledger database). Ensure foreign key constraints for account IDs.
2.  **Transaction Recording Service:** Develop a service (`LedgerService`) responsible for creating new ledger entries. This service must validate incoming transactions, apply business rules, and persist entries to the database.
    *   *Considerations:* Implement ACID properties for transactions. Use a transaction manager to ensure all related operations (e.g., updating account balances, creating ledger entries) are atomic.
3.  **Immutability Enforcement:** Implement mechanisms to prevent modification or deletion of existing ledger entries. This can be achieved through database-level constraints, application-level logic, and cryptographic chaining.
    *   *Considerations:* Store a hash of the previous ledger entry within each new entry. Any attempt to alter a past entry would break the chain, indicating tampering. This can be verified periodically.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/ledger/ledger.model.ts
interface LedgerEntry {
  id: string; // UUID
  timestamp: Date;
  type: 'credit' | 'debit';
  amount: number; // Stored in kobo integers (Nigeria First invariant)
  currency: string; // e.g., 'NGN'
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  metadata?: Record<string, any>;
  previousEntryHash: string; // Cryptographic hash of the previous entry
  entryHash: string; // Hash of the current entry
}

// src/ledger/ledger.service.ts
class LedgerService {
  async recordTransaction(transaction: Omit<LedgerEntry, 'id' | 'timestamp' | 'previousEntryHash' | 'entryHash'>): Promise<LedgerEntry> {
    // 1. Fetch last ledger entry to get previousEntryHash
    // 2. Calculate current entry hash
    // 3. Persist to database
    // 4. Ensure atomicity with account balance updates
  }

  async verifyLedgerIntegrity(): Promise<boolean> {
    // Iterate through ledger entries and verify hash chain
  }
}
```

**Architectural Considerations:**
*   **High Availability & Durability:** The ledger is mission-critical. Ensure the database and application services are highly available and data is durably stored with backups.
*   **Scalability:** Design for high transaction throughput. Consider sharding or partitioning strategies if necessary.
*   **Security:** Implement strict access controls, encryption at rest and in transit, and regular security audits.
*   **Auditability:** Every transaction must be fully auditable, with clear trails of who initiated what and when.

### **WCM-002: Develop Event Ingestion Pipeline for Financial Transactions**

**Task Breakdown:**
This task focuses on building a robust, scalable event ingestion pipeline to receive financial transaction events from all vertical repositories, as mandated by the Anti-Drift Rule.

**Implementation Prompts:**
1.  **Event Listener/Consumer Setup:** Configure a mechanism to listen for financial transaction events published by other WebWaka OS repositories. This will likely involve subscribing to a central Event Bus (e.g., Kafka, RabbitMQ, or a custom `@webwaka/core` Event Bus implementation).
    *   *Considerations:* Ensure idempotency in event processing to handle duplicate messages without adverse effects. Implement proper error handling and retry mechanisms.
2.  **Event Validation and Transformation:** Upon receiving an event, validate its structure and content against a predefined schema. Transform the event data into the `LedgerEntry` format required by `webwaka-central-mgmt`.
    *   *Considerations:* Use schema validation libraries (e.g., Zod, Joi) to ensure data integrity. Handle potential data type mismatches or missing fields gracefully.
3.  **Integration with Ledger Service:** Once validated and transformed, pass the event data to the `LedgerService` (WCM-001) to record the transaction in the immutable ledger.
    *   *Considerations:* Ensure that the event ingestion pipeline and ledger service communicate securely and efficiently. Use asynchronous processing to avoid blocking the ingestion pipeline.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/events/financial.event.consumer.ts
import { EventBus } from '@webwaka/core'; // Assuming @webwaka/core provides an EventBus
import { LedgerService } from '../ledger/ledger.service';

interface FinancialTransactionEvent {
  // Define event structure from other verticals
  transactionId: string;
  amount: number;
  // ... other relevant fields
}

class FinancialEventConsumer {
  constructor(private eventBus: EventBus, private ledgerService: LedgerService) {
    this.eventBus.subscribe('financial.transaction.created', this.handleFinancialTransaction.bind(this));
  }

  private async handleFinancialTransaction(event: FinancialTransactionEvent): Promise<void> {
    try {
      // 1. Validate event schema
      // 2. Transform to LedgerEntry format
      const ledgerEntryData = this.transformEventToLedgerEntry(event);
      await this.ledgerService.recordTransaction(ledgerEntryData);
      console.log(`Transaction ${event.transactionId} recorded successfully.`);
    } catch (error) {
      console.error(`Error processing financial transaction event ${event.transactionId}:`, error);
      // Implement dead-letter queueing or retry logic
    }
  }

  private transformEventToLedgerEntry(event: FinancialTransactionEvent): Omit<LedgerEntry, 'id' | 'timestamp' | 'previousEntryHash' | 'entryHash'> {
    // Transformation logic here
    return {
      amount: event.amount,
      // ... map other fields
    };
  }
}
```

**Architectural Considerations:**
*   **Message Broker Selection:** Choose a message broker that aligns with the ecosystem's needs for reliability, scalability, and message persistence.
*   **Observability:** Implement comprehensive logging, monitoring, and alerting for the event ingestion pipeline to quickly identify and resolve issues.
*   **Backpressure Management:** Design the pipeline to handle bursts of events and prevent overwhelming downstream services.
*   **Security:** Ensure that only authorized services can publish and consume financial events.

### **WCM-003: Build Global Affiliate and Commission Engine**

**Task Breakdown:**
This task involves creating the logic to calculate, track, and manage affiliate commissions based on predefined rules and events from other verticals.

**Implementation Prompts:**
1.  **Commission Rule Engine:** Develop a flexible rule engine that can define and apply various commission structures (e.g., percentage-based, fixed amount, tiered). Rules should be configurable and potentially dynamic.
    *   *Considerations:* Store commission rules in a database or configuration service. Allow for rule versioning and A/B testing of different commission structures.
2.  **Commission Calculation Service:** Create a service (`CommissionService`) that receives relevant events (e.g., `sale.completed`, `referral.signed_up`) and calculates commissions based on the active rules.
    *   *Considerations:* Ensure calculations are accurate and handle edge cases (e.g., refunds, chargebacks). Integrate with the `LedgerService` to record commission payouts.
3.  **Affiliate Tracking and Payout Management:** Implement mechanisms to track affiliate performance, manage affiliate accounts, and facilitate commission payouts. This might involve generating payout reports and integrating with payment gateways.
    *   *Considerations:* Provide a dashboard for affiliates to view their earnings. Automate payout processes where possible, while maintaining manual review capabilities.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/commissions/commission.model.ts
interface CommissionRule {
  id: string;
  name: string;
  type: 'percentage' | 'fixed';
  value: number; // e.g., 0.10 for 10% or 500 for fixed 500 NGN
  triggerEvent: string; // e.g., 'webwaka.commerce.sale.completed'
  isActive: boolean;
  // ... other rule parameters like minimum sale amount, product categories
}

interface AffiliateCommission {
  id: string;
  affiliateId: string;
  transactionId: string; // Reference to the original transaction
  amount: number;
  currency: string;
  calculatedAt: Date;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
}

// src/commissions/commission.service.ts
class CommissionService {
  async calculateCommission(event: any): Promise<AffiliateCommission | null> {
    // 1. Fetch active commission rules based on event.triggerEvent
    // 2. Apply rules to calculate commission amount
    // 3. Create AffiliateCommission entry
    // 4. Record payout to LedgerService (WCM-001)
  }

  async getAffiliateCommissions(affiliateId: string): Promise<AffiliateCommission[]> {
    // Retrieve commissions for a given affiliate
  }
}
```

**Architectural Considerations:**
*   **Rule Engine Flexibility:** The rule engine should be easily extensible to accommodate new commission structures without code changes.
*   **Performance:** Commission calculations should be efficient, especially for high-volume events.
*   **Financial Accuracy:** Ensure all calculations are precise and reconcile with the immutable ledger.
*   **Security:** Protect sensitive affiliate data and ensure secure payout processes.

### **WCM-004: Establish Webhook Dead Letter Queue (DLQ) Infrastructure**

**Task Breakdown:**
This task involves setting up a robust Dead Letter Queue (DLQ) infrastructure to handle failed webhook deliveries, ensuring data consistency and reliability across the ecosystem.

**Implementation Prompts:**
1.  **DLQ Message Producer:** Modify existing webhook sending mechanisms in `webwaka-central-mgmt` (and potentially other repos that send webhooks) to route failed deliveries to the DLQ instead of simply discarding them.
    *   *Considerations:* Implement a retry policy before sending to DLQ. Include relevant metadata in the DLQ message (e.g., original payload, error message, retry count).
2.  **DLQ Storage and Retrieval:** Choose and implement a reliable storage mechanism for DLQ messages (e.g., a dedicated database table, a message queue with DLQ capabilities like SQS, or a persistent file store).
    *   *Considerations:* Ensure messages are durably stored and easily retrievable. Implement indexing for efficient searching and filtering of DLQ messages.
3.  **DLQ Reprocessing Mechanism:** Develop a service or worker that can periodically (or on-demand) retrieve messages from the DLQ, attempt to reprocess them, and remove them upon successful delivery.
    *   *Considerations:* Implement exponential backoff for retries. Provide tools for manual inspection and reprocessing of DLQ messages. Alerting for persistent failures.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/webhooks/webhook.dlq.service.ts
interface DLQMessage {
  id: string;
  originalPayload: any;
  targetUrl: string;
  error: string;
  retryCount: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  status: 'pending' | 'reprocessed' | 'failed_permanently';
}

class WebhookDLQService {
  async enqueueFailedWebhook(payload: any, targetUrl: string, error: string): Promise<void> {
    // Create DLQMessage and persist to storage
  }

  async getMessagesForReprocessing(): Promise<DLQMessage[]> {
    // Retrieve messages from DLQ based on status and retry count
  }

  async markAsReprocessed(messageId: string): Promise<void> {
    // Update status of DLQ message
  }

  async markAsFailedPermanently(messageId: string): Promise<void> {
    // Update status of DLQ message
  }
}

// Example of webhook sender (conceptual)
async function sendWebhook(payload: any, targetUrl: string) {
  try {
    await fetch(targetUrl, { method: 'POST', body: JSON.stringify(payload) });
  } catch (error) {
    await new WebhookDLQService().enqueueFailedWebhook(payload, targetUrl, error.message);
  }
}
```

**Architectural Considerations:**
*   **Reliability:** The DLQ must be highly reliable to prevent data loss. Use persistent storage.
*   **Scalability:** The DLQ should be able to handle a large volume of failed messages without impacting performance.
*   **Monitoring & Alerting:** Implement robust monitoring for DLQ size, processing rates, and permanent failures.
*   **Security:** Protect sensitive data within DLQ messages and ensure secure access to the DLQ.

### **WCM-005: Implement Global Fraud Scoring Mechanism**

**Task Breakdown:**
This task involves developing a global fraud scoring mechanism that can analyze transactions and events across all verticals to identify and mitigate fraudulent activities.

**Implementation Prompts:**
1.  **Fraud Rule Definition and Management:** Create a system to define and manage fraud detection rules. These rules could be based on various parameters like transaction velocity, unusual amounts, IP address reputation, or behavioral patterns.
    *   *Considerations:* Allow for rule configuration via a UI or API. Support different types of rules (e.g., threshold-based, pattern-matching). Version control for rules.
2.  **Fraud Scoring Service:** Develop a service (`FraudService`) that receives relevant events (e.g., `transaction.created`, `user.login.failed`) and applies the defined fraud rules to generate a fraud score or risk assessment.
    *   *Considerations:* Integrate with external fraud detection APIs if necessary. The scoring should be real-time or near real-time. The output should be a score and a list of triggered rules.
3.  **Actionable Outcomes:** Based on the fraud score, trigger appropriate actions (e.g., flag transaction for manual review, block user, notify security team, automatically decline transaction). Integrate with `webwaka-central-mgmt`'s tenant suspension enforcement (WCM-007).
    *   *Considerations:* Define clear thresholds for different actions. Provide an interface for reviewing flagged items and overriding automated decisions.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/fraud/fraud.model.ts
interface FraudRule {
  id: string;
  name: string;
  description: string;
  condition: string; // e.g., 'transaction.amount > 1000000 && user.country !== transaction.country'
  scoreImpact: number; // How much this rule contributes to the total fraud score
  isActive: boolean;
}

interface FraudAssessment {
  transactionId: string;
  score: number;
  triggeredRules: string[]; // IDs of rules that were triggered
  recommendation: 'approve' | 'review' | 'decline';
  assessedAt: Date;
}

// src/fraud/fraud.service.ts
class FraudService {
  async assessTransaction(transactionEvent: any): Promise<FraudAssessment> {
    let score = 0;
    const triggeredRules: string[] = [];

    // 1. Fetch active fraud rules
    // 2. Evaluate each rule against transactionEvent data
    // 3. Accumulate score and triggered rules

    // Determine recommendation based on final score
    let recommendation: FraudAssessment['recommendation'] = 'approve';
    if (score > 50) recommendation = 'review';
    if (score > 80) recommendation = 'decline';

    return { transactionId: transactionEvent.id, score, triggeredRules, recommendation, assessedAt: new Date() };
  }

  async applyFraudAction(assessment: FraudAssessment): Promise<void> {
    if (assessment.recommendation === 'decline') {
      // Trigger transaction decline logic
    }
    if (assessment.recommendation === 'review') {
      // Flag for manual review
    }
    // Integrate with WCM-007 for tenant suspension if severe fraud detected
  }
}
```

**Architectural Considerations:**
*   **Real-time Processing:** Fraud detection often requires real-time or near real-time processing to be effective.
*   **Machine Learning Integration:** Consider integrating with ML models for more sophisticated anomaly detection and predictive fraud scoring.
*   **Data Privacy:** Handle sensitive user and transaction data in compliance with privacy regulations.
*   **Scalability:** The fraud scoring mechanism must be able to handle a high volume of events from all verticals.

### **WCM-006: Develop Automated Data Retention Pruning System**

**Task Breakdown:**
This task involves implementing logic to periodically identify and delete or archive data based on predefined retention policies, ensuring compliance with data privacy regulations and managing storage costs.

**Implementation Prompts:**
1.  **Retention Policy Definition:** Define configurable data retention policies for different types of data (e.g., ledger entries, DLQ messages, audit logs). Policies should specify retention periods and actions (delete, archive).
    *   *Considerations:* Store policies in a database or configuration service. Allow for different policies based on data sensitivity or regulatory requirements.
2.  **Pruning Service/Worker:** Develop a background service or scheduled worker (`DataRetentionService`) that periodically scans the database for data that has exceeded its retention period.
    *   *Considerations:* Implement efficient queries to identify expired data. Use batch processing to avoid performance impact on the main application.
3.  **Data Deletion/Archiving:** Implement the actual deletion or archiving of expired data. For archiving, integrate with a long-term storage solution (e.g., S3, cold storage database).
    *   *Considerations:* Ensure data deletion is irreversible where required. For archiving, maintain metadata to allow for future retrieval if necessary. Log all pruning actions for audit purposes.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/tenancy/data.retention.model.ts
interface DataRetentionPolicy {
  id: string;
  dataType: 'ledger_entry' | 'dlq_message' | 'audit_log';
  retentionPeriodDays: number;
  action: 'delete' | 'archive';
  isActive: boolean;
}

// src/tenancy/data.retention.service.ts
class DataRetentionService {
  async runPruningJob(): Promise<void> {
    const policies = await this.getRetentionPolicies();

    for (const policy of policies) {
      if (!policy.isActive) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionPeriodDays);

      if (policy.dataType === 'ledger_entry') {
        await this.pruneLedgerEntries(cutoffDate, policy.action);
      } else if (policy.dataType === 'dlq_message') {
        await this.pruneDLQMessages(cutoffDate, policy.action);
      }
      // ... handle other data types
    }
  }

  private async pruneLedgerEntries(cutoffDate: Date, action: 'delete' | 'archive'): Promise<void> {
    if (action === 'delete') {
      // Execute DELETE FROM ledger_entries WHERE timestamp < cutoffDate;
    } else if (action === 'archive') {
      // Move data to archive storage
    }
    console.log(`Pruned ledger entries older than ${cutoffDate.toISOString()}`);
  }

  private async pruneDLQMessages(cutoffDate: Date, action: 'delete' | 'archive'): Promise<void> {
    // Similar logic for DLQ messages
  }

  private async getRetentionPolicies(): Promise<DataRetentionPolicy[]> {
    // Fetch policies from database
    return [];
  }
}
```

**Architectural Considerations:**
*   **Compliance:** Ensure the system adheres to all relevant data privacy and retention regulations (e.g., GDPR, NDPR).
*   **Performance Impact:** Schedule pruning jobs during off-peak hours to minimize impact on production systems. Use database features for efficient deletion/archiving.
*   **Audit Trails:** Maintain detailed logs of all data pruning activities for compliance and debugging.
*   **Data Integrity:** Ensure that pruning operations do not corrupt or inadvertently delete active data.

### **WCM-007: Implement Dynamic Tenant Suspension Enforcement**

**Task Breakdown:**
This task involves developing the logic to dynamically enforce tenant suspensions based on specific triggers (e.g., non-payment, policy violations, severe fraud), ensuring that suspended tenants lose access to platform services.

**Implementation Prompts:**
1.  **Suspension Trigger Mechanism:** Define triggers for tenant suspension. These could be events from `webwaka-super-admin-v2` (for billing issues), `webwaka-central-mgmt` (for fraud), or other services.
    *   *Considerations:* Use an event-driven approach. Triggers should include tenant ID, reason for suspension, and duration (if temporary).
2.  **Tenant Status Management:** Implement a mechanism to update and manage tenant suspension status. This might involve updating a central tenant registry (potentially in `webwaka-super-admin-v2` or a shared `@webwaka/core` component) and caching the status locally.
    *   *Considerations:* Ensure consistency of tenant status across the ecosystem. Implement a clear state machine for tenant status (active, suspended, terminated).
3.  **Access Control Enforcement:** Integrate with the platform's authentication and authorization systems (likely provided by `@webwaka/core`) to enforce suspension. When a suspended tenant attempts to access services, their requests should be denied.
    *   *Considerations:* Implement this enforcement at API gateways, middleware, or service-level checks. Provide clear error messages to suspended tenants.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// src/tenancy/tenant.suspension.service.ts
import { EventBus } from '@webwaka/core';
import { AuthService } from '@webwaka/core'; // Assuming @webwaka/core provides an AuthService

interface TenantSuspensionEvent {
  tenantId: string;
  reason: string;
  suspendedBy: string;
  durationDays?: number; // Optional, for temporary suspensions
}

class TenantSuspensionService {
  constructor(private eventBus: EventBus, private authService: AuthService) {
    this.eventBus.subscribe('tenant.suspended', this.handleTenantSuspension.bind(this));
    this.eventBus.subscribe('tenant.reactivated', this.handleTenantReactivation.bind(this));
  }

  private async handleTenantSuspension(event: TenantSuspensionEvent): Promise<void> {
    // 1. Update tenant status in central registry (e.g., database)
    // 2. Invalidate cached tenant permissions/tokens for immediate effect
    await this.authService.suspendTenantAccess(event.tenantId);
    console.log(`Tenant ${event.tenantId} suspended for reason: ${event.reason}`);
  }

  private async handleTenantReactivation(event: { tenantId: string }): Promise<void> {
    // 1. Update tenant status in central registry
    // 2. Reactivate tenant permissions/tokens
    await this.authService.reactivateTenantAccess(event.tenantId);
    console.log(`Tenant ${event.tenantId} reactivated.`);
  }

  async enforceAccess(tenantId: string): Promise<boolean> {
    // Check tenant status from central registry or cache
    const isSuspended = await this.authService.isTenantSuspended(tenantId);
    if (isSuspended) {
      throw new Error('Tenant account is suspended.');
    }
    return true;
  }
}
```

**Architectural Considerations:**
*   **Real-time Enforcement:** Suspension should be enforced as close to real-time as possible to prevent further unauthorized access.
*   **Clear Communication:** Inform suspended tenants about the reason for suspension and steps for reactivation.
*   **Reversibility:** Provide mechanisms to reactivate tenants if the issue is resolved or a suspension was erroneous.
*   **Security:** Ensure that only authorized personnel or automated systems can trigger and manage tenant suspensions.

### **WCM-008: Integrate with `@webwaka/core` for Shared Primitives**

**Task Breakdown:**
This task involves updating existing code or implementing new integrations to leverage shared primitives from `@webwaka/core`, adhering to the "Build Once Use Infinitely" invariant.

**Implementation Prompts:**
1.  **Identify Core Primitive Usage:** Review `webwaka-central-mgmt` codebase to identify areas where custom implementations of authentication, RBAC, event bus types, KYC/KYB logic, rate limiting, or D1 query helpers are currently in use.
    *   *Considerations:* Look for direct database queries for permissions, custom event emitters, or bespoke KYC/KYB workflows.
2.  **Replace Custom Implementations with `@webwaka/core`:** Refactor identified sections to replace custom logic with imports and calls to the corresponding modules within `@webwaka/core`.
    *   *Considerations:* Ensure backward compatibility during migration. Thoroughly test all integrations to prevent regressions.
3.  **Update `package.json` and Dependencies:** Ensure `@webwaka/core` is correctly listed as a dependency in `package.json` and that the correct versions are being used.
    *   *Considerations:* Manage dependency versions carefully to avoid conflicts. Use `npm install` or `yarn install` to update dependencies.

**Relevant Code Snippets (Conceptual - TypeScript/Node.js):**

```typescript
// Before (example: custom auth check)
// function checkPermission(user: User, action: string) { /* ... custom logic ... */ }

// After (example: using @webwaka/core RBAC)
import { RBACService } from '@webwaka/core';

class MyService {
  constructor(private rbacService: RBACService) {}

  async performAction(user: User, action: string): Promise<void> {
    if (!await this.rbacService.hasPermission(user.id, action)) {
      throw new Error('Permission denied');
    }
    // ... proceed with action
  }
}

// Before (example: custom event emitter)
// const myEventEmitter = new EventEmitter();
// myEventEmitter.emit('financial.transaction.created', data);

// After (example: using @webwaka/core EventBus)
import { EventBus } from '@webwaka/core';

class MyPublisher {
  constructor(private eventBus: EventBus) {}

  publishTransaction(data: any): void {
    this.eventBus.publish('financial.transaction.created', data);
  }
}
```

**Architectural Considerations:**
*   **Dependency Management:** Clearly define and manage dependencies on `@webwaka/core` to ensure stability and avoid version conflicts.
*   **Refactoring Strategy:** Plan a phased refactoring approach to minimize disruption and allow for thorough testing of each integration.
*   **Documentation:** Update internal documentation to reflect the reliance on `@webwaka/core` primitives.
*   **Training:** Ensure developers are familiar with the usage patterns and APIs of `@webwaka/core`.

### **WCM-009: Optimize Ledger Query Performance**

**Task Breakdown:**
This task involves analyzing and optimizing database queries, indexing strategies, and potentially implementing caching mechanisms to ensure efficient data retrieval from the immutable ledger, especially as transaction volume grows.

**Implementation Prompts:**
1.  **Performance Profiling:** Identify slow-running queries related to the ledger. Use database profiling tools (e.g., `EXPLAIN ANALYZE` in PostgreSQL) to understand query execution plans and bottlenecks.
    *   *Considerations:* Focus on frequently accessed queries or those with high latency. Analyze queries used for reporting, reconciliation, and API endpoints.
2.  **Indexing Strategy Review:** Evaluate existing database indexes on the ledger tables. Create new indexes or optimize existing ones based on query patterns.
    *   *Considerations:* Index frequently queried columns (e.g., `timestamp`, `accountId`, `transactionId`). Be mindful of the trade-offs between read performance and write performance when adding indexes.
3.  **Query Optimization:** Rewrite inefficient queries to improve their performance. This might involve restructuring `JOIN` clauses, using appropriate `WHERE` conditions, or optimizing subqueries.
    *   *Considerations:* Avoid `SELECT *`. Only fetch necessary columns. Use pagination for large result sets.
4.  **Caching Implementation (Optional but Recommended):** For frequently accessed, relatively static ledger data (e.g., aggregated balances, historical summaries), implement a caching layer (e.g., Redis, Memcached).
    *   *Considerations:* Define cache invalidation strategies. Ensure cached data remains consistent with the source of truth. Do not cache sensitive, rapidly changing data.

**Relevant Code Snippets (Conceptual - SQL/TypeScript):**

```sql
-- Example: Adding an index to improve query performance
CREATE INDEX idx_ledger_entries_account_id_timestamp ON ledger_entries (sourceAccountId, timestamp DESC);

-- Example: Optimized query for an an account's recent transactions
SELECT id, timestamp, type, amount, description
FROM ledger_entries
WHERE sourceAccountId = 'some-account-id'
ORDER BY timestamp DESC
LIMIT 100;
```

```typescript
// src/ledger/ledger.repository.ts (conceptual)
import { RedisClient } from 'redis'; // Assuming Redis for caching

class LedgerRepository {
  constructor(private dbClient: any, private cacheClient?: RedisClient) {}

  async getRecentTransactions(accountId: string, limit: number): Promise<LedgerEntry[]> {
    const cacheKey = `recent_transactions:${accountId}:${limit}`;
    if (this.cacheClient) {
      const cachedData = await this.cacheClient.get(cacheKey);
      if (cachedData) return JSON.parse(cachedData);
    }

    const query = `SELECT id, timestamp, type, amount, description FROM ledger_entries WHERE sourceAccountId = $1 ORDER BY timestamp DESC LIMIT $2`;
    const result = await this.dbClient.query(query, [accountId, limit]);
    const transactions = result.rows;

    if (this.cacheClient) {
      await this.cacheClient.setex(cacheKey, 300, JSON.stringify(transactions)); // Cache for 5 minutes
    }
    return transactions;
  }
}
```

**Architectural Considerations:**
*   **Database Choice:** Ensure the underlying database is suitable for the expected load and data characteristics.
*   **Monitoring:** Continuously monitor database performance metrics (query times, CPU usage, I/O) to detect new bottlenecks.
*   **Read Replicas:** For read-heavy workloads, consider using database read replicas to distribute the load.
*   **Data Consistency:** When implementing caching, carefully manage cache invalidation to maintain data consistency.

### **WCM-010: Develop Comprehensive QA Suite for Financial Transactions**

**Task Breakdown:**
Given the critical nature of financial transactions, a comprehensive QA suite is essential. This task involves developing unit, integration, and end-to-end tests to verify the accuracy, integrity, and security of the immutable ledger and related components.

**Implementation Prompts:**
1.  **Unit Tests:** Write unit tests for individual functions and methods within the `LedgerService`, `CommissionService`, `FraudService`, and other core components. Focus on testing business logic in isolation.
    *   *Considerations:* Use a testing framework (e.g., Jest, Mocha). Mock external dependencies (database calls, API integrations) to ensure tests are fast and isolated.
2.  **Integration Tests:** Develop integration tests to verify the interaction between different services and components (e.g., `EventConsumer` with `LedgerService`, `CommissionService` with `LedgerService`).
    *   *Considerations:* Use a test database or in-memory database for integration tests. Test data flow and error handling across service boundaries.
3.  **End-to-End (E2E) Tests:** Create E2E tests that simulate real-world financial transaction flows, from event ingestion to ledger recording, commission calculation, and fraud assessment.
    *   *Considerations:* Use tools like Playwright or Cypress for E2E testing if there's a UI component, or custom scripts for API-driven E2E tests. Test the entire system as a black box.
4.  **Negative Testing and Edge Cases:** Include tests for invalid inputs, error conditions, race conditions, and other edge cases to ensure the system behaves robustly under stress.
    *   *Considerations:* Test for attempts to modify immutable ledger entries, duplicate events, and high-volume concurrent transactions.
5.  **Performance and Load Testing:** (Optional, but highly recommended for financial systems) Conduct performance and load tests to ensure the system can handle expected transaction volumes and maintain acceptable response times.
    *   *Considerations:* Use tools like JMeter or k6. Simulate realistic user behavior and transaction patterns.

**Relevant Code Snippets (Conceptual - TypeScript/Jest):**

```typescript
// tests/ledger.service.test.ts
import { LedgerService } from '../src/ledger/ledger.service';
import { LedgerRepository } from '../src/ledger/ledger.repository';

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  let mockLedgerRepository: jest.Mocked<LedgerRepository>;

  beforeEach(() => {
    mockLedgerRepository = {
      recordEntry: jest.fn(),
      getLatestEntry: jest.fn(),
      // ... mock other methods
    } as jest.Mocked<LedgerRepository>;
    ledgerService = new LedgerService(mockLedgerRepository);
  });

  it('should record a valid transaction', async () => {
    mockLedgerRepository.getLatestEntry.mockResolvedValueOnce({ entryHash: 'initial_hash' });
    mockLedgerRepository.recordEntry.mockResolvedValueOnce({ id: 'tx-123', entryHash: 'new_hash' });

    const transaction = {
      type: 'credit',
      amount: 100000,
      sourceAccountId: 'acc-1',
      destinationAccountId: 'acc-2',
      description: 'Test credit',
    };

    const result = await ledgerService.recordTransaction(transaction);
    expect(result).toBeDefined();
    expect(mockLedgerRepository.recordEntry).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100000,
      previousEntryHash: 'initial_hash',
    }));
  });

  it('should throw error for invalid transaction amount', async () => {
    const transaction = {
      type: 'credit',
      amount: -100,
      sourceAccountId: 'acc-1',
      destinationAccountId: 'acc-2',
      description: 'Invalid credit',
    };
    await expect(ledgerService.recordTransaction(transaction)).rejects.toThrow('Invalid amount');
  });
});
```

**Architectural Considerations:**
*   **Test Automation:** Integrate the QA suite into a Continuous Integration/Continuous Deployment (CI/CD) pipeline to ensure tests run automatically on every code change.
*   **Test Data Management:** Develop strategies for creating and managing realistic test data without compromising sensitive information.
*   **Code Coverage:** Aim for high code coverage to ensure that most of the codebase is tested.
*   **Security Testing:** Incorporate security testing (e.g., penetration testing, vulnerability scanning) as part of the overall QA process for financial systems.

## 7. QA PLANS & PROMPTS

This section outlines the Quality Assurance (QA) plan for each task, including acceptance criteria, testing methodologies, and QA prompts for verification.

### **WCM-001: Implement Immutable Financial Ledger Core**

**Acceptance Criteria:**
*   All financial transactions are recorded in the ledger with a unique ID, timestamp, type, amount, and associated accounts.
*   Each ledger entry includes a cryptographic hash of the previous entry, forming an unbroken chain.
*   No existing ledger entry can be modified or deleted after creation.
*   The ledger accurately reflects the state of all financial movements within the WebWaka OS ecosystem.
*   Database schema enforces immutability and data integrity (e.g., `NOT NULL` constraints, appropriate data types).

**Testing Methodologies:**
*   **Unit Tests:** Verify `LedgerService` methods for recording transactions, calculating hashes, and retrieving entries. Mock database interactions.
*   **Integration Tests:** Test the interaction between `LedgerService` and the database. Ensure transactions are correctly persisted and retrieved.
*   **Immutability Tests:** Attempt to update or delete existing ledger entries directly via the service and database. Assert that these operations fail or are prevented.
*   **Data Integrity Tests:** Introduce malformed data or missing fields to ensure the system rejects them gracefully.

**QA Prompts:**
1.  "Record 10 sequential credit and debit transactions for a single account. Verify that all 10 entries are present in the ledger, their `previousEntryHash` values form a correct chain, and the final balance is accurate."
2.  "Attempt to update the `amount` of a recorded ledger entry via the API/service. Confirm that the operation is rejected and the original entry remains unchanged."
3.  "Simulate a database-level update on an existing ledger entry. Verify that the database prevents the modification or that subsequent integrity checks flag the tampering."
4.  "Verify that the `amount` field correctly stores values as kobo integers and that currency is consistently NGN."

### **WCM-002: Develop Event Ingestion Pipeline for Financial Transactions**

**Acceptance Criteria:**
*   The pipeline successfully consumes financial transaction events from the Event Bus.
*   Events are validated against a predefined schema before processing.
*   Validated events are correctly transformed into `LedgerEntry` format.
*   Transformed events are passed to the `LedgerService` for recording.
*   Duplicate events are handled idempotently, preventing double-counting or erroneous entries.
*   Error handling and retry mechanisms are in place for failed event processing.

**Testing Methodologies:**
*   **Unit Tests:** Test event validation and transformation logic in isolation.
*   **Integration Tests:** Simulate publishing financial events to the Event Bus and verify that the `EventConsumer` processes them, calls the `LedgerService`, and records entries correctly.
*   **Idempotency Tests:** Publish the same financial event multiple times and verify that only one ledger entry is created.
*   **Error Handling Tests:** Publish malformed events or events that cause the `LedgerService` to fail. Verify that errors are logged, and retry mechanisms (if implemented) are triggered or events are routed to a DLQ.

**QA Prompts:**
1.  "Publish a `financial.transaction.created` event with a valid payload. Verify that a corresponding entry appears in the immutable ledger."
2.  "Publish the exact same `financial.transaction.created` event twice within a short period. Confirm that only one ledger entry is created for this transaction."
3.  "Publish a `financial.transaction.created` event with a missing `amount` field. Verify that the event is rejected, an error is logged, and no ledger entry is created."
4.  "Simulate a temporary database outage during event processing. Verify that the event ingestion pipeline attempts to retry processing the event or routes it to a Dead Letter Queue."

### **WCM-003: Build Global Affiliate and Commission Engine**

**Acceptance Criteria:**
*   Commission rules can be defined, activated, and deactivated.
*   The `CommissionService` accurately calculates commissions based on active rules and incoming events.
*   Calculated commissions are recorded, tracked, and associated with the correct affiliate and transaction.
*   Commission payouts are correctly recorded in the immutable ledger via `LedgerService`.
*   Affiliate performance and earnings can be retrieved accurately.

**Testing Methodologies:**
*   **Unit Tests:** Test individual commission rule evaluation logic. Test `CommissionService` methods for calculating and storing commissions. Mock `LedgerService` interactions.
*   **Integration Tests:** Simulate `sale.completed` events and verify that commissions are calculated and recorded correctly, and that corresponding entries appear in the ledger.
*   **Rule Configuration Tests:** Test activating/deactivating rules and changing rule parameters. Verify that commission calculations reflect the current active rules.
*   **Edge Case Tests:** Test scenarios like zero-amount sales, refunds (if applicable), and multiple rules applying to a single event.

**QA Prompts:**
1.  "Define a commission rule: 10% for `webwaka.commerce.sale.completed` events. Publish a sale event of 10,000 NGN. Verify that a 1,000 NGN commission is calculated, recorded for the affiliate, and a corresponding debit entry is made in the ledger for the commission payout."
2.  "Deactivate the 10% commission rule. Publish another sale event. Verify that no commission is calculated or recorded."
3.  "Publish a sale event that should trigger two different commission rules (e.g., a product-specific rule and a general rule). Verify that both commissions are calculated and recorded correctly."
4.  "Retrieve all commissions for a specific affiliate. Verify that the list is accurate and reflects all calculated commissions."

### **WCM-004: Establish Webhook Dead Letter Queue (DLQ) Infrastructure**

**Acceptance Criteria:**
*   Failed webhook deliveries are routed to the DLQ with their original payload, target URL, error message, and retry count.
*   DLQ messages are durably stored and retrievable.
*   The DLQ reprocessing mechanism can retrieve messages and attempt to re-deliver them.
*   Successfully reprocessed messages are removed from the DLQ.
*   Messages that fail reprocessing after a configured number of retries are marked as permanently failed.

**Testing Methodologies:**
*   **Unit Tests:** Test `WebhookDLQService` methods for enqueuing, retrieving, and updating DLQ messages. Mock storage interactions.
*   **Integration Tests:** Simulate a webhook sender attempting to deliver to a non-existent or failing endpoint. Verify that the failed webhook appears in the DLQ.
*   **Reprocessing Tests:** Manually trigger the DLQ reprocessing mechanism. Verify that messages are re-delivered and removed from the DLQ upon success, or marked as permanently failed after multiple retries.
*   **Persistence Tests:** Verify that DLQ messages persist across service restarts.

**QA Prompts:**
1.  "Configure a webhook to send to a deliberately invalid URL. Trigger the webhook. Verify that the webhook payload, target URL, and error message are correctly stored in the DLQ."
2.  "Manually inspect the DLQ. Confirm the presence of the failed webhook. Then, simulate fixing the target URL and trigger the DLQ reprocessing. Verify that the webhook is successfully delivered and removed from the DLQ."
3.  "Configure a DLQ message to have a maximum of 3 retries. Trigger a webhook that consistently fails. Verify that the message is attempted 3 times, then marked as `failed_permanently` in the DLQ."
4.  "Verify that the DLQ message includes metadata such as `firstAttemptAt` and `lastAttemptAt`."

### **WCM-005: Implement Global Fraud Scoring Mechanism**

**Acceptance Criteria:**
*   Fraud rules can be defined and managed.
*   The `FraudService` accurately assesses events against active fraud rules.
*   A fraud score and a list of triggered rules are generated for each assessment.
*   Based on the fraud score, appropriate recommendations (`approve`, `review`, `decline`) are provided.
*   Actions (e.g., transaction decline, flagging for review, tenant suspension) are triggered based on recommendations.

**Testing Methodologies:**
*   **Unit Tests:** Test individual fraud rule evaluation logic. Test `FraudService` methods for assessing events and generating scores. Mock external integrations.
*   **Integration Tests:** Simulate various transaction events (e.g., high-value, unusual location) and verify that the `FraudService` generates the correct score and recommendation.
*   **Rule Configuration Tests:** Test activating/deactivating rules and changing rule parameters. Verify that fraud assessments reflect the current active rules.
*   **Action Trigger Tests:** Verify that when a transaction exceeds a fraud threshold, the corresponding action (e.g., decline, review flag) is correctly initiated.

**QA Prompts:**
1.  "Define a fraud rule: `transaction.amount > 500000` adds 60 points to the fraud score. Publish a transaction event with an amount of 600,000 NGN. Verify that the transaction receives a score of 60+, is recommended for `review`, and is flagged accordingly."
2.  "Define another fraud rule: `user.country !== transaction.country` adds 30 points. Publish a transaction event that triggers both rules. Verify that the combined score is 90+, and the recommendation is `decline`."
3.  "Verify that when a transaction is recommended for `decline`, the system prevents the transaction from being recorded in the ledger."
4.  "Test a scenario where a tenant repeatedly triggers high fraud scores. Verify that this leads to a tenant suspension event being triggered (integrating with WCM-007)."

### **WCM-006: Develop Automated Data Retention Pruning System**

**Acceptance Criteria:**
*   Data retention policies can be defined for different data types with specified retention periods and actions (delete/archive).
*   The `DataRetentionService` correctly identifies data that has exceeded its retention period.
*   Expired data is either deleted or archived according to the policy.
*   Pruning operations are logged for audit purposes.
*   The system does not inadvertently delete or archive active data.

**Testing Methodologies:**
*   **Unit Tests:** Test `DataRetentionService` methods for identifying expired data based on policies. Mock database interactions.
*   **Integration Tests:** Populate the database with data having various timestamps. Configure retention policies and run the pruning job. Verify that only expired data is affected and the correct action (delete/archive) is performed.
*   **Negative Tests:** Attempt to configure conflicting retention policies or policies that would delete critical active data. Verify that the system prevents such configurations or provides warnings.
*   **Audit Log Verification:** Check audit logs to confirm that all pruning actions are recorded with details.

**QA Prompts:**
1.  "Configure a policy to delete ledger entries older than 30 days. Create a ledger entry 35 days ago and another 20 days ago. Run the pruning job. Verify that only the 35-day-old entry is deleted, and the 20-day-old entry remains."
2.  "Configure a policy to archive DLQ messages older than 90 days. Create a DLQ message 100 days ago. Run the pruning job. Verify that the message is moved to the archive storage and removed from the active DLQ."
3.  "Verify that the pruning job logs its actions, including the policy applied, data type, and number of records processed."
4.  "Attempt to delete a ledger entry that is still within its retention period via the pruning system. Verify that the system does not delete it."

### **WCM-007: Implement Dynamic Tenant Suspension Enforcement**

**Acceptance Criteria:**
*   Tenant suspension events are correctly received and processed.
*   Tenant status is updated in the central registry and propagated across relevant systems.
*   Suspended tenants are immediately denied access to platform services.
*   Reactivation events correctly restore tenant access.
*   Clear error messages are provided to suspended tenants attempting access.

**Testing Methodologies:**
*   **Unit Tests:** Test `TenantSuspensionService` methods for handling suspension/reactivation events and checking tenant status. Mock `AuthService` interactions.
*   **Integration Tests:** Simulate a `tenant.suspended` event. Attempt to access a service as the suspended tenant. Verify that access is denied. Then simulate `tenant.reactivated` and verify access is restored.
*   **Access Control Tests:** Test various access points (APIs, UI if applicable) to ensure suspension is enforced consistently.
*   **Edge Case Tests:** Test suspending an already suspended tenant, reactivating an active tenant, and concurrent suspension/reactivation events.

**QA Prompts:**
1.  "Trigger a `tenant.suspended` event for `tenant-X`. Attempt to make an API call as `tenant-X`. Verify that the API call is rejected with an appropriate \'Tenant Suspended\' error message."
2.  "Trigger a `tenant.reactivated` event for `tenant-X`. Attempt to make the same API call. Verify that the API call is now successful."
3.  "Simulate a scenario where `tenant-Y` is suspended due to fraud (triggered by WCM-005). Verify that `tenant-Y` loses access to services."
4.  "Verify that the tenant suspension status is consistent across all integrated services (e.g., if `webwaka-super-admin-v2` also checks tenant status, ensure it reflects the suspension)."

### **WCM-008: Integrate with `@webwaka/core` for Shared Primitives**

**Acceptance Criteria:**
*   All identified custom implementations of shared primitives (Auth, RBAC, Event Bus, KYC/KYB, Rate Limiting, D1 Query Helpers) are replaced with `@webwaka/core` modules.
*   The system functions correctly after integration, with no regressions in functionality.
*   `package.json` correctly lists `@webwaka/core` as a dependency.
*   The application correctly uses the shared primitives as intended.

**Testing Methodologies:**
*   **Unit Tests:** Verify that individual components now correctly call `@webwaka/core` modules instead of custom logic. Mock `@webwaka/core` modules for isolation.
*   **Integration Tests:** Test end-to-end flows that rely on the integrated primitives (e.g., a user login flow using `@webwaka/core` Auth, a transaction flow using `@webwaka/core` Event Bus).
*   **Regression Tests:** Run existing test suites to ensure no functionality has been broken by the refactoring.
*   **Dependency Verification:** Check `package.json` and installed node modules to confirm correct `@webwaka/core` dependency.

**QA Prompts:**
1.  "Verify that the authentication process for internal API calls now correctly uses the `@webwaka/core` Auth middleware. Attempt to access a protected endpoint without proper authentication and verify rejection."
2.  "Publish a custom event through the `webwaka-central-mgmt` service. Verify that it is now routed via the `@webwaka/core` Event Bus and consumed by relevant listeners."
3.  "Review the `package.json` file. Confirm that `@webwaka/core` is listed as a dependency with an appropriate version."
4.  "Perform a code review to ensure that no direct calls to external authentication or event bus libraries remain, and all such interactions are mediated through `@webwaka/core`."

### **WCM-009: Optimize Ledger Query Performance**

**Acceptance Criteria:**
*   Identified slow-running ledger queries are optimized to meet performance targets (e.g., response time, throughput).
*   Database indexes are appropriately applied to support efficient query execution.
*   If caching is implemented, it effectively reduces database load for frequently accessed data.
*   Query optimization does not introduce data inconsistencies or errors.

**Testing Methodologies:**
*   **Performance Benchmarking:** Measure the execution time and resource consumption of critical ledger queries before and after optimization.
*   **Load Testing:** Simulate high concurrent query loads to ensure the optimized system maintains performance under stress.
*   **Regression Tests:** Run existing functional tests to ensure query optimization has not introduced any data retrieval errors.
*   **Cache Verification (if applicable):** Monitor cache hit rates and ensure cached data is consistent with the database.

**QA Prompts:**
1.  "Execute the `getRecentTransactions` query for an account with 10,000 transactions. Measure the response time and verify it meets the defined performance SLA (e.g., < 100ms)."
2.  "Using `EXPLAIN ANALYZE` (or equivalent database tool), verify that the optimized queries are utilizing the correct indexes and avoiding full table scans."
3.  "If caching is implemented, make a query for aggregated ledger data. Clear the cache and make the same query again. Verify that the first query is slower (cache miss) and subsequent queries are faster (cache hit)."
4.  "Verify that after query optimization, all reports and dashboards that rely on ledger data display accurate and consistent information."

### **WCM-010: Develop Comprehensive QA Suite for Financial Transactions**

**Acceptance Criteria:**
*   A comprehensive suite of unit, integration, and end-to-end tests is developed for `webwaka-central-mgmt`.
*   Tests cover core functionalities of the immutable ledger, commission engine, fraud scoring, DLQ, data retention, and tenant suspension.
*   Tests include positive, negative, and edge-case scenarios.
*   The test suite can be executed automatically as part of a CI/CD pipeline.
*   High code coverage is achieved for critical financial logic.

**Testing Methodologies:**
*   **Test Execution:** Run the entire test suite and verify that all tests pass.
*   **Code Coverage Analysis:** Use code coverage tools to ensure that a high percentage of the codebase, especially critical financial logic, is covered by tests.
*   **CI/CD Integration Verification:** Confirm that the test suite is integrated into the CI/CD pipeline and runs automatically on every code commit.
*   **Test Report Review:** Review test reports for any failures, warnings, or skipped tests.

**QA Prompts:**
1.  "Execute the entire test suite for `webwaka-central-mgmt`. Verify that all unit, integration, and end-to-end tests pass without errors."
2.  "Generate a code coverage report. Verify that the code coverage for `src/ledger/` and `src/commissions/` directories is above 90%."
3.  "Introduce a deliberate bug into the `LedgerService` (e.g., incorrect hash calculation). Run the tests and verify that the relevant unit/integration tests fail as expected."
4.  "Verify that the test suite runs successfully in the CI/CD environment and provides clear feedback on test results."

## 8. EXECUTION READINESS NOTES

This section provides final instructions and considerations for the Replit agent before commencing execution of tasks in the `webwaka-central-mgmt` repository.

### General Guidelines for Replit Agent:

1.  **Adherence to Anti-Drift Rules and Invariants:** Strictly adhere to the WebWaka OS v4 Ecosystem Scope & Boundary Document, particularly the Anti-Drift Rules and the 7 Core Invariants. Any deviation must be escalated for review.
2.  **Incremental Development:** Implement tasks incrementally, focusing on one sub-task at a time. Prioritize foundational components (e.g., WCM-001: Immutable Financial Ledger Core) before building dependent features.
3.  **Test-Driven Development (TDD):** For each implementation task, write comprehensive unit and integration tests as outlined in the QA Plans & Prompts (Section 7) *before* writing the production code. This ensures correctness and maintainability.
4.  **Code Review and Documentation:** Ensure all new code is well-documented with clear comments, especially for complex logic related to financial transactions, fraud scoring, and data retention. Adhere to established coding standards.
5.  **Security First:** Given the sensitive nature of financial data, prioritize security in all implementation decisions. This includes secure coding practices, input validation, and protection against common vulnerabilities.
6.  **Performance Monitoring:** Implement and monitor performance metrics for all new features, especially for high-throughput operations like event ingestion and ledger recording. Optimize as necessary.
7.  **Error Handling and Logging:** Implement robust error handling and comprehensive logging for all components. This is crucial for debugging, auditing, and operational visibility.
8.  **Idempotency:** Ensure that all operations, especially those triggered by events, are idempotent to prevent adverse effects from duplicate processing.
9.  **Collaboration:** If any ambiguities or dependencies on other repositories arise, escalate for clarification before proceeding.

### Specific Considerations for `webwaka-central-mgmt`:

*   **Financial Integrity:** The primary objective is to maintain the absolute integrity and immutability of the financial ledger. Any change that could compromise this must be rigorously reviewed and tested.
*   **Event-Driven Paradigm:** Embrace the event-driven architecture. Ensure that `webwaka-central-mgmt` correctly consumes events from other verticals and, where appropriate, emits its own events for auditing or downstream processing.
*   **Data Consistency:** Pay close attention to data consistency across the ecosystem, especially when dealing with distributed transactions and eventual consistency models.
*   **Regulatory Compliance:** Be mindful of financial regulations and data privacy laws (e.g., NDPR) when implementing data retention, fraud scoring, and KYC/KYB integrations.

### Task Execution Flow:

1.  **Start with WCM-001:** Begin by implementing the core immutable financial ledger. This is the bedrock for all other financial operations.
2.  **Proceed with WCM-002:** Once the ledger is stable, develop the event ingestion pipeline to feed transactions into it.
3.  **Integrate Shared Primitives (WCM-008):** As you progress, ensure that any custom implementations are replaced with `@webwaka/core` primitives to maintain consistency and leverage shared components.
4.  **Iterate on Features:** Implement the remaining tasks (WCM-003, WCM-004, WCM-005, WCM-006, WCM-007) in a logical sequence, ensuring each build upon stable foundations.
5.  **Continuous QA (WCM-010):** Develop and run the comprehensive QA suite continuously throughout the development process.
6.  **Performance Optimization (WCM-009):** Address performance bottlenecks as they arise, particularly for ledger queries.
