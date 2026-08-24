import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

const statusConfig = {
  pending: { label: "Pendente", bg: "#FEF3C7", text: "#92400E" },
  paid: { label: "Pago", bg: "#D1FAE5", text: "#065F46" },
  overdue: { label: "Atrasado", bg: "#FEE2E2", text: "#991B1B" },
  renegotiated: { label: "Renegociado", bg: "#F3F4F6", text: "#6B7280" },
};

export default function ParcelasScreen() {
  const [installments, setInstallments] = useState<Record<string, unknown>[]>([]);
  const [contract, setContract] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const q = query(collection(db, "contracts"), where("customerId", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as Record<string, unknown>;
        setContract(c);
        const instSnap = await getDocs(
          query(
            collection(db, "contracts", c.id as string, "installments"),
            orderBy("number", "asc")
          )
        );
        setInstallments(instSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const today = new Date().toISOString().split("T")[0];

  return (
    <View style={styles.container}>
      <FlatList
        data={installments}
        keyExtractor={(item) => item.id as string}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const status = (item.status as string) || "pending";
          const config =
            statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
          const dias =
            status !== "paid" ? daysBetween(item.dueDate as string, today) : 0;
          const penaltyRate = (contract?.penaltyRate as number) || 2;
          const dailyRate = (contract?.dailyInterestRate as number) || 0.1;
          const valor =
            dias > 0
              ? (item.value as number) +
                (item.value as number) * (penaltyRate / 100) +
                (item.value as number) * (dailyRate / 100) * dias
              : (item.value as number);

          return (
            <View style={styles.item}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemNum}>#{item.number as number}</Text>
                <Text style={styles.itemDate}>{item.dueDate as string}</Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemValue}>{formatCurrency(valor)}</Text>
                {dias > 0 && (
                  <Text style={styles.itemDelay}>{dias}d de atraso</Text>
                )}
                <View style={[styles.badge, { backgroundColor: config.bg }]}>
                  <Text style={[styles.badgeText, { color: config.text }]}>
                    {config.label}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma parcela encontrada.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 16 },
  item: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  itemLeft: {},
  itemNum: { fontSize: 15, fontWeight: "700", color: "#111827" },
  itemDate: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  itemRight: { alignItems: "flex-end" },
  itemValue: { fontSize: 15, fontWeight: "700", color: "#111827" },
  itemDelay: { fontSize: 11, color: "#EF4444", marginTop: 2 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#9CA3AF" },
});
