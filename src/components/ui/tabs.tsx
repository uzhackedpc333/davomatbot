"use client"

import * as React from "react"
import { cn } from "@/utils/cn"

const Tabs = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    defaultValue: string
    value?: string
    onValueChange?: (value: string) => void
  }
>(({ className, defaultValue, value, onValueChange, children, ...props }, ref) => {
  const [controlledValue, setControlledValue] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : controlledValue

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setControlledValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child

        if (child.type === TabsList) {
          return React.cloneElement(child, {
            onValueChange: handleValueChange,
            value: currentValue,
          })
        }

        if (child.type === TabsContent) {
          return React.cloneElement(child, { value: currentValue })
        }

        return child
      })}
    </div>
  )
})
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    value: string
    onValueChange: (value: string) => void
  }
>(({ className, value, onValueChange, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child
        if (child.type === TabsTrigger) {
          return React.cloneElement(child, {
            value: (child.props as any).value,
            isActive: (child.props as any).value === value,
            onClick: () => onValueChange((child.props as any).value),
          })
        }
        return child
      })}
    </div>
  )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  React.ElementRef<"button">,
  React.ComponentPropsWithoutRef<"button"> & {
    value: string
    isActive?: boolean
  }
>(({ className, value, isActive, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {
    value: string
  }
>(({ className, value, children, ...props }, ref) => {
  const parentValue = React.useContext(TabsContext)
  const isActive = parentValue === value

  if (!isActive) return null

  return (
    <div
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TabsContent.displayName = "TabsContent"

const TabsContext = React.createContext<string>("")

export { Tabs, TabsList, TabsTrigger, TabsContent }