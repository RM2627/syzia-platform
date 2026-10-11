export function memberLimitLabel(value: number | null | undefined) {
  if (value == null) return "Ilimitado · membros da equipe";
  return `${value} ${value === 1 ? "membro" : "membros"} da equipe`;
}
