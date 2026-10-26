import { scheduleJob } from "../utils/jobTracker.js"
import { purgeStaleVariants } from "../utils/imageVariants.js"

export const startImageVariantCleanup = () => {
    scheduleJob("image-variant-cleanup", "20 3 * * 0", 10_080, async () => {
        const removed = await purgeStaleVariants()
        if (removed > 0) console.log(`Image variant cleanup: removed ${removed} unused thumbnails`)
    })
}
