'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, Keyboard, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cleanScan, makeReader, RecentScans, type Reader } from '@/lib/scanning';

/**
 * ONE SCANNER, EVERYWHERE SOMETHING IS SCANNED.
 *
 * Three screens need a camera — receiving a return, checking a parcel
 * against the batch in front of you, and finding an order by its label. The
 * cheap way to ship that is three copies, and three copies is three sets of
 * camera permissions, three ways of releasing the camera, and two of them
 * eventually wrong: the one that leaves the torch on, and the one that keeps
 * the stream open after the sheet closes, so the phone's camera light stays
 * lit until the tab is killed.
 *
 * So it is one component. The caller says what to do with a code; everything
 * about getting the code — the camera, the permission, the decoder, the
 * duplicate suppression, the release — happens here and only here.
 *
 * WHAT IT DOES NOT DO. It does not open a record, look anything up, or know
 * what an order is. It hands a cleaned string back to the screen, and the
 * screen puts it in the same search box a person types into — which is what
 * keeps a scan a SEARCH, subject to exactly the permissions the typed search
 * already is. A scanner that opened records directly would be a second door
 * into the data with its own idea of who may walk through it.
 *
 * THE MANUAL FIELD IS NOT A FALLBACK. It is always there, under the
 * viewfinder. A crushed label, a phone with no camera permission, a warehouse
 * with a USB scanner already plugged in — in all three the work continues,
 * through the same path, with the same validation.
 */

export interface ScanButtonProps {
  /** Given a validated code. Return a message to show, or nothing. */
  onScan: (code: string) => void | string | Promise<void | string>;
  /** The sheet's heading — what the person is scanning, in their words. */
  title?: string;
  /**
   * Stay open after a hit. Receiving twenty returns is one opening of the
   * camera, not twenty; finding one order is the opposite.
   */
  continuous?: boolean;
  /** The trigger's own label. */
  label?: string;
  className?: string;
}

/** A short, dry tick. Loud enough for a warehouse, short enough to repeat. */
let audio: AudioContext | null = null;
function announce(ok: boolean): void {
  try {
    navigator.vibrate?.(ok ? 60 : [40, 60, 40]);
  } catch {
    /* a desktop, or a browser that refuses without a gesture */
  }
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 880 : 240;
    gain.gain.value = 0.07;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.09);
  } catch {
    /* no audio on this device — the vibration and the text still land */
  }
}

/** Roughly eight frames a second: fast for a hand, cheap for a battery. */
const FRAME_MS = 125;

export function ScanButton({ onScan, title = 'مسح الباركود', continuous = false, label = 'مسح', className }: ScanButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'h-10 px-3 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5 shrink-0'
        }
      >
        <Camera className="w-4 h-4" />
        {label}
      </button>
      {open && <ScanSheet onClose={() => setOpen(false)} onScan={onScan} title={title} continuous={continuous} />}
    </>
  );
}

/**
 * The sheet on its own, for the callers that must load something BEFORE the
 * camera opens — checking a parcel against a batch needs that batch's
 * references in hand, and a viewfinder that appears and then says "wait" is
 * a viewfinder somebody scans into for nothing.
 */
