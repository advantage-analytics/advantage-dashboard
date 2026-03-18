import AccentLine from "./accent-line";

interface FormHeaderProps {
  title: string;
  description: string;
  subtitle: string;
  icon?: React.ReactNode;
}

export default function FormHeader({
  title,
  description,
  subtitle,
  icon,
}: FormHeaderProps) {
  return (
    <>
      <AccentLine />
      {icon && (
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[rgba(0,0,0,0.03)]">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-[8px]">
        <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.5px] text-[var(--color-text-primary)]">
          {title}
        </h2>
        <p className="text-[12px] leading-[1.5] text-[var(--color-text-muted)]">
          {description}
        </p>
        <p className="text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
          {subtitle}
        </p>
      </div>
    </>
  );
}
