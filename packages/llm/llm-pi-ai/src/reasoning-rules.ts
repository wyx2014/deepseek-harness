/**
 * Reasoning levels for hand-declared models that declare none, resolved by TP Cowork's reference product's rule
 * engine (`ModelConfigRules.resolve`) over its built-in rules: every matching model, protocol, and provider-site rule
 * overlays the reasoning spec in order, so a catch-all on/off toggle gives way to a model's own levels and its
 * protocol's wire spelling. pi-ai reads such a model as non-reasoning, so the level travels as a JSON merge patch on
 * the request body, evaluated by the reference product's option-map language.
 */
import type { Api, Model } from '@earendil-works/pi-ai'
import { applyOrderedJsonMergePatches, compileModelOptionMap } from './option-map/index.ts'
import type { JsonObject, ModelOptionMapProgram } from './option-map/index.ts'
import { REASONING_RULES } from './option-map/reasoning-rules.ts'

/** One reference-product rule's reasoning spec; `null` clears what earlier rules set. */
interface ReasoningLevelSpec {
  readonly values?: readonly string[] | null | undefined
  readonly map?: string | null | undefined
}

/** One reference-product rule, reduced to its match and its reasoning spec. */
export interface ReasoningRule {
  readonly type: 'model' | 'model-api' | 'provider-site'
  readonly modelMatch: string
  readonly apiTypeMatch?: string
  readonly baseUrlMatch?: string
  readonly reasoningLevel: ReasoningLevelSpec | null
}

/** A model's resolved levels, least to greatest, and the program spelling one on the wire. */
export interface ReasoningSpec {
  readonly values: readonly string[]
  readonly map: ModelOptionMapProgram
}

/** pi-ai protocol names the reference product spells differently. */
const API_TYPES: Partial<Record<Api, string>> = { 'openai-completions': 'openai-chat-completions' }

const specs = new WeakMap<Model<Api>, ReasoningSpec>()

function matches(pattern: string, value: string, ignoreCase = false): boolean {
  return new RegExp(`^(?:${pattern})$`, ignoreCase ? 'i' : undefined).test(value)
}

/** Host case, default ports, and trailing slashes do not change a match; path and query case are kept. */
function normalizeBaseUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    const suffix = `${parsed.search}${parsed.hash}`
    const serialized = parsed.toString()
    const endpoint = suffix.length === 0 ? serialized : serialized.slice(0, -suffix.length)
    return `${endpoint.replace(/\/+$/, '')}${suffix}`
  } catch {
    return undefined
  }
}

/**
 * Resolve a model's reasoning spec from the rules, in order.
 * @param modelId - the request model id.
 * @param api - the model's pi-ai protocol.
 * @param baseUrl - the route endpoint, if any.
 * @param rules - rules in application order.
 * @returns the spec, or undefined when the rules leave the model without levels.
 */
export function resolveReasoningSpec(
  modelId: string,
  api: Api,
  baseUrl: string | undefined,
  rules: readonly ReasoningRule[] = REASONING_RULES,
): ReasoningSpec | undefined {
  const apiType = API_TYPES[api] ?? api
  const site = baseUrl === undefined ? undefined : normalizeBaseUrl(baseUrl)
  let spec: ReasoningLevelSpec | null | undefined
  for (const rule of rules) {
    if (!matches(rule.modelMatch, modelId, true)) continue
    if (rule.type !== 'model' && rule.apiTypeMatch !== undefined && !matches(rule.apiTypeMatch, apiType)) continue
    if (rule.type === 'provider-site' && (site === undefined || !matches(rule.baseUrlMatch ?? '', site))) continue
    const next = rule.reasoningLevel
    spec = next === null || spec === null || spec === undefined
      ? next
      : { values: next.values === undefined ? spec.values : next.values, map: next.map === undefined ? spec.map : next.map }
  }
  const values = spec?.values
  if (values === undefined || values === null || values.length === 0) return undefined
  return { values, map: compileModelOptionMap(spec?.map ?? '{}', 'reasoningLevel') }
}

/**
 * Attach the rules' levels to a hand-declared model, when they give it any.
 * @param model - the materialized model.
 * @returns the same model.
 */
export function withReasoningRules(model: Model<Api>): Model<Api> {
  const spec = resolveReasoningSpec(model.id, model.api, model.baseUrl)
  if (spec !== undefined) specs.set(model, spec)
  return model
}

/**
 * The rule-resolved spec a model carries.
 * @param model - a model from the current collection.
 * @returns the spec, or undefined for a model pi-ai's own levels describe.
 */
export function reasoningSpecOf(model: Model<Api>): ReasoningSpec | undefined {
  return specs.get(model)
}

/**
 * Patch a request body with one level, as the reference product applies an option map.
 * @param payload - the body pi-ai built.
 * @param spec - the model's spec.
 * @param level - a level from `spec.values`.
 * @returns the patched body; a non-object body is returned unchanged.
 */
export function applyReasoningLevel(payload: unknown, spec: ReasoningSpec, level: string): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  return applyOrderedJsonMergePatches(payload as JsonObject, [{ option: 'reasoningLevel', patch: spec.map.evaluate(level) }])
}
