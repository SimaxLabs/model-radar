export function calculateBlendedPrice(inputPrice: number, outputPrice: number) {
  return (inputPrice * 3 + outputPrice) / 4;
}

export function calculatePriceChange(current: number, previous: number | null) {
  return previous === null || previous === 0 ? null : ((current - previous) / previous) * 100;
}
