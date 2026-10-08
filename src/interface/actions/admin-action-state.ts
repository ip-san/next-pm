/** Result shape every admin Server Action returns to `useActionState`. */
export type AdminActionState = {
  error: string | null;
};

/** The four reorder controls an admin list offers, as they arrive in a FormData field. */
export const positionMoveValues = ["highest", "higher", "lower", "lowest"] as const;