export function ScanSheet({
  onClose,
  onScan,
  title,
  continuous,
}: {
  onClose: () => void;
  onScan: ScanButtonProps['onScan'];
  title: string;
  continuous: boolean;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const reader = useRef<Reader | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);
  const recent = useRef(new RecentScans());

  const [state, setState] = useState<'starting' | 'scanning' | 'denied' | 'nocamera'>('starting');
  const [torch, setTorch] = useState<boolean | null>(null); // null = the lamp does not exist
  const [said, setSaid] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  /**
   * The code is accepted in ONE place, whether it came from the lens or the
   * keyboard. Two entry points with two validations is how a rule ends up
   * enforced on one of them.
   */
  const accept = useCallback(
    async (raw: string) => {
      const code = cleanScan(raw);
      if (!code) {
        announce(false);
        setSaid('هذا ليس مرجعاً نعرفه.');
        return;
      }
      if (recent.current.isRepeat(code)) return;
      recent.current.accept(code);
      announce(true);
      const message = await onScan(code);
      setSaid(typeof message === 'string' ? message : code);
      if (!continuous) onClose();
    },
    [continuous, onClose, onScan]
  );

  /**
   * RELEASING THE CAMERA.
   *
   * Every exit runs through here: closing the sheet, a failure while
   * starting, and the unmount React does when the parent navigates away.
   * A stream left running holds the lens, keeps the indicator lit, and stops
   * any other app — including this one, on the next screen — from opening it.
   */
  const release = useCallback(() => {
    live.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    reader.current?.close();
    reader.current = null;
  }, []);

  useEffect(() => {
    live.current = true;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('nocamera');
        return;
      }
      try {
        // The rear camera, asked for as a preference rather than a demand: a
        // laptop has only one, and `exact` makes it fail instead of using it.
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          for (const t of media.getTracks()) t.stop();
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => undefined);
        }

        const track = media.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);

        const { reader: made } = await makeReader();
        if (cancelled) {
          made.close();
          for (const t of media.getTracks()) t.stop();
          return;
        }
        reader.current = made;
        setState('scanning');
        void tick();
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'nocamera');
      }
    }

    async function tick() {
      if (!live.current) return;
      const v = video.current;
      const c = canvas.current;
      const r = reader.current;
      if (v && c && r && v.videoWidth > 0) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const hit = await r.read(c).catch(() => null);
          if (hit && live.current) await accept(hit.text);
        }
      }
      if (live.current) timer.current = setTimeout(() => void tick(), FRAME_MS);
    }

    void start();
    return () => {
      cancelled = true;
      release();
    };
  }, [accept, release]);

  const close = useCallback(() => {
    release();
    onClose();
  }, [onClose, release]);

  const toggleTorch = useCallback(async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      // `torch` is real on Android and absent from the DOM types.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorch(next);
    } catch {
      // Some phones advertise the lamp and then refuse it. Better to drop the
      // control than to leave a button that silently does nothing.
      setTorch(null);
    }
  }, [torch]);

  return (
    <Modal isOpen onClose={close} title={title} maxWidth="sm">
      <div className="space-y-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          <canvas ref={canvas} className="hidden" />

          {/* The window to aim through. A full-frame camera with no target
              makes people hold the label too far back, every time. */}
          {state === 'scanning' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-2/5 w-3/5 rounded-lg border-2 border-[var(--sys-primary)]/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {state === 'starting' && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ فتح الكاميرا…
            </p>
          )}

          {state === 'denied' && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
              الكاميرا مرفوضة لهذا الموقع. افتح إعدادات المتصفح واسمح بها، أو اكتب المرجع بالأسفل.
            </p>
          )}

          {state === 'nocamera' && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
              لا كاميرا متاحة على هذا الجهاز. اكتب المرجع بالأسفل.
            </p>
          )}

          {torch !== null && (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-pressed={torch}
              className={`absolute bottom-3 end-3 h-11 w-11 rounded-full border border-white/40 ${
                torch ? 'bg-white text-black' : 'bg-black/50 text-white'
              } inline-flex items-center justify-center`}
            >
              <Flashlight className="h-5 w-5" />
              <span className="sr-only">الإضاءة</span>
            </button>
          )}
        </div>

        {said && (
          <p
            data-testid="scan-said"
            className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-2.5 text-center text-sm text-[var(--sys-foreground)]"
            dir="auto"
          >
            {said}
          </p>
        )}

        {/* Always present — see the note at the top of the file. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = typed.trim();
            if (!value) return;
            setTyped('');
            void accept(value);
          }}
          className="flex gap-2"
        >
          <label className="relative flex-1">
            <span className="sr-only">اكتب المرجع يدوياً</span>
            <Keyboard className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sys-muted)]" />
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="أو اكتب المرجع"
              dir="ltr"
              className="h-10 w-full rounded-lg border border-[var(--sys-border)] ps-9 pe-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className="h-10 shrink-0 rounded-lg bg-[var(--sys-primary)] px-4 text-sm font-medium text-[var(--sys-primary-foreground)]"
          >
            إدخال
          </button>
        </form>
      </div>
    </Modal>
  );
}
