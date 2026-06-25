import { z } from "zod";

// Per-user UI preferences (D1 `user_preferences`, persisted server-side + cached in localStorage so
// a user's chosen layout follows them across devices and sessions). See web-app.md.

/** How the file canvas lays out folders + files. */
export const FileView = z.enum(["grid", "list", "tree"]);
export type FileView = z.infer<typeof FileView>;

/** Icon-grid tile size, like macOS Finder's icon-size control. Applies to the grid view. */
export const GridSize = z.enum(["small", "large"]);
export type GridSize = z.infer<typeof GridSize>;

export const UserPreferences = z.object({
  fileView: FileView.default("list"),
  gridSize: GridSize.default("large"),
});
export type UserPreferences = z.infer<typeof UserPreferences>;

/** Persist the full preferences object (web `savePreferences` server fn). */
export const SavePreferencesInput = z.object({
  fileView: FileView,
  gridSize: GridSize,
});
export type SavePreferencesInput = z.infer<typeof SavePreferencesInput>;
