'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { normalizeBarcode } from '@/lib/foods/barcode';
import { es } from '@/lib/i18n/es';
import { createDetector, type CodeDetector } from '../scanner';

const s = es.addFood.scan;

/** Cada cuánto se intenta leer un código del video. */
const SCAN_INTERVAL_MS = 250;

type CameraState =
  'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'no-camera' | 'error';

type Props = {
  /** Código válido (ya normalizado a EAN-13/EAN-8), venga de la cámara o escrito a mano. */
  onCode: (code: string) => void;
  /** Deshabilita la cámara y el campo mientras se busca el producto. */
  busy?: boolean;
};

const MESSAGES: Partial<Record<CameraState, string>> = {
  unsupported: s.unsupported,
  'no-camera': s.noCamera,
  error: s.cameraError,
};

/**
 * Lector de códigos: cámara trasera con detección continua, y siempre el ingreso a mano como
 * respaldo (sin permiso de cámara, sin soporte o con un código dañado).
 */
export function BarcodeScanner({ onCode, busy = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<CodeDetector | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);
  const [state, setState] = useState<CameraState>('idle');
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState('idle');
  }, []);

  // Al salir de la pantalla la cámara se apaga siempre.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    setState('starting');
    try {
      const [detector, stream] = await Promise.all([
        createDetector(),
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        }),
      ]);
      if (!detector) {
        stream.getTracks().forEach((track) => track.stop());
        setState('unsupported');
        return;
      }
      detectorRef.current = detector;
      streamRef.current = stream;
      setState('scanning');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setState('no-camera');
      else setState('error');
    }
  }, []);

  // Con la cámara abierta (y el <video> ya montado) se engancha el stream y se lee de a intervalos.
  useEffect(() => {
    if (state !== 'scanning') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const detector = detectorRef.current;
    if (!video || !stream || !detector) return;

    video.srcObject = stream;
    void video.play().catch(() => undefined);

    let reading = false;
    const timer = setInterval(async () => {
      if (reading || video.readyState < 2) return;
      reading = true;
      try {
        for (const result of await detector.detect(video)) {
          const code = normalizeBarcode(result.rawValue);
          // Una lectura a medias o dañada no vale: se sigue mirando.
          if (code) {
            clearInterval(timer);
            stop();
            onCodeRef.current(code);
            return;
          }
        }
      } catch {
        // Un cuadro que no se pudo leer no corta el escaneo.
      } finally {
        reading = false;
      }
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state, stop]);

  function submitManual() {
    const code = normalizeBarcode(manual);
    if (!code) {
      setManualError(s.invalid);
      return;
    }
    setManualError(null);
    onCode(code);
  }

  const cameraOn = state === 'scanning';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {cameraOn ? (
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label={s.title}
              className="aspect-[4/3] w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
            />
          </div>
        ) : null}

        {state === 'denied' ? (
          <div role="alert" className="bg-surface-muted flex flex-col gap-1 rounded-lg p-3 text-sm">
            <p className="font-semibold">{s.permissionTitle}</p>
            <p className="text-muted">{s.permissionHelp}</p>
          </div>
        ) : null}
        {MESSAGES[state] ? (
          <p role="alert" className="bg-surface-muted rounded-lg p-3 text-sm">
            {MESSAGES[state]}
          </p>
        ) : null}

        {cameraOn ? (
          <>
            <p className="text-muted text-sm">{s.hint}</p>
            <Button variant="secondary" onClick={stop}>
              {s.stop}
            </Button>
          </>
        ) : (
          <Button onClick={start} loading={state === 'starting'} disabled={busy}>
            {state === 'starting' ? s.starting : s.start}
          </Button>
        )}
      </div>

      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitManual();
        }}
      >
        <label htmlFor="manual-barcode" className="text-sm font-medium">
          {s.manualLabel}
        </label>
        <p className="text-muted -mt-1 text-xs">{s.manualHelp}</p>
        <div className="flex items-start gap-2">
          <input
            id="manual-barcode"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={manual}
            onChange={(event) => {
              setManual(event.target.value);
              setManualError(null);
            }}
            aria-invalid={manualError ? true : undefined}
            className="bg-surface border-border focus:border-primary min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base tabular-nums outline-none"
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            {s.manualSubmit}
          </Button>
        </div>
        {manualError ? (
          <p role="alert" className="text-danger text-sm">
            {manualError}
          </p>
        ) : null}
      </form>
    </div>
  );
}
