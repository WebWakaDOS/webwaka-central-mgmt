import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentEngine } from './index';

const T1 = 'tenant_alpha';
const T2 = 'tenant_beta';

describe('CORE-11: Document & Contract Management', () => {
  let docEngine: DocumentEngine;

  beforeEach(() => {
    docEngine = new DocumentEngine();
  });

  it('should create a document in draft status', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Terms and conditions...');
    expect(doc.title).toBe('Lease Agreement');
    expect(doc.tenantId).toBe(T1);
    expect(doc.status).toBe('draft');
    expect(doc.signatures).toHaveLength(0);
    expect(doc.id).toMatch(/^doc_/);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('should transition document to pending_signature', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Terms and conditions...');
    const updatedDoc = docEngine.requestSignatures(T1, doc.id);
    expect(updatedDoc.status).toBe('pending_signature');
  });

  it('should allow signing a pending document', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Terms and conditions...');
    docEngine.requestSignatures(T1, doc.id);

    const signedDoc = docEngine.signDocument(T1, doc.id, 'user_1', '192.168.1.1');
    expect(signedDoc.status).toBe('signed');
    expect(signedDoc.signatures).toHaveLength(1);
    expect(signedDoc.signatures[0]!.userId).toBe('user_1');
    expect(signedDoc.signatures[0]!.ipAddress).toBe('192.168.1.1');
    expect(signedDoc.signatures[0]!.hash).toBeDefined();
    expect(signedDoc.signatures[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('should reject signing a draft document', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Terms and conditions...');

    expect(() => {
      docEngine.signDocument(T1, doc.id, 'user_1', '192.168.1.1');
    }).toThrow('Document is not pending signature');
  });

  it('should throw when requesting signatures on non-existent document', () => {
    expect(() => {
      docEngine.requestSignatures(T1, 'doc_nonexistent');
    }).toThrow('Document not found');
  });

  it('should throw when signing a non-existent document', () => {
    expect(() => {
      docEngine.signDocument(T1, 'doc_nonexistent', 'user_1', '10.0.0.1');
    }).toThrow('Document not found');
  });

  it('should throw when requesting signatures on non-draft document', () => {
    const doc = docEngine.createDocument(T1, 'Contract', 'Content');
    docEngine.requestSignatures(T1, doc.id);

    expect(() => {
      docEngine.requestSignatures(T1, doc.id);
    }).toThrow('Document must be in draft status to request signatures');
  });

  it('should throw when trying to sign an already-signed document', () => {
    const doc = docEngine.createDocument(T1, 'Contract', 'Content');
    docEngine.requestSignatures(T1, doc.id);
    docEngine.signDocument(T1, doc.id, 'user_1', '10.0.0.1');

    expect(() => {
      docEngine.signDocument(T1, doc.id, 'user_2', '10.0.0.2');
    }).toThrow('Document is not pending signature');
  });

  it('should assign unique IDs to each document', () => {
    const d1 = docEngine.createDocument(T1, 'Doc A', 'Content A');
    const d2 = docEngine.createDocument(T1, 'Doc B', 'Content B');
    expect(d1.id).not.toBe(d2.id);
  });

  // ─── Cross-Tenant Isolation ───────────────────────────────────────────────

  it('cross-tenant: tenant_B cannot request signatures on tenant_A document', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Content');

    expect(() => {
      docEngine.requestSignatures(T2, doc.id);
    }).toThrow('Document not found');
  });

  it('cross-tenant: tenant_B cannot sign a tenant_A document', () => {
    const doc = docEngine.createDocument(T1, 'Lease Agreement', 'Content');
    docEngine.requestSignatures(T1, doc.id);

    expect(() => {
      docEngine.signDocument(T2, doc.id, 'user_1', '10.0.0.1');
    }).toThrow('Document not found');
  });
});
