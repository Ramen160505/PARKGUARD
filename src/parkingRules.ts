export type ParkingVerdict = "check" | "caution" | "unknown";
export interface SignCheck { verdict: ParkingVerdict; title: string; explanation: string; }
/** Conservative placeholder until official Ukrainian sign rules and image recognition are integrated. */
export function getParkingVerdict(hasSignPhoto: boolean): SignCheck {
 if (!hasSignPhoto) return { verdict:"unknown", title:"Потрібне фото знака", explanation:"Сфотографуйте дорожній знак перед паркуванням." };
 return { verdict:"check", title:"Перевірте знак і розмітку", explanation:"Автоматичне розпізнавання ще не підключене. Не сприймайте цей екран як юридичне підтвердження дозволу на паркування." };
}
export function getRemainingMs(expiresAt: number, now = Date.now()): number { return Math.max(0, expiresAt - now); }
