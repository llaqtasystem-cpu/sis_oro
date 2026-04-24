export type MaterialType = 'pieza' | 'barra';
export type MaterialStatus = 'disponible' | 'fundido' | 'exportado' | 'eliminado';

export type UserRole = 'superadmin' | 'admin' | 'operator';

export interface User {
  id?: string;
  name: string;
  username: string;
  email?: string;
  pin: string;
  role: UserRole;
  branchId?: string;
  createdAt: string;
  anonymousUid?: string;
}

export interface Branch {
  id: string;
  name: string;
  abbreviation: string;
  location: string;
  phone: string;
  managerId?: string;
  createdAt: string;
}

export interface SourceMaterialInfo {
  receiptNumber: string;
  client: string;
  finalWeight: number;
  total: number;
  registrationDate: string;
  purity: number;
  marketPrice: number;
  type?: MaterialType;
  sourceMaterials?: SourceMaterialInfo[];
}

export interface Material {
  id?: string;
  receiptNumber: string;
  client: string;
  initialWeight: number;
  finalWeight: number;
  marketPrice: number;
  loss: number;
  lossPercentage?: number;
  purity: number;
  usdToBs: number;
  pricePerGram: number;
  registrationDate: string;
  total: number;
  type: MaterialType;
  status: MaterialStatus;
  createdBy: string;
  sourceMaterials?: SourceMaterialInfo[];
}

export interface SmeltingOperation {
  id?: string;
  sourceMaterialIds: string[];
  resultMaterialId: string;
  date: string;
  totalInitialWeight: number;
  totalFinalWeight: number;
  marketPrice: number;
  loss: number;
  purity: number;
  usdToBs: number;
  pricePerGram: number;
  total: number;
  createdBy: string;
}

export interface ExportOperation {
  id?: string;
  sourceMaterialIds: string[];
  date: string;
  totalWeight: number;
  marketPrice: number;
  pricePerGram: number;
  salePrice: number;
  createdBy: string;
  client: string; // Destination or buyer
  receiptNumber: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
}

export interface CompanySettings {
  id?: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoUrl: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  ci: string;
  workplace: string;
  isMineCooperative: boolean;
  recommendedBy?: string;
  referentialPhone?: string;
  branchId: string;
  branchName?: string;
  registeredBy?: string;
  createdAt: string;
}

export interface Referrer {
  id: string;
  name: string;
  phone1: string;
  phone2?: string;
  ci: string;
  branchId: string;
  createdAt: string;
  totalCommissionsEarned?: number;
  totalCommissionsPaid?: number;
}

export interface ReferrerPayout {
  id: string;
  referrerId: string;
  referrerName: string;
  purchaseIds: string[];
  purchaseReceipts: string[];
  totalAmount: number;
  paidAt: string;
  paidBy: string;
  branchId: string;
  notes?: string;
}

export interface GoldPurchaseItem {
  id: string;
  purchaseId: string;
  initialWeight: number;
  finalWeight: number;
  marketPrice: number;
  purity: number;
  pricePerGram: number;
  total: number;
  usdToBs: number;
  loss: number;
  lossPercentage?: number;
  type?: MaterialType;
  createdBy?: string;
  closeMarketPrice?: number;
  closeUsdToBs?: number;
  closePricePerGram?: number;
  closeTotal?: number;
  otherWeight?: number;
  otherPurity?: number;
}

export interface GoldPurchase {
  id: string;
  receiptNumber: string;
  branchId: string;
  clientId: string;
  total: number;
  type: 'abierto' | 'cerrado';
  createdBy: string;
  createdAt: string;
  date?: string;
  items?: GoldPurchaseItem[];
  referrerName?: string;
  commission?: number;
  commissionPaid?: boolean;
  commissionPaidAt?: string;
  commissionPaidBy?: string;
  advancePayment?: number;
  closedAt?: string;
  closedBy?: string;
  closeMarketPrice?: number;
  closeUsdToBs?: number;
  closeTotal?: number;
}
