// v2
import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
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

  // Senha temporária legível para o admin entregar ao cliente
  // (ex.: "fin-7392-auto"). O cliente é obrigado a trocá-la no primeiro acesso.
  const tempPassword = `fin-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).slice(2, 6)}`;

  // Verifica se já existe Auth com esse email
  let uid: string;
  let isExistingAuth = false;
  try {
    const existing = await admin.auth().getUserByEmail(email);
    uid = existing.uid;
    isExistingAuth = true;
  } catch {
    const newUser = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
    uid = newUser.uid;
  }

  // Proteção: nunca sobrescrever um usuário existente com outro papel
  // (ex.: e-mail já pertence a um admin/vendedor).
  const existingDoc = await db.collection("users").doc(uid).get();
  const existingRole = existingDoc.data()?.role;
  if (existingDoc.exists && existingRole && existingRole !== "customer" && existingRole !== "prospect") {
    throw new HttpsError(
      "already-exists",
      `Este e-mail já pertence a um usuário com papel "${existingRole}". Use outro e-mail para o cliente.`
    );
  }

  // Conta já existia (ex.: prospect da loja): redefine para a senha temporária
  if (isExistingAuth) {
    await admin.auth().updateUser(uid, { password: tempPassword });
  }

  // Cria/atualiza documento em users/
  await db.collection("users").doc(uid).set({
    uid,
    role: "customer",
    name,
    email,
    active: true,
    customerId,
    mustChangePassword: true, // força troca no primeiro acesso
    createdAt: existingDoc.data()?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Vincula o uid ao documento do cliente
  await db.collection("customers").doc(customerId).update({
    authUid: uid,
    updatedAt: new Date().toISOString(),
  });

  // Link de redefinição como alternativa (caso prefira enviar por e-mail)
  const resetLink = await admin.auth().generatePasswordResetLink(email);

  await auditar(callerUid, "acesso_criado", `Gerou acesso para o cliente ${name} (${email})`, { tipo: "cliente", id: customerId });

  return { success: true, uid, tempPassword, resetLink };
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

// Excluir (ou desativar) vendedor — só admin
export const excluirVendedor = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Não autenticado");

  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Apenas administradores podem excluir vendedores");
  }

  const { uid } = request.data as { uid: string };
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid é obrigatório");
  }
  if (uid === callerUid) {
    throw new HttpsError("failed-precondition", "Você não pode excluir a si mesmo");
  }

  const targetDoc = await db.collection("users").doc(uid).get();
  const targetData = targetDoc.data();
  if (!targetDoc.exists || targetData?.role !== "seller") {
    throw new HttpsError("not-found", "Vendedor não encontrado");
  }

  // Verifica se existem contratos vinculados a este vendedor — se houver,
  // não apagamos (preservaria histórico/relatórios quebrados); apenas desativamos.
  const contratosSnap = await db.collection("contracts").where("sellerId", "==", uid).limit(1).get();

  if (!contratosSnap.empty) {
    await db.collection("users").doc(uid).update({
      active: false,
      updatedAt: new Date().toISOString(),
    });
    try {
      await admin.auth().updateUser(uid, { disabled: true });
    } catch {
      // se não existir mais no Auth, ignora
    }
    return { success: true, mode: "deactivated" as const };
  }

  // Sem contratos vinculados — pode remover por completo
  await db.collection("users").doc(uid).delete();
  try {
    await admin.auth().deleteUser(uid);
  } catch {
    // se não existir mais no Auth, ignora
  }
  return { success: true, mode: "deleted" as const };
});

