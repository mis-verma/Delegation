# Phone app (Android and iPhone)

The app is the same KaryaOS web app, wrapped with Capacitor. `client/capacitor.config.ts` is already
set up. The wrapper opens the live site (`https://karyaos.in`) inside the app, so there is one code
base, sign-in cookies keep working, and every web release reaches the phone app straight away.

## What you need

- Android: Android Studio, and a Google Play developer account (one-time fee) to publish.
- iPhone: a Mac with Xcode, and an Apple Developer account (yearly fee) to publish.
- A Firebase project (free) for push notifications on Android, and an APNs key from Apple for iPhone.

## First time

1. `cd client && npm install`
2. `npx cap add android` (and `npx cap add ios` on a Mac). This creates the `android/` and `ios/` folders.
3. `npm run cap:sync`, then `npm run cap:android` (or `cap:ios`) to open the project in Android Studio or Xcode.
4. Replace the icons and splash screen with the files in `client/public` (the 512 px and maskable icons).
5. Build and run on a phone or an emulator from Android Studio or Xcode.

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
  for photo proof, haptics) to pass review. Android has no such rule.
- Photo upload and the camera work through the web view. The live-photo checks keep working.
- If you ever change the site address, change `server.url` in `capacitor.config.ts` and publish a new build.
