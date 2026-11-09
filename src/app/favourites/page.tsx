import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { MenuScreen } from "@/components/menu-screen";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/favourites");
  if (user.role !== "CUSTOMER") redirect("/profile");
  return <MenuScreen favoritesOnly />;
}
