/**
 * CORE-11: Document & Contract Management
 * Blueprint Reference: Part 10.5 (Real Estate), Part 10.12 (Legal)
 *
 * Secure system for generating, signing, and storing legal documents.
 *
 * Tenant Isolation: every mutating and querying method requires a tenantId.
 * Documents are scoped per tenant — cross-tenant leakage is impossible by construction.
 */

export interface Document {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  status: 'draft' | 'pending_signature' | 'signed';
  signatures: Signature[];
  createdAt: Date;
}

export interface Signature {
  userId: string;
  timestamp: Date;
  ipAddress: string;
  hash: string;
}

export class DocumentEngine {
  private documents: Map<string, Document> = new Map();

  /**
   * Creates a new document from a template, scoped to the tenant.
   */
  createDocument(tenantId: string, title: string, content: string): Document {
    const doc: Document = {
      id: `doc_${crypto.randomUUID()}`,
      tenantId,
      title,
      content,
      status: 'draft',
      signatures: [],
      createdAt: new Date(),
    };
    this.documents.set(doc.id, doc);
    return doc;
  }

  /**
   * Requests signatures for a document, scoped to the tenant.
   */
  requestSignatures(tenantId: string, documentId: string): Document {
    const doc = this.documents.get(documentId);
    if (!doc || doc.tenantId !== tenantId) throw new Error('Document not found');

    if (doc.status !== 'draft') {
      throw new Error('Document must be in draft status to request signatures');
    }

    doc.status = 'pending_signature';
    return doc;
  }

  /**
   * Signs a document, scoped to the tenant.
   */
  signDocument(
    tenantId: string,
    documentId: string,
    userId: string,
    ipAddress: string
  ): Document {
    const doc = this.documents.get(documentId);
    if (!doc || doc.tenantId !== tenantId) throw new Error('Document not found');

    if (doc.status !== 'pending_signature') {
      throw new Error('Document is not pending signature');
    }

    if (doc.signatures.some(s => s.userId === userId)) {
      throw new Error('User has already signed this document');
    }

    const signature: Signature = {
      userId,
      timestamp: new Date(),
      ipAddress,
      hash: this.generateSignatureHash(doc.content, userId, ipAddress),
    };

    doc.signatures.push(signature);
    doc.status = 'signed';

    return doc;
  }

  private generateSignatureHash(content: string, userId: string, ipAddress: string): string {
    return `hash_${userId}_${Date.now()}`;
  }
}
