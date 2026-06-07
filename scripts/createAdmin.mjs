// Script para criar o usuário admin no Firestore
// Uso: node scripts/createAdmin.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

// Lê as credenciais do service account
const serviceAccount = JSON.parse(readFileSync("./scripts/serviceAccount.json", "utf8"));

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const uid = "GYbC3eeKyXefAC0UAA3PP2TeZUW2";

await db.collection("users").doc(uid).set({
  uid,
  name: "Niltinho",
  email: "csinput@gmail.com",
  role: "admin",
  active: true,
  phone: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

console.log("✅ Usuário admin criado com sucesso! UID:", uid);
process.exit(0);
