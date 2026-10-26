export const GOOD_FROM = 80;
export const FAIR_FROM = 50;

export const bandWord = (value: number): 'Good' | 'Fair' | 'Low' => (value >= GOOD_FROM ? 'Good' : value >= FAIR_FROM ? 'Fair' : 'Low');
