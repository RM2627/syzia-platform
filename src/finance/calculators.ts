export type SimulationValues = {
  cost: number;
  price: number;
  percent: number;
  goal: number;
  days: number;
};
export function simulate(kind: string, values: SimulationValues) {
  const { cost, price, percent, goal, days } = values;
  if (Object.values(values).some((v) => !Number.isFinite(v) || v < 0))
    throw Error("Informe valores finitos e não negativos.");
  if (kind === "price") {
    if (percent >= 100) throw Error("A margem deve ser menor que 100%.");
    const final = cost / (1 - percent / 100);
    return {
      label: "Preço sugerido",
      value: final,
      unit: "money",
      gross: final - cost,
      margin: percent,
    };
  }
  if (kind === "margin") {
    if (price <= 0) throw Error("O preço deve ser maior que zero.");
    return {
      label: "Resultado bruto estimado",
      value: price - cost,
      unit: "money",
      gross: price - cost,
      margin: ((price - cost) / price) * 100,
    };
  }
  if (kind === "discount") {
    if (percent > 100) throw Error("O desconto deve ficar entre 0 e 100%.");
    const final = price * (1 - percent / 100);
    return {
      label: "Preço após desconto",
      value: final,
      unit: "money",
      gross: final - cost,
      margin: final > 0 ? ((final - cost) / final) * 100 : null,
    };
  }
  if (price <= 0 || days <= 0 || !Number.isInteger(days))
    throw Error("Informe ticket positivo e dias inteiros maiores que zero.");
  return {
    label: "Serviços para atingir a meta informada",
    value: Math.ceil(goal / price),
    perDay: Math.ceil(goal / price / days),
    unit: "count",
  };
}
