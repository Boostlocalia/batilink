// Photos and the assistant's picture live in the public 'media' bucket so they don't weigh on the app bundle.
export type Banner = 'materials' | 'network' | 'delivery' | 'architect' | 'phone' | 'supplier' | 'site';

export function mediaUrl(path: string): string {
  return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}

export function bannerUrl(name: Banner): string {
  return mediaUrl(`banners/${name}.jpg`);
}
