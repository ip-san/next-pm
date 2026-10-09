/**
 * Separates the values of a multiple-valued custom field when they travel as one string (a form field, a REST
 * value, a stored custom_values row set). A newline can't occur in a list entry, an enumeration name, or a user
 * or version id, so it never splits a value.
 */
export const CUSTOM_VALUE_SEPARATOR = "\n";
