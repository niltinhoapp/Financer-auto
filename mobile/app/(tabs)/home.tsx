import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<Record<string, unknown> | null>(null);
  const [vehicle, setVehicle] = useState<Record<string, unknown> | null>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const q = query(
        collection(db, "contracts"),
        where("customerId", "==", user.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as Record<string, unknown>;
        setContract(c);
        const vSnap = await getDoc(doc(db, "vehicles", c.vehicleId as string));
        if (vSnap.exists()) setVehicle({ id: vSnap.id, ...vSnap.data() });
        const instSnap = await getDocs(
          collection(db, "contracts", c.id as string, "installments")
        );
        const paid = instSnap.docs.filter((d) => d.data().status === "paid").length;
        setPaidCount(paid);
        setTotalCount(instSnap.size);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {vehicle && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Veículo</Text>
          <Text style={styles.cardTitle}>
            {vehicle.brand as string} {vehicle.model as string}
          </Text>
          <Text style={styles.cardSub}>
            {vehicle.plate as string} · {vehicle.year as string}
          </Text>
        </View>
      )}

      {contract && (
        <>
          <View style={styles.row}>
            <View style={[styles.kpi, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.kpiValue, { color: "#1D4ED8" }]}>
                {formatCurrency(contract.installmentValue as number)}
              </Text>
              <Text style={styles.kpiLabel}>Parcela Mensal</Text>
            </View>
            <View style={[styles.kpi, { backgroundColor: "#F0FDF4" }]}>
              <Text style={[styles.kpiValue, { color: "#15803D" }]}>
                {paidCount}/{totalCount}
              </Text>
              <Text style={styles.kpiLabel}>Parcelas Pagas</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Financiamento</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Valor financiado</Text>
              <Text style={styles.infoVal}>
                {formatCurrency(contract.financedAmount as number)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Entrada</Text>
              <Text style={styles.infoVal}>
                {formatCurrency(contract.downPayment as number)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Taxa de juros</Text>
              <Text style={styles.infoVal}>{contract.interestRate as number}% a.m.</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>1º vencimento</Text>
              <Text style={styles.infoVal}>{contract.firstDueDate as string}</Text>
            </View>
          </View>
        </>
      )}

      {!contract && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nenhum contrato encontrado.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={() => signOut(auth)}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  cardSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  row: { flexDirection: "row", gap: 12, marginBottom: 14 },
  kpi: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center" },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiLabel: { fontSize: 11, color: "#6B7280", marginTop: 4 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  infoKey: { fontSize: 13, color: "#6B7280" },
  infoVal: { fontSize: 13, fontWeight: "600", color: "#111827" },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { color: "#9CA3AF", fontSize: 14 },
  logoutBtn: { marginTop: 24, alignItems: "center" },
  logoutText: { color: "#EF4444", fontSize: 13 },
});
