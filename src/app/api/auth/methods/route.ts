import { api } from "@/lib/http";
import { communicationCapabilities } from "@/lib/communications";
import { passwordResetCapabilities } from "@/lib/password-reset";
export async function GET() { return api(async () => ({ ...communicationCapabilities(), ...passwordResetCapabilities() })); }
