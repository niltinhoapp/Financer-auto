export type VehicleStatus = "available" | "reserved" | "sold" | "warranty";
export type VehicleType = "car" | "motorcycle" | "truck" | "utility";

export interface Vehicle {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  chassis: string;
  mileage: number;
  price: number;
  purchasePrice: number;
  status: VehicleStatus;
  photos: string[];
  features: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
