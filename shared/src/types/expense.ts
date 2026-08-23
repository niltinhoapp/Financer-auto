export type ExpenseCategory =
  | "manutencao_veiculo"
  | "combustivel"
  | "aluguel"
  | "salarios"
  | "marketing"
  | "documentacao"
  | "impostos"
  | "compra_veiculo"
  | "outros";

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  vehicleId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}
