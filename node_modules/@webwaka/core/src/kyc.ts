export interface KycVerificationResult {
  verified: boolean;
  matchScore?: number;
  reason?: string;
  provider: string;
}

export interface IKycProvider {
  verifyBvn(
    bvnHash: string,
    firstName: string,
    lastName: string,
    dob: string
  ): Promise<KycVerificationResult>;

  verifyNin(
    ninHash: string,
    firstName: string,
    lastName: string
  ): Promise<KycVerificationResult>;

  verifyCac(rcNumber: string, businessName: string): Promise<KycVerificationResult>;
}
