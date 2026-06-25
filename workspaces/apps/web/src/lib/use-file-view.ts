import type { FileView, GridSize, UserPreferences } from "@byos3/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getPreferences, savePreferences } from "#/fn/preferences";

// File-layout preference, cached in localStorage for an instant, flicker-free first paint and
// persisted server-side (D1 `user_preferences`) so it follows the user across devices. See
// web-app.md / routing.md. Flow: render from localStorage immediately -> hydrate from the server
// query -> on change, update localStorage + state instantly and persist in the background.

const LS_KEY = "byos3:file-view";
const DEFAULTS: UserPreferences = { fileView: "list", gridSize: "large" };

function readLs(): UserPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      fileView: parsed.fileView ?? DEFAULTS.fileView,
      gridSize: parsed.gridSize ?? DEFAULTS.gridSize,
    };
  } catch {
    return DEFAULTS;
  }
}

function writeLs(prefs: UserPreferences): void {
  if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
}

export interface FileViewControls {
  fileView: FileView;
  gridSize: GridSize;
  setFileView: (v: FileView) => void;
  setGridSize: (s: GridSize) => void;
}

export function useFileView(): FileViewControls {
  // Start from the stable default so SSR and the first client render agree, then immediately adopt
  // the localStorage value in an effect (the file list shows a loading skeleton meanwhile).
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const qc = useQueryClient();

  const server = useQuery({
    queryKey: ["preferences"],
    queryFn: () => getPreferences(),
    staleTime: 5 * 60_000,
  });

  // Adopt localStorage on mount, then the server value once it loads (server wins across devices).
  useEffect(() => {
    setPrefs(readLs());
  }, []);
  useEffect(() => {
    if (server.data) {
      setPrefs(server.data);
      writeLs(server.data);
    }
  }, [server.data]);

  const save = useMutation({
    mutationFn: (next: UserPreferences) => savePreferences({ data: next }),
    onSuccess: (data) => qc.setQueryData(["preferences"], data),
  });

  const apply = (next: UserPreferences) => {
    setPrefs(next); // instant
    writeLs(next); // local cache
    save.mutate(next); // persist across devices
  };

  return {
    fileView: prefs.fileView,
    gridSize: prefs.gridSize,
    setFileView: (v) => apply({ ...prefs, fileView: v }),
    setGridSize: (s) => apply({ ...prefs, gridSize: s }),
  };
}
