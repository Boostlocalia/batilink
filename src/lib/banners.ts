// Banner photos live in the public 'media' bucket so they don't weigh on the app bundle.
export type Banner = 'materials' | 'network' | 'delivery' | 'architect' | 'phone' | 'supplier' | 'site';

export function bannerUrl(name: Banner): string {
  return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/banners/${name}.jpg`;
}