// Assinatura eletrônica do contrato pelo próprio cliente
export const assinarContrato = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Não autenticado");

  const { contractId, signerName, signerCpf } = request.data as {
    contractId: string;
    signerName: string;
    signerCpf: string;
  };

  if (!contractId || !signerName || !signerCpf) {
    throw new HttpsError("invalid-argument", "contractId, signerName e signerCpf são obrigatórios");
  }

  const callerDoc = await db.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  if (callerData?.role !== "customer" || !callerData?.customerId) {
    throw new HttpsError("permission-denied", "Apenas o cliente vinculado ao contrato pode assiná-lo");
  }

  const contractRef = db.collection("contracts").doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) {
    throw new HttpsError("not-found", "Contrato não encontrado");
  }
  const contract = contractSnap.data();

  if (contract?.customerId !== callerData.customerId) {
    throw new HttpsError("permission-denied", "Este contrato não pertence a este cliente");
  }

  if (contract?.signature) {
    throw new HttpsError("already-exists", "Este contrato já foi assinado anteriormente");
  }

  // Confere se o nome/CPF informados batem com o cadastro do cliente —
  // garante que quem assina é de fato o titular dos dados (camada 1 de validação)
  const customerSnap = await db.collection("customers").doc(callerData.customerId).get();
  const customer = customerSnap.data();
  const normalizedCpf = (signerCpf || "").replace(/\D/g, "");
  if (!customer || customer.cpf !== normalizedCpf) {
    throw new HttpsError("failed-precondition", "O CPF informado não corresponde ao cadastro do cliente");
  }

  const signature = {
    signerUid: callerUid,
    signerName,
    signerCpf: normalizedCpf,
    signedAt: new Date().toISOString(),
    userAgent: request.rawRequest?.headers?.["user-agent"] ?? "",
    ip:
      (request.rawRequest?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      request.rawRequest?.ip ??
      "",
  };

  await contractRef.update({
    signature,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, signature };
});

// Registrar pagamento e atualizar parcela
export const registerPayment = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Não autenticado");
  }

  const { contractId, installmentId, amount, method, notes } = request.data as {
    contractId: string;
    installmentId: string;
    amount: number;
    method: string;
    notes?: string;
  };

  if (!contractId || !installmentId || !amount || !method) {
    throw new HttpsError(
      "invalid-argument",
      "contractId, installmentId, amount e method são obrigatórios"
    );
  }

  // Somente admin ou o vendedor dono do contrato podem registrar pagamentos
  const callerDoc = await db.collection("users").doc(callerUid).get();
  const callerRole = callerDoc.data()?.role;
  if (callerRole !== "admin" && callerRole !== "seller") {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores ou vendedores podem registrar pagamentos"
    );
  }

  const contractRef = db.collection("contracts").doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) {
    throw new HttpsError("not-found", "Contrato não encontrado");
  }
  const contract = contractSnap.data();

  if (callerRole === "seller" && contract?.sellerId !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "Você só pode registrar pagamentos de contratos dos quais é o vendedor"
    );
  }

  const installmentRef = contractRef.collection("installments").doc(installmentId);

  const installmentSnap = await installmentRef.get();
  if (!installmentSnap.exists) {
    throw new HttpsError("not-found", "Parcela não encontrada");
  }

  if (installmentSnap.data()?.status === "paid") {
    throw new HttpsError("already-exists", "Esta parcela já foi paga");
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
    registeredBy: callerUid,
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
  const allInstallments = await contractRef.collection("installments").get();

  const allPaid = allInstallments.docs.every(
    (d) => d.data().status === "paid" || d.id === installmentId
  );

  if (allPaid) {
    await contractRef.update({
      status: "settled",
      updatedAt: now,
    });
  }

  await auditar(
    callerUid,
    "pagamento_registrado",
    `Registrou pagamento de R$ ${amount} (${method}) na parcela ${installmentId}`,
    { tipo: "contrato", id: contractId }
  );

  return { success: true, paymentId: paymentRef.id };
});

