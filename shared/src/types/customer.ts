export interface CustomerAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zip: string;
}

export interface CustomerDocuments {
  cpfPhoto?: string;
  rgPhoto?: string;
  proofOfResidence?: string;
  incomeProof?: string;
}

export type CustomerApprovalStatus = "pending" | "approved" | "rejected";

export interface Customer {
  id: string;
  name: string;
  cpf: string;
  rg?: string;
  birthDate: string;
  phone: string;
  email?: string;
  address: CustomerAddress;
  documents: CustomerDocuments;
  approvalStatus: CustomerApprovalStatus;
  authUid?: string; // vínculo com users/{uid} quando o acesso é criado
  approvalNote?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
