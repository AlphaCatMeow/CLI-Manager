import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";

interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    const childProps = node.props as { children?: ReactNode };
    return nodeToText(childProps.children);
  }
  return "";
}

function collectOptions(children: ReactNode, acc: ParsedOption[]): void {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as {
        value?: string | number | readonly string[];
        children?: ReactNode;
        disabled?: boolean;
      };
      acc.push({
        value: String(props.value ?? ""),
        label: nodeToText(props.children),
        disabled: !!props.disabled,
      });
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as { children?: ReactNode };
      collectOptions(props.children, acc);
      return;
    }
    const props = child.props as { children?: ReactNode };
    if (props.children !== undefined) {
      collectOptions(props.children, acc);
    }
  });
}

interface SelectProps {
  className?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children?: ReactNode;
  name?: string;
  id?: string;
  "aria-label"?: string;
}

export function Select({
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  children,
  name,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options = useMemo(() => {
    const list: ParsedOption[] = [];
    collectOptions(children, list);
    return list;
  }, [children]);

  const [internalValue, setInternalValue] = useState<string>(() => {
    if (value !== undefined) return String(value);
    if (defaultValue !== undefined) return String(defaultValue);
    return options[0]?.value ?? "";
  });

  useEffect(() => {
    if (value !== undefined) setInternalValue(String(value));
  }, [value]);

  const currentValue = value !== undefined ? String(value) : internalValue;
  const selectedOption = options.find((o) => o.value === currentValue);
  const displayLabel = selectedOption?.label ?? currentValue;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; placement: "down" | "up" } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const computePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const desiredMaxHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const placeUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    setPos({
      top: placeUp ? Math.max(8, rect.top - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      placement: placeUp ? "up" : "down",
    });
    return desiredMaxHeight;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === currentValue);
    setHighlight(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
  }, [open, options, currentValue]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const el = popoverRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const emitChange = useCallback(
    (next: string) => {
      if (value === undefined) setInternalValue(next);
      if (!onChange) return;
      const fakeEvent = {
        target: { value: next },
        currentTarget: { value: next },
      } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(fakeEvent);
    },
    [onChange, value]
  );

  const selectByIndex = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      emitChange(opt.value);
      setOpen(false);
      requestAnimationFrame(() => buttonRef.current?.focus());
    },
    [options, emitChange]
  );

  const findNextEnabled = useCallback(
    (from: number, dir: 1 | -1): number => {
      if (options.length === 0) return -1;
      let idx = from;
      for (let i = 0; i < options.length; i++) {
        idx = (idx + dir + options.length) % options.length;
        if (!options[idx].disabled) return idx;
      }
      return -1;
    },
    [options]
  );

  const handleButtonKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((prev) => findNextEnabled(prev < 0 ? -1 : prev, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((prev) => findNextEnabled(prev < 0 ? options.length : prev, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = options.findIndex((o) => !o.disabled);
      if (first >= 0) setHighlight(first);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setHighlight(i);
          break;
        }
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlight >= 0) selectByIndex(highlight);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={handleButtonKeyDown}
        className={cn(
          "ui-input ui-focus-ring flex h-8 w-full items-center justify-between gap-2 px-3 py-1.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("flex-1 truncate text-left", !selectedOption && "text-on-surface-variant")}>
          {displayLabel || <span className="text-on-surface-variant">请选择</span>}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={cn("shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        >
          <path d="M2 4.5L6 8.5L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && pos && (
        <Portal>
          <div
            ref={popoverRef}
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel}
            aria-activedescendant={highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined}
            tabIndex={-1}
            className="ui-select-popover fixed z-[1000] overflow-auto rounded-xl border border-border bg-surface-container-high py-1 text-xs shadow-lg"
            style={{
              top: pos.placement === "down" ? pos.top : undefined,
              bottom: pos.placement === "up" ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: pos.width,
              maxHeight: 280,
            }}
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-on-surface-variant">无选项</div>
            )}
            {options.map((opt, idx) => {
              const selected = opt.value === currentValue;
              const highlighted = idx === highlight;
              return (
                <div
                  key={`${opt.value}-${idx}`}
                  id={`${listboxId}-opt-${idx}`}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={opt.disabled || undefined}
                  data-option-index={idx}
                  data-selected={selected ? "true" : "false"}
                  data-highlighted={highlighted ? "true" : "false"}
                  onMouseEnter={() => {
                    if (!opt.disabled) setHighlight(idx);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!opt.disabled) selectByIndex(idx);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5",
                    opt.disabled && "cursor-not-allowed opacity-50",
                    highlighted && !opt.disabled && "bg-surface-container-highest",
                    selected && "font-semibold text-primary"
                  )}
                >
                  <span className="flex-1 truncate">{opt.label || opt.value}</span>
                  {selected && (
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
                      <path d="M2.5 6.5L5 9L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </Portal>
      )}
    </>
  );
}
