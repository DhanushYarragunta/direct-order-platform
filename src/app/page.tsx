import { MenuScreen } from "@/components/menu-screen";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  if (!(await currentUser())) redirect("/login?next=/");
  return <MenuScreen />;
}
