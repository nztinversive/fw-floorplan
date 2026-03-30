export type ShortcutDefinition = {
  keys: string[]
  label: string
}

export type ShortcutGroup = {
  title: string
  shortcuts: ShortcutDefinition[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    shortcuts: [
      { keys: ["Esc"], label: "Select tool" },
      { keys: ["W"], label: "Wall tool" },
      { keys: ["M"], label: "Measure tool" },
      { keys: ["A"], label: "Annotation tool" },
      { keys: ["C"], label: "Scale calibration tool" },
      { keys: ["R"], label: "Room tool" },
      { keys: ["D"], label: "Door tool" },
      { keys: ["N"], label: "Window tool" },
      { keys: ["T"], label: "Furniture tool" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["Shift", "Click"], label: "Add or remove from selection" },
      { keys: ["Del"], label: "Delete selected items" },
      { keys: ["Ctrl", "D"], label: "Duplicate selection" },
      { keys: ["Ctrl", "Z"], label: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
    ],
  },
  {
    title: "Canvas",
    shortcuts: [
      { keys: ["Scroll"], label: "Zoom in / out" },
      { keys: ["Space", "Drag"], label: "Pan canvas" },
      { keys: ["F"], label: "Zoom to fit" },
      { keys: ["?"], label: "Toggle shortcuts panel" },
    ],
  },
]