// Upload de comprovante de pagamento (bypass CORS via Admin SDK)
export const uploadComprovante = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Não autenticado");

  const { base64, fileName, customerId } = request.data as {
    base64: string;
    fileName: string;
    customerId: string;
  };

  if (!base64 || !fileName || !customerId)
    throw new HttpsError("invalid-argument", "base64, fileName e customerId são obrigatórios");

  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  if (callerDoc.data()?.role !== "customer" || callerDoc.data()?.customerId !== customerId)
    throw new HttpsError("permission-denied", "Acesso negado");

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `paymentProofs/${customerId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const contentType = ext === "pdf" ? "application/pdf" : `image/${ext}`;
  await file.save(buffer, { metadata: { contentType } });
  // Arquivo PRIVADO (LGPD) — visualização via URL assinada gerada sob demanda
  const [signedUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 3600 * 1000 });
  return { url: signedUrl, path };
});

// Upload de foto de veículo (bypass CORS via Admin SDK)
export const uploadFotoVeiculo = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Não autenticado");

  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = callerDoc.data()?.role;
  if (role !== "admin" && role !== "seller")
    throw new HttpsError("permission-denied", "Apenas admin/vendedor pode fazer upload de fotos");

  const { base64, fileName, vehicleId } = request.data as {
    base64: string;
    fileName: string;
    vehicleId: string;
  };

  if (!base64 || !fileName || !vehicleId)
    throw new HttpsError("invalid-argument", "base64, fileName e vehicleId são obrigatórios");

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `vehiclePhotos/${vehicleId}/${Date.now()}_${safeName}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const contentType = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : `image/jpeg`;
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
  return { url, path };
});

