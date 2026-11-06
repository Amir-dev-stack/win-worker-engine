import { createHash } from "node:crypto";

/**
 * Deterministic JSON serialization for reproducibility manifests.
 * Object keys are sorted; array order is preserved; unsupported and
 * non-finite values fail closed instead of receiving ambiguous encodings.
 */
export function canonicalizeWinMLProvenance(value: unknown): string {
  const active = new WeakSet<object>();
  const encode = (item: unknown): string => {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new Error("ml_provenance_non_finite_number");
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) {
      if (active.has(item)) throw new Error("ml_provenance_circular_reference");
      active.add(item);
      const ownKeys = Reflect.ownKeys(item);
      if (ownKeys.some(key => typeof key === "symbol" ||
          (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))) {
        throw new Error("ml_provenance_array_extra_properties");
      }
      const values: string[] = [];
      for (let index = 0; index < item.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(item, index)) {
          throw new Error("ml_provenance_sparse_array");
        }
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new Error("ml_provenance_array_accessors_unsupported");
        }
        values.push(encode(descriptor.value));
      }
      const result = "[" + values.join(",") + "]";
      active.delete(item);
      return result;
    }
    if (typeof item === "object") {
      const object = item as Record<string, unknown>;
      const prototype = Object.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("ml_provenance_plain_objects_only");
      }
      if (active.has(object)) throw new Error("ml_provenance_circular_reference");
      active.add(object);
      const ownKeys = Reflect.ownKeys(object);
      if (ownKeys.some(key => typeof key === "symbol")) {
        throw new Error("ml_provenance_symbol_key_unsupported");
      }
      const keys = (ownKeys as string[]).sort();
      const result = "{" + keys.map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !descriptor.enumerable) {
          throw new Error("ml_provenance_non_enumerable_property");
        }
        if (!("value" in descriptor)) throw new Error("ml_provenance_accessors_unsupported");
        if (descriptor.value === undefined) throw new Error("ml_provenance_undefined_value");
        return JSON.stringify(key) + ":" + encode(descriptor.value);
      }).join(",") + "}";
      active.delete(object);
      return result;
    }
    throw new Error("ml_provenance_unsupported_value");
  };
  return encode(value);
}

export function hashWinMLProvenance(value: unknown): {
  canonicalJson: string;
  sha256: string;
} {
  const canonicalJson = canonicalizeWinMLProvenance(value);
  const sha256 = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return { canonicalJson, sha256 };
}

export function hashWinMLTrainingConfig(config: Record<string, unknown>) {
  return hashWinMLProvenance(config);
}

export function hashWinMLSplitManifest(split: {
  trainingEventIds: string[];
  validationEventIds: string[];
  testEventIds: string[];
  trainingEndsAt: string;
  validationStartsAt: string;
  validationEndsAt: string;
  testStartsAt: string;
}) {
  return hashWinMLProvenance(split);
}

export function hashWinMLFeatureVector(features: Record<string, unknown>) {
  return hashWinMLProvenance(features);
}
