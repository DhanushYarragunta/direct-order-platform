import { PaymentScreen } from "@/components/order-screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PaymentScreen id={(await params).id} />;
}
