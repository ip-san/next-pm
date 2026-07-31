export interface CustomValue {
  id: string;
  customFieldId: string;
  /** Polymorphic target discriminator — only "Issue" is written today (plan's CustomValue caveat). */
  customizedType: "Issue";
  customizedId: string;
  value: string | null;
}
