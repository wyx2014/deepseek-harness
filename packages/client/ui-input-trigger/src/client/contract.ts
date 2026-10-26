/**
 * Frozen service contract of the slash pipeline. Types only. The
 * InputTriggerService implementation publishes this face as `ctx.inputTriggers`; sources
 * see registerSource alone, the conversation wiring layer resolves its
 * per-session controller through sessionOf.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ClientSessionContext, InputTriggerCandidate, InputTriggerPresenter, InputTriggerSource, TriggerChar } from '../types.ts'
import type { InputTriggerController } from './controller.ts'

/** The `ctx.inputTriggers` service face. */
export interface InputTriggerServiceContract {
  /**
   * Register one trigger source; duplicate trigger/name pairs throw.
   * @param src - source that discovers and resolves slash or reference candidates.
   * @returns effect disposer removing this source.
   */
  registerSource(src: InputTriggerSource): () => void
  /**
   * Register a product presenter for one source's candidates (later registrations apply after earlier ones).
   * @param trigger - the source's trigger character.
   * @param source - the source name.
   * @param presenter - synchronous candidate presentation.
   * @returns effect disposer removing this presenter.
   */
  registerPresenter(trigger: TriggerChar, source: string, presenter: InputTriggerPresenter): () => void
  /**
   * Apply the registered presenters of one source; a failing presenter is skipped.
   * @param trigger - the source's trigger character.
   * @param source - the source name.
   * @param session - stable session projection.
   * @param candidates - the source's rows before ranking.
   * @returns the presented rows.
   */
  present(
    trigger: TriggerChar,
    source: string,
    session: ClientSessionContext,
    candidates: readonly InputTriggerCandidate[],
  ): readonly InputTriggerCandidate[]
  /**
   * Resolve the lazy controller owned by one session scope.
   * @param actx - session-scoped Client context.
   * @returns controller that dies with that scope.
   */
  sessionOf(actx: ClientContext): InputTriggerController
}
