import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  forwardRef,
} from 'react';
import './Tabs.css';

/* Context */
interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  variant: 'underline' | 'pills';
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
};

/* Main Tabs component */
export interface TabsProps {
  /** Default selected tab (uncontrolled) */
  defaultValue?: string;
  /** Selected tab value (controlled) */
  value?: string;
  /** Called when tab changes */
  onValueChange?: (value: string) => void;
  /** Tab content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: 'underline' | 'pills';
  /** Additional class name */
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  defaultValue = '',
  value: controlledValue,
  onValueChange,
  children,
  variant = 'underline',
  className = '',
}) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange, variant }}>
      <div className={`ui-tabs ui-tabs--${variant} ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
};

Tabs.displayName = 'Tabs';

/* TabsList component */
export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className = '', children, ...props }, ref) => {
    const listRef = useRef<HTMLDivElement>(null);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
      const list = listRef.current;
      if (!list) return;

      const triggers = Array.from(
        list.querySelectorAll<HTMLButtonElement>('.ui-tabs__trigger:not(:disabled)')
      );
      const currentIndex = triggers.findIndex(
        (trigger) => trigger === document.activeElement
      );

      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % triggers.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = triggers.length - 1;
          break;
      }

      if (nextIndex !== null) {
        triggers[nextIndex].focus();
      }
    };

    return (
      <div
        ref={(node) => {
          (listRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={`ui-tabs__list ${className}`}
        role="tablist"
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabsList.displayName = 'TabsList';

/* TabsTrigger component */
export interface TabsTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** Tab value to activate */
  value: string;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, className = '', children, disabled, ...props }, ref) => {
    const { value: selectedValue, onValueChange } = useTabsContext();
    const isActive = value === selectedValue;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        className={`ui-tabs__trigger ${isActive ? 'ui-tabs__trigger--active' : ''} ${className}`}
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        onClick={() => onValueChange(value)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

TabsTrigger.displayName = 'TabsTrigger';

/* TabsContent component */
export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tab value this content belongs to */
  value: string;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className = '', children, ...props }, ref) => {
    const { value: selectedValue } = useTabsContext();
    const isActive = value === selectedValue;

    return (
      <div
        ref={ref}
        role="tabpanel"
        className={`ui-tabs__content ${!isActive ? 'ui-tabs__content--hidden' : ''} ${className}`}
        hidden={!isActive}
        tabIndex={0}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabsContent.displayName = 'TabsContent';
