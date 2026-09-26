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
 * The image is layered ON TOP of a gradient built from the brand's own
 * colours. The slot is filled now — `/brand/banner.webp`, the circuit wave —
 * but it stays a slot: if the file is ever missing the request 404s, the
 * layer draws nothing, and the gradient is a finished screen rather than a
 * broken one. Swapping the file changes no code.
 *
 * AND THE OVERLAY IS NOT DECORATION.
 *
 * A scrim at 0.78 of the page's own background is what guarantees the
 * heading keeps its contrast over a bright image as well as over a dark
 * one — so the text is measured against the background token, as
 * everywhere else, rather than against a picture that may be replaced.
 * The banner that arrived is dark navy, which the scrim did not need to
 * know.
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
      {/* The slot, filled: the circuit wave, in the brand's own navy. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.55]"
        style={{ backgroundImage: "url('/brand/banner.webp')" }}
      />
      {/*
        0.55 over a 0.45 scrim, and both numbers were measured rather than
        guessed. While the slot was empty they were 0.25 and 0.78 — blind
        insurance against a photograph nobody had seen, which would have
        left the real banner as a faint smudge.

        What these two numbers buy is that the IMAGE NO LONGER MATTERS: at
        0.55 and 0.45, even a pure-white banner leaves the heading above
        4.5:1. `brand-stage.test.ts` composites exactly that worst case, so
        the pair cannot be pushed apart without failing — which is the real
        risk, since the file can be swapped by anyone and these numbers can
        be nudged by anyone reading them as taste.
      */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[var(--sys-background)]/[0.45]" />

      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.png" alt="" aria-hidden className="h-20 w-20 object-contain" />
          <div>
            <p className="text-display font-bold leading-none tracking-wide text-[var(--sys-heading)]" dir="ltr">
              Zaki <span className="text-[var(--sys-primary)]">AI</span> OMS
            </p>
            {/* `lang="en"` and `tracking-wide` are not decoration: they are
                what the one documented exception in system.css looks for.
                Arabic refuses letter-spacing and text-transform globally —
                correctly — and this Latin tagline opts back in by saying
                what it is. */}
            <p
              className="mt-1.5 text-note font-semibold uppercase tracking-wide text-[var(--sys-muted-foreground)]"
              lang="en"
              dir="ltr"
            >
              Intelligent Systems
            </p>
          </div>
          {caption && <p className="text-sm text-[var(--sys-muted-foreground)]">{caption}</p>}
        </div>

        {children}
      </div>
    </div>
  );
}
