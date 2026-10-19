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