// Upload genérico de documento do cliente (bypass CORS via Admin SDK)
export const uploadDocumento = onCall({ maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Não autenticado");

  const { base64, fileName, customerId, docTipo } = request.data as {
    base64: string;
    fileName: string;
    customerId: string;
    docTipo: string; // ex: "cpf", "rg", "residencia", "renda"
  };

  if (!base64 || !fileName || !customerId || !docTipo)
    throw new HttpsError("invalid-argument", "base64, fileName, customerId e docTipo são obrigatórios");

  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  const callerData = callerDoc.data();
  // Permite: o próprio cliente ou admin/seller
  const isOwner = callerData?.role === "customer" && callerData?.customerId === customerId;
  const isStaff = callerData?.role === "admin" || callerData?.role === "seller";
  if (!isOwner && !isStaff)
    throw new HttpsError("permission-denied", "Acesso negado");

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `customerDocs/${customerId}/${docTipo}_${Date.now()}_${safeName}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const contentType = ext === "pdf" ? "application/pdf" : `image/${ext}`;
  await file.save(buffer, { metadata: { contentType } });
  // Arquivo PRIVADO (LGPD) — visualização via URL assinada gerada sob demanda
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 3600 * 1000 });

  // Salva referência no Firestore
  await db.collection("customers").doc(customerId)
    .collection("documents").doc(docTipo).set({
      docTipo,
      fileName,
      url,
      path,
      uploadedAt: new Date().toISOString(),
      uploadedBy: request.auth.uid,
      status: "pending", // pending | approved | rejected
    }, { merge: true });

  return { url, path };
});

/* ═══════════════════════ EXCLUSÃO E LIMPEZA DE DADOS ═══════════════════════
   Operações destrutivas — somente admin. Usam o Admin SDK para limpar
   Firestore, Storage (fotos/documentos) e contas Auth de uma só vez.       */

async function assertAdmin(uid?: string): Promise<void> {
  if (!uid) throw new HttpsError("unauthenticated", "Não autenticado");
  const doc = await db.collection("users").doc(uid).get();
  if (doc.data()?.role !== "admin")
    throw new HttpsError("permission-denied", "Apenas administradores podem excluir dados");
}

async function auditar(uid: string | undefined, acao: string, descricao: string, alvo?: { tipo: string; id: string }) {
  try {
    const ator = uid ? (await db.collection("users").doc(uid).get()).data() : null;
    await db.collection("audit").add({
      acao, descricao,
      atorUid: uid ?? null,
      atorNome: ator?.name ?? "—",
      atorPapel: ator?.role ?? null,
      alvoTipo: alvo?.tipo ?? null,
      alvoId: alvo?.id ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) { console.error("auditar:", e); }
}

/** Apaga todos os arquivos do Storage sob um prefixo (ex.: vehiclePhotos/abc/). */
async function deleteStoragePrefix(prefix: string): Promise<void> {
  const bucket = admin.storage().bucket();
  await bucket.deleteFiles({ prefix, force: true });
}

/** Apaga uma subcoleção inteira em lotes. */
async function deleteSubcollection(parentPath: string, sub: string): Promise<void> {
  const snap = await db.collection(`${parentPath}/${sub}`).get();
  const docs = snap.docs;
  while (docs.length) {
    const batch = db.batch();
    docs.splice(0, 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Exclui um contrato e tudo que depende dele (parcelas, pagamentos, solicitações). */
async function deleteContractCascade(contractId: string): Promise<void> {
  await deleteSubcollection(`contracts/${contractId}`, "installments");
  for (const col of ["payments", "paymentRequests"]) {
    const snap = await db.collection(col).where("contractId", "==", contractId).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
  await deleteStoragePrefix(`contracts/${contractId}/`);
  await db.collection("contracts").doc(contractId).delete();
}

// Excluir um veículo (doc + fotos). Bloqueia se houver contrato vinculado.
export const excluirVeiculo = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);
  const { vehicleId } = request.data as { vehicleId: string };
  if (!vehicleId) throw new HttpsError("invalid-argument", "vehicleId é obrigatório");

  const contratos = await db.collection("contracts").where("vehicleId", "==", vehicleId).limit(1).get();
  if (!contratos.empty)
    throw new HttpsError("failed-precondition",
      "Este veículo está vinculado a um contrato. Exclua o contrato primeiro ou apenas mude o status do veículo.");

  const veic = (await db.collection("vehicles").doc(vehicleId).get()).data();
  await deleteStoragePrefix(`vehiclePhotos/${vehicleId}/`);
  await deleteStoragePrefix(`vehicles/${vehicleId}/`);
  await db.collection("vehicles").doc(vehicleId).delete();
  await auditar(request.auth?.uid, "veiculo_excluido",
    `Excluiu o veículo ${veic ? `${veic.brand} ${veic.model} (${veic.plate ?? "-"})` : vehicleId}`,
    { tipo: "veiculo", id: vehicleId });
  return { success: true };
});

// Excluir um cliente (doc + documentos + conta de acesso). Bloqueia se houver contrato.
export const excluirCliente = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);
  const { customerId } = request.data as { customerId: string };
  if (!customerId) throw new HttpsError("invalid-argument", "customerId é obrigatório");

  const contratos = await db.collection("contracts").where("customerId", "==", customerId).limit(1).get();
  if (!contratos.empty)
    throw new HttpsError("failed-precondition",
      "Este cliente possui contrato. Exclua o contrato primeiro ou use o bloqueio interno.");

  // Conta de acesso vinculada (Auth + users/)
  const custDoc = await db.collection("customers").doc(customerId).get();
  const authUid = custDoc.data()?.authUid as string | undefined;
  if (authUid) {
    await db.collection("users").doc(authUid).delete().catch(() => {});
    await admin.auth().deleteUser(authUid).catch(() => {});
  }

  await deleteSubcollection(`customers/${customerId}`, "documents");
  await deleteStoragePrefix(`customers/${customerId}/`);
  await deleteStoragePrefix(`customerDocs/${customerId}/`);
  // Leads vinculados a este cliente perdem o vínculo (mantém histórico)
  const nome = custDoc.data()?.name ?? customerId;
  await db.collection("customers").doc(customerId).delete();
  await auditar(request.auth?.uid, "cliente_excluido", `Excluiu o cliente ${nome}`, { tipo: "cliente", id: customerId });
  return { success: true };
});

// Excluir um contrato específico (cascata completa)
export const excluirContrato = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);
  const { contractId } = request.data as { contractId: string };
  if (!contractId) throw new HttpsError("invalid-argument", "contractId é obrigatório");
  await deleteContractCascade(contractId);
  await auditar(request.auth?.uid, "contrato_excluido", `Excluiu o contrato ${contractId}`, { tipo: "contrato", id: contractId });
  return { success: true };
});

// Limpeza em massa por categoria (Configurações → Zona de Perigo)
export const limparDados = onCall({ timeoutSeconds: 540 }, async (request) => {
  await assertAdmin(request.auth?.uid);
  const { alvo } = request.data as {
    alvo: "leads" | "veiculos" | "clientes" | "contratos" | "despesas";
  };

  let removidos = 0;

  if (alvo === "leads") {
    const snap = await db.collection("leads").get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
    removidos = snap.size;

  } else if (alvo === "despesas") {
    const snap = await db.collection("expenses").get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
    removidos = snap.size;

  } else if (alvo === "contratos") {
    const snap = await db.collection("contracts").get();
    for (const d of snap.docs) {
      await deleteContractCascade(d.id);
      removidos++;
    }

  } else if (alvo === "veiculos") {
    // Apenas veículos SEM contrato vinculado (segurança)
    const [vehSnap, contractsSnap] = await Promise.all([
      db.collection("vehicles").get(),
      db.collection("contracts").get(),
    ]);
    const vinculados = new Set(contractsSnap.docs.map((d) => d.data().vehicleId));
    for (const d of vehSnap.docs) {
      if (vinculados.has(d.id)) continue;
      await deleteStoragePrefix(`vehiclePhotos/${d.id}/`);
      await deleteStoragePrefix(`vehicles/${d.id}/`);
      await d.ref.delete();
      removidos++;
    }

  } else if (alvo === "clientes") {
    // Apenas clientes SEM contrato vinculado (segurança)
    const [custSnap, contractsSnap] = await Promise.all([
      db.collection("customers").get(),
      db.collection("contracts").get(),
    ]);
    const vinculados = new Set(contractsSnap.docs.map((d) => d.data().customerId));
    for (const d of custSnap.docs) {
      if (vinculados.has(d.id)) continue;
      const authUid = d.data().authUid as string | undefined;
      if (authUid) {
        await db.collection("users").doc(authUid).delete().catch(() => {});
        await admin.auth().deleteUser(authUid).catch(() => {});
      }
      await deleteSubcollection(`customers/${d.id}`, "documents");
      await deleteStoragePrefix(`customers/${d.id}/`);
      await deleteStoragePrefix(`customerDocs/${d.id}/`);
      await d.ref.delete();
      removidos++;
    }

  } else {
    throw new HttpsError("invalid-argument", "Alvo de limpeza inválido");
  }

  await auditar(request.auth?.uid, "limpeza_dados", `Limpeza em massa: ${alvo} (${removidos} removido(s))`);
  return { success: true, removidos };
});

/* ═══════════════════════ SEGURANÇA DE ARQUIVOS (LGPD) ═══════════════════════ */

// Gera URL assinada de curta duração para visualizar um arquivo privado.
// Permissões: admin/vendedor veem tudo; cliente vê apenas os próprios arquivos.
export const gerarUrlAssinada = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Não autenticado");

  const { path } = request.data as { path: string };
  if (!path || path.includes("..")) throw new HttpsError("invalid-argument", "path inválido");

  const caller = (await db.collection("users").doc(uid).get()).data();
  const role = caller?.role;

  if (role !== "admin" && role !== "seller") {
    // Cliente: só pode acessar arquivos das próprias pastas
    const cid = caller?.customerId;
    const permitido = cid && (
      path.startsWith(`customerDocs/${cid}/`) ||
      path.startsWith(`customers/${cid}/`) ||
      path.startsWith(`paymentProofs/${cid}/`)
    );
    if (!permitido) throw new HttpsError("permission-denied", "Acesso negado a este arquivo");
  }

  const file = admin.storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "Arquivo não encontrado");

  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 }); // 15 min
  return { url };
});

// Remove o acesso público de arquivos sensíveis já enviados (rodar uma vez).
export const privatizarArquivos = onCall({ timeoutSeconds: 540 }, async (request) => {
  await assertAdmin(request.auth?.uid);
  const bucket = admin.storage().bucket();
  let count = 0;
  for (const prefix of ["customerDocs/", "paymentProofs/", "customers/", "contracts/"]) {
    const [files] = await bucket.getFiles({ prefix });
    for (const f of files) {
      await f.acl.delete({ entity: "allUsers" }).catch(() => {});
      count++;
    }
  }
  return { success: true, arquivos: count };
});

/* ═══════════════════ AVISOS AUTOMÁTICOS DE VENCIMENTO ═══════════════════
   Regras de negócio:
   - Lembrete amigável: 3 dias ANTES do vencimento e NO DIA do vencimento.
   - Cobrança: somente a partir do dia SEGUINTE ao vencimento.
   Envio: automático via Evolution API (config/whatsapp) quando configurada;
   caso contrário, fica na fila `notifications` para envio manual no painel.  */

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function isoDate(offsetDays: number, base?: Date): string {
  const d = base ?? new Date();
  const dt = new Date(d.getTime() + offsetDays * 86400000);
  return dt.toISOString().split("T")[0];
}

export const enviarAvisosDiarios = onSchedule(
  { schedule: "every day 09:00", timeZone: "America/Sao_Paulo", timeoutSeconds: 540 },
  async () => {
    const hoje = isoDate(0);
    const em3dias = isoDate(3);
    const ontem = isoDate(-1);

    const [instSnap, contractsSnap, customersSnap, waSnap] = await Promise.all([
      db.collectionGroup("installments").where("status", "in", ["pending", "overdue"]).get(),
      db.collection("contracts").get(),
      db.collection("customers").get(),
      db.collection("config").doc("whatsapp").get(),
    ]);

    const contracts: Record<string, FirebaseFirestore.DocumentData> = {};
    contractsSnap.docs.forEach((d) => (contracts[d.id] = d.data()));
    const customers: Record<string, FirebaseFirestore.DocumentData> = {};
    customersSnap.docs.forEach((d) => (customers[d.id] = d.data()));

    const wa = waSnap.exists ? waSnap.data() : null;
    const waConfigurado = Boolean(wa?.apiUrl && wa?.apiKey && wa?.instance);

    let enviados = 0;
    let fila = 0;

    for (const doc of instSnap.docs) {
      const inst = doc.data();
      const contractId = doc.ref.parent.parent!.id;
      const contract = contracts[contractId];
      if (!contract || contract.status === "settled") continue;
      const customer = customers[contract.customerId];
      if (!customer?.phone) continue;

      let tipo: "lembrete3" | "lembreteHoje" | "cobranca" | null = null;
      if (inst.dueDate === em3dias) tipo = "lembrete3";
      else if (inst.dueDate === hoje) tipo = "lembreteHoje";
      else if (inst.dueDate <= ontem) tipo = "cobranca";
      if (!tipo) continue;

      // Cobrança: envia no dia seguinte ao vencimento e reforça a cada 7 dias
      if (tipo === "cobranca") {
        const diasAtraso = Math.floor((new Date(hoje).getTime() - new Date(inst.dueDate).getTime()) / 86400000);
        if (diasAtraso !== 1 && diasAtraso % 7 !== 0) continue;
      }

      // Idempotência: um aviso por parcela/tipo/dia
      const notifId = `${doc.id}_${tipo}_${hoje}`;
      const notifRef = db.collection("notifications").doc(notifId);
      if ((await notifRef.get()).exists) continue;

      const nome = (customer.name as string).split(" ")[0];
      const valor = inst.value as number;
      let mensagem: string;

      if (tipo === "lembrete3") {
        mensagem =
          `Olá, ${nome}! Tudo bem? 😊\n\n` +
          `Passando só para lembrar: a parcela #${inst.number} do seu veículo, no valor de ${fmtBRL(valor)}, ` +
          `vence em ${fmtData(inst.dueDate)} (daqui a 3 dias).\n\n` +
          `Qualquer dúvida, é só responder por aqui!`;
      } else if (tipo === "lembreteHoje") {
        mensagem =
          `Olá, ${nome}! 😊\n\n` +
          `Lembrete: a parcela #${inst.number}, no valor de ${fmtBRL(valor)}, vence HOJE (${fmtData(inst.dueDate)}).\n\n` +
          `Você pode pagar pela sua área do cliente ou direto conosco. Qualquer dúvida, estamos à disposição!`;
      } else {
        const diasAtraso = Math.floor((new Date(hoje).getTime() - new Date(inst.dueDate).getTime()) / 86400000);
        const multa = (contract.penaltyRate ?? 2) / 100 * valor;
        const juros = (contract.dailyInterestRate ?? 0.1) / 100 * valor * diasAtraso;
        const atualizado = valor + multa + juros;
        mensagem =
          `Olá, ${nome}. Tudo bem?\n\n` +
          `A parcela #${inst.number}, com vencimento em ${fmtData(inst.dueDate)}, está em aberto há ` +
          `${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}.\n\n` +
          `Valor atualizado: ${fmtBRL(atualizado)}\n\n` +
          `Para regularizar ou combinar o pagamento, é só responder por aqui. Obrigado!`;
      }

      const phone = (customer.phone as string).replace(/\D/g, "");
      const phoneFull = phone.startsWith("55") ? phone : `55${phone}`;

      let status = "manual"; // aguardando envio manual no painel
      if (waConfigurado) {
        try {
          const resp = await fetch(`${wa!.apiUrl}/message/sendText/${wa!.instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: wa!.apiKey },
            body: JSON.stringify({ number: phoneFull, text: mensagem }),
          });
          status = resp.ok ? "sent" : "error";
          if (resp.ok) enviados++;
        } catch {
          status = "error";
        }
      }
      if (status === "manual") fila++;

      await notifRef.set({
        tipo,
        date: hoje,
        contractId,
        installmentId: doc.id,
        installmentNumber: inst.number,
        dueDate: inst.dueDate,
        customerId: contract.customerId,
        customerName: customer.name,
        phone: phoneFull,
        mensagem,
        status, // sent | manual | error
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`Avisos: ${enviados} enviados automaticamente, ${fila} na fila manual`);
  }
);

/* ═══════════════ NOTIFICAÇÃO AO CLIENTE (pagamento confirmado/recusado) ═══════════════
   Chamada pelo painel após o admin confirmar ou recusar uma solicitação.
   Envia via Evolution API se configurada; senão enfileira em `notifications`
   para envio manual (aba Recebimentos → Avisos).                              */
export const notificarCliente = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Não autenticado");
  const caller = (await db.collection("users").doc(uid).get()).data();
  if (caller?.role !== "admin" && caller?.role !== "seller")
    throw new HttpsError("permission-denied", "Acesso negado");

  const { customerId, tipo, mensagem } = request.data as {
    customerId: string;
    tipo: string;       // "pagamento_confirmado" | "pagamento_recusado" | livre
    mensagem: string;
  };
  if (!customerId || !mensagem) throw new HttpsError("invalid-argument", "customerId e mensagem são obrigatórios");

  const customer = (await db.collection("customers").doc(customerId).get()).data();
  if (!customer?.phone) throw new HttpsError("failed-precondition", "Cliente sem telefone cadastrado");

  const phone = (customer.phone as string).replace(/\D/g, "");
  const phoneFull = phone.startsWith("55") ? phone : `55${phone}`;

  const waSnap = await db.collection("config").doc("whatsapp").get();
  const wa = waSnap.exists ? waSnap.data() : null;
  const waConfigurado = Boolean(wa?.apiUrl && wa?.apiKey && wa?.instance);

  let status = "manual";
  if (waConfigurado) {
    try {
      const resp = await fetch(`${wa!.apiUrl}/message/sendText/${wa!.instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: wa!.apiKey },
        body: JSON.stringify({ number: phoneFull, text: mensagem }),
      });
      status = resp.ok ? "sent" : "error";
    } catch {
      status = "error";
    }
  }

  // Registra a notificação (fila manual se não enviou automaticamente)
  await db.collection("notifications").add({
    tipo,
    date: new Date().toISOString().split("T")[0],
    customerId,
    customerName: customer.name,
    phone: phoneFull,
    mensagem,
    status,
    createdAt: new Date().toISOString(),
    createdBy: uid,
  });

  return { success: true, status, phone: phoneFull };
});

