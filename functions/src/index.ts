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
    const { installmentsCount, installmentValue, firstDueDate } = contract;

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

// Criar acesso do cliente (Auth + documento users/)
export const criarAcessoCliente = onCall(async (request) => {
  // Só admin pode criar acesso
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Não autenticado");

  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Apenas administradores podem criar acessos");
  }

  const { customerId, email, name } = request.data as {
    customerId: string;
    email: string;
    name: string;
  };

  if (!email || !customerId) {
    throw new HttpsError("invalid-argument", "customerId e email são obrigatórios");
  }

  // Verifica se já existe Auth com esse email
  let uid: string;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
  } catch {
    // Cria novo usuário com senha temporária aleatória
    const tempPassword = Math.random().toString(36).slice(-10) + "Aa1!";
    const newUser = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
    uid = newUser.uid;
  }

  // Proteção: nunca sobrescrever um usuário existente com outro papel
  // (ex.: e-mail já pertence a um admin/vendedor).
  const existingDoc = await db.collection("users").doc(uid).get();
  const existingRole = existingDoc.data()?.role;
  if (existingDoc.exists && existingRole && existingRole !== "customer") {
    throw new HttpsError(
      "already-exists",
      `Este e-mail já pertence a um usuário com papel "${existingRole}". Use outro e-mail para o cliente.`
    );
  }

  // Cria/atualiza documento em users/
  await db.collection("users").doc(uid).set({
    uid,
    role: "customer",
    name,
    email,
    active: true,
    customerId,
    createdAt: existingDoc.data()?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Vincula o uid ao documento do cliente
  await db.collection("customers").doc(customerId).update({
    authUid: uid,
    updatedAt: new Date().toISOString(),
  });

  // Envia e-mail de redefinição de senha (cliente cria a própria senha)
  const resetLink = await admin.auth().generatePasswordResetLink(email);
  console.log(`Reset link para ${email}: ${resetLink}`);
  // Em produção: enviar via SendGrid/Nodemailer. Por ora o link aparece no log.

  return { success: true, uid, resetLink };
});

// Criar vendedor (Auth + documento users/) — só admin
export const criarVendedor = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Não autenticado");

  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Apenas administradores podem criar vendedores");
  }

  const { name, email, phone, password } = request.data as {
    name: string;
    email: string;
    phone?: string;
    password: string;
  };

  if (!name || !email || !password) {
    throw new HttpsError("invalid-argument", "name, email e password são obrigatórios");
  }

  let uid: string;
  let isNewAuthUser = false;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
  } catch {
    const newUser = await admin.auth().createUser({ email, password, displayName: name });
    uid = newUser.uid;
    isNewAuthUser = true;
  }

  // Proteção: nunca sobrescrever um usuário existente com outro papel
  // (ex.: e-mail já usado por um admin ou cliente). Isso evitaria reaproveitar
  // a conta de outra pessoa — inclusive a do próprio admin que está cadastrando.
  const existingDoc = await db.collection("users").doc(uid).get();
  const existingRole = existingDoc.data()?.role;
  if (existingDoc.exists && existingRole && existingRole !== "seller") {
    throw new HttpsError(
      "already-exists",
      `Este e-mail já pertence a um usuário com papel "${existingRole}". Use outro e-mail para o vendedor.`
    );
  }

  // Só altera senha/nome no Auth depois de garantir que não vamos pisar em outro papel
  if (!isNewAuthUser) {
    await admin.auth().updateUser(uid, { password, displayName: name });
  }

  await db.collection("users").doc(uid).set({
    uid,
    role: "seller",
    name,
    email,
    phone: phone ?? "",
    active: true,
    createdAt: existingDoc.data()?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  return { success: true, uid };
});

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
