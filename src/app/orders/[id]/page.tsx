import { OrderScreen } from "@/components/order-screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OrderScreen id={(await params).id} />;
}
