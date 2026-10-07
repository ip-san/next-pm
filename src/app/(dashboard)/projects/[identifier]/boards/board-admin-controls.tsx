"use client";

import { useActionState, useState } from "react";
import {
  deleteBoardAction,
  reorderBoardAction,
  updateBoardAction,
  type BoardActionState,
} from "@/interface/actions/board-actions";
import type { BoardOption } from "./board-create-form";

const initialState: BoardActionState = { error: null };

function MoveButton({
  projectIdentifier,
  boardId,
  position,
  label,
}: {
  projectIdentifier: string;
  boardId: string;
  position: number;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(reorderBoardAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <input type="hidden" name="position" value={position} />
      <button type="submit" disabled={pending} className="text-xs underline disabled:opacity-50">
        {label}
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

function DeleteButton({ projectIdentifier, boardId }: { projectIdentifier: string; boardId: string }) {
  const [state, formAction, pending] = useActionState(deleteBoardAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
      <input type="hidden" name="boardId" value={boardId} />
      <button type="submit" disabled={pending} className="text-xs underline text-red-600 disabled:opacity-50">
        削除
      </button>
      {state.error ? <span className="text-xs text-red-600 ml-1">{state.error}</span> : null}
    </form>
  );
}

/**
 * The manage_boards row controls from Redmine's project settings "boards" tab: reorder handle,
 * edit and delete. Deleting a board takes its topics with it and lifts its child boards to the
 * project's top level, so the confirmation text says both.
 */
export function BoardAdminControls({
  projectIdentifier,
  board,
  parentOptions,
  canMoveUp,
  canMoveDown,
}: {
  projectIdentifier: string;
  board: { id: string; name: string; description: string; parentId: string | null; position: number };
  parentOptions: BoardOption[];
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateBoardAction, initialState);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {canMoveUp ? (
          <MoveButton projectIdentifier={projectIdentifier} boardId={board.id} position={board.position - 1} label="↑" />
        ) : null}
        {canMoveDown ? (
          <MoveButton projectIdentifier={projectIdentifier} boardId={board.id} position={board.position + 1} label="↓" />
        ) : null}
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs underline">
          編集
        </button>
        <DeleteButton projectIdentifier={projectIdentifier} boardId={board.id} />
      </div>

      {open ? (
        <form action={formAction} className="flex flex-col gap-2 max-w-md">
          <input type="hidden" name="projectIdentifier" value={projectIdentifier} />
          <input type="hidden" name="boardId" value={board.id} />
          <input name="name" defaultValue={board.name} maxLength={30} required className="border rounded px-3 py-2 text-sm" />
          <textarea name="description" defaultValue={board.description} maxLength={255} required className="border rounded px-3 py-2 text-sm" />
          <select name="parentId" defaultValue={board.parentId ?? ""} className="border rounded px-3 py-2 text-sm">
            <option value="">(親フォーラムなし)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {state.error ? <p role="alert" className="text-xs text-red-600">{state.error}</p> : null}
          <button type="submit" disabled={pending} className="bg-black text-white rounded px-3 py-1 text-sm self-start disabled:opacity-50">
            保存
          </button>
        </form>
      ) : null}
    </div>
  );
}
