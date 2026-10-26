# Phone app (Android and iPhone)

The app is the same KaryaOS web app, wrapped with Capacitor. `client/capacitor.config.ts` is already
set up. The wrapper opens the live site (`https://karyaos.in`) inside the app, so there is one code
base, sign-in cookies keep working, and every web release reaches the phone app straight away.

## What you need

- Android: Android Studio, and a Google Play developer account (one-time fee) to publish.
- iPhone: a Mac with Xcode, and an Apple Developer account (yearly fee) to publish.
- A Firebase project (free) for push notifications on Android, and an APNs key from Apple for iPhone.

## What is already done

- The `android/` and `ios/` projects exist in `client/` and are committed with the code.
- Icons and splash screens are generated from the KaryaOS logo. The source art is in `client/assets/`;
  regenerate with `npx @capacitor/assets generate --android --ios --iconBackgroundColor '#0b1020' --splashBackgroundColor '#0b1020'`.
- Vibration works in the apps. `lib/haptics.ts` uses the native haptics plugin inside the wrapper (so iPhone
  vibrates too) and the browser vibrate call everywhere else.
- Camera, microphone, location and photo-library permissions are declared (Android manifest and iPhone
  Info.plist), with plain-language reasons for Apple.

## Build it

1. `cd client && npm install`
2. `npm run cap:sync` builds the web code and copies it and the plugins into both projects.
3. Android: `npm run cap:android` opens Android Studio. Run on a phone or emulator, then use Build >
   Generate Signed Bundle for the Play Store.
4. iPhone: on a Mac, run `npm run cap:ios`, choose your team under Signing in Xcode, run on a phone, then
   Product > Archive for the App Store.
5. Decide the app id (`in.karyaos.app`) in `capacitor.config.ts` before the first store upload. It cannot
   change after that.

## Push notifications

The web app already registers for push when it runs in a browser. For the wrapped app, add the
native plugin so alerts arrive when the app is closed:

1. `npm install @capacitor/push-notifications` and `npm run cap:sync`.
2. Android: put the Firebase `google-services.json` in `client/android/app/`.
3. iPhone: enable the Push Notifications capability in Xcode and upload the APNs key to Firebase.
4. Ask the server to send native tokens as well as web push: this needs a small server change (a
   table for device tokens and a sender using Firebase). It is not built yet.

Until step 4 is done, the wrapped Android app still shows web push, and iPhone alerts need the app
added to the Home Screen the usual way.

## Things to know

- Apple can refuse apps that only wrap a website. The iPhone version needs native features (push, camera
  for photo proof, haptics) to pass review. Haptics are done; push is the missing piece. Android has no
  such rule.
- Photo upload and the camera work through the web view. The live-photo checks keep working.
- If you ever change the site address, change `server.url` in `capacitor.config.ts` and publish a new build.
- I could not build or run either app here: there is no Android SDK or Mac in this environment. The
  projects were generated and synced, and the web side builds, but the first run on a real phone is still to do.
