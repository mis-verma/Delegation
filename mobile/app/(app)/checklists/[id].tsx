import { useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Image, Alert, Modal } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { checklistInstanceApi, type ChecklistInstanceItem } from "../../../lib/api/checklistInstances";
import { formatDateShort, formatDeadlineTime } from "../../../lib/checklist/display";

// Item types the mobile fill-out flow can already drive end-to-end. Anything outside this list
// (GPS geofence, signature pad, QR scan, cash tally, per-auditor AUDIT sub-forms, video upload)
// still needs a native-specific UI and isn't built yet — those items render a plain
// "finish this on the web" notice instead of a broken control.
const SUPPORTED_TYPES = new Set(["STANDARD", "YES_NO", "PASS_FAIL", "TEXT_BOX", "NUMBER_ENTRY", "RATING"]);

const MAX_PHOTOS = 25;

const askForAnother = (count: number, max: number) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      `Photo added (${count} of ${max})`,
      "Take another?",
      [
        { text: "Done", style: "cancel", onPress: () => resolve(false) },
        { text: "Take another", onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });

const ReasonModal = ({
  title,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full rounded-2xl bg-surface p-4">
          <Text className="text-base font-semibold text-text">{title}</Text>
          <Text className="mt-1 text-sm text-text-muted">The reviewer sees your reason.</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus
            maxLength={1000}
            placeholder="Type the reason"
            placeholderTextColor="#94a3b8"
            className="mt-3 min-h-20 rounded-lg border border-border px-3 py-2 text-text"
          />
          <View className="mt-3 flex-row justify-end gap-2">
            <Pressable onPress={onCancel} disabled={busy} className="rounded-lg border border-border px-4 py-3">
              <Text className="text-text">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(reason.trim())}
              disabled={busy || !reason.trim()}
              className={`rounded-lg px-4 py-3 ${busy || !reason.trim() ? "bg-primary-700/50" : "bg-primary-700"}`}
            >
              <Text className="font-medium text-white">Save answer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const useInstance = (id: string) =>
  useQuery({
    queryKey: ["checklist-instance", id],
    queryFn: () => checklistInstanceApi.getOne(id),
  });

const ItemCard = ({ item, instanceId }: { item: ChecklistInstanceItem; instanceId: string }) => {
  const queryClient = useQueryClient();
  const [text, setText] = useState(item.textValue ?? "");
  const [number, setNumber] = useState(item.numericValue != null ? String(item.numericValue) : "");
  const [isUploading, setIsUploading] = useState(false);
  const [askingWhyNo, setAskingWhyNo] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["checklist-instance", instanceId] });

  const setDone = useMutation({
    mutationFn: (values: Parameters<typeof checklistInstanceApi.setItemDone>[2]) =>
      checklistInstanceApi.setItemDone(item.id, true, values),
    onSuccess: () => {
      setAskingWhyNo(false);
      invalidate();
    },
    onError: () => Alert.alert("Couldn't save", "Check your connection and try again."),
  });

  const maxPhotos = Math.min(item.maxImageCount ?? MAX_PHOTOS, MAX_PHOTOS);
  const photoRoom = Math.max(0, maxPhotos - item.images.length);
  const noAsksReason = (item.noActions ?? []).includes("ASK_REASON");

  const saveNo = (reason: string) =>
    setDone.mutate({ booleanAnswer: "NO", remarks: reason, ...(noAsksReason ? { conditionalReasonValue: reason } : {}) });

  const uploadAsset = (asset: ImagePicker.ImagePickerAsset, source: "camera" | "gallery") =>
    checklistInstanceApi.uploadImage(
      item.id,
      { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" },
      source === "camera" ? "LIVE" : "GALLERY",
    );

  const pickImage = async (source: "camera" | "gallery") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", `Allow ${source} access to attach a photo.`);
      return;
    }

    let taken = 0;
    let keepGoing = true;
    while (keepGoing && taken < photoRoom) {
      const room = photoRoom - taken;
      const result = await (source === "camera"
        ? ImagePicker.launchCameraAsync({ quality: 0.7 })
        : ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, selectionLimit: room }));
      if (result.canceled || result.assets.length === 0) break;

      setIsUploading(true);
      try {
        for (const asset of result.assets.slice(0, room)) {
          await uploadAsset(asset, source);
          taken += 1;
        }
        invalidate();
      } catch {
        Alert.alert("Upload failed", "Check your connection and try again.");
        break;
      } finally {
        setIsUploading(false);
      }

      keepGoing = source === "camera" && taken < photoRoom && (await askForAnother(item.images.length + taken, maxPhotos));
    }
  };

  const needsMorePhotos = item.requiredImageCount > item.images.length;

  return (
    <View className={`border rounded-2xl p-4 mb-3 bg-surface ${item.isDone ? "border-emerald-300" : "border-border"}`}>
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-base font-medium text-text flex-1 pr-2">{item.label}</Text>
        {item.isDone && <Text className="text-emerald-600 text-sm font-medium">Done</Text>}
      </View>
      {item.section && <Text className="text-xs text-text-muted mb-2">{item.section}</Text>}

      {item.images.length > 0 && (
        <ScrollView horizontal className="mb-3" showsHorizontalScrollIndicator={false}>
          {item.images.map((img) => (
            <Image key={img.id} source={{ uri: img.url }} className="w-20 h-20 rounded-lg mr-2 bg-surface-hover" />
          ))}
        </ScrollView>
      )}

      {!SUPPORTED_TYPES.has(item.itemType) && (
        <Text className="text-sm text-text-muted italic">
          This item type isn't supported in the app yet — finish it on the web.
        </Text>
      )}

      {item.itemType === "STANDARD" && (
        <View className="flex-row items-center gap-2 flex-wrap">
          <Pressable
            onPress={() => pickImage("camera")}
            disabled={isUploading || photoRoom === 0}
            className="border border-border rounded-lg px-3 py-2 mr-2 mb-2"
          >
            <Text className="text-sm text-text">📷 Camera</Text>
          </Pressable>
          <Pressable
            onPress={() => pickImage("gallery")}
            disabled={isUploading || photoRoom === 0}
            className="border border-border rounded-lg px-3 py-2 mr-2 mb-2"
          >
            <Text className="text-sm text-text">🖼 Gallery</Text>
          </Pressable>
          {isUploading && <ActivityIndicator size="small" />}
          <Text className="text-xs text-text-muted mb-2">{item.images.length} of {maxPhotos} photos</Text>
          {!needsMorePhotos && !item.isDone && (
            <Pressable
              onPress={() => setDone.mutate(undefined)}
              disabled={setDone.isPending}
              className="bg-primary-700 rounded-lg px-3 py-2 mb-2"
            >
              <Text className="text-sm text-white font-medium">Mark done</Text>
            </Pressable>
          )}
          {needsMorePhotos && (
            <Text className="text-xs text-amber-600 w-full">
              {item.requiredImageCount - item.images.length} more photo(s) needed
            </Text>
          )}
        </View>
      )}

      {(item.itemType === "YES_NO" || item.itemType === "PASS_FAIL") && (
        <View className="flex-row gap-2">
          {(item.itemType === "YES_NO" ? ["YES", "NO"] : ["YES", "NO"]).map((ans, idx) => {
            const label = item.itemType === "PASS_FAIL" ? (idx === 0 ? "Pass" : "Fail") : idx === 0 ? "Yes" : "No";
            const selected = item.booleanAnswer === ans;
            return (
              <Pressable
                key={ans}
                onPress={() => (ans === "NO" ? setAskingWhyNo(true) : setDone.mutate({ booleanAnswer: "YES" }))}
                disabled={setDone.isPending}
                className={`flex-1 rounded-lg py-2.5 items-center border ${selected ? "bg-primary-700 border-primary-700" : "border-border"}`}
              >
                <Text className={selected ? "text-white font-medium" : "text-text"}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {askingWhyNo && (
        <ReasonModal
          title={item.itemType === "PASS_FAIL" ? "Why did it fail?" : "Why is it No?"}
          busy={setDone.isPending}
          onCancel={() => setAskingWhyNo(false)}
          onSave={saveNo}
        />
      )}

      {item.itemType === "TEXT_BOX" && (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your answer"
            placeholderTextColor="#94a3b8"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-text mr-2"
          />
          <Pressable
            onPress={() => setDone.mutate({ textValue: text })}
            disabled={setDone.isPending || !text.trim()}
            className="bg-primary-700 rounded-lg px-3 py-2"
          >
            <Text className="text-white font-medium">Save</Text>
          </Pressable>
        </View>
      )}

      {item.itemType === "NUMBER_ENTRY" && (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={number}
            onChangeText={setNumber}
            keyboardType="numeric"
            placeholder={item.numberEntryUnit ?? "0"}
            placeholderTextColor="#94a3b8"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-text mr-2"
          />
          <Pressable
            onPress={() => setDone.mutate({ numericValue: Number(number) })}
            disabled={setDone.isPending || number.trim() === "" || Number.isNaN(Number(number))}
            className="bg-primary-700 rounded-lg px-3 py-2"
          >
            <Text className="text-white font-medium">Save</Text>
          </Pressable>
        </View>
      )}

      {item.itemType === "RATING" && item.ratingScale && (
        <View className="flex-row gap-2">
          {Array.from({ length: item.ratingScale }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              onPress={() => setDone.mutate({ numericValue: n })}
              disabled={setDone.isPending}
              className={`w-10 h-10 rounded-full items-center justify-center border ${item.numericValue === n ? "bg-primary-700 border-primary-700" : "border-border"}`}
            >
              <Text className={item.numericValue === n ? "text-white font-medium" : "text-text"}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

export default function ChecklistInstanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useInstance(id);
  const instance = data?.data;

  const done = instance?.items.filter((i) => i.isDone).length ?? 0;
  const total = instance?.items.length ?? 0;

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="pt-16 px-4 pb-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="mb-2">
          <Text className="text-primary-700 text-sm font-medium">← Back</Text>
        </Pressable>
        {instance && (
          <>
            <Text className="text-xl font-bold text-text" numberOfLines={2}>
              {instance.title}
            </Text>
            <Text className="text-sm text-text-muted mt-1">
              {formatDateShort(instance.periodStart)} – {formatDateShort(instance.periodEnd)}
              {formatDeadlineTime(instance) ? ` · due ${formatDeadlineTime(instance)}` : ""}
            </Text>
            <Text className="text-sm text-text-muted mt-0.5">{done} of {total} items done</Text>
          </>
        )}
      </View>

      {isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#213e6a" />
        </View>
      )}

      {error && (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-red-600 text-center">Couldn't load this checklist. Go back and try again.</Text>
        </View>
      )}

      {instance && (
        <ScrollView className="flex-1 px-4 pt-3" contentContainerStyle={{ paddingBottom: 32 }}>
          {[...instance.items]
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <ItemCard key={item.id} item={item} instanceId={instance.id} />
            ))}
        </ScrollView>
      )}
    </View>
  );
}
