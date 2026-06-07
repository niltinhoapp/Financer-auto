import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(d: string) {
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}

const methodLabel: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Cartão",
  transfer: "Transferência",
  check: "Cheque",
};

export default function HistoricoScreen() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const q = query(
        collection(db, "payments"),
        where("customerId", "==", user.uid),
        orderBy("paidAt", "desc")
      );
      const snap = await getDocs(q);
      setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    <View style={styles.container}>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id as string}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View>
              <Text style={styles.amount}>{formatCurrency(item.amount as number)}</Text>
              <Text style={styles.method}>
                {methodLabel[item.method as string] ?? item.method as string}
              </Text>
            </View>
            <Text style={styles.date}>{formatDate(item.paidAt as string)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum pagamento registrado ainda.</Text>
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
  amount: { fontSize: 16, fontWeight: "700", color: "#111827" },
  method: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  date: { fontSize: 13, color: "#6B7280" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#9CA3AF" },
});
