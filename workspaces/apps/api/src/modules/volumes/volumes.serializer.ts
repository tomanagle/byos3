import type { VolumeSummary } from "@byos3/services";

export function serializeVolume(v: VolumeSummary) {
  return { id: v.id, label: v.label, bucket: v.bucket, prefix: v.prefix, provider: v.provider };
}
