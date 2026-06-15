type HomeFigurePreviewProps = {
  src: string;
  alt: string;
};

export function HomeFigurePreview({ src, alt }: HomeFigurePreviewProps) {
  return (
    <div className="flex h-44 min-h-44 w-full items-center justify-center overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff]">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the existing cache-controlled route. */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
