import { cn } from "@/lib/utils";

interface IconProps extends React.SVGAttributes<SVGElement> {
  children: React.ReactNode;
}

export function IconBase({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-6 h-6", className)}
      {...props}
    >
      {children}
    </svg>
  );
}
