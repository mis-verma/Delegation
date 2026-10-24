import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
    appId: "in.karyaos.app",
    appName: "KaryaOS",
    webDir: "dist",
    server: {
        url: "https://karyaos.in",
        androidScheme: "https",
        allowNavigation: ["karyaos.in", "api.karyaos.in"],
    },
    android: {
        backgroundColor: "#0b1020",
    },
    ios: {
        backgroundColor: "#0b1020",
        contentInset: "always",
    },
}

export default config
