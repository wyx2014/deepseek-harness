// Vendored from the reference product's @tpcowork/model-option-map (packages/model-option-map/src/types.ts); keep in sync.
/** Scalar values accepted in a model option map's JSON output. */
export type JsonPrimitive = string | number | boolean | null
/** Recursive JSON output produced by restricted expressions. */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]

/** Request object or JSON merge patch with readonly input fields. */
export interface JsonObject {
  readonly [key: string]: JsonValue
}

/** Value bound to the expression's single input variable. */
export type RestrictedCelValue = string | number
/** Model options accepted as expression input variables. */
export type ModelOptionName = 'reasoningLevel' | 'maxOutputTokens'

/** Compiled expression that evaluates one option value to immutable JSON. */
export interface RestrictedCelProgram {
  readonly source: string
  evaluate(input: RestrictedCelValue): JsonValue
}

/** Compiled expression constrained to produce JSON objects for request patches. */
export interface ModelOptionMapProgram {
  readonly source: string
  evaluate(input: RestrictedCelValue): JsonObject
}

/** Syntax or evaluation failure with an offset into the expression source. */
export class RestrictedCelError extends Error {
  /** Zero-based character offset of the failed token or operation. */
  readonly offset: number

  constructor(message: string, offset: number) {
    super(`${message} at offset ${offset}`)
    this.name = 'RestrictedCelError'
    this.offset = offset
  }
}

/** Invalid effective option value or conflicting request-field patches. */
export class ModelOptionMapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelOptionMapError'
  }
}
