import { View, Text, FlatList, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { checklistInstanceApi, type ChecklistInstance } from "../../lib/api/checklistInstances";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  instanceProgressStatus,
  isInstanceOverdue,
  formatDateShort,
  formatDeadlineTime,
} from "../../lib/checklist/display";

const STATUS_STYLE: Record<string, string> = {
  TODO: "bg-surface-hover text-text-muted",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
};

const ChecklistCard = ({ instance }: { instance: ChecklistInstance }) => {
  const router = useRouter();
  const done = instance.items.filter((i) => i.isDone).length;
  const total = instance.items.length;
  const isComplete = total > 0 && done === total;
  const overdue = isInstanceOverdue(instance, isComplete);
  const status = overdue ? "OVERDUE" : instanceProgressStatus(done, total);
  const deadline = formatDeadlineTime(instance);

  return (
    <Pressable
      onPress={() => router.push(`/checklists/${instance.id}`)}
      className="border border-border rounded-2xl p-4 mb-3 bg-surface active:bg-surface-hover"
    >
      <View className="flex-row items-start justify-between mb-2">
        <Text className="text-base font-semibold text-text flex-1 pr-2" numberOfLines={2}>
          {instance.title}
        </Text>
        <View className={`rounded-full px-2.5 py-1 ${STATUS_STYLE[status]}`}>
          <Text className="text-xs font-medium">{STATUS_LABEL[status]}</Text>
        </View>
      </View>

      <Text className="text-sm text-text-muted mb-3">
        {formatDateShort(instance.periodStart)} – {formatDateShort(instance.periodEnd)}
        {deadline ? ` · due ${deadline}` : ""}
      </Text>

      <View className="h-2 rounded-full bg-surface-hover overflow-hidden">
        <View
          className={`h-full rounded-full ${isComplete ? "bg-emerald-500" : overdue ? "bg-red-500" : "bg-primary-500"}`}
          style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
        />
      </View>
      <Text className="text-xs text-text-muted mt-1.5">
        {done} of {total} items done
      </Text>
    </Pressable>
  );
};

export default function MyChecklists() {
  const { user, logout } = useAuth();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["checklist-instances", "mine"],
    queryFn: () => checklistInstanceApi.getMine(),
  });

  const instances = data?.data ?? [];

  return (
    <View className="flex-1 bg-surface pt-16 px-4">
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold text-text">My Checklists</Text>
          {user?.firstName && <Text className="text-sm text-text-muted">Hi, {user.firstName}</Text>}
        </View>
        <Pressable onPress={logout} className="px-3 py-2">
          <Text className="text-sm text-primary-700 font-medium">Sign out</Text>
        </Pressable>
      </View>

      {error && (
        <Text className="text-sm text-red-600 mb-3">
          Couldn't load your checklists — pull down to try again.
        </Text>
      )}

      <FlatList
        data={instances}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChecklistCard instance={item} />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-24">
              <Text className="text-base text-text-muted">Nothing assigned to you right now.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
