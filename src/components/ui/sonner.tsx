import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Global sonner toaster. Toast type variants use semantic colors matched to
 * NotificationCard for visual consistency across the app.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:glass-strong group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-info/30 group-[.toaster]:rounded-2xl group-[.toaster]:shadow-2xl group-[.toaster]:animate-slide-up",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:!bg-success/15 group-[.toaster]:!border-success/40 group-[.toaster]:!text-success",
          error:
            "group-[.toaster]:!bg-destructive/15 group-[.toaster]:!border-destructive/40 group-[.toaster]:!text-destructive",
          warning:
            "group-[.toaster]:!bg-warning/15 group-[.toaster]:!border-warning/40 group-[.toaster]:!text-warning",
          info:
            "group-[.toaster]:!bg-info/15 group-[.toaster]:!border-info/40 group-[.toaster]:!text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
