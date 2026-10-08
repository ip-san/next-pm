import { handleProjectStatusRequest } from "@/interface/http/project-status-request";

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  return handleProjectStatusRequest(request, identifier, "reopen");
}

/** Redmine routes these as `match ... :via => [:post, :put]`, so PUT is accepted too. */
export const PUT = POST;
