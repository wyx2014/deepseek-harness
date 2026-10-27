// Vendored from the reference product's @tpcowork/model-option-map (packages/model-option-map/src/option-maps.ts); keep in sync.
import { compileModelOptionMap } from './compiler.ts'
import { applyOrderedJsonMergePatches, type NamedJsonMergePatch } from './merge-patch.ts'
import { ModelOptionMapError, type JsonObject, type ModelOptionMapProgram } from './types.ts'

/** Expressions used to translate effective model options into request fields. */
export interface ModelOptionMapSpecs {
  readonly reasoningLevel: { readonly map: string }
  readonly maxOutputTokens: { readonly map: string }
}

/** Effective option values frozen for one request. */
export interface ModelOptionValues {
  readonly reasoningLevel: string
  readonly maxOutputTokens: number
}

/** Compiled option maps that reject conflicting writes when applied to a request. */
export interface CompiledModelOptionMaps {
  apply(body: JsonObject, values: ModelOptionValues): JsonObject
}

/**
 * Compile option maps once when creating a model; requests supply their frozen option values.
 * @param specs - expressions for reasoning level and maximum output tokens.
 * @returns compiled maps whose apply operation copies the request body.
 */
export function compileModelOptionMaps(specs: ModelOptionMapSpecs): CompiledModelOptionMaps {
  const reasoningLevel = compileModelOptionMap(specs.reasoningLevel.map, 'reasoningLevel')
  const maxOutputTokens = compileModelOptionMap(specs.maxOutputTokens.map, 'maxOutputTokens')
  return Object.freeze({
    apply(body: JsonObject, values: ModelOptionValues): JsonObject {
      const patches: NamedJsonMergePatch[] = []
      if (values.reasoningLevel === undefined) {
        throw new ModelOptionMapError('reasoningLevel requires an effective value')
      }
      patches.push(optionPatch('reasoningLevel', reasoningLevel, values.reasoningLevel))
      patches.push(optionPatch('maxOutputTokens', maxOutputTokens, values.maxOutputTokens))
      return applyOrderedJsonMergePatches(body, patches)
    },
  })
}

function optionPatch(
  option: string,
  program: ModelOptionMapProgram,
  value: string | number,
): NamedJsonMergePatch {
  return { option, patch: program.evaluate(value) }
}
