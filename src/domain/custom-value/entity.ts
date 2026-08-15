import type { CustomizedType } from "@/domain/custom-field/entity";

export interface CustomValue {
  id: string;
  customFieldId: string;
  /** Polymorphic target discriminator. */
  customizedType: CustomizedType;
  customizedId: string;
  value: string | null;
}
