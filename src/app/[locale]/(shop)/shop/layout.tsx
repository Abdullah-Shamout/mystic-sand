import { setRequestLocale } from "next-intl/server";
import { ShopFrame } from "@/components/shop/shop-frame";

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

/** /shop and the collection pages share the banner and chips, which persist between them. */
export default async function CollectionsLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ShopFrame>{children}</ShopFrame>;
}