/* ═══════════════════ AGREGADOS DO DASHBOARD (performance) ═══════════════════
   Mantém um único doc `stats/resumo` com os números do negócio, recalculado
   quando há pagamento/contrato novo. O dashboard lê 1 doc em vez de varrer
   todas as parcelas — instantâneo e barato em escala.                        */

async function recomputeStats(): Promise<FirebaseFirestore.DocumentData> {
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7);

  const [contractsSnap, customersSnap, vehiclesSnap, paymentsSnap, instSnap, reqsSnap, leadsSnap] =
    await Promise.all([
      db.collection("contracts").get(),
      db.collection("customers").get(),
      db.collection("vehicles").get(),
      db.collection("payments").get(),
      db.collectionGroup("installments").get(),
      db.collection("paymentRequests").where("status", "==", "pending").get(),
      db.collection("leads").where("status", "==", "new").get(),
    ]);

  const contracts = contractsSnap.docs.map((d) => d.data());
  const vehicles = vehiclesSnap.docs.map((d) => d.data());
  const payments = paymentsSnap.docs.map((d) => d.data());
  const installments = instSnap.docs.map((d) => d.data());

  // Receitas = pagamentos + entradas em dinheiro (downPayment - trade-in)
  const receitas: { amount: number; ym: string }[] = [];
  for (const p of payments) {
    if ((p.amount ?? 0) > 0 && p.paidAt) receitas.push({ amount: p.amount, ym: String(p.paidAt).slice(0, 7) });
  }
  for (const c of contracts) {
    const entrada = (c.downPayment ?? 0) - (c.tradeIn?.valor ?? 0);
    if (entrada > 0 && c.createdAt) receitas.push({ amount: entrada, ym: String(c.createdAt).slice(0, 7) });
  }

  const aberto = installments.filter((i) => i.status !== "paid" && i.status !== "renegotiated");
  const overdue = aberto.filter((i) => i.dueDate < today);

  // Receita por mês (últimos 6)
  const last6: string[] = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    last6.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  const revenueByMonth: Record<string, number> = {};
  last6.forEach((m) => (revenueByMonth[m] = 0));
  for (const r of receitas) if (r.ym in revenueByMonth) revenueByMonth[r.ym] += r.amount;

  const countByStatus = (arr: any[], key: string, val: string) => arr.filter((x) => x[key] === val).length;

  const stats = {
    activeContracts: countByStatus(contracts, "status", "active"),
    totalContracts: contracts.length,
    totalReceivable: contracts.reduce((a, c) => a + (c.financedAmount || 0), 0),
    totalReceived: receitas.reduce((a, r) => a + r.amount, 0),
    openBalance: aberto.reduce((a, i) => a + (i.value || 0), 0),
    overdueInstallments: overdue.length,
    overdueValue: overdue.reduce((a, i) => a + (i.value || 0), 0),
    totalCustomers: customersSnap.size,
    availableVehicles: countByStatus(vehicles, "status", "available"),
    soldVehicles: countByStatus(vehicles, "status", "sold"),
    salesThisMonth: contracts.filter((c) => String(c.createdAt ?? "").slice(0, 7) === thisMonth).length,
    revenueThisMonth: receitas.filter((r) => r.ym === thisMonth).reduce((a, r) => a + r.amount, 0),
    pendingRequests: reqsSnap.size,
    newLeads: leadsSnap.size,
    revenueByMonth: last6.map((m) => ({ ym: m, value: revenueByMonth[m] })),
    contractsByStatus: {
      active: countByStatus(contracts, "status", "active"),
      settled: countByStatus(contracts, "status", "settled"),
      defaulted: countByStatus(contracts, "status", "defaulted"),
      renegotiated: countByStatus(contracts, "status", "renegotiated"),
    },
    vehiclesByStatus: {
      available: countByStatus(vehicles, "status", "available"),
      reserved: countByStatus(vehicles, "status", "reserved"),
      sold: countByStatus(vehicles, "status", "sold"),
      warranty: countByStatus(vehicles, "status", "warranty"),
    },
    updatedAt: new Date().toISOString(),
  };

  await db.collection("stats").doc("resumo").set(stats);
  return stats;
}

// Recalcula quando entra pagamento novo
export const onPaymentWriteStats = onDocumentCreated("payments/{id}", async () => {
  await recomputeStats().catch((e) => console.error("recomputeStats(payment):", e));
});

// Recalcula quando um contrato é criado/alterado/excluído
export const onContractWriteStats = onDocumentWritten("contracts/{id}", async () => {
  await recomputeStats().catch((e) => console.error("recomputeStats(contract):", e));
});

// Recálculo manual (botão no painel, se necessário)
export const recalcularStats = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);
  const stats = await recomputeStats();
  return { success: true, stats };
});
