import { PICKER_FOOTER_STYLE } from "./picker-shared";

export function PickerFooter() {
  return (
    <div style={PICKER_FOOTER_STYLE}>
      <span>↑↓ navigate</span>
      <span>↵ / Tab select</span>
      <span>Esc dismiss</span>
    </div>
  );
}
