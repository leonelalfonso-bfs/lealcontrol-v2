import { useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  onRecorded: (base64: string, mimeType: string, fileName: string) => void;
};

export function AudioRecorderButton({ disabled, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
    };
  }, []);

  const toggle = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          onRecorded(base64, mimeType, `nota-voz-${Date.now()}.webm`);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert("No se pudo acceder al micrófono.");
    }
  };

  return (
    <button
      type="button"
      className={`btn ghost compact ${recording ? "btn-danger" : ""}`}
      disabled={disabled}
      onClick={() => void toggle()}
      title={recording ? "Detener grabación" : "Grabar nota de voz"}
    >
      {recording ? "⏹" : "🎤"}
    </button>
  );
}
