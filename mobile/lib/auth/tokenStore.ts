import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Mirrors client/src/lib/tokenStore.ts's split: the access token only ever lives in memory (it's
// short-lived and re-fetched on every cold start via the refresh token), while the refresh token
// is the one thing that must survive an app restart, so it goes in SecureStore (Keychain/Keystore-
// backed, encrypted at rest) — this is the mobile equivalent of the web app's httpOnly cookie.
//
// SecureStore is a native-only module — there is no Keychain/Keystore in a browser, and Expo's web
// shim for it isn't functional (throws "getValueWithKeyAsync is not a function"). The real target
// for this app is Expo Go/native, where SecureStore is used properly; `npx expo start` -> `w` is
// just a fast preview during development, so it falls back to localStorage there instead of
// crashing — not encrypted, but the web preview was never the secure, real deployment target.
const REFRESH_TOKEN_KEY = "karya-refresh-token";
const isWeb = Platform.OS === "web";

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken: () => accessToken,
  setAccessToken: (token: string | null) => {
    accessToken = token;
  },

  getRefreshToken: async (): Promise<string | null> => {
    if (isWeb) return typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  setRefreshToken: async (token: string | null) => {
    if (isWeb) {
      if (typeof localStorage === "undefined") return;
      if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
      else localStorage.removeItem(REFRESH_TOKEN_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
