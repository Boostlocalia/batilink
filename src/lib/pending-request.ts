import AsyncStorage from '@react-native-async-storage/async-storage';

// A request written before the company details exist, kept until the form is filled in.
const KEY = 'batilink.pending-request';

export type PendingRequest = {
  title: string;
  categoryId: number | null;
  postalCode: string;
  city: string;
  fulfilment: 'delivery' | 'pickup';
  items: { label: string; quantity: string; unit: string }[];
  note: string;
};

export async function keepPendingRequest(request: PendingRequest): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(request)).catch(() => undefined);
}

export async function takePendingRequest(): Promise<PendingRequest | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingRequest;
  } catch {
    return null;
  }
}

// The form being written, kept on this device so leaving the screen loses nothing.
const draftKey = (userId: string) => `batilink.request-draft.${userId}`;

export type FormDraft = PendingRequest & { step: 1 | 2 | 3 };

export async function keepFormDraft(userId: string, draft: FormDraft): Promise<void> {
  await AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft)).catch(() => undefined);
}

export async function readFormDraft(userId: string): Promise<FormDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    return raw ? (JSON.parse(raw) as FormDraft) : null;
  } catch {
    return null;
  }
}

export async function dropFormDraft(userId: string): Promise<void> {
  await AsyncStorage.removeItem(draftKey(userId)).catch(() => undefined);
}
