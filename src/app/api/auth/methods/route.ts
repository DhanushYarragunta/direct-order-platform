import { api } from "@/lib/http";
import { communicationCapabilities } from "@/lib/communications";
export async function GET() { return api(async () => communicationCapabilities()); }
