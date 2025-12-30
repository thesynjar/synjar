export interface InstructionSet {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  publicUrl: string | null;
  documentCount: number;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstructionSetDetail extends InstructionSet {
  documents: InstructionSetDocument[];
  tokenEstimate: number;
  sizeStatus: 'ok' | 'warning' | 'near_limit' | 'exceeded';
}

export interface InstructionSetDocument {
  id: string;
  documentId: string;
  title: string;
  sizeBytes: number;
  order: number;
}

export interface InstructionSetListResponse {
  data: InstructionSet[];
  meta: {
    count: number;
    limit: number;
    remaining: number;
  };
}

export interface Document {
  id: string;
  title: string;
  contentType: 'TEXT' | 'FILE';
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
  processingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}
