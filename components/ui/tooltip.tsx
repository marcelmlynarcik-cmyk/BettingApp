'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { useIsMobile } from '@/components/ui/use-mobile'
import { cn } from '@/lib/utils'

type TooltipContextValue = {
  isMobile: boolean
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  open: openProp,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  return (
    <TooltipProvider>
      <TooltipContext.Provider value={{ isMobile, open, setOpen }}>
        <TooltipPrimitive.Root
          data-slot="tooltip"
          {...props}
          open={isMobile ? open : openProp}
          onOpenChange={isMobile ? setOpen : onOpenChange}
        />
      </TooltipContext.Provider>
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const context = React.useContext(TooltipContext)

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onClick={(event) => {
        props.onClick?.(event)

        if (event.defaultPrevented || !context?.isMobile) {
          return
        }

        context.setOpen((currentOpen) => !currentOpen)
      }}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
