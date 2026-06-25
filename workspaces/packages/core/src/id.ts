import { customAlphabet } from "nanoid";

// Alphanumeric (no `-`/`_`/look-alike confusion with the prefix separator), URL-safe. 10 chars of a
// 62-symbol alphabet is ~5.8e17 combinations - ample for the volumes/connectors/nodes we mint.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 10;
const nano = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Mint a prefixed id for an entity byos3 controls (volume, connector, node, version, member, ...):
 * `createId("vol")` -> `vol_a1B2c3D4e5`. The random part is always 10 chars. Use this for every id
 * we generate ourselves so ids are short, sortable-by-prefix, and consistent. (Better Auth still
 * owns user/session/account ids.) See agents/docs/data-model.md.
 */
export function createId(prefix: string): string {
  return `${prefix}_${nano()}`;
}
