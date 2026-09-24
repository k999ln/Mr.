import Image from "next/image";

const assets = {
  whole: { src: "/avocado-whole-v1.png", width: 609, height: 640 },
  half: { src: "/avocado-half-pit-v1.png", width: 622, height: 640 },
  slices: { src: "/avocado-slices-v1.png", width: 640, height: 533 },
  "print-half": { src: "/avocado-print-half-v1.png", width: 720, height: 900 },
  "print-whole": { src: "/avocado-print-whole-v1.png", width: 764, height: 900 },
  "print-slices": { src: "/avocado-print-slices-v1.png", width: 857, height: 900 },
  "print-leaf": { src: "/avocado-print-leaf-v1.png", width: 675, height: 900 },
  "print-overprint": { src: "/avocado-print-overprint-v1.png", width: 600, height: 900 },
} as const;

type AvocadoVariant = keyof typeof assets | "emoji";
type AvocadoMotion = "drift" | "rain" | "conveyor" | "slide" | "bloom";

export default function FloatingAvocados({
  variant,
  count = 3,
  motion = "drift",
  className = "",
}: {
  variant: AvocadoVariant;
  count?: number;
  motion?: AvocadoMotion;
  className?: string;
}) {
  const asset = variant === "emoji" ? null : assets[variant];

  return (
    <div
      className={`floating-avocados floating-avocados--${variant} floating-motion--${motion} ${className}`.trim()}
      data-avocado-motion={motion}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => asset ? (
        <Image
          className="floating-avocado"
          data-float-index={index}
          src={asset.src}
          width={asset.width}
          height={asset.height}
          alt=""
          sizes="(max-width: 800px) 28vw, 14vw"
          key={`${variant}-${index}`}
        />
      ) : (
        <span className="floating-avocado floating-avocado-emoji" data-float-index={index} key={`emoji-${index}`}>🥑</span>
      ))}
    </div>
  );
}
