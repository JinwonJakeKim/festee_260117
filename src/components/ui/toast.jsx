import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ({ children }) => {
  return <>{children}</>;
};

const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed bottom-[100px] left-4 right-4 z-[99999]",
      "flex max-h-screen w-auto flex-col gap-2",
      "pointer-events-none",
      className
    )}
    {...props}
  />
));

ToastViewport.displayName = "ToastViewport";

const Toast = React.forwardRef(
  ({ className, open, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "pointer-events-auto relative flex w-full items-center",
          "justify-between gap-4 rounded-lg",
          "border border-gray-300 bg-white",
          "p-4 shadow-xl",
          "text-black",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Toast.displayName = "Toast";

const ToastAction = React.forwardRef(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center",
        "rounded-md border bg-transparent px-3",
        "text-sm font-medium",
        className
      )}
      {...props}
    />
  )
);

ToastAction.displayName = "ToastAction";

const ToastClose = React.forwardRef(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "absolute right-2 top-2 rounded-md p-1",
        "text-gray-500 hover:text-gray-900",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  )
);

ToastClose.displayName = "ToastClose";

const ToastTitle = React.forwardRef(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "text-base font-bold text-black",
        className
      )}
      {...props}
    />
  )
);

ToastTitle.displayName = "ToastTitle";

const ToastDescription = React.forwardRef(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "text-sm font-normal text-gray-700",
        className
      )}
      {...props}
    />
  )
);

ToastDescription.displayName = "ToastDescription";

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};