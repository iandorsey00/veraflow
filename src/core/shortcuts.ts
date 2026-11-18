const modifiers: Record<string, [string, string]> = {
  commandorcontrol: ["Ctrl", "Cmd"],
  commandorctrl: ["Ctrl", "Cmd"],
  control: ["Ctrl", "Control"],
  ctrl: ["Ctrl", "Control"],
  command: ["Super", "Cmd"],
  cmd: ["Super", "Cmd"],
  meta: ["Super", "Cmd"],
  super: ["Super", "Cmd"],
  alt: ["Alt", "Opt"],
  option: ["Alt", "Opt"],
  shift: ["Shift", "Shift"],
};

export function shortcutLabel(binding: string, mac: boolean) {
  return binding
    .split("+")
    .map(
      (key) => modifiers[key.trim().toLowerCase()]?.[mac ? 1 : 0] ?? key.trim(),
    )
    .join("+");
}

const accelerators = new Map([
  ["opt", "Alt"],
  ["option", "Alt"],
  ["cmd", "Super"],
  ["command", "Super"],
  ["control", "Ctrl"],
]);
export function shortcutAccelerator(label: string) {
  return label
    .split("+")
    .map((key) => {
      const name = key.trim();
      return accelerators.get(name.toLowerCase()) ?? name;
    })
    .join("+");
}
