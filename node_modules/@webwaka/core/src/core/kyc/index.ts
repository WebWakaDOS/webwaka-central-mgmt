/**
 * CORE-12: Universal KYC/KYB Verification
 * Blueprint Reference: Part 10.11 (Fintech), Part 10.3 (Transport)
 *
 * Centralized identity verification system with Nigeria-First integrations.
 *
 * Tenant Isolation: every mutating and querying method requires a tenantId.
 * KYC requests are scoped per tenant — cross-tenant leakage is impossible by construction.
 */

export interface KYCRequest {
  id: string;
  tenantId: string;
  userId: string;
  documentType: 'NIN' | 'BVN' | 'PASSPORT' | 'DRIVERS_LICENSE';
  documentNumber: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: Date;
  rejectionReason?: string;
}

export class KYCEngine {
  private requests: Map<string, KYCRequest> = new Map();

  /**
   * Submits a new KYC verification request, scoped to the tenant.
   */
  submitVerification(
    tenantId: string,
    userId: string,
    documentType: 'NIN' | 'BVN' | 'PASSPORT' | 'DRIVERS_LICENSE',
    documentNumber: string
  ): KYCRequest {
    const request: KYCRequest = {
      id: `kyc_${crypto.randomUUID()}`,
      tenantId,
      userId,
      documentType,
      documentNumber,
      status: 'pending',
    };

    this.requests.set(request.id, request);
    return request;
  }

  /**
   * Processes a verification request, scoped to the tenant.
   * Mocks external API calls to NIMC (NIN) / NIBSS (BVN).
   */
  async processVerification(tenantId: string, requestId: string): Promise<KYCRequest> {
    const request = this.requests.get(requestId);
    if (!request || request.tenantId !== tenantId) {
      throw new Error('KYC request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Request is already processed');
    }

    const isValid = this.mockExternalVerification(request.documentNumber);

    if (isValid) {
      request.status = 'verified';
      request.verifiedAt = new Date();
    } else {
      request.status = 'rejected';
      request.rejectionReason = 'Document verification failed against national database';
    }

    return request;
  }

  /**
   * Retrieves all verification requests for a user, scoped to the tenant.
   */
  getUserVerificationStatus(tenantId: string, userId: string): KYCRequest[] {
    return Array.from(this.requests.values()).filter(
      r => r.tenantId === tenantId && r.userId === userId
    );
  }

  private mockExternalVerification(documentNumber: string): boolean {
    return !documentNumber.startsWith('000');
  }
}
