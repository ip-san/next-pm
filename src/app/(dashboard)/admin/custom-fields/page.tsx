import { notFound } from "next/navigation";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { deleteCustomFieldAction, reorderCustomFieldAction } from "@/interface/actions/admin-custom-field-actions";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { AdminRowControls } from "../admin-row-controls";
import { CustomFieldForm } from "./custom-field-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<string, string> = {
  string: "文字列",
  text: "テキスト",
  int: "整数",
  float: "浮動小数点",
  date: "日付",
  bool: "真偽値",
  list: "リスト",
};

const CUSTOMIZED_TYPE_LABEL: Record<string, string> = {
  Issue: "チケット",
  Project: "プロジェクト",
};

export default async function CustomFieldsPage() {
  const user = await currentUserFromCookies();
  if (!user?.isAdmin) {
    notFound();
  }

  const [fields, trackers] = await Promise.all([
    new DrizzleCustomFieldRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">カスタムフィールド</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {fields.map((field) => (
          <li key={field.id} className="border rounded p-3">
            <p className="font-medium">
              {field.name}{" "}
              <span className="text-xs text-gray-500">
                ({CUSTOMIZED_TYPE_LABEL[field.customizedType]} / {FORMAT_LABEL[field.fieldFormat]})
              </span>
              {field.isRequired ? <span className="text-xs text-red-600"> 必須</span> : null}
            </p>
            {field.customizedType === "Issue" ? (
              <p className="text-xs text-gray-500">
                トラッカー: {field.trackerIds.map((id) => trackerById.get(id)?.name ?? "?").join(", ") || "(なし)"}
              </p>
            ) : null}
            {field.fieldFormat === "list" ? (
              <p className="text-xs text-gray-500">選択肢: {field.possibleValues.join(", ")}</p>
            ) : null}
            <div className="mt-2">
              <AdminRowControls
                id={field.id}
                idField="customFieldId"
                editHref={`/admin/custom-fields/${field.id}`}
                reorderAction={reorderCustomFieldAction}
                deleteAction={deleteCustomFieldAction}
                deleteConfirm={`カスタムフィールド「${field.name}」と入力済みの値をすべて削除しますか?`}
              />
            </div>
          </li>
        ))}
        {fields.length === 0 ? <li className="text-gray-400">登録されていません。</li> : null}
      </ul>
      <CustomFieldForm trackers={trackers} />
    </main>
  );
}
