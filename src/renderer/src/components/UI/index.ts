/**
 * UI Components
 *
 * Reusable UI primitives with synthwave theming.
 * All components use CSS custom properties for styling.
 */

// Buttons
export { Button, type ButtonProps } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';

// Inputs
export { Input, type InputProps } from './Input';
export { Textarea, type TextareaProps } from './Textarea';

// Controls
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Radio, RadioGroup, type RadioProps, type RadioGroupProps } from './Radio';
export { Toggle, type ToggleProps } from './Toggle';
export { Slider, type SliderProps } from './Slider';
export { Select, type SelectProps, type SelectOption } from './Select';

// Layout
export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
} from './Card';
export { Badge, type BadgeProps } from './Badge';
export {
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  type DialogProps,
  type DialogHeaderProps,
  type DialogBodyProps,
  type DialogFooterProps,
} from './Dialog';
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from './Tabs';
export { Tooltip, type TooltipProps } from './Tooltip';
