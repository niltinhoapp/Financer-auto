import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = admin.firestore();

// Ao criar um contrato, gera automaticamente as parcelas na subcoleção
export const onContractCreated = onDocumentCreated(
  "contracts/{contractId}",
  async (event) => {
    const contract = event.data?.data();
    if (!contract) return;

    const { contractId } = event.params;
    const {
      financedAmount,
      installmentsCount,
      installmentValue,
      firstDueDate,
      interestRate,
      penaltyRate,
      dailyInterestRate,
    } = contract;

    const batch = db.batch();
    const firstDate = new Date(firstDueDate);

    for (let i = 0; i < installmentsCount; i++) {
      const dueDate = new Date(firstDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      const ref = db
        .collection("contracts")
        .doc(contractId)
        .collection("installments")
        .doc();

      batch.set(ref, {
        contractId,
        number: i + 1,
        dueDate: dueDate.toISOString().split("T")[0],
        value: installmentValue,
        status: "pending",
        updatedAt: new Date().toISOString(),
      });
    }

    await batch.commit();

    // Atualizar status do veículo para "sold"
    await db.collection("vehicles").doc(contract.vehicleId).update({
      status: "sold",
      updatedAt: new Date().toISOString(),
    });
  }
);

// Verificar parcelas vencidas diariamente e marcar como overdue
export const checkOverdueInstallments = onSchedule(
  "every 24 hours",
  async () => {
    const today = new Date().toISOString().split("T")[0];

    const snapshot = await db
      .collectionGroup("installments")
      .where("status", "==", "pending")
      .where("dueDate", "<", today)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "overdue",
        updatedAt: new Date().toISOString(),
      });
    });

    await batch.commit();
    console.log(`Marked ${snapshot.size} installments as overdue`);
  }
);

// Registrar pagamento e atualizar parcela
export const registerPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Não autenticado");
  }

  const { contractId, installmentId, amount, method, notes } = request.data;

  const installmentRef = db
    .collection("contracts")
    .doc(contractId)
    .collection("installments")
    .doc(installmentId);

  const installmentSnap = await installmentRef.get();
  if (!installmentSnap.exists) {
    throw new HttpsError("not-found", "Parcela não encontrada");
  }

  const now = new Date().toISOString();

  // Registrar pagamento
  const paymentRef = db.collection("payments").doc();
  await paymentRef.set({
    contractId,
    installmentId,
    customerId: installmentSnap.data()?.customerId,
    amount,
    method,
    paidAt: now,
    registeredBy: request.auth.uid,
    notes: notes ?? "",
  });

  // Atualizar parcela
  await installmentRef.update({
    status: "paid",
    paidAt: now,
    paidAmount: amount,
    paymentMethod: method,
    updatedAt: now,
  });

  // Verificar se contrato está quitado
  const allInstallments = await db
    .collection("contracts")
    .doc(contractId)
    .collection("installments")
    .get();

  const allPaid = allInstallments.docs.every(
    (d) => d.data().status === "paid" || d.id === installmentId
  );

  if (allPaid) {
    await db.collection("contracts").doc(contractId).update({
      status: "settled",
      updatedAt: now,
    });
  }

  return { success: true, paymentId: paymentRef.id };
});
