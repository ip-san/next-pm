"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { createDocument, InvalidDocumentError } from "@/application/documents/create-document";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type CreateDocumentActionState = {
  error: string | null;
};

const createDocumentSchema = z.object({
  projectIdentifier: z.string().min(1),
  categoryId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().default(""),
});

export async function createDocumentAction(_prevState: CreateDocumentActionState, formData: FormData): Promise<CreateDocumentActionState> {
  const parsed = createDocumentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    categoryId: formData.get("categoryId"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_documents", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  let created;
  try {
    created = await createDocument(
      { documentRepository: new DrizzleDocumentRepository() },
      { projectId: project.id, categoryId: parsed.data.categoryId, title: parsed.data.title, description: parsed.data.description },
    );
  } catch (error) {
    if (error instanceof InvalidDocumentError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/documents`);
  redirect(`/projects/${parsed.data.projectIdentifier}/documents/${created.id}`);
}

export type DeleteDocumentActionState = {
  error: string | null;
};

const deleteDocumentSchema = z.object({
  projectIdentifier: z.string().min(1),
  documentId: z.string().uuid(),
});

export async function deleteDocumentAction(_prevState: DeleteDocumentActionState, formData: FormData): Promise<DeleteDocumentActionState> {
  const parsed = deleteDocumentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const documentRepository = new DrizzleDocumentRepository();
  const document = await documentRepository.findById(parsed.data.documentId);
  if (!document || document.projectId !== project.id) {
    return { error: "ドキュメントが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "delete_documents", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await documentRepository.delete(document.id);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/documents`);
  redirect(`/projects/${parsed.data.projectIdentifier}/documents`);
}

export type UploadDocumentAttachmentActionState = {
  error: string | null;
};

const uploadDocumentAttachmentSchema = z.object({
  documentId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  file: z.instanceof(File),
});

export async function uploadDocumentAttachmentAction(
  _prevState: UploadDocumentAttachmentActionState,
  formData: FormData,
): Promise<UploadDocumentAttachmentActionState> {
  const parsed = uploadDocumentAttachmentSchema.safeParse({
    documentId: formData.get("documentId"),
    projectIdentifier: formData.get("projectIdentifier"),
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  if (parsed.data.file.size === 0) {
    return { error: "ファイルを選択してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const document = await new DrizzleDocumentRepository().findById(parsed.data.documentId);
  if (!document) {
    return { error: "ドキュメントが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(document.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_documents", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  const buffer = Buffer.from(await parsed.data.file.arrayBuffer());
  try {
    await uploadAttachment(
      { attachmentRepository: new DrizzleAttachmentRepository(), attachmentStorage: new FsAttachmentStore() },
      {
        containerType: "Document",
        containerId: document.id,
        authorId: user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        data: buffer,
      },
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/documents/${document.id}`);
  return { error: null };
}

export type DeleteDocumentAttachmentActionState = {
  error: string | null;
};

const deleteDocumentAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function deleteDocumentAttachmentAction(
  _prevState: DeleteDocumentAttachmentActionState,
  formData: FormData,
): Promise<DeleteDocumentAttachmentActionState> {
  const parsed = deleteDocumentAttachmentSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment || attachment.containerType !== "Document") {
    return { error: "添付ファイルが見つかりません。" };
  }

  const document = await new DrizzleDocumentRepository().findById(attachment.containerId);
  if (!document) {
    return { error: "ドキュメントが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(document.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "delete_documents", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/documents/${document.id}`);
  return { error: null };
}
