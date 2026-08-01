import { handleProjectLifecycle } from "@/interface/http/project-lifecycle-api";

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  return handleProjectLifecycle(request, params, "archive");
}
