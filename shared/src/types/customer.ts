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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
