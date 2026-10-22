const KEY = 'tm-admin-device'

export const readDeviceToken = (): string | undefined => {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const saveDeviceToken = (token: string) => {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    void 0
  }
}
