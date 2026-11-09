/** Loading state of the first-run stage, drawn as the startup cover's breathing logo. */
import css from './OnboardingLoading.module.css'

/**
 * Continue the startup cover while onboarding state loads, so opening the application reads as one loading screen
 * rather than a logo followed by a "Loading settings…" line. The text stays available to assistive technology.
 * @param props.label - accessible name of the loading status.
 * @returns the centered breathing logo.
 */
export function OnboardingLoading({ label }: { label: string }) {
  return <div className={css.loading} role="status" aria-label={label}>
    <img className={css.logo} src="/startup-logo.png" alt="" data-onboarding-loading-logo />
  </div>
}
