export const clockParts = (value: string): [number, number] => {
    const [hours = 0, minutes = 0] = value.split(":").map(Number)
    return [hours, minutes]
}
