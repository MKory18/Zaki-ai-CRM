import React from 'react';

/**
 * THE THREE SCREENS BEFORE THE WORK.
 *
 * Sign in, pick a country, pick a store — three full screens a person sees
 * every morning, and all three were a grey page with a box in the middle.
 * They are the only moments in the product where nothing is being measured
 * or decided, which is exactly why they are where the brand goes.
 *
 * THE BANNER IS A SLOT, NOT A DEPENDENCY.
 *
 * The photograph is layered ON TOP of a gradient built from the brand's own
 * colours. If `/brand/banner.jpg` is not there, the request 404s, the layer
 * draws nothing, and the gradient is what shows — which is a finished
 * screen, not a broken one. Dropping the file in later changes no code.
 *
 * AND THE OVERLAY IS NOT DECORATION.
 *
 * Whatever image eventually lands in that slot, nobody here will have seen
 * it. A scrim at 0.78 of the page's own background is what guarantees the
 * heading keeps its contrast over a bright sky as well as over a dark one —
 * so the text is measured against the background token, as everywhere else,
 * rather than against a photograph nobody can test.
 */
export function BrandStage({
  children,
  /** A line under the lockup: what this step is for. */
  caption,
}: {
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* Navy into petrol into the glow: the brand's own three, in order. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{
          background:
            'radial-gradient(120% 85% at 85% 0%, var(--sys-primary-soft) 0%, transparent 55%),' +
            'radial-gradient(100% 70% at 10% 100%, var(--sys-primary-soft) 0%, transparent 50%),' +
            'var(--sys-background)',
        }}
      />
      {/* The slot. Absent today; present the moment a file is put there. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-25"
        style={{ backgroundImage: "url('/brand/banner.jpg')" }}
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--sys-background)]/[0.78]" />

      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Zaki AI" className="h-16 w-20 object-contain" />
          <div>
            <p className="text-display font-bold leading-none tracking-wide text-[var(--sys-heading)]" dir="ltr">
              Zaki <span className="text-[var(--sys-primary)]">AI</span> Store
            </p>
            <p
              className="mt-1.5 text-note font-semibold uppercase tracking-[0.3em] text-[var(--sys-muted-foreground)]"
              dir="ltr"
            >
              Operations
            </p>
          </div>
          {caption && <p className="text-sm text-[var(--sys-muted-foreground)]">{caption}</p>}
        </div>

        {children}
      </div>
    </div>
  );
}
